import json
import math
import os
import time
import uuid
from pathlib import Path

import psycopg
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from ml.api import router as ml_router
from ml.history import get_candles, live_quote
from backend.fih import router as fih_router

try:
    from backend.auth import router as auth_router, get_current_user, get_optional_user
except ImportError:
    from auth import router as auth_router, get_current_user, get_optional_user

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()
DB_URL = os.getenv("TIGER_DATABASE_URL")

app = FastAPI(title="Aerorithmetic Trading API")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])  # lets Next.js call it

# Auth routes (/auth/signup, /auth/login, /auth/logout, /auth/me, /auth/refresh, etc.)
app.include_router(auth_router)

# Model routes (/models/train, /models/{id}/predict, /models/{id}/overlay, /history/{symbol})
# come from the ML package, trained on real hourly history.
app.include_router(ml_router)
app.include_router(fih_router)

from backend.nessie_router import router as nessie_router
app.include_router(nessie_router)

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
# Leverage on buys: at 5x, a $10,000 position costs $2,000 of cash and borrows $8,000.
LEVERAGE_CHOICES = (1, 2, 3, 5, 10)
# A leveraged position is liquidated (sold at market) once its own equity
# (value - borrowed) falls below this share of its value.
MAINTENANCE_MARGIN = 0.05
ASSETS = {a["symbol"]: a for a in json.loads(
    (Path(__file__).resolve().parents[1] / "shared" / "assets.json").read_text())}


FRESH_TICK_MS = 120_000


def latest_price(symbol, cur=None):
    """(price, ts_ms, source) for a symbol, or None. In order of preference:
    1. a tick from the ingest feeds under 2 minutes old ("live", or "replay": the feeds
       re-write a closed market's last real price as a heartbeat)
    2. a live quote straight from Coinbase / Yahoo (when the feeds aren't running)
    3. an older tick
    4. the last closed hourly candle
    """
    tick = None
    if cur is not None:
        cur.execute("SELECT price, ts, source FROM ticks WHERE symbol = %s ORDER BY ts DESC LIMIT 1", (symbol,))
        row = cur.fetchone()
        if row:
            tick = (float(row[0]), int(row[1].timestamp() * 1000), row[2] or "live")
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
def order(body: dict, auth_user: dict | None = Depends(get_optional_user)):
    user_id = body.get("user_id") or (auth_user["id"] if auth_user else None)
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
    try:
        leverage = float(body.get("leverage", 1) or 1)
    except (TypeError, ValueError):
        leverage = 0.0
    if leverage not in LEVERAGE_CHOICES:
        choices = ", ".join(f"{x}x" for x in LEVERAGE_CHOICES)
        raise HTTPException(status_code=400, detail=f"Leverage must be one of {choices}")
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
            display_name = (auth_user.get("name") if auth_user else None) or user_id
            cur.execute("INSERT INTO users (id, name, cash) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
                        (user_id, display_name, START_CASH))
            # Settle any leveraged positions that have already run out of margin.
            _liquidate(cur, user_id, {symbol: price})
            cur.execute("SELECT cash FROM users WHERE id = %s FOR UPDATE", (user_id,))
            cash = cur.fetchone()[0]
            cur.execute("SELECT qty, avg_price, borrowed FROM positions WHERE user_id = %s AND symbol = %s FOR UPDATE",
                        (user_id, symbol))
            pres = cur.fetchone()

            notional = price * qty
            held, avg, borrowed = pres if pres else (0.0, 0.0, 0.0)
            # Four cases: open/add long, reduce long, open/add short, cover short.
            # Leverage only applies when opening or adding; reducing/covering is 1x.
            opening = (side == "buy" and held >= -1e-9) or (side == "sell" and held <= 1e-9)
            if not opening:
                leverage = 1.0
            margin = notional / leverage
            at = f" at {leverage:g}x" if leverage > 1 else ""
            if opening and cash < margin:
                raise HTTPException(status_code=400, detail=f"Insufficient funds: this needs {margin:,.2f} of cash{at} and you have {cash:,.2f}")

            if side == "buy" and opening:              # open/add long: margin from cash, rest borrowed
                cash_after = cash - margin
                new_qty, new_borrowed = held + qty, borrowed + (notional - margin)
                new_avg = (held * avg + qty * price) / new_qty
            elif side == "sell" and not opening:       # reduce long: repay this sale's share of the debt
                if qty > held + 1e-9:
                    raise HTTPException(status_code=400, detail=f"You hold {held:g} {symbol}. Sell those first, then sell again to go short.")
                repay = borrowed * min(1.0, qty / held)
                cash_after = cash + notional - repay
                new_qty, new_borrowed, new_avg = held - qty, borrowed - repay, avg
            elif side == "sell":                       # open/add short: post margin, hold proceeds as collateral
                cash_after = cash - margin
                short = -held
                new_qty, new_borrowed = held - qty, borrowed - (notional + margin)
                new_avg = (short * avg + qty * price) / (short + qty)
            else:                                      # cover short: release collateral, pay to buy back
                short = -held
                if qty > short + 1e-9:
                    raise HTTPException(status_code=400, detail=f"You're short {short:g} {symbol}. Buy {short:g} to cover it first, then buy again to go long.")
                release = -borrowed * min(1.0, qty / short)
                cash_after = cash + release - notional
                new_qty, new_borrowed, new_avg = held + qty, borrowed + release, avg

            if abs(new_qty) <= 1e-9:
                cur.execute("DELETE FROM positions WHERE user_id = %s AND symbol = %s", (user_id, symbol))
            elif pres:
                cur.execute("UPDATE positions SET qty = %s, avg_price = %s, borrowed = %s WHERE user_id = %s AND symbol = %s",
                            (new_qty, new_avg, new_borrowed, user_id, symbol))
            else:
                cur.execute("INSERT INTO positions (user_id, symbol, qty, avg_price, borrowed) VALUES (%s, %s, %s, %s, %s)",
                            (user_id, symbol, new_qty, new_avg, new_borrowed))

            cur.execute("UPDATE users SET cash = %s WHERE id = %s", (cash_after, user_id))
            cur.execute("INSERT INTO orders (id, user_id, symbol, side, qty, fill_price, leverage) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (order_id, user_id, symbol, side, qty, price, leverage))
            ts_ms = int(time.time() * 1000)

    return {"order_id": order_id, "status": "filled", "symbol": symbol, "side": side, "qty": qty,
            "fill_price": price, "leverage": leverage, "ts": ts_ms, "cash_after": cash_after}


@app.get("/orders/me")
def my_orders(limit: int = 50, user: dict = Depends(get_current_user)):
    return order_history(user["id"], limit=limit)


@app.get("/orders/{user_id}")
def order_history(user_id: str, limit: int = 50):
    require_db()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, symbol, side, qty, fill_price, status, ts, leverage FROM orders "
                    "WHERE user_id = %s ORDER BY ts DESC LIMIT %s", (user_id, max(1, min(limit, 500))))
        return [{"order_id": oid, "symbol": sym, "side": side, "qty": qty, "fill_price": fill,
                 "status": status, "ts": int(ts.timestamp() * 1000), "leverage": lev}
                for oid, sym, side, qty, fill, status, ts, lev in cur.fetchall()]


def _price_of(cur, symbol, prices):
    """Latest price, cached in `prices` across a request (None if unknown)."""
    if symbol not in prices:
        quote = latest_price(symbol, cur)
        prices[symbol] = quote[0] if quote else None
    return prices[symbol]


def liquidation_price(qty, borrowed):
    """Price at which a position's equity hits the maintenance margin: below it for a
    leveraged long, above it for a short. None for an unleveraged long."""
    if qty > 0 and borrowed > 0:
        return borrowed / (qty * (1 - MAINTENANCE_MARGIN))
    if qty < 0 and borrowed < 0:
        return borrowed / (qty * (1 + MAINTENANCE_MARGIN))
    return None


def _liquidate(cur, user_id, prices):
    """Close, at market, any leveraged long or short whose equity (value - borrowed) is below
    MAINTENANCE_MARGIN of its value: sells a long / buys back a short, settles the debt or
    collateral, and records a 'liquidated' order. Runs inside the caller's transaction."""
    cur.execute("SELECT symbol, qty, borrowed FROM positions WHERE user_id = %s AND borrowed <> 0 FOR UPDATE", (user_id,))
    to_close = []
    for symbol, qty, borrowed in cur.fetchall():
        price = _price_of(cur, symbol, prices)
        if price is not None and qty * price - borrowed < MAINTENANCE_MARGIN * abs(qty * price):
            to_close.append((symbol, qty, borrowed, price))
    if not to_close:
        return
    cur.execute("SELECT cash FROM users WHERE id = %s FOR UPDATE", (user_id,))
    cash = cur.fetchone()[0]
    for symbol, qty, borrowed, price in to_close:
        cash += qty * price - borrowed
        cur.execute("DELETE FROM positions WHERE user_id = %s AND symbol = %s", (user_id, symbol))
        cur.execute("INSERT INTO orders (id, user_id, symbol, side, qty, fill_price, status, leverage) "
                    "VALUES (%s, %s, %s, %s, %s, %s, 'liquidated', 1)",
                    ("o_" + str(uuid.uuid4())[:8], user_id, symbol, "sell" if qty > 0 else "buy", abs(qty), price))
    cur.execute("UPDATE users SET cash = %s WHERE id = %s", (cash, user_id))


def _account(cur, user_id, prices):
    """Liquidate if needed, then mark the user's positions to market.
    Returns (cash, positions, equity); equity = cash + sum(value - borrowed)."""
    _liquidate(cur, user_id, prices)
    cur.execute("SELECT cash FROM users WHERE id = %s", (user_id,))
    cash = cur.fetchone()[0]
    cur.execute("SELECT symbol, qty, avg_price, borrowed FROM positions WHERE user_id = %s ORDER BY symbol", (user_id,))
    positions, equity = [], cash
    for symbol, qty, avg_price, borrowed in cur.fetchall():
        price = _price_of(cur, symbol, prices)
        last_price = price if price is not None else avg_price
        value = last_price * qty
        equity += value - borrowed
        positions.append({"symbol": symbol, "qty": qty, "avg_price": avg_price, "last_price": last_price,
                          "unrealized_pnl": (last_price - avg_price) * qty + 0.0,   # + 0.0 turns -0.0 into 0.0
                          "borrowed": borrowed, "position_equity": value - borrowed,
                          "side": "long" if qty > 0 else "short",
                          "leverage": round(abs(value) / (value - borrowed), 2) if value - borrowed > 0 else None,
                          "liquidation_price": liquidation_price(qty, borrowed)})
    return cash, positions, equity


@app.get("/portfolio/me")
def my_portfolio(user: dict = Depends(get_current_user)):
    return portfolio(user["id"])


@app.get("/portfolio/{user_id}")
def portfolio(user_id: str):
    require_db()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT cash FROM users WHERE id = %s", (user_id,))
        res = cur.fetchone()
        if not res:
            return {"user_id": user_id, "cash": START_CASH, "equity": START_CASH, "pnl": 0.0, "pnl_pct": 0.0, "positions": []}
        cash, positions, equity = _account(cur, user_id, {})
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
        for uid, name, is_bot, _ in cur.fetchall():
            _, _, equity = _account(cur, uid, prices)
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
