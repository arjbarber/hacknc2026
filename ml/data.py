"""Fake market data: a geometric random walk sampled as hourly OHLCV candles.

A random walk has no predictable structure, so any model trained on it should
score about 50% accuracy. That makes it a good test for leakage.
"""
import numpy as np
import pandas as pd

HOUR_MS = 3_600_000


def random_walk_candles(n_hours=5000, start_price=150.0, hourly_vol=0.01,
                        start_ts_ms=1_700_000_000_000, seed=0):
    """Return a DataFrame with columns ts, open, high, low, close, volume.

    Each candle is built from 60 one-minute log-return steps so that high/low
    are real path extremes, not noise added after the fact.
    """
    rng = np.random.default_rng(seed)
    steps = 60
    minute_rets = rng.normal(0.0, hourly_vol / np.sqrt(steps), size=(n_hours, steps))
    log_path = np.log(start_price) + np.cumsum(minute_rets.ravel())
    prices = np.exp(log_path).reshape(n_hours, steps)

    close = prices[:, -1]
    open_ = np.concatenate([[start_price], close[:-1]])
    high = np.maximum(prices.max(axis=1), open_)
    low = np.minimum(prices.min(axis=1), open_)
    volume = rng.lognormal(mean=10.0, sigma=0.5, size=n_hours)
    ts = start_ts_ms + np.arange(n_hours, dtype=np.int64) * HOUR_MS

    return pd.DataFrame({"ts": ts, "open": open_, "high": high, "low": low,
                         "close": close, "volume": volume})
