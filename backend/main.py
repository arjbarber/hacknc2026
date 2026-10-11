import json
import math
import os
import time
import uuid
from pathlib import Path

import psycopg
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from ml.api import router as ml_router
from ml.history import get_candles, live_quote

load_dotenv()
DB_URL = os.getenv("TIGER_DATABASE_URL")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])  # lets Next.js call it

# Model routes (/models/train, /models/{id}/predict, /models/{id}/overlay, /history/{symbol})
# come from the ML package, trained on real hourly history.
app.include_router(ml_router)

def get_connection():
    return psycopg.connect(DB_URL)

# Create any missing tables/columns on startup (CREATE ... IF NOT EXISTS, so it's safe to rerun).
if DB_URL:
    try:
        from backend.database import init_db
        init_db()
    except Exception as e:
        print(f"init_db failed: {e}")

@app.get("/")
def read_root():
    return {"message": "Backend is running!"}

START_CASH = 100000.0
ASSETS = {a["symbol"]: a for a in json.loads(
    (Path(__file__).resolve().parents[1] / "shared" / "assets.json").read_text())}


FRESH_TICK_MS = 120_000


def latest_price(symbol, cur=None):
    """(price, ts_ms, source) for a symbol, or None. In order of preference:
    1. a tick from the ingest feeds under 2 minutes old ("live")
    2. a live quote straight from Coinbase / Yahoo (when the feeds aren't running)
    3. an older tick
    4. the last closed hourly candle
    """
    tick = None
    if cur is not None:
        cur.execute("SELECT price, ts FROM ticks WHERE symbol = %s ORDER BY ts DESC LIMIT 1", (symbol,))
        row = cur.fetchone()
        if row:
            tick = (float(row[0]), int(row[1].timestamp() * 1000), "live")
    elif DB_URL:
        try:
            with get_connection() as conn, conn.cursor() as c:
                return latest_price(symbol, c)
        except psycopg.Error as e:
            print(f"latest_price: database unavailable ({e}); using exchange quotes")
    if tick and time.time() * 1000 - tick[1] < FRESH_TICK_MS:
        return tick
    quote = live_quote(symbol)
    if quote:
        return quote
    if tick:
        return tick
    try:
        candles, source = get_candles(symbol)
    except KeyError:
        return None
    if source == "synthetic":
        return None
    last = candles.iloc[-1]
    return float(last["close"]), int(last["ts"]) + 3_600_000, source   # the candle's close time


def require_db():
    if not DB_URL:
        raise HTTPException(status_code=503, detail="Database is not configured (TIGER_DATABASE_URL)")


@app.get("/prices/{symbol}")
def price(symbol: str):
    if symbol not in ASSETS:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol}")
    quote = latest_price(symbol)
    if quote is None:
        raise HTTPException(status_code=503, detail=f"No price available for {symbol} yet")
    p, ts, source = quote
    return {"symbol": symbol, "price": p, "ts": ts, "source": source}


@app.get("/prices/{symbol}/candles")
def candles(symbol: str, interval: str = "1h", limit: int = 200):
    # Hourly candles only (the ones the models use); see /history/{symbol}.
    if symbol not in ASSETS:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol}")
    df, _ = get_candles(symbol)
    return [{"ts": int(r.ts), "o": r.open, "h": r.high, "l": r.low, "c": r.close, "v": r.volume}
            for r in df.tail(max(1, limit)).itertuples()]


@app.post("/orders")
def order(body: dict):
    user_id = body.get("user_id")
    symbol = body.get("symbol")
    side = body.get("side")
    try:
        qty = float(body.get("qty", 0))
    except (TypeError, ValueError):
        qty = 0.0

    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user_id")
    if symbol not in ASSETS:
        raise HTTPException(status_code=400, detail=f"Unknown symbol {symbol}")
    if side not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="Side must be buy or sell")
    if not (math.isfinite(qty) and qty > 0):
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
    require_db()

    order_id = "o_" + str(uuid.uuid4())[:8]

    # One transaction: any error below rolls everything back.
    with get_connection() as conn:
        with conn.cursor() as cur:
            quote = latest_price(symbol, cur)
            if quote is None:
                raise HTTPException(status_code=503, detail=f"No price available for {symbol} yet")
            price = quote[0]

            # Create the account on first trade, then lock its row so two orders
            # at once can't spend the same cash.
            cur.execute("INSERT INTO users (id, name, cash) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
                        (user_id, user_id, START_CASH))
            cur.execute("SELECT cash FROM users WHERE id = %s FOR UPDATE", (user_id,))
            cash = cur.fetchone()[0]
            cur.execute("SELECT qty, avg_price FROM positions WHERE user_id = %s AND symbol = %s FOR UPDATE",
                        (user_id, symbol))
            pres = cur.fetchone()

            cost = price * qty
            if side == "buy":
                if cash < cost:
                    raise HTTPException(status_code=400, detail=f"Insufficient funds: this costs {cost:,.2f} and you have {cash:,.2f}")
                cash_after = cash - cost
                if not pres:
                    cur.execute("INSERT INTO positions (user_id, symbol, qty, avg_price) VALUES (%s, %s, %s, %s)", (user_id, symbol, qty, price))
                else:
                    old_qty, old_avg = pres
                    new_qty = old_qty + qty
                    new_avg = ((old_qty * old_avg) + (qty * price)) / new_qty
                    cur.execute("UPDATE positions SET qty = %s, avg_price = %s WHERE user_id = %s AND symbol = %s", (new_qty, new_avg, user_id, symbol))
            else:
                held = pres[0] if pres else 0.0
                if held < qty - 1e-9:
                    raise HTTPException(status_code=400, detail=f"Insufficient position: you hold {held:g} {symbol}")
                cash_after = cash + cost
                new_qty = held - qty
                if new_qty <= 1e-9:
                    cur.execute("DELETE FROM positions WHERE user_id = %s AND symbol = %s", (user_id, symbol))
                else:
                    cur.execute("UPDATE positions SET qty = %s WHERE user_id = %s AND symbol = %s", (new_qty, user_id, symbol))

            cur.execute("UPDATE users SET cash = %s WHERE id = %s", (cash_after, user_id))
            cur.execute("INSERT INTO orders (id, user_id, symbol, side, qty, fill_price) VALUES (%s, %s, %s, %s, %s, %s)",
                        (order_id, user_id, symbol, side, qty, price))
            ts_ms = int(time.time() * 1000)

    return {"order_id": order_id, "status": "filled", "symbol": symbol, "side": side, "qty": qty,
            "fill_price": price, "ts": ts_ms, "cash_after": cash_after}


@app.get("/orders/{user_id}")
def order_history(user_id: str, limit: int = 50):
    require_db()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, symbol, side, qty, fill_price, status, ts FROM orders "
                    "WHERE user_id = %s ORDER BY ts DESC LIMIT %s", (user_id, max(1, min(limit, 500))))
        return [{"order_id": oid, "symbol": sym, "side": side, "qty": qty, "fill_price": fill,
                 "status": status, "ts": int(ts.timestamp() * 1000)}
                for oid, sym, side, qty, fill, status, ts in cur.fetchall()]


def _account(cur, user_id, cash, prices):
    """Mark a user's positions to market. prices caches latest prices across users."""
    cur.execute("SELECT symbol, qty, avg_price FROM positions WHERE user_id = %s ORDER BY symbol", (user_id,))
    positions, equity = [], cash
    for symbol, qty, avg_price in cur.fetchall():
        if symbol not in prices:
            quote = latest_price(symbol, cur)
            prices[symbol] = quote[0] if quote else None
        last_price = prices[symbol] if prices[symbol] is not None else avg_price
        equity += last_price * qty
        positions.append({"symbol": symbol, "qty": qty, "avg_price": avg_price, "last_price": last_price,
                          "unrealized_pnl": (last_price - avg_price) * qty})
    return positions, equity


@app.get("/portfolio/{user_id}")
def portfolio(user_id: str):
    require_db()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT cash FROM users WHERE id = %s", (user_id,))
        res = cur.fetchone()
        if not res:
            return {"user_id": user_id, "cash": START_CASH, "equity": START_CASH, "pnl": 0.0, "pnl_pct": 0.0, "positions": []}
        cash = res[0]
        positions, equity = _account(cur, user_id, cash, {})
    pnl = equity - START_CASH
    return {"user_id": user_id, "cash": cash, "equity": equity, "pnl": pnl,
            "pnl_pct": pnl / START_CASH, "positions": positions}


@app.get("/leaderboard")
def leaderboard(limit: int = 20):
    """Everyone who has traded, plus bot accounts, ranked by equity. pnl_pct is in percent."""
    require_db()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT u.id, u.name, u.is_bot, u.cash FROM users u "
                    "WHERE u.is_bot OR EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)")
        rows, prices = [], {}
        for uid, name, is_bot, cash in cur.fetchall():
            _, equity = _account(cur, uid, cash, prices)
            label = name if name and name != uid else f"Trader {uid[-4:]}"
            rows.append({"user_id": uid, "name": label, "is_bot": bool(is_bot), "equity": round(equity, 2),
                         "pnl_pct": round((equity - START_CASH) / START_CASH * 100, 2)})
    rows.sort(key=lambda r: r["equity"], reverse=True)
    return [{"rank": i + 1, **r} for i, r in enumerate(rows[:max(1, limit)])]


@app.get("/news")
def news(symbol: str = "SOL", limit: int = 20, asset_class: str | None = None):
    """Scored headlines from ingest/news_feed.py (Finnhub + Gemini), newest first.
    symbol: one asset, MARKET (stories Gemini didn't tie to one asset), or ALL.
    asset_class (crypto | stock | forex) narrows ALL to that class.
    Empty until the news feed has run; unscored headlines are left out."""
    require_db()
    if symbol == "ALL":
        wanted = [s for s, a in ASSETS.items() if asset_class in (None, a["class"])]
        if asset_class is None:
            wanted.append("MARKET")
    else:
        wanted = [symbol]
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT to_regclass('news')")
        if cur.fetchone()[0] is None:      # news feed hasn't created its table yet
            return []
        cur.execute("SELECT headline, source, url, ts, symbol, sentiment, summary FROM news "
                    "WHERE symbol = ANY(%s) AND scored_at IS NOT NULL ORDER BY ts DESC LIMIT %s",
                    (wanted, max(1, min(limit, 100))))
        return [{"headline": h, "source": src, "url": url, "ts": int(ts.timestamp() * 1000),
                 "symbol": sym, "sentiment": sent, "summary": summ}
                for h, src, url, ts, sym, sent, summ in cur.fetchall()]