"""Saving trained models to a user's account (Postgres / Tiger Data).

Each saved model is one row in `ml_models`: the recipe (type, hyperparameters,
start, seed, feature and library versions), the numbers its list entry shows,
and the pickled model. Loading puts it back in train._MODELS, which is the
in-memory cache that predict() and overlay() read.

If the pickle can't be used (feature code or library versions changed), the
model is retrained from its recipe on current history instead.

Pickles are only ever created by this server, never uploaded by users: loading
an untrusted pickle can run arbitrary code.
"""
import json
import os
import pickle

import lightgbm
import psycopg
import sklearn

from ml.features import FEATURE_VERSION
from ml.history import CANDLES_PER_YEAR, asset_class, get_candles
from ml.train import _MODELS, train

LIBS = {"sklearn": sklearn.__version__, "lightgbm": lightgbm.__version__}
_ready = False


class StoreUnavailable(Exception):
    pass


class NotOwner(Exception):
    pass


def _connect():
    url = os.getenv("TIGER_DATABASE_URL")
    if not url:
        raise StoreUnavailable("Saving models needs a database (TIGER_DATABASE_URL is not set)")
    return psycopg.connect(url)


def _ensure_table(cur):
    global _ready
    if _ready:
        return
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ml_models (
            id VARCHAR(20) PRIMARY KEY,
            user_id VARCHAR(80) NOT NULL,
            name VARCHAR(120) NOT NULL,
            symbol VARCHAR(20) NOT NULL,
            model_type VARCHAR(30) NOT NULL,
            hyperparams JSONB NOT NULL,
            seed INTEGER NOT NULL DEFAULT 0,
            start_ts BIGINT NOT NULL,
            trained_through_ts BIGINT NOT NULL,
            data_source VARCHAR(20),
            summary JSONB NOT NULL,
            feature_version VARCHAR(20) NOT NULL,
            lib_versions JSONB NOT NULL,
            artifact BYTEA NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ml_models_user ON ml_models (user_id, created_at DESC);
    """)
    _ready = True


def _row_to_listing(row):
    (mid, name, symbol, model_type, hp, start_ts, through, source, summary, created) = row
    return {"model_id": mid, "name": name, "symbol": symbol, "model_type": model_type,
            "hyperparams": hp, "start_ts": start_ts, "trained_through_ts": through,
            "data_source": source, **summary, "created_at": int(created.timestamp() * 1000)}


LISTING_COLUMNS = ("id, name, symbol, model_type, hyperparams, start_ts, trained_through_ts, "
                   "data_source, summary, created_at")


def save(model_id, user_id, name):
    """Save a trained (in-memory) model to user_id's account. Saving again renames it."""
    entry = _MODELS[model_id]   # KeyError: never trained here, or lost in a restart
    hp = {k: v for k, v in entry["hp"].items()}
    with _connect() as conn, conn.cursor() as cur:
        _ensure_table(cur)
        cur.execute("SELECT user_id FROM ml_models WHERE id = %s", (model_id,))
        owner = cur.fetchone()
        if owner and owner[0] != user_id:
            raise NotOwner(model_id)
        cur.execute(f"""
            INSERT INTO ml_models (id, user_id, name, symbol, model_type, hyperparams, seed, start_ts,
                                   trained_through_ts, data_source, summary, feature_version, lib_versions, artifact)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
            RETURNING {LISTING_COLUMNS}""",
            (model_id, user_id, name, entry["symbol"], entry["model_type"], json.dumps(hp),
             entry.get("seed", 0), entry["start_ts"], entry["trained_through_ts"], entry.get("data_source"),
             json.dumps(entry["summary"]), FEATURE_VERSION, json.dumps(LIBS),
             pickle.dumps(entry["model"], protocol=pickle.HIGHEST_PROTOCOL)))
        return _row_to_listing(cur.fetchone())


def list_models(user_id, warm=True):
    """The user's saved models, newest first. warm=True also loads them into memory,
    so switching to the Trade page and picking one is instant."""
    with _connect() as conn, conn.cursor() as cur:
        _ensure_table(cur)
        cur.execute(f"SELECT {LISTING_COLUMNS} FROM ml_models WHERE user_id = %s ORDER BY created_at DESC",
                    (user_id,))
        listings = [_row_to_listing(r) for r in cur.fetchall()]
    if warm:
        for item in listings:
            if item["model_id"] not in _MODELS:
                try:
                    load(item["model_id"])
                except Exception as e:   # one bad model shouldn't hide the rest
                    print(f"store: could not load {item['model_id']}: {e}")
    return listings


def load(model_id):
    """Put a saved model back into memory (train._MODELS). KeyError if there is none."""
    with _connect() as conn, conn.cursor() as cur:
        _ensure_table(cur)
        cur.execute("SELECT symbol, model_type, hyperparams, seed, start_ts, trained_through_ts, data_source, "
                    "summary, feature_version, lib_versions, artifact FROM ml_models WHERE id = %s", (model_id,))
        row = cur.fetchone()
    if row is None:
        raise KeyError(model_id)
    symbol, model_type, hp, seed, start_ts, through, source, summary, fver, libs, artifact = row
    model = None
    if fver == FEATURE_VERSION and libs == LIBS:
        try:
            model = pickle.loads(artifact)
        except Exception as e:
            print(f"store: unpickling {model_id} failed ({e}); retraining from its recipe")
    if model is None:
        return _rebuild(model_id, symbol, model_type, hp, seed, start_ts)
    _MODELS[model_id] = {"model": model, "model_type": model_type, "symbol": symbol, "hp": hp,
                         "candles": None, "seed": seed, "start_ts": start_ts,
                         "trained_through_ts": through, "data_source": source, "summary": summary}
    return _MODELS[model_id]


def _rebuild(model_id, symbol, model_type, hp, seed, start_ts):
    """Retrain from the saved recipe on current history, under the same id."""
    candles, source = get_candles(symbol, 5000)
    hp = {**hp, "start_ts": start_ts,
          "candles_per_year": hp.get("candles_per_year", CANDLES_PER_YEAR[asset_class(symbol)])}
    out = train(candles, model_type=model_type, hyperparams=hp, symbol=symbol, seed=seed)
    entry = _MODELS.pop(out["model_id"])
    entry["data_source"] = source
    _MODELS[model_id] = entry
    return entry


def delete(model_id, user_id):
    """Delete a saved model. Returns False if the user has no such model."""
    with _connect() as conn, conn.cursor() as cur:
        _ensure_table(cur)
        cur.execute("DELETE FROM ml_models WHERE id = %s AND user_id = %s", (model_id, user_id))
        gone = cur.rowcount > 0
    if gone:
        _MODELS.pop(model_id, None)
    return gone
