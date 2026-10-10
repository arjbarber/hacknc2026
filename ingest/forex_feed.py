import asyncio, json, os, pathlib, time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import httpx, psycopg
from dotenv import load_dotenv
load_dotenv()

KEY = os.environ["TWELVEDATA_API_KEY"]
LIVE = os.getenv("FOREX_LIVE", "false").lower() == "true"
IGNORE_HOURS = os.getenv("FOREX_IGNORE_HOURS", "false").lower() == "true"
POLL_SECONDS = int(os.getenv("FOREX_POLL_SECONDS", "60"))
DAILY_LIMIT = 760        # free plan is 800/day, keep a reserve for tests
STALE_AFTER_S = 180      # quote older than this = not live

ROOT = pathlib.Path(__file__).parent.parent
ASSETS = json.loads((ROOT / "shared" / "assets.json").read_text())
MAP = {a["provider_symbol"]: a["symbol"] for a in ASSETS if a["provider"] == "twelvedata"}
CACHE_DIR = ROOT / "ingest" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CREDITS_FILE = CACHE_DIR / "forex_credits.json"

pending = []       # (symbol, price, ts_ms, source)
unsent = []
last_price = {}    # symbol -> last known price
last_seen = {}     # symbol -> ms of last write
last_live = {}     # symbol -> ms when we last got a fresh quote

def now_ms():
    return int(time.time() * 1000)

def forex_open():
    t = datetime.now(ZoneInfo("America/New_York"))
    wd, mins = t.weekday(), t.hour * 60 + t.minute
    if wd == 5: return False                    # Saturday
    if wd == 4 and mins >= 17 * 60: return False  # Friday after 5pm ET
    if wd == 6 and mins < 17 * 60: return False   # Sunday before 5pm ET
    return True

def today_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def load_credits():
    try:
        d = json.loads(CREDITS_FILE.read_text())
        if d.get("date") == today_utc():
            return d["used"]
    except Exception:
        pass
    return 0

def save_credits(used):
    CREDITS_FILE.write_text(json.dumps({"date": today_utc(), "used": used}))

credits_used = load_credits()

def insert_ticks(rows):
    data = [(datetime.fromtimestamp(ts / 1000, tz=timezone.utc), sym, price, src)
            for sym, price, ts, src in rows]
    with psycopg.connect(os.environ["TIGER_DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO ticks (ts, symbol, price, source) VALUES (%s, %s, %s, %s)", data)

def seed_last_prices():
    try:
        with psycopg.connect(os.environ["TIGER_DATABASE_URL"]) as conn:
            rows = conn.execute(
                "SELECT DISTINCT ON (symbol) symbol, price FROM ticks "
                "WHERE symbol = ANY(%s) ORDER BY symbol, ts DESC",
                (list(MAP.values()),)).fetchall()
        for sym, price in rows:
            last_price[sym] = price
            last_seen[sym] = 0
        print("seeded last prices:", {s: p for s, p in rows})
    except Exception as e:
        print("seed failed (continuing without):", e)

async def poll_once(client):
    global credits_used
    r = await client.get("https://api.twelvedata.com/quote",
                         params={"symbol": ",".join(MAP.keys()), "apikey": KEY})
    credits_used += len(MAP)
    save_credits(credits_used)
    data = r.json()
    if data.get("status") == "error":
        print("twelvedata error:", data.get("message"))
        return
    if len(MAP) == 1:
        data = {next(iter(MAP)): data}
    now = now_ms()
    for psym, q in data.items():
        sym = MAP.get(psym)
        if not sym or not isinstance(q, dict) or "close" not in q:
            print("bad quote for", psym, q)
            continue
        price = float(q["close"])
        qts = int(q.get("last_quote_at") or 0)
        last_price[sym] = price
        if qts and now / 1000 - qts <= STALE_AFTER_S:
            pending.append((sym, price, qts * 1000, "live"))
            last_seen[sym] = now
            last_live[sym] = now
        else:
            print(f"{sym}: quote is stale, treating as replay")
    print(f"polled {len(MAP)} pairs | credits used today: {credits_used}/{DAILY_LIMIT}")

async def poller():
    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            if credits_used + len(MAP) > DAILY_LIMIT:
                print("daily credit budget reached, replay only until UTC midnight")
            elif forex_open() or IGNORE_HOURS:
                try:
                    await poll_once(client)
                except Exception as e:
                    print("poll failed:", e)
            else:
                print("forex closed, not polling")
            await asyncio.sleep(POLL_SECONDS)

async def flusher():
    global unsent
    while True:
        await asyncio.sleep(1)
        now = now_ms()
        rows = unsent + pending[:]
        unsent = []
        pending.clear()
        for sym, price in last_price.items():
            fresh = now - last_live.get(sym, 0) < 120_000
            hb = 10 if fresh else 30
            if now - last_seen.get(sym, 0) >= hb * 1000:
                rows.append((sym, price, now, "live" if fresh else "replay"))
                last_seen[sym] = now
        if not rows:
            continue
        try:
            await asyncio.to_thread(insert_ticks, rows)
            live = sum(1 for r in rows if r[3] == "live")
            print(f"wrote {len(rows)} ticks ({live} live, {len(rows) - live} replay)")
        except Exception as e:
            print("db error:", e)
            unsent = rows

async def main():
    await asyncio.to_thread(seed_last_prices)
    tasks = [flusher()]
    if LIVE:
        print(f"FOREX_LIVE=true | polling every {POLL_SECONDS}s | credits today: {credits_used}/{DAILY_LIMIT}")
        tasks.append(poller())
    else:
        print("FOREX_LIVE=false: replay only, no credits spent")
    await asyncio.gather(*tasks)

asyncio.run(main())