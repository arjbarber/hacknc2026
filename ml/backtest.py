"""A simple threshold backtest on the test set.

Each candle: go long if P(up) > threshold, go short if P(up) < 1 - threshold,
otherwise hold no position. The position earns the next candle's return.
Fees are charged on every change in position.
"""
import numpy as np

# Sharpe is annualized by candles per year. The default assumes hourly crypto candles
# (24/7). For hourly US stocks use about 252 * 7.
CANDLES_PER_YEAR = 24 * 365


def run_backtest(proba_up, fwd_ret, ts, threshold=0.55, fee_bps=10,
                 start_equity=100_000.0, allow_short=True, candles_per_year=CANDLES_PER_YEAR):
    proba_up = np.asarray(proba_up, dtype=float)
    fwd = np.asarray(fwd_ret, dtype=float)

    pos = np.where(proba_up > threshold, 1.0, 0.0)
    if allow_short:
        pos = np.where(proba_up < 1 - threshold, -1.0, pos)

    turnover = np.abs(np.diff(np.concatenate([[0.0], pos])))
    strat_ret = pos * fwd - turnover * fee_bps / 10_000
    equity = start_equity * np.cumprod(1 + strat_ret)

    std = strat_ret.std()
    sharpe = float(strat_ret.mean() / std * np.sqrt(candles_per_year)) if std > 0 else 0.0
    peak = np.maximum.accumulate(equity)
    max_dd = float(((peak - equity) / peak).max()) if len(equity) else 0.0

    return {
        "equity_curve": [{"ts": int(t), "equity": round(float(e), 2)}
                         for t, e in zip(ts, equity)],
        "sharpe": round(sharpe, 3),
        "max_drawdown": round(max_dd, 4),
        "total_return": round(float(equity[-1] / start_equity - 1), 4) if len(equity) else 0.0,
        "n_trades": int((turnover > 0).sum()),
        "exposure": round(float((pos != 0).mean()), 3),
    }
