# API Contract (the law: change it here first, then tell the team)

Rules: timestamps = ms epoch | symbols from assets.json | user_id on every request |
starting cash $100,000 | fractional qty OK | errors = {"error": "code", "message": "..."}

## Prices
GET /prices/{symbol}
-> {"symbol":"SOL","price":148.32,"ts":1760000000000}

GET /prices/{symbol}/candles?interval=1m&limit=200
-> [{"ts":1760000000000,"o":148.1,"h":148.5,"l":147.9,"c":148.3,"v":1200}]

WS /stream (server pushes)
-> {"type":"price","symbol":"SOL","price":148.32,"ts":1760000000000}
-> {"type":"leaderboard","rows":[...]}

## Orders
POST /orders  body: {"user_id":"u_123","symbol":"SOL","side":"buy","qty":2.5}
-> {"order_id":"o_9","status":"filled","fill_price":148.32,"ts":1760000000000,"cash_after":99629.2}

## Portfolio
GET /portfolio/{user_id}
-> {"user_id":"u_123","cash":99629.2,"equity":100012.4,"pnl":12.4,"pnl_pct":0.012,
    "positions":[{"symbol":"SOL","qty":2.5,"avg_price":148.32,"last_price":150.0,"unrealized_pnl":4.2}]}

## Leaderboard
GET /leaderboard?limit=20
-> [{"rank":1,"name":"alice","is_bot":false,"equity":104200.1,"pnl_pct":4.2}]

## Models
POST /models/train
body: {"symbol":"SOL","model_type":"lightgbm",
       "hyperparams":{"n_estimators":200,"max_depth":4,"learning_rate":0.05,
                      "lookback":30,"horizon":5,"train_split":0.8}}
-> {"model_id":"m_42","metrics":{"accuracy":0.53,"precision":0.54},
    "backtest":{"equity_curve":[{"ts":1760000000000,"equity":100000}],"sharpe":0.4,"max_drawdown":0.08},
    "train_seconds":3.1}
model_type: ridge | random_forest | lightgbm

GET /models/{model_id}/predict
-> {"model_id":"m_42","symbol":"SOL","direction":"up","confidence":0.61,
    "horizon_candles":5,"ts":1760000000000}

## News
GET /news?symbol=SOL&limit=20
-> [{"headline":"...","source":"CryptoPanic","url":"...","ts":1760000000000,
     "symbol":"SOL","sentiment":0.6,"summary":"One-line summary"}]