from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])  # lets Next.js call it

@app.get("/prices/{symbol}")
def price(symbol: str):
    return {"symbol": symbol, "price": 148.32, "ts": 1760000000000}

@app.get("/prices/{symbol}/candles")
def candles(symbol: str, interval: str = "1m", limit: int = 200):
    return [{"ts": 1760000000000 + i*60000, "o": 148.1, "h": 148.5,
             "l": 147.9, "c": 148.3 + i*0.01, "v": 1200} for i in range(limit)]

@app.post("/orders")
def order(body: dict):
    return {"order_id": "o_9", "status": "filled", "fill_price": 148.32,
            "ts": 1760000000000, "cash_after": 99629.2}

@app.get("/portfolio/{user_id}")
def portfolio(user_id: str):
    return {"user_id": user_id, "cash": 99629.2, "equity": 100012.4, "pnl": 12.4,
            "pnl_pct": 0.012, "positions": [{"symbol": "SOL", "qty": 2.5,
            "avg_price": 148.32, "last_price": 150.0, "unrealized_pnl": 4.2}]}

@app.get("/leaderboard")
def leaderboard(limit: int = 20):
    return [{"rank": 1, "name": "alice", "is_bot": False, "equity": 104200.1, "pnl_pct": 4.2},
            {"rank": 2, "name": "LightGBM-SOL-bot", "is_bot": True, "equity": 103100.5, "pnl_pct": 3.1}]

@app.post("/models/train")
def train(body: dict):
    return {"model_id": "m_42", "metrics": {"accuracy": 0.53, "precision": 0.54},
            "backtest": {"equity_curve": [{"ts": 1760000000000, "equity": 100000}],
                         "sharpe": 0.4, "max_drawdown": 0.08}, "train_seconds": 3.1}

@app.get("/models/{model_id}/predict")
def predict(model_id: str):
    return {"model_id": model_id, "symbol": "SOL", "direction": "up",
            "confidence": 0.61, "horizon_candles": 5, "ts": 1760000000000}

@app.get("/news")
def news(symbol: str = "SOL", limit: int = 20):
    return [{"headline": "Example headline", "source": "CryptoPanic", "url": "https://example.com",
             "ts": 1760000000000, "symbol": symbol, "sentiment": 0.6, "summary": "Example summary"}]