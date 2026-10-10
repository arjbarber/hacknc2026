import os
import time
import uuid
import psycopg
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("TIGER_DATABASE_URL")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])  # lets Next.js call it

def get_connection():
    return psycopg.connect(DB_URL)

@app.get("/")
def read_root():
    return {"message": "Backend is running!"}

@app.get("/prices/{symbol}")
def price(symbol: str):
    return {"symbol": symbol, "price": 148.32, "ts": 1760000000000}

@app.get("/prices/{symbol}/candles")
def candles(symbol: str, interval: str = "1m", limit: int = 200):
    return [{"ts": 1760000000000 + i*60000, "o": 148.1, "h": 148.5,
             "l": 147.9, "c": 148.3 + i*0.01, "v": 1200} for i in range(limit)]

@app.post("/orders")
def order(body: dict):
    user_id = body.get("user_id")
    symbol = body.get("symbol")
    side = body.get("side")
    qty = float(body.get("qty", 0))

    if not all([user_id, symbol, side, qty]):
        raise HTTPException(status_code=400, detail="Missing required fields")
        
    order_id = "o_" + str(uuid.uuid4())[:8]

    with get_connection() as conn:
        with conn.cursor() as cur:
            # 1. Get current price
            cur.execute("SELECT price FROM ticks WHERE symbol = %s ORDER BY ts DESC LIMIT 1", (symbol,))
            res = cur.fetchone()
            price = res[0] if res else 148.32

            # 2. Get user cash (create if not exists)
            cur.execute("SELECT cash FROM users WHERE id = %s", (user_id,))
            res = cur.fetchone()
            if not res:
                cur.execute("INSERT INTO users (id, name, cash) VALUES (%s, %s, %s) RETURNING cash", (user_id, user_id, 100000.0))
                cash = 100000.0
            else:
                cash = res[0]

            cost = price * qty
            if side == "buy":
                if cash < cost:
                    raise HTTPException(status_code=400, detail="Insufficient funds")
                cash_after = cash - cost
                
                # Update positions
                cur.execute("SELECT qty, avg_price FROM positions WHERE user_id = %s AND symbol = %s", (user_id, symbol))
                pres = cur.fetchone()
                if not pres:
                    cur.execute("INSERT INTO positions (user_id, symbol, qty, avg_price) VALUES (%s, %s, %s, %s)", (user_id, symbol, qty, price))
                else:
                    old_qty, old_avg = pres
                    new_qty = old_qty + qty
                    new_avg = ((old_qty * old_avg) + (qty * price)) / new_qty
                    cur.execute("UPDATE positions SET qty = %s, avg_price = %s WHERE user_id = %s AND symbol = %s", (new_qty, new_avg, user_id, symbol))

            elif side == "sell":
                cur.execute("SELECT qty, avg_price FROM positions WHERE user_id = %s AND symbol = %s", (user_id, symbol))
                pres = cur.fetchone()
                if not pres or pres[0] < qty:
                    raise HTTPException(status_code=400, detail="Insufficient position")
                
                old_qty, old_avg = pres
                cash_after = cash + cost
                new_qty = old_qty - qty
                if new_qty <= 0:
                    cur.execute("DELETE FROM positions WHERE user_id = %s AND symbol = %s", (user_id, symbol))
                else:
                    cur.execute("UPDATE positions SET qty = %s WHERE user_id = %s AND symbol = %s", (new_qty, user_id, symbol))
            else:
                raise HTTPException(status_code=400, detail="Invalid side")

            # Update cash
            cur.execute("UPDATE users SET cash = %s WHERE id = %s", (cash_after, user_id))

            # Insert order record
            cur.execute("INSERT INTO orders (id, user_id, symbol, side, qty, fill_price) VALUES (%s, %s, %s, %s, %s, %s)",
                        (order_id, user_id, symbol, side, qty, price))

            conn.commit()
            
            ts_ms = int(time.time() * 1000)

    return {"order_id": order_id, "status": "filled", "fill_price": price,
            "ts": ts_ms, "cash_after": cash_after}

@app.get("/portfolio/{user_id}")
def portfolio(user_id: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT cash FROM users WHERE id = %s", (user_id,))
            res = cur.fetchone()
            if not res:
                return {"user_id": user_id, "cash": 100000.0, "equity": 100000.0, "pnl": 0.0, "pnl_pct": 0.0, "positions": []}
            cash = res[0]

            cur.execute("SELECT symbol, qty, avg_price FROM positions WHERE user_id = %s", (user_id,))
            positions_data = cur.fetchall()

            positions = []
            total_equity = cash
            for symbol, qty, avg_price in positions_data:
                # get current price
                cur.execute("SELECT price FROM ticks WHERE symbol = %s ORDER BY ts DESC LIMIT 1", (symbol,))
                pres = cur.fetchone()
                last_price = pres[0] if pres else avg_price
                
                unrealized_pnl = (last_price - avg_price) * qty
                total_equity += (last_price * qty)

                positions.append({
                    "symbol": symbol,
                    "qty": qty,
                    "avg_price": avg_price,
                    "last_price": last_price,
                    "unrealized_pnl": unrealized_pnl
                })
            
            pnl = total_equity - 100000.0
            pnl_pct = pnl / 100000.0

    return {
        "user_id": user_id,
        "cash": cash,
        "equity": total_equity,
        "pnl": pnl,
        "pnl_pct": pnl_pct,
        "positions": positions
    }

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