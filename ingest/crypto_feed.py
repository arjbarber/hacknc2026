import asyncio, json, os, pathlib, time
from datetime import datetime, timezone
import psycopg, websockets
from dotenv import load_dotenv
load_dotenv()

ROOT = pathlib.Path(__file__).parent.parent
ASSETS = json.loads((ROOT / "shared" / "assets.json").read_text())
MAP = {a["provider_symbol"]: a["symbol"] for a in ASSETS if a["provider"] == "coinbase"}
URL = "wss://ws-feed.exchange.coinbase.com"
HEARTBEAT_SECONDS = 10

buffer = []        # (symbol, price, ts_ms)
last_price = {}    # symbol -> last known price
last_seen = {}     # symbol -> wall-clock ms of last write (real tick or heartbeat)

def now_ms():
    return int(time.time() * 1000)

def to_ms(iso):
    try:
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:
        return now_ms()

def insert_ticks(rows, source="live"):
    data = [(datetime.fromtimestamp(ts / 1000, tz=timezone.utc), sym, price, source)
            for sym, price, ts in rows]
    with psycopg.connect(os.environ["TIGER_DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO ticks (ts, symbol, price, source) VALUES (%s, %s, %s, %s)", data)

def seed_last_prices():
    """Load each symbol's most recent price from the DB so quiet coins start with a value."""
    try:
        with psycopg.connect(os.environ["TIGER_DATABASE_URL"]) as conn:
            rows = conn.execute(
                "SELECT DISTINCT ON (symbol) symbol, price FROM ticks "
                "WHERE symbol = ANY(%s) ORDER BY symbol, ts DESC",
                (list(MAP.values()),)).fetchall()
        for sym, price in rows:
            last_price[sym] = price
            last_seen[sym] = 0  # forces a heartbeat on the first check
        print("seeded last prices:", {s: p for s, p in rows})
    except Exception as e:
        print("seed failed (continuing without):", e)

async def reader():
    while True:  # reconnect loop
        try:
            async with websockets.connect(URL, ping_interval=20) as ws:
                await ws.send(json.dumps({
                    "type": "subscribe",
                    "product_ids": list(MAP.keys()),
                    "channels": ["ticker"],
                }))
                print("connected, subscribed to", list(MAP.keys()))
                async for raw in ws:
                    msg = json.loads(raw)
                    if msg.get("type") == "ticker" and msg.get("product_id") in MAP:
                        sym = MAP[msg["product_id"]]
                        price = float(msg["price"])
                        buffer.append((sym, price, to_ms(msg["time"])))
                        last_price[sym] = price
                        last_seen[sym] = now_ms()
        except Exception as e:
            print("socket error, reconnecting in 3s:", e)
            await asyncio.sleep(3)

def add_heartbeats():
    """Re-write last known price for symbols that have been quiet."""
    now = now_ms()
    for sym, price in last_price.items():
        if now - last_seen.get(sym, 0) >= HEARTBEAT_SECONDS * 1000:
            buffer.append((sym, price, now))
            last_seen[sym] = now

async def flusher():
    while True:
        await asyncio.sleep(1)
        add_heartbeats()
        if not buffer:
            continue
        rows = buffer[:]
        buffer.clear()
        try:
            await asyncio.to_thread(insert_ticks, rows)
            latest = {}
            for sym, price, _ in rows:
                latest[sym] = price
            print(f"wrote {len(rows)} ticks | latest: {latest}")
        except Exception as e:
            print("db error:", e)
            buffer.extend(rows)  # keep them, retry next second

async def main():
    await asyncio.to_thread(seed_last_prices)
    await asyncio.gather(reader(), flusher())

asyncio.run(main())