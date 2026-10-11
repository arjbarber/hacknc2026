import json, os, pathlib
from datetime import datetime
from zoneinfo import ZoneInfo
import psycopg
from dotenv import load_dotenv
load_dotenv()

ROOT = pathlib.Path(__file__).parent.parent
ASSETS = json.loads((ROOT / "shared" / "assets.json").read_text())
FOREX_POLLING = os.getenv("FOREX_LIVE", "false").lower() == "true"

def et_now():
    return datetime.now(ZoneInfo("America/New_York"))

def stocks_open():
    t = et_now()
    return t.weekday() < 5 and 570 <= t.hour * 60 + t.minute < 960

def forex_open():
    t = et_now(); wd, m = t.weekday(), t.hour * 60 + t.minute
    return not (wd == 5 or (wd == 4 and m >= 1020) or (wd == 6 and m < 1020))

def ui_label(src, age):
    if age > 120:
        return "Delayed"
    return "Live" if src == "live" else "Market closed / simulated"

def expected(cls):
    if cls == "crypto": return "Live"
    if cls == "stock":  return "Live" if stocks_open() else "Market closed / simulated"
    if cls == "forex":
        return "Live" if (forex_open() and FOREX_POLLING) else "Market closed / simulated"

with psycopg.connect(os.environ["TIGER_DATABASE_URL"]) as conn:
    latest = {r[0]: r for r in conn.execute(
        "SELECT DISTINCT ON (symbol) symbol, price, source, extract(epoch from now() - ts) "
        "FROM ticks WHERE source IN ('live','replay') AND ts > now() - interval '1 day' "
        "ORDER BY symbol, ts DESC")}

print(f"ET now: {et_now():%a %H:%M} | stocks open: {stocks_open()} | forex open: {forex_open()} | FOREX_LIVE: {FOREX_POLLING}\n")
bad = 0
for a in ASSETS:
    s, cls = a["symbol"], a["class"]
    if s not in latest:
        print(f"MISSING  {s}"); bad += 1; continue
    _, price, src, age = latest[s]
    got, want = ui_label(src, age), expected(cls)
    ok = got == want
    bad += not ok
    print(f"{'OK  ' if ok else 'DIFF'} {s:7} {cls:7} src={src:7} age={age:5.0f}s  UI shows: {got:26} expected: {want}")
print(f"\n{bad} mismatch(es)")