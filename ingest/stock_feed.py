import asyncio, json, os, pathlib, time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import httpx, psycopg, websockets
from dotenv import load_dotenv
load_dotenv()

KEY = os.environ["FINNHUB_API_KEY"]
ROOT = pathlib.Path(__file__).parent.parent
ASSETS = json.loads((ROOT / "shared" / "assets.json").read_text())
MAP = {a["provider_symbol"]: a["symbol"] for a in ASSETS if a["provider"] == "finnhub"}
WS_URL = f"wss://ws.finnhub.io?token={KEY}"
HB_OPEN, HB_CLOSED = 10, 30   # heartbeat seconds when market open / closed

pending = {}      # symbol -> (price, ts_ms): latest real trade this second
unsent = []       # rows that failed to write, retried next second
last_price = {}   # symbol -> last known price
last_seen = {}    # symbol -> ms of last write

def now_ms():
    return int(time.time() * 1000)

def market_open():
    t = datetime.now(ZoneInfo("America/New_York"))
    if t.weekday() >= 5:
        return False
    mins = t.hour * 60 + t.minute
    return 570 <= mins < 960   # 9:30 to 16:00 ET (holidays not handled)

def insert_ticks(rows):
    # rows: (symbol, price, ts_ms, source)
    data = [(datetime.fromtimestamp(ts / 1000, tz=timezone.utc), sym, price, src)
            for sym, price, ts, src in rows]
    with psycopg.connect(os.environ["TIGER_DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO ticks (ts, symbol, price, source) VALUES (%s, %s, %s, %s)", data)

async def fetch_quotes():
    """REST last price for every stock (18 calls, well under 60/min)."""
    async with httpx.AsyncClient(timeout=10) as client:
        for psym, sym in MAP.items():
            try:
                d = (await client.get("https://finnhub.io/api/v1/quote",
                                      params={"symbol": psym, "token": KEY})).json()
                price = d.get("c") or d.get("pc")   # c = current/last close, pc = prev close
                if price:
                    last_price[sym] = float(price)
            except Exception as e:
                print("quote failed for", sym, e)
            await asyncio.sleep(0.15)
    print("quotes loaded:", len(last_price), "symbols")

async def quote_refresher():
    while True:
        await asyncio.sleep(600)
        if not market_open():       # when open, the WebSocket keeps prices fresh
            await fetch_quotes()

async def reader():
    while True:  # reconnect loop
        try:
            async with websockets.connect(WS_URL, ping_interval=20) as ws:
                for psym in MAP:
                    await ws.send(json.dumps({"type": "subscribe", "symbol": psym}))
                print("connected, subscribed to", len(MAP), "stocks")
                async for raw in ws:
                    msg = json.loads(raw)
                    if msg.get("type") != "trade":
                        continue
                    for tr in msg.get("data", []):
                        sym = MAP.get(tr["s"])
                        if not sym:
                            continue
                        prev = pending.get(sym)
                        if prev is None or tr["t"] >= prev[1]:
                            pending[sym] = (float(tr["p"]), int(tr["t"]))
                        last_price[sym] = float(tr["p"])
        except Exception as e:
            print("socket error, reconnecting in 3s:", e)
            await asyncio.sleep(3)

async def flusher():
    global unsent
    while True:
        await asyncio.sleep(1)
        now = now_ms()
        rows = unsent
        unsent = []
        for sym, (price, ts) in list(pending.items()):   # one real tick per symbol per second
            rows.append((sym, price, ts, "live"))
            last_seen[sym] = now
        pending.clear()
        is_open = market_open()
        hb = HB_OPEN if is_open else HB_CLOSED
        for sym, price in last_price.items():
            if now - last_seen.get(sym, 0) >= hb * 1000:
                rows.append((sym, price, now, "live" if is_open else "replay"))
                last_seen[sym] = now
        if not rows:
            continue
        try:
            await asyncio.to_thread(insert_ticks, rows)
            kind = "OPEN" if is_open else "CLOSED"
            print(f"[{kind}] wrote {len(rows)} ticks")
        except Exception as e:
            print("db error:", e)
            unsent = rows

async def main():
    await fetch_quotes()
    await asyncio.gather(reader(), flusher(), quote_refresher())

asyncio.run(main())