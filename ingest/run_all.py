import asyncio, json, os, pathlib, signal, sys, time
from datetime import datetime
import psycopg
from dotenv import load_dotenv
load_dotenv()

ROOT = pathlib.Path(__file__).parent.parent
ASSETS = json.loads((ROOT / "shared" / "assets.json").read_text())
FEED_OF_CLASS = {"crypto": "crypto", "stock": "stocks", "forex": "forex"}
CLASS_OF = {a["symbol"]: FEED_OF_CLASS[a["class"]] for a in ASSETS}

FEEDS = {
    "crypto": "ingest/crypto_feed.py",
    "stocks": "ingest/stock_feed.py",
    "forex":  "ingest/forex_feed.py",
}
VERBOSE = os.getenv("INGEST_VERBOSE", "false").lower() == "true"
STATUS_EVERY = 60
procs = {}
stopping = False

def log(msg):
    print(f"{datetime.now().strftime('%H:%M:%S')} {msg}", flush=True)

async def pump(name, stream):
    """Forward a feed's output with a prefix; hide the per-second 'wrote' lines unless verbose."""
    while True:
        line = await stream.readline()
        if not line:
            return
        text = line.decode(errors="replace").rstrip()
        if VERBOSE or "wrote " not in text:
            log(f"[{name}] {text}")

async def supervise(name, script):
    backoff = 2
    while not stopping:
        started = time.time()
        env = {**os.environ, "PYTHONUNBUFFERED": "1"}
        p = await asyncio.create_subprocess_exec(
            sys.executable, "-u", str(ROOT / script),
            cwd=str(ROOT), env=env,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        procs[name] = p
        log(f"[{name}] started (pid {p.pid})")
        await pump(name, p.stdout)
        code = await p.wait()
        if stopping:
            return
        ran = time.time() - started
        backoff = 2 if ran > 60 else min(backoff * 2, 30)
        log(f"[{name}] exited with code {code} after {ran:.0f}s, restarting in {backoff}s")
        await asyncio.sleep(backoff)

def status_query():
    with psycopg.connect(os.environ["TIGER_DATABASE_URL"]) as conn:
        return conn.execute(
            "SELECT symbol, source, count(*), max(ts) FROM ticks "
            "WHERE ts > now() - interval '1 minute' AND source IN ('live','replay') "
            "GROUP BY symbol, source").fetchall()

async def status_loop(active):
    while not stopping:
        await asyncio.sleep(STATUS_EVERY)
        try:
            rows = await asyncio.to_thread(status_query)
        except Exception as e:
            log(f"[status] db check failed: {e}")
            continue
        stats = {c: {"live": 0, "replay": 0} for c in active}
        for sym, src, n, _ in rows:
            c = CLASS_OF.get(sym)
            if c in stats:
                stats[c][src] += n
        parts = [f"{c}: {s['live']} live / {s['replay']} replay" for c, s in stats.items()]
        log("[status] last 60s -> " + " | ".join(parts))
        for c, s in stats.items():
            if s["live"] + s["replay"] == 0:
                log(f"[status] WARNING: no {c} ticks in the last minute")

async def main():
    global stopping
    wanted = [a for a in sys.argv[1:] if a in FEEDS] or list(FEEDS)
    log(f"starting feeds: {', '.join(wanted)} | FOREX_LIVE={os.getenv('FOREX_LIVE', 'false')}")
    tasks = [asyncio.create_task(supervise(n, FEEDS[n])) for n in wanted]
    tasks.append(asyncio.create_task(status_loop(wanted)))
    loop = asyncio.get_running_loop()
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    await stop.wait()
    stopping = True
    log("shutting down...")
    for p in procs.values():
        if p.returncode is None:
            p.terminate()
    for t in tasks:
        t.cancel()
    await asyncio.sleep(1)

asyncio.run(main())