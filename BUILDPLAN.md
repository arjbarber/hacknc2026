# Build plan: paper-trading app with tunable prediction models

## The pitch

**"Trade against AI models you can tune yourself."** Users paper-trade Solana/crypto, forex, and Fortune 500 stocks with live prices. They train and tune prediction models (hyperparameters in the UI), and those models also **trade as bots on the same leaderboard**, so users compete against the AI and against each other. That's your twist over Investopedia's simulator.

## Architecture

```
Market feeds (Binance/Pyth for SOL, Finnhub/Twelve Data for FX + stocks, Finnhub/CryptoPanic news)
        │
   Ingest worker (Python) ──► Tiger Data (TimescaleDB): ticks, candles, orders, positions, leaderboard
        │                              │
        │                              ├─► WebSocket → Next.js frontend (live prices, P&L, leaderboard)
        │                              └─► Snowflake (history, analytics, Cortex sentiment)
        │
   FastAPI backend: trade engine, model train/predict endpoints
        │
        ├─ Gemini: news → sentiment/summary per ticker, "explain this prediction", trade coach
        ├─ ElevenLabs: voice market briefing + voice trade commands
        ├─ Photon: iMessage agent ("buy 5 AAPL", "portfolio", "what does the SOL model say")
        ├─ Nessie (Capital One): fund the paper account from a mock bank account, round-up investing
        └─ Solana: wallet login + verifiable on-chain trade records / badges
```

**Stack:** Next.js + Tailwind + TradingView `lightweight-charts` (frontend), FastAPI + scikit-learn/LightGBM (backend and ML), Tiger Data Postgres for the hot data. Host the backend on Railway/Render/Fly and the frontend on Vercel, and register a `.tech` domain.

## Track mapping

| Track | How you use it | Depth |
|---|---|---|
| **Tiger Data** | Core DB: tick/candle hypertables, continuous aggregates for candles, leaderboard queries | Core |
| **Snowflake** | Historical datasets for model training, analytics, Cortex `SENTIMENT`/`COMPLETE` on news, "platform stats" dashboard | Medium |
| **Gemini** | News analysis, prediction explanations, personal trade coach | Core |
| **Solana** | Solana market as an asset class, Phantom wallet login, on-chain season results/badges (devnet) | Medium |
| **ElevenLabs** | Spoken market briefings, voice commands | Light |
| **Nessie** | Link a mock Capital One account, set starting capital from it, round-up purchases into the portfolio | Light/medium |
| **Photon iMessage** | Chat interface to the whole app | Medium |
| **.tech domain** | Pick something clever (e.g. `paperalpha.tech`) | 10 min |
| **DEV Writing** | Blog post at the end | 45 min |

Check each sponsor's prize rubric and docs at their tables early. I'm working from general knowledge of these sponsors and don't know their exact judging criteria or current SDK details, especially for Photon.

## Team roles

**Person 1: Backend and data lead**
- Tiger Data schema, trade engine (market and limit orders, positions, P&L)
- WebSocket server, real-time leaderboard
- Solana on-chain pieces

**Person 2: ML lead**
- Feature pipeline, models, hyperparameter API, backtesting, bot traders
- Snowflake integration

**Person 3: Frontend lead**
- All UI: trading screen, model lab, leaderboard, news
- ElevenLabs voice features, domain setup, demo polish

**Person 4: Integrations and ingestion**
- Live price ingestion for all three markets, news pipeline plus Gemini
- Photon iMessage agent, Nessie
- DEV post and demo script

## Timeline

### Hour 0–1: Alignment (everyone together)
1. Create the repo with `/frontend`, `/backend`, `/ml`, `/ingest` folders.
2. Sign up for every API key and share them in a `.env` (don't commit it).
3. **Agree on the API contract**, so the frontend can mock against it from minute one:
   - `GET /prices/{symbol}` and a `WS /stream` that pushes `{symbol, price, ts}`
   - `POST /orders` with `{user_id, symbol, side, qty}`
   - `GET /portfolio/{user_id}` and `GET /leaderboard`
   - `POST /models/train` with `{symbol, model_type, hyperparams}` and `GET /models/{id}/predict`
   - `GET /news?symbol=` returning headline, summary, sentiment
4. Pick a **fixed asset universe**: about 5 SOL/crypto pairs (SOL, BTC, ETH, JUP...), 6 forex pairs (EUR/USD, GBP/USD, USD/JPY...), and 15–20 F500 tickers. Don't build a full-market search.

### Hours 1–6: Core build (parallel)

**Person 1**
- Tiger Data tables: `ticks` (hypertable), `candles_1m` (continuous aggregate), `users`, `orders`, `positions`, `portfolio_snapshots` (hypertable).
- Trade engine: fill orders at the latest tick price, update cash and positions, and compute equity as cash + the sum of positions × latest price.
- Snapshot every user's equity every 10–30 seconds, which gives you both the leaderboard and portfolio charts.
- WebSocket broadcast of prices and leaderboard changes.

**Person 2**
- Pull 1–2 years of history (`yfinance` for stocks/forex, Binance or Coinbase REST for SOL) into CSVs. Load them to Snowflake as the training dataset.
- Features: returns over several lags, rolling volatility, RSI, MACD, volume change, plus news sentiment later.
- Target: direction (up/down) over the next N candles.
- Models, each with exposed hyperparameters:
  - **Ridge/logistic regression:** regularization
  - **Random Forest / LightGBM:** trees, depth, learning rate
  - **Small LSTM (optional, only if time allows):** lookback window, hidden size, epochs
  - **Shared controls:** lookback window, prediction horizon, train/test split
- `/models/train` should finish in under about 10 seconds so tuning feels live. Use small data windows.
- Always report **out-of-sample accuracy and a backtest equity curve**, with a strict time-based split and no shuffling. Be honest in the demo that these models are weak predictors. Judges respect that more than inflated claims.

**Person 3**
- Next.js app with mocked data first: Trade page (chart, order ticket, positions), Leaderboard, Model Lab, News panel.
- Model Lab is the star feature: sliders for hyperparameters, a Train button, then the prediction and backtest chart displayed beside the live price chart.
- Wire to the real backend as endpoints come online.

**Person 4**
- Ingest worker with one async task per source:
  - **SOL/crypto:** Binance or Coinbase WebSocket (or Pyth's Hermes stream, which also plays well with the Solana track)
  - **Stocks:** Finnhub WebSocket for the free tier
  - **Forex:** Twelve Data or similar. Free tiers are rate-limited, so poll every few seconds and cache.
- Normalize everything into `{symbol, price, ts}` and write to Tiger Data. Person 1 owns the table, so agree on the insert format.
- If a live feed fails, fall back to replaying recent history as simulated ticks so the demo never breaks.

### Hours 6–10: Integrate, then get a working MVP
- Connect frontend to the real backend and run a full loop: live price → place trade → portfolio updates → leaderboard moves.
- Person 2 delivers a trained model that returns predictions through the API.
- **Bot traders:** each model gets a bot account that places trades automatically when confidence exceeds a threshold, so AI bots show up on the leaderboard.
- **Checkpoint at hour 10:** a user can sign up, trade across all 3 markets, tune a model, and see the leaderboard. If not, cut features from the later phases.

### Hours 10–15: Sponsor integrations (parallel)

**Person 4: News and Gemini**
- Pull headlines (Finnhub news, CryptoPanic) every few minutes and send them to Gemini with a prompt that returns JSON: `{ticker, sentiment: -1..1, one_line_summary}`.
- Store the results in Tiger Data and display a live ticker/news panel.
- Feed average sentiment into the models as an extra feature. This "news-aware model" is a good demo moment.

**Person 2: Snowflake**
- Load the historical data and news into Snowflake. Use Cortex `SENTIMENT` as a second opinion, or use Snowflake for an "Insights" page (most-traded assets, win rates by model type).
- Make the use of Snowflake visible, not hidden, since judges need to see it.

**Person 1: Solana**
- Phantom wallet login via `@solana/wallet-adapter`.
- At the end of each "season" (or on demand), write the user's final P&L as a **Memo transaction on devnet** and show the explorer link. A minted NFT badge for the winner is a stretch goal.

**Person 3: ElevenLabs and polish**
- A "Play briefing" button: Gemini summarizes the day's market news and top movers, and ElevenLabs reads it aloud.
- Optional: push-to-talk voice orders ("buy 2 SOL") using ElevenLabs speech-to-text, parsed by Gemini into an order.

**Person 4 (once news is done) or Person 3: Nessie and Photon**
- **Nessie:** create a mock customer and account. Let users "link" it, set starting buying power from the balance, and offer a **round-up investing** toggle that sweeps rounded-up purchases into the paper portfolio. Even a simple version is a clear, demoable use.
- **Photon iMessage agent:** commands like `portfolio`, `buy 5 AAPL`, `leaderboard`, `predict SOL`, plus a daily recap text. Route messages to your FastAPI endpoints and let Gemini handle natural-language parsing. Read Photon's docs at the start of this phase, since setup can eat time.

Whoever finishes first takes the other of Nessie/Photon, and you can drop Nessie to a minimal version if time gets tight.

### Hours 15–18: Hardening and polish
- Run a load test with many fake users on the leaderboard to confirm it stays real-time.
- Handle edge cases: insufficient cash, markets closed (stocks and forex outside trading hours), stale prices.
- Seed the demo with realistic fake users so the leaderboard isn't empty.
- Deploy everything and attach the `.tech` domain.
- Person 4 writes the **DEV post** (what you built, the architecture, and lessons learned), and Person 3 records screenshots/GIFs.

### Hours 18–20: Demo prep
- Write a 3-minute demo script and rehearse it twice.
- Record a backup video in case live data or Wi-Fi fails.
- Sleep in shifts if you can. Even 90 minutes helps a lot.

## Demo flow (3 minutes)
1. Open the live leaderboard, with prices ticking and users and AI bots competing.
2. Place a SOL trade and watch P&L move.
3. Open Model Lab, change hyperparameters, retrain, and show the new prediction and backtest.
4. Show the news panel with Gemini sentiment feeding the model.
5. Play the ElevenLabs briefing.
6. Text the iMessage agent "portfolio".
7. Show the Solana explorer link for a recorded result and the Nessie-linked funding.
8. Close with the architecture slide naming each sponsor.

## Cut list (if you fall behind, drop in this order)
1. LSTM model (keep Ridge and tree models)
2. Voice commands (keep the spoken briefing)
3. NFT badges (keep Memo transactions)
4. Limit orders (keep market orders only)
5. Nessie round-ups (keep simple account linking)

Don't cut the live leaderboard, Model Lab, Tiger Data, or Gemini news, since those carry your core story.

## Practical tips
- **Rate limits will bite you.** Use one central ingest worker, never each client, to call market APIs.
- **Don't let anyone work on `main` directly.** Use short-lived branches and merge often.
- **Mock first:** the frontend should never wait on the backend, and the backend should never wait on ML (return a stub prediction until the real one is ready).
- Prefix the demo with "this is a simulation, not financial advice."

If you tell me your team's strongest languages and which tracks you most want to win, I can adjust the role split or write starter schemas, the API skeleton, or the model-training endpoint code.
