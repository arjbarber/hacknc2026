# PaperTrade: paper trading against AI models you can tune

Paper-trade Solana/crypto, forex, and Fortune 500 stocks with live prices. Build and tune your own prediction models (change hyperparameters in the UI). The models also trade as bots on the same live leaderboard, so you compete against the AI and against other users.

> This is a simulation, not financial advice. No real money is involved.

## How it works (the 30-second version)

1. **Ingest** pulls live prices and news from outside APIs and saves them to the database.
2. **Backend** (FastAPI) runs the trading engine: it fills orders, tracks cash and positions, and ranks users on the leaderboard.
3. **ML** trains prediction models and returns predictions and backtest results to the backend.
4. **Frontend** (Next.js) shows the charts, order ticket, leaderboard, Model Lab, and news.

The frontend only ever talks to the backend. The rules for how they talk are in `shared/API.md`.

## Folders and owners

| Folder | Owner | What's in it |
|---|---|---|
| `frontend/` | P3: Vivi | Next.js app, all UI |
| `backend/` | P1: Andre | FastAPI app, trade engine, database |
| `ml/` | P2: Gabe | Features, models, training, backtests |
| `ingest/` | P4: Zeren | Live price and news workers |
| `shared/` | Everyone | `API.md` (the contract) and `assets.json` (the asset list) |
| `docs/` | P4: Zeren | DEV post draft, demo script |

Only edit your own folder. If you need to change `shared/`, tell the group chat first.

## Run it locally

**Backend (Python):**
```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then fill in keys (get them from the team vault, never commit .env)
uvicorn backend.main:app --reload
```
Open http://localhost:8000/docs to see every endpoint.

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:3000.

## The API contract (read this first)

Everything the frontend can ask the backend for is listed in **`shared/API.md`**, with example responses.

Right now the backend returns **fake hardcoded data** that matches the contract. That is on purpose: the frontend can build real screens today, and we swap in real logic endpoint by endpoint.

**Rule: if you need to change the shape of any data, edit `shared/API.md` first, then message the group. No silent changes.**

## Git rules

- Never push directly to `main`. Make a branch (`p2/model-lab-api`) and open a PR.
- Merge small and often, at least once an hour.
- Pull before you start working, every time.
- Adding a Python library? Add one line to the root `requirements.txt`, push, and tell the others to re-run `pip install -r requirements.txt`.

## Where we are right now

- [x] Repo created, folders set up
- [x] Flask boilerplate removed, FastAPI requirements in place
- [x] `shared/API.md` written
- [x] Stub backend running with fake data (`/docs` works)
- [ ] `.env` shared and every key tested (curl or small script)
- [ ] `shared/assets.json` created
- [ ] Tiger Data database connected, tables created (P1)
- [ ] Live SOL prices printing from a WebSocket (P4)
- [ ] Historical data downloaded for training (P2)
- [ ] Frontend showing chart and leaderboard from the stub (P3)

## What's next (hours 1-6)

| Person | First goal |
|---|---|
| Andrew | Connect Tiger Data, create `ticks`, `users`, `orders`, `positions` tables, replace the fake `/orders` and `/portfolio` with real logic |
| Gabe | Download 1-2 years of history, build features, train a first model that returns the `/models/train` shape |
| Vivi | Trade page, Leaderboard, and Model Lab screens built against the stub backend |
| Zeren | Live price ingest for crypto, stocks, and forex, writing `{symbol, price, ts}` to the database |

## Sponsor tracks we're using

Tiger Data (main database), Gemini (news sentiment and explanations), Snowflake (historical data and analytics), Solana (SOL market, wallet login, on-chain results), ElevenLabs (voice briefing), Nessie (Capital One mock account funding), Photon (iMessage agent), .tech domain, DEV writing challenge.
