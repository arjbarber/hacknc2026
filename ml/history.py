"""Real hourly candles for training and live overlays.

Crypto comes from Coinbase's public candles API and stocks/forex from Yahoo's
chart API. Neither needs a key. Results are cached in memory for a few minutes.
If a fetch fails (offline, rate limited, unknown symbol), it falls back to the
random-walk generator and says so in `source`, so the UI can label it as fake.

Only closed candles are returned: the in-progress hour is dropped, because the
models were trained on finished candles.
"""
import json
import time
import urllib.parse
import urllib.request
import zlib
from pathlib import Path

import pandas as pd

from ml.data import random_walk_candles

HOUR_MS = 3_600_000
CACHE_SECONDS = 300
_ASSETS = {a["symbol"]: a for a in json.loads(
    (Path(__file__).resolve().parents[1] / "shared" / "assets.json").read_text())}
_cache = {}   # symbol -> (fetched_at, candles DataFrame, source)

# Candles per year, used to annualize Sharpe. Stocks trade ~7 hourly bars a day.
CANDLES_PER_YEAR = {"crypto": 24 * 365, "stock": 252 * 7, "forex": 24 * 5 * 52}


def asset_class(symbol):
    return _ASSETS.get(symbol, {}).get("class", "crypto")


def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (aerorithmetic-ml)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def _coinbase(product, n):
    """Coinbase returns at most 300 candles per request, newest first."""
    rows, end = [], int(time.time()) // 3600 * 3600
    while len(rows) < n:
        start = end - 300 * 3600
        q = urllib.parse.urlencode({"granularity": 3600,
                                    "start": pd.Timestamp(start, unit="s", tz="UTC").isoformat(),
                                    "end": pd.Timestamp(end, unit="s", tz="UTC").isoformat()})
        batch = _get_json(f"https://api.exchange.coinbase.com/products/{product}/candles?{q}")
        if not batch:
            break
        rows += batch
        end = start
        time.sleep(0.12)   # stay under the public rate limit
    df = pd.DataFrame(rows, columns=["t", "low", "high", "open", "close", "volume"])
    df["ts"] = df["t"].astype("int64") * 1000
    return df[["ts", "open", "high", "low", "close", "volume"]]


def _yahoo(ticker):
    q = urllib.parse.urlencode({"interval": "1h", "range": "730d"})
    res = _get_json(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}?{q}")
    r = res["chart"]["result"][0]
    quote = r["indicators"]["quote"][0]
    df = pd.DataFrame({"ts": pd.Series(r["timestamp"], dtype="int64") * 1000,
                       "open": quote["open"], "high": quote["high"], "low": quote["low"],
                       "close": quote["close"], "volume": quote["volume"]})
    df["volume"] = df["volume"].fillna(0)   # forex reports no volume
    return df.dropna()


def _fetch(symbol, n):
    asset = _ASSETS.get(symbol)
    if asset is None:
        raise KeyError(f"unknown symbol {symbol}")
    if asset["class"] == "crypto":
        return _coinbase(asset["provider_symbol"], n), "coinbase"
    ticker = f"{symbol}=X" if asset["class"] == "forex" else symbol
    return _yahoo(ticker), "yahoo"


def get_candles(symbol, n=5000):
    """Return (candles, source): up to n closed hourly candles, oldest first."""
    hit = _cache.get(symbol)
    if hit and time.time() - hit[0] < CACHE_SECONDS and len(hit[1]) >= min(n, len(hit[1])):
        return hit[1].tail(n).reset_index(drop=True), hit[2]
    if symbol not in _ASSETS:
        raise KeyError(f"unknown symbol {symbol}")
    try:
        df, source = _fetch(symbol, n)
        df = (df.drop_duplicates("ts").sort_values("ts")
                .astype({"open": float, "high": float, "low": float, "close": float, "volume": float}))
        now_ms = int(time.time() * 1000)
        df = df[df["ts"] + HOUR_MS <= now_ms]          # closed candles only
        if len(df) < 500:
            raise ValueError(f"only {len(df)} candles")
    except Exception as e:  # network, parsing, or too little history
        print(f"history: {symbol} fetch failed ({e}); using synthetic candles")
        seed = zlib.crc32(symbol.encode())
        df = random_walk_candles(n_hours=n, seed=seed,
                                 start_ts_ms=(int(time.time() * 1000) // HOUR_MS - n) * HOUR_MS)
        source = "synthetic"
    df = df.tail(n).reset_index(drop=True)
    _cache[symbol] = (time.time(), df, source)
    return df, source
