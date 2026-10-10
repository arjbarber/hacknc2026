"""Leakage check: on a random walk, every model should score about 50%.

Run from the repo root:  python -m ml.sanity_check
Any model above 52% (averaged over 5 seeds of 20k hours) means there's a leak to find.
With less data, noise alone can push a single run past 52%: when horizon > 1,
neighboring labels overlap, so the effective sample size is about n_test / horizon
(~800 for 4000 test rows at horizon 5), not n_test.
"""
import sys

import numpy as np

from ml.data import random_walk_candles
from ml.train import predict, train

MODELS = ["logreg", "random_forest", "lightgbm"]
SEEDS = [0, 1, 2, 3, 4]
LIMIT = 0.52


def main():
    failed = False
    for model_type in MODELS:
        accs, bases, sharpes = [], [], []
        for seed in SEEDS:
            candles = random_walk_candles(n_hours=20000, seed=seed)
            try:
                out = train(candles, model_type=model_type, seed=seed)
            except ImportError as e:
                print(f"{model_type:14s} skipped ({e})")
                break
            accs.append(out["metrics"]["accuracy"])
            bases.append(out["metrics"]["baseline_always_up"])
            sharpes.append(out["backtest"]["sharpe"])
            last = out
        else:
            acc = float(np.mean(accs))
            ok = acc <= LIMIT
            failed |= not ok
            print(f"{model_type:14s} acc={acc:.3f}  always-up={np.mean(bases):.3f}  "
                  f"sharpe={np.mean(sharpes):+.2f}  dd={last['backtest']['max_drawdown']:.3f}  "
                  f"t={last['train_seconds']:.1f}s  {'OK' if ok else 'LEAK?'}")
            print(f"{'':14s} predict -> {predict(last['model_id'])}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
