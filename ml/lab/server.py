"""Model Lab: a local dev page for the ML pipeline, separate from the real frontend.

Run from the repo root:  python -m uvicorn ml.lab.server:app --port 8100
Then open http://localhost:8100

The routes match shared/API.md (/models/train, /models/{id}/predict,
/prices/{symbol}/candles), so the page talks to the API the same way the real
frontend will. The only lab-specific part is the optional "data" field in the
train body, which picks which fake data to generate.
"""
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from ml.data import random_walk_candles
from ml.train import predict, train

app = FastAPI(title="Model Lab")
INDEX = Path(__file__).with_name("index.html")
DEFAULT_DATA = {"n_hours": 5000, "seed": 0, "autocorr": 0.0}


@lru_cache(maxsize=16)
def _candles(n_hours, seed, autocorr):
    return random_walk_candles(n_hours=n_hours, seed=seed, autocorr=autocorr)


def _data_params(raw):
    d = {**DEFAULT_DATA, **(raw or {})}
    return int(d["n_hours"]), int(d["seed"]), float(d["autocorr"])


@app.get("/")
def index():
    return FileResponse(INDEX)


@app.get("/prices/{symbol}/candles")
def candles(symbol: str, limit: int = 500, n_hours: int = 5000, seed: int = 0,
            autocorr: float = 0.0):
    c = _candles(n_hours, seed, autocorr).tail(limit)
    return [{"ts": int(r.ts), "o": r.open, "h": r.high, "l": r.low, "c": r.close, "v": r.volume}
            for r in c.itertuples()]


@app.post("/models/train")
def train_model(body: dict):
    candles_df = _candles(*_data_params(body.get("data")))
    try:
        out = train(candles_df, model_type=body.get("model_type", "logreg"),
                    hyperparams=body.get("hyperparams"), symbol=body.get("symbol", "SOL"))
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=400, detail={"error": "bad_request", "message": str(e)})

    return out


@app.get("/models/{model_id}/predict")
def predict_model(model_id: str):
    try:
        return predict(model_id)
    except KeyError:
        raise HTTPException(status_code=404, detail={"error": "not_found",
                                                     "message": f"no model {model_id}"})
