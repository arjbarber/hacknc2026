"""FastAPI routes for the ML side, trained on real hourly history.

The backend includes these with two lines:
    from ml.api import router as ml_router
    app.include_router(ml_router)

Routes (see shared/API.md, Models section):
    GET  /history/{symbol}            hourly candles the models train on
    POST /models/train                train + backtest, with per-candle predictions
    GET  /models/{model_id}/predict   prediction for the newest closed candle
    GET  /models/{model_id}/overlay   the model applied from its start to now, for charts
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ml.history import CANDLES_PER_YEAR, asset_class, get_candles
from ml.train import _MODELS, overlay, predict, train

router = APIRouter()
HISTORY_CANDLES = 5000


def _error(status, code, message):
    return JSONResponse(status_code=status, content={"error": code, "message": message})


def _candles(symbol):
    return get_candles(symbol, HISTORY_CANDLES)


def _symbol_of(model_id):
    return _MODELS[model_id]["symbol"]   # KeyError if unknown, handled by the caller


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
