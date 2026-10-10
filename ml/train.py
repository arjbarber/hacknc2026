"""train() and predict(), returning the shapes defined in shared/API.md (Models section)."""
import time
import uuid

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ml.backtest import run_backtest
from ml.features import build_features, latest_features

DEFAULTS = {
    "lookback": 30, "horizon": 5, "train_split": 0.8,
    "C": 1.0,                                             # logreg
    "n_estimators": 200, "max_depth": 4, "learning_rate": 0.05,  # trees
    "threshold": 0.55, "fee_bps": 10,                     # backtest
}

# Trained models, kept in memory for predict(). They're lost when the process restarts.
_MODELS = {}


def _make_model(model_type, hp, seed):
    if model_type in ("logreg", "ridge"):
        # L2-penalized logistic regression. "ridge" is the old name, kept as an alias.
        return make_pipeline(StandardScaler(),
                             LogisticRegression(C=float(hp["C"]), max_iter=1000))
    if model_type == "random_forest":
        return RandomForestClassifier(n_estimators=int(hp["n_estimators"]),
                                      max_depth=int(hp["max_depth"]),
                                      min_samples_leaf=20, n_jobs=-1, random_state=seed)
    if model_type == "lightgbm":
        from lightgbm import LGBMClassifier
        return LGBMClassifier(n_estimators=int(hp["n_estimators"]),
                              max_depth=int(hp["max_depth"]),
                              learning_rate=float(hp["learning_rate"]),
                              num_leaves=min(31, 2 ** int(hp["max_depth"])),
                              random_state=seed, verbose=-1)
    raise ValueError(f"unknown model_type: {model_type}")


def time_split(n, train_split, horizon):
    """Index arrays for train and test, split by time with no shuffling.

    Train rows whose label looks `horizon` candles ahead, into the test period,
    are dropped so no future prices leak into training.
    """
    split = int(n * train_split)
    train_idx = np.arange(0, max(0, split - horizon))
    test_idx = np.arange(split, n)
    return train_idx, test_idx


def train(candles, model_type="logreg", hyperparams=None, symbol="SOL", seed=0):
    t0 = time.perf_counter()
    hp = {**DEFAULTS, **(hyperparams or {})}
    lookback, horizon = int(hp["lookback"]), int(hp["horizon"])

    X, y, ts, fwd = build_features(candles, lookback=lookback, horizon=horizon)
    tr, te = time_split(len(X), float(hp["train_split"]), horizon)
    if len(tr) < 100 or len(te) < 20:
        raise ValueError("not enough data for this lookback/horizon/train_split")

    # Plain arrays: the same code path for every model, and no feature-name warnings.
    Xn, yn = X.to_numpy(np.float64), y.to_numpy()
    model = _make_model(model_type, hp, seed)
    model.fit(Xn[tr], yn[tr])

    proba = model.predict_proba(Xn[te])[:, 1]
    pred = (proba > 0.5).astype(int)
    y_te = yn[te]

    backtest = run_backtest(proba, fwd.iloc[te], ts.iloc[te],
                            threshold=float(hp["threshold"]), fee_bps=float(hp["fee_bps"]))

    model_id = "m_" + uuid.uuid4().hex[:8]
    _MODELS[model_id] = {"model": model, "symbol": symbol, "hp": hp, "candles": candles}

    return {
        "model_id": model_id,
        "metrics": {
            "accuracy": round(float(accuracy_score(y_te, pred)), 4),
            "precision": round(float(precision_score(y_te, pred, zero_division=0)), 4),
            "baseline_always_up": round(float(y_te.mean()), 4),
            "n_train": int(len(tr)), "n_test": int(len(te)),
        },
        "backtest": backtest,
        "train_seconds": round(time.perf_counter() - t0, 2),
    }


def predict(model_id, candles=None):
    """Predict for the latest candle. Pass fresh candles, or it reuses the training ones."""
    entry = _MODELS[model_id]
    candles = entry["candles"] if candles is None else candles
    x = latest_features(candles, lookback=int(entry["hp"]["lookback"])).to_numpy(np.float64)
    p_up = float(entry["model"].predict_proba(x)[:, 1][0])
    return {
        "model_id": model_id, "symbol": entry["symbol"],
        "direction": "up" if p_up >= 0.5 else "down",
        "confidence": round(max(p_up, 1 - p_up), 4),
        "horizon_candles": int(entry["hp"]["horizon"]),
        "ts": int(candles["ts"].iloc[-1]),
    }
