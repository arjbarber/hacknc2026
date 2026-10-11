"""FastAPI routes for the ML side, trained on real hourly history.

The backend includes these with two lines:
    from ml.api import router as ml_router
    app.include_router(ml_router)

Routes (see shared/API.md, Models section):
    GET  /history/{symbol}            hourly candles the models train on
    POST /models/train                train + backtest, with per-candle predictions
    GET  /models/{model_id}/predict   prediction for the newest closed candle
    GET  /models/{model_id}/overlay   the model applied from its start to now, for charts
    POST /models/{model_id}/save      save a trained model to a user's account
    GET  /users/{user_id}/models      a user's saved models (also loads them into memory)
    DELETE /models/{model_id}?user_id=...
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ml.history import CANDLES_PER_YEAR, asset_class, get_candles
from ml import store
from ml.train import _MODELS, overlay, predict, train

router = APIRouter()
HISTORY_CANDLES = 5000


def _error(status, code, message):
    return JSONResponse(status_code=status, content={"error": code, "message": message})


def _candles(symbol):
    return get_candles(symbol, HISTORY_CANDLES)


def _symbol_of(model_id):
    """Symbol of a model, loading it from saved models if it isn't in memory
    (e.g. after a backend restart). KeyError if it doesn't exist anywhere."""
    if model_id not in _MODELS:
        try:
            store.load(model_id)
        except store.StoreUnavailable:
            raise KeyError(model_id)
    return _MODELS[model_id]["symbol"]


@router.get("/history/{symbol}")
def history(symbol: str, limit: int = 2000):
    try:
        df, source = _candles(symbol)
    except KeyError as e:
        return _error(404, "unknown_symbol", e.args[0])
    df = df.tail(max(1, min(limit, HISTORY_CANDLES)))
    return {"symbol": symbol, "interval": "1h", "source": source,
            "candles": [{"ts": int(r.ts), "o": r.open, "h": r.high, "l": r.low, "c": r.close, "v": r.volume}
                        for r in df.itertuples()]}


@router.post("/models/train")
def train_model(body: dict):
    symbol = body.get("symbol", "SOL")
    try:
        df, source = _candles(symbol)
    except KeyError as e:
        return _error(404, "unknown_symbol", e.args[0])
    hp = {"candles_per_year": CANDLES_PER_YEAR[asset_class(symbol)], **(body.get("hyperparams") or {})}
    try:
        out = train(df, model_type=body.get("model_type", "logreg"), hyperparams=hp, symbol=symbol)
    except ValueError as e:
        return _error(400, "bad_request", str(e))
    _MODELS[out["model_id"]]["data_source"] = source
    return {**out, "symbol": symbol, "interval": "1h", "data_source": source}


@router.get("/models/{model_id}/predict")
def predict_model(model_id: str):
    try:
        return predict(model_id, _candles(_symbol_of(model_id))[0])
    except KeyError:
        return _error(404, "not_found", f"no model {model_id}")


@router.get("/models/{model_id}/overlay")
def overlay_model(model_id: str):
    try:
        return overlay(model_id, _candles(_symbol_of(model_id))[0])
    except KeyError:
        return _error(404, "not_found", f"no model {model_id}")


@router.post("/models/{model_id}/save")
def save_model(model_id: str, body: dict):
    user_id, name = body.get("user_id"), (body.get("name") or "").strip()
    if not user_id or not name:
        return _error(400, "bad_request", "user_id and name are required")
    try:
        return store.save(model_id, user_id, name[:120])
    except KeyError:
        return _error(404, "not_found", f"no trained model {model_id} (train it again; unsaved models are lost on restart)")
    except store.NotOwner:
        return _error(403, "forbidden", "that model belongs to another account")
    except store.StoreUnavailable as e:
        return _error(503, "storage_unavailable", str(e))


@router.get("/users/{user_id}/models")
def saved_models(user_id: str):
    try:
        return store.list_models(user_id)
    except store.StoreUnavailable as e:
        return _error(503, "storage_unavailable", str(e))


@router.delete("/models/{model_id}")
def delete_model(model_id: str, user_id: str):
    try:
        if not store.delete(model_id, user_id):
            return _error(404, "not_found", f"no saved model {model_id} in this account")
    except store.StoreUnavailable as e:
        return _error(503, "storage_unavailable", str(e))
    return {"model_id": model_id, "deleted": True}
