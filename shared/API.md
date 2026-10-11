# API Contract (the law: change it here first, then tell the team)

Rules: timestamps = ms epoch | symbols from assets.json | user_id on every request |
starting cash $100,000 | fractional qty OK | errors = {"error": "code", "message": "..."}

## Prices
GET /prices/{symbol}
-> {"symbol":"SOL","price":148.32,"ts":1760000000000,"source":"live"}
source: live / replay (tick from the ingest feeds; replay = a closed market's last price) |
coinbase-live / yahoo-live (straight from the exchange when no fresh tick) | coinbase / yahoo (last hourly close, when there
is no tick yet). 404 for symbols not in assets.json, 503 if no price exists at all.

GET /prices/{symbol}/candles?interval=1m&limit=200
-> [{"ts":1760000000000,"o":148.1,"h":148.5,"l":147.9,"c":148.3,"v":1200}]

WS /stream (server pushes)
-> {"type":"price","symbol":"SOL","price":148.32,"ts":1760000000000}
-> {"type":"leaderboard","rows":[...]}

## Orders
POST /orders  body: {"user_id":"u_123","symbol":"SOL","side":"buy","qty":2.5}
-> {"order_id":"o_9","status":"filled","symbol":"SOL","side":"buy","qty":2.5,
    "fill_price":148.32,"ts":1760000000000,"cash_after":99629.2}
Market orders fill at the same price GET /prices returns. 400 for: missing user_id, symbol
not in assets.json, side not buy/sell, qty not > 0, insufficient funds/position (message says
how much you have). The account is created with $100,000 on its first order.

GET /orders/{user_id}?limit=50   (newest first)
-> [{"order_id":"o_9","symbol":"SOL","side":"buy","qty":2.5,"fill_price":148.32,
     "status":"filled","ts":1760000000000}]

## Portfolio
GET /portfolio/{user_id}
-> {"user_id":"u_123","cash":99629.2,"equity":100012.4,"pnl":12.4,"pnl_pct":0.012,
    "positions":[{"symbol":"SOL","qty":2.5,"avg_price":148.32,"last_price":150.0,"unrealized_pnl":4.2}]}

## Leaderboard
GET /leaderboard?limit=20
-> [{"rank":1,"name":"alice","is_bot":false,"equity":104200.1,"pnl_pct":4.2}]

## Models
Models train on real hourly candles: Coinbase for crypto, Yahoo for stocks and forex
(no API keys). If that fetch fails, synthetic candles are used and data_source says so.

GET /history/{symbol}?limit=2000        (max 5000; the candles the models train on)
-> {"symbol":"SOL","interval":"1h","source":"coinbase",
    "candles":[{"ts":1760000000000,"o":148.1,"h":148.5,"l":147.9,"c":148.3,"v":1200}]}
source: coinbase | yahoo | synthetic

POST /models/train
body: {"symbol":"SOL","model_type":"lightgbm",
       "hyperparams":{"n_estimators":200,"max_depth":4,"learning_rate":0.05,
                      "lookback":30,"horizon":5,"start_ts":1785000000000}}
-> {"model_id":"m_42","symbol":"SOL","interval":"1h","data_source":"coinbase",
    "start_ts":1785000000000,"trained_through_ts":1791660000000,"threshold":0.55,
    "metrics":{"accuracy":0.53,"precision":0.54,"baseline_always_up":0.52,"n_train":3967,"n_test":993},
    "backtest":{"equity_curve":[{"ts":1760000000000,"equity":100000}],"sharpe":0.4,"max_drawdown":0.08,
                "total_return":-0.02,"n_trades":120,"exposure":0.6},
    "predictions":[{"ts":1760000000000,"p_up":0.57}],
    "train_seconds":0.3}
model_type: logreg | random_forest | lightgbm   ("ridge" still works as an old alias for logreg)
hyperparams by model_type (all optional; defaults shown):
  logreg:         C=1.0   (inverse regularization strength: smaller = simpler model)
  random_forest:  n_estimators=200, max_depth=4
  lightgbm:       n_estimators=200, max_depth=4, learning_rate=0.05
  every model:    lookback=30, horizon=5, threshold=0.55, fee_bps=10,
                  start_ts (when the model starts trading; it trains on candles before it)
                  or train_split=0.8 if start_ts is not given
lookback and horizon are counted in candles, not hours. Stocks and forex skip nights and
weekends, so a 5-candle horizon can span a weekend. Label the UI sliders "candles".
start_ts (response) = first candle the model trades. predictions = P(up) made at each
candle's close from start_ts on. Errors: 400 bad_request (e.g. start too early/late),
404 unknown_symbol.

GET /models/{model_id}/predict           (newest closed candle)
-> {"model_id":"m_42","symbol":"SOL","direction":"up","confidence":0.61,
    "horizon_candles":5,"ts":1760000000000}

GET /models/{model_id}/overlay           (for drawing the model on a price chart)
-> {"model_id":"m_42","symbol":"SOL","start_ts":1785000000000,"trained_through_ts":1791660000000,
    "threshold":0.55,"horizon_candles":5,"predictions":[{"ts":...,"p_up":0.57}],
    "backtest":{...same shape as /models/train}}
Applies the model from start_ts to the newest candle, so it keeps going on candles that
arrive after training (after trained_through_ts = never seen in training).
Unsaved models live in memory and are lost when the backend restarts (404 not_found).
Saved models are reloaded from the database automatically by predict/overlay.

POST /models/{model_id}/save   body: {"user_id":"u_123","name":"My SOL model"}
-> {"model_id":"m_42","name":"My SOL model","symbol":"SOL","model_type":"lightgbm",
    "hyperparams":{...},"start_ts":...,"trained_through_ts":...,"data_source":"coinbase",
    "metrics":{...},"backtest":{...summary, no equity_curve},"equity_preview":[{"ts":...,"equity":...}],
    "created_at":1760000000000}
Saving again renames it. 403 if another account saved it, 404 if the model isn't in memory.

GET /users/{user_id}/models    -> [same shape as save], newest first (also loads them into memory)
DELETE /models/{model_id}?user_id=u_123   -> {"model_id":"m_42","deleted":true}
503 storage_unavailable if the backend has no database.

## News
GET /news?symbol=SOL&limit=20
-> [{"headline":"...","source":"CryptoPanic","url":"...","ts":1760000000000,
     "symbol":"SOL","sentiment":0.6,"summary":"One-line summary"}]
From the news table written by ingest/news_feed.py (Finnhub headlines scored by Gemini).
Only scored headlines, newest first; [] until the news feed has run.
symbol can also be MARKET (stories Gemini didn't tie to one asset) or ALL (everything);
with ALL, &asset_class=crypto|stock|forex narrows it to that class.
