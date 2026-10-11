# Deploying the PaperTrade backend on a server

`deploy/docker-compose.yml` runs **only the backend** by default: one container with the
FastAPI API, ML (training, predictions, saved models) and auth, on `BACKEND_PORT` (default 8080,
so it doesn't collide with anything already on 8000).

Optional extras, off unless you ask for them:

| Profile | What it adds |
|---|---|
| `feeds` | Live crypto/stock/forex prices -> `ticks` (without it, the backend asks Coinbase/Yahoo directly) |
| `news` | Finnhub headlines scored by Gemini -> `news` |
| `frontend` | The web app (nginx); needs `PUBLIC_API_URL` in `deploy/.env` |

## First time

```bash
git clone https://github.com/arjbarber/hacknc2026.git && cd hacknc2026
nano .env                      # paste the team .env (secrets; never commit it)
chmod 600 .env
cp deploy/.env.example deploy/.env      # optional: change BACKEND_PORT
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml ps     # backend should become (healthy)
curl localhost:8080/                               # {"message":"Backend is running!"}
```

Open the port in the cloud firewall (AWS Lightsail: instance -> Networking -> add TCP 8080),
and attach a static IP so the backend's address doesn't change. The backend is then at
`http://<static-ip>:8080`; set that as `VITE_API_URL` wherever the frontend is built.

## Current setup: behind nginx at https://api.api-ggreat317.com/papertrade

The server's nginx already serves Murmur at `https://api.api-ggreat317.com` (Let's Encrypt,
managed by certbot). PaperTrade shares that domain and certificate under `/papertrade`:

1. `deploy/.env`: `BACKEND_PORT=127.0.0.1:8080` (only nginx can reach the backend; no firewall port).
2. In the nginx site for `api.api-ggreat317.com` (`grep -rl api.api-ggreat317.com /etc/nginx/`),
   inside the `listen 443 ssl` server block, above `location / {`:
   ```nginx
   location /papertrade/ {
           proxy_pass http://127.0.0.1:8080/;      # trailing slash strips /papertrade
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_read_timeout 60s;
   }
   ```
3. `sudo nginx -t && sudo systemctl reload nginx` (always test first: a typo would also take Murmur down).
4. The frontend's production build calls `https://api.api-ggreat317.com/papertrade`
   (set in `frontend/.env.production`).

Note: the interactive docs at `/papertrade/docs` don't load behind the prefix; the API itself is fine.

## Updating

```bash
git pull && docker compose -f deploy/docker-compose.yml up -d --build
```

## Useful

```bash
docker compose -f deploy/docker-compose.yml logs -f backend
docker compose -f deploy/docker-compose.yml restart backend
docker compose -f deploy/docker-compose.yml down      # stop (data stays in the database)
# with extras:
docker compose -f deploy/docker-compose.yml --profile feeds --profile news up -d --build
```

Notes:
- The container runs as uid 1000 (the `ubuntu` user), so a `chmod 600` `.env` owned by
  `ubuntu` is readable. If you created `.env` as another user, `chown ubuntu .env`.
- Don't pass the root `.env` with `--env-file`: its values are quoted, which Docker keeps
  literally. The compose file mounts it instead, and the app reads it with python-dotenv.
- One worker process on purpose: unsaved models and caches live in memory. Saved models
  reload from the database after restarts; unsaved ones are lost.
- The first start against the team database adds a `ticks` index and (on first model save)
  the `ml_models` table. Nothing existing is modified.
- Plain HTTP. If the frontend is served over https, browsers will block calls to an http
  backend: put Caddy or a Cloudflare tunnel in front and use the https address.
