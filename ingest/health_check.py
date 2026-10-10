import json, os, pathlib
import psycopg
from dotenv import load_dotenv
load_dotenv()

ROOT = pathlib.Path(__file__).parent.parent
ASSETS = json.loads((ROOT / "shared" / "assets.json").read_text())
SYMS = [a["symbol"] for a in ASSETS]
problems = 0

with psycopg.connect(os.environ["TIGER_DATABASE_URL"]) as conn:
    latest = {r[0]: r for r in conn.execute(
        "SELECT DISTINCT ON (symbol) symbol, price, source, extract(epoch from now() - ts) "
        "FROM ticks WHERE ts > now() - interval '2 days' ORDER BY symbol, ts DESC").fetchall()}

    print("== Freshness (every symbol should have a tick under 60s old) ==")
    for s in SYMS:
        if s not in latest:
            print(f"  MISSING  {s}: no ticks at all"); problems += 1; continue
        _, price, src, age = latest[s]
        flag = "OK     " if age < 60 else "STALE  "
        if age >= 60: problems += 1
        print(f"  {flag} {s:7} price={price:<12g} source={src:8} age={age:.0f}s")

    print("== Unknown symbols in ticks (last hour) ==")
    known = set(SYMS)
    unk = [r[0] for r in conn.execute(
        "SELECT DISTINCT symbol FROM ticks WHERE ts > now() - interval '1 hour'").fetchall()
        if r[0] not in known]
    print("  none" if not unk else f"  {unk}  <- symbol mismatch or leftover test rows")
    problems += len(unk)

    print("== Biggest gap per symbol, last 15 min (seconds) ==")
    for sym, gap in conn.execute(
        "SELECT symbol, max(gap) FROM (SELECT symbol, extract(epoch from ts - lag(ts) OVER "
        "(PARTITION BY symbol ORDER BY ts)) AS gap FROM ticks WHERE ts > now() - interval '15 minutes' "
        "AND source IN ('live','replay')) g GROUP BY symbol ORDER BY 2 DESC NULLS LAST LIMIT 5").fetchall():
        print(f"  {sym:7} {gap or 0:.0f}s" + ("  <- gap" if (gap or 0) > 60 else ""))

    print("== Price jumps over 5% between consecutive ticks, last hour ==")
    jumps = conn.execute(
        "SELECT symbol, ts, prev, price FROM (SELECT symbol, ts, price, lag(price) OVER "
        "(PARTITION BY symbol ORDER BY ts) prev FROM ticks WHERE ts > now() - interval '1 hour' "
        "AND source IN ('live','replay')) t WHERE prev > 0 AND abs(price/prev - 1) > 0.05 LIMIT 10").fetchall()
    print("  none" if not jumps else "")
    for j in jumps: print("  ", j); problems += 1

print(f"\n{problems} problem(s) found")