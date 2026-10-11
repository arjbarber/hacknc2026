# Deploying PaperTrade on a server

Runs four containers from `deploy/docker-compose.yml`:

| Service | What it does | Port |
|---|---|---|
| `backend` | FastAPI API (trading, models, news) | `BACKEND_PORT` (default 8080) |
| `feeds` | Live crypto/stock/forex prices -> `ticks` | none |
| `news` | Finnhub headlines scored by Gemini -> `news` | none |
| `frontend` | The web app (nginx), built to call `PUBLIC_API_URL` | `FRONTEND_PORT` (default 3000) |

Ports default to 8080/3000 so they don't collide with services already on 5000/8000.

## First time

```bash
git clone https://github.com/arjbarber/hacknc2026.git && cd hacknc2026
# 1. Secrets: copy the team .env to the repo root (never commit it), e.g. from your laptop:
#    scp -i <key.pem> .env ubuntu@<server-ip>:~/hacknc2026/.env
# 2. Deployment settings:
cp deploy/.env.example deploy/.env
nano deploy/.env        # PUBLIC_API_URL=http://<server-public-ip>:8080
# 3. Build and start:
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml ps     # backend should become (healthy)
```

Open the ports in the cloud firewall (AWS Lightsail: instance -> Networking -> add TCP 8080 and 3000).
Then visit `http://<server-public-ip>:3000`.

Use a static IP (Lightsail: Networking -> Create static IP): the frontend has the backend address
built in, so if the IP changes you must update `PUBLIC_API_URL` and rebuild the frontend.

## Updating

```bash
git pull && docker compose -f deploy/docker-compose.yml up -d --build
```

## Useful

```bash
docker compose -f deploy/docker-compose.yml logs -f backend     # or feeds / news
docker compose -f deploy/docker-compose.yml restart feeds
docker compose -f deploy/docker-compose.yml down                # stop everything (data stays in the database)
```

Notes:
- Don't pass the root `.env` with `--env-file`: its values are quoted, which Docker keeps literally.
  The compose file mounts it instead, and the app reads it with python-dotenv.
- Unsaved models live in memory and vanish on backend restarts; saved models reload from the database.
- For HTTPS (needed if the frontend is ever served over https), put Caddy or a Cloudflare tunnel in
  front of the backend and set `PUBLIC_API_URL` to the https address.
