import json, os, pathlib, time
from datetime import datetime, timezone
import httpx, psycopg
from dotenv import load_dotenv
from zoneinfo import ZoneInfo
load_dotenv()

KEY = os.environ["TWELVEDATA_API_KEY"]
ROOT = pathlib.Path(__file__).parent.parent
ASSETS = json.loads((ROOT / "shared" / "assets.json").read_text())
MAP = {a["provider_symbol"]: a["symbol"] for a in ASSETS if a["provider"] == "twelvedata"}

def fetch(psym):
    r = httpx.get("https://api.twelvedata.com/time_series", timeout=60, params={
        "symbol": psym, "interval": "1min", "outputsize": 5000,
        "timezone": "UTC", "apikey": KEY}).json()
    if r.get("status") != "ok":
        raise RuntimeError(r.get("message", r))
    return r["values"]

def forex_closed(ts_utc):
    t = ts_utc.astimezone(ZoneInfo("America/New_York"))
    wd, mins = t.weekday(), t.hour * 60 + t.minute
    return wd == 5 or (wd == 4 and mins >= 17 * 60) or (wd == 6 and mins < 17 * 60)

rows = []
for psym, sym in MAP.items():
    values = fetch(psym)
    for v in values:
        ts = datetime.strptime(v["datetime"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        if forex_closed(ts):
            continue
        rows.append((ts, sym, float(v["close"]), "history"))
    print(sym, len(values), "bars:", values[-1]["datetime"], "->", values[0]["datetime"], "UTC")
    time.sleep(2)

with psycopg.connect(os.environ["TIGER_DATABASE_URL"]) as conn:
    conn.execute("DELETE FROM ticks WHERE source = 'history' AND symbol = ANY(%s)",
                 (list(MAP.values()),))
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO ticks (ts, symbol, price, source) VALUES (%s, %s, %s, %s)", rows)
print("inserted", len(rows), "history rows")