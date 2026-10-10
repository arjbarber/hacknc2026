# Aerorithmetic frontend

Aerorithmetic is a responsive paper-trading interface for stocks, crypto, and forex. Prices, candles, orders, balances, leaderboard rows, model results, and news use the FastAPI endpoints documented in `../shared/API.md`.

## Run locally

```sh
cp .env.example .env
npm install
npm run dev
```

Start the FastAPI service separately on port 8000. Set `VITE_API_URL` in `frontend/.env` or in the deployment build environment when the API is hosted elsewhere. Only the API base URL is exposed to the browser; provider credentials stay on the backend.

## Build

```sh
npm run build
npm run lint
```

From the repository root, the production build can also be run with `npm --prefix frontend run build`.

## Data notes

The browser gets a persistent anonymous `user_id` for the backend paper account. Recent order receipts are saved locally because the API contract has no order-history endpoint. The current backend returns sample values for market prices/candles, leaderboard, model training/prediction, and news; those sections are labeled as sample data. Account balances and successful order fills are read from backend responses.
