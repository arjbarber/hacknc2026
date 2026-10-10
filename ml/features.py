"""Features and labels built only from past prices.

The features in row t use candles up to and including t.
The label in row t is whether close[t + horizon] > close[t].
"""
import numpy as np
import pandas as pd

LAGS = (1, 2, 3, 6, 12, 24)


def _rsi(close, period=14):
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    # No losses yet: RSI is 100 (or 50 if the price hasn't moved at all), not NaN.
    # A NaN here would drop a row mid-series and break the purge in time_split.
    rsi = 100 - 100 / (1 + gain / loss.where(loss > 0))
    return rsi.mask(loss == 0, np.where(gain > 0, 100.0, 50.0))


def _macd(close, fast=12, slow=26, signal=9):
    macd = close.ewm(span=fast, adjust=False).mean() - close.ewm(span=slow, adjust=False).mean()
    sig = macd.ewm(span=signal, adjust=False).mean()
    # Divide by price so the values are comparable across assets.
    return macd / close, (macd - sig) / close


def build_features(candles, lookback=30, horizon=5, require_label=True):
    """Return (X, y, ts, fwd_ret) with rows aligned and NaNs dropped.

    lookback sets the volatility window and caps which return lags are used.
    The last `horizon` rows are dropped because their label isn't known yet,
    unless require_label=False (for predicting on the newest candles); then y
    and fwd_ret are NaN on those rows.
    """
    close = candles["close"].astype(float)
    log_close = np.log(close)
    f = pd.DataFrame(index=candles.index)

    for k in LAGS:
        if k <= lookback:
            f[f"ret_{k}"] = log_close.diff(k)
    one_candle = log_close.diff()
    f["vol"] = one_candle.rolling(lookback).std()
    f["vol_short"] = one_candle.rolling(max(2, lookback // 4)).std()
    f["rsi"] = _rsi(close) / 100.0
    f["macd"], f["macd_hist"] = _macd(close)
    f["volume_chg"] = np.log1p(candles["volume"].astype(float)).diff()  # log1p: forex volume can be 0
    f["range"] = (candles["high"] - candles["low"]) / close

    future = close.shift(-horizon)
    y = (future > close).astype(float).where(future.notna())
    # Return of the candle after t, used by the backtest (never a feature).
    fwd_ret = close.shift(-1) / close - 1

    keep = f.notna().all(axis=1)
    if require_label:
        keep &= y.notna()
    # Rows must be consecutive (warm-up cut from the front, unlabeled rows from the back)
    # because time_split purges `horizon` rows by position.
    kept = np.flatnonzero(keep.to_numpy())
    if len(kept) and kept[-1] - kept[0] + 1 != len(kept):
        raise ValueError("features have NaNs mid-series; time_split's purge would be wrong")
    y = y[keep].reset_index(drop=True)
    return (f[keep].reset_index(drop=True),
            y.astype(int) if require_label else y,
            candles["ts"][keep].reset_index(drop=True),
            fwd_ret[keep].reset_index(drop=True))


def latest_features(candles, lookback=30):
    """Feature row for the most recent candle (it has no label yet), for live predictions."""
    X, *_ = build_features(candles, lookback=lookback, require_label=False)
    return X.iloc[[-1]]
