FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY . .

WORKDIR /app/frontend
RUN npm install
RUN npm run build

WORKDIR /app/ig-turing/aqua-exe
RUN npm install
RUN npm run build

FROM python:3.11-slim

RUN apt-get update && apt-get install -y curl supervisor ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main" | tee /etc/apt/sources.list.d/cloudflared.list && \
    apt-get update && apt-get install -y cloudflared && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY ingest/ ./ingest/
COPY ml/ ./ml/
COPY shared/ ./shared/

COPY --from=builder /app/frontend /app/frontend
COPY --from=builder /app/ig-turing/aqua-exe /app/ig-turing/aqua-exe

RUN printf "[supervisord]\n\
nodaemon=true\n\
\n\
[program:backend]\n\
command=uvicorn backend.main:app --host 0.0.0.0 --port 8000\n\
directory=/app\n\
autostart=true\n\
autorestart=true\n\
\n\
[program:frontend]\n\
command=npm run preview -- --host 0.0.0.0 --port 3000\n\
directory=/app/frontend\n\
autostart=true\n\
autorestart=true\n\
\n\
[program:aqua-exe]\n\
command=npm run preview -- --host 0.0.0.0 --port 3001\n\
directory=/app/ig-turing/aqua-exe\n\
autostart=true\n\
autorestart=true\n\
\n\
[program:cloudflared]\n\
command=cloudflared tunnel --url http://127.0.0.1:8000\n\
directory=/app\n\
autostart=true\n\
autorestart=true\n\
stdout_logfile=/dev/stdout\n\
stdout_logfile_maxbytes=0\n\
stderr_logfile=/dev/stderr\n\
stderr_logfile_maxbytes=0\n\
" > /etc/supervisor/conf.d/supervisord.conf

# Expose ports
# 8000: FastAPI Backend
# 3000: Vite Frontend
# 3001: Aqua-exe 3D App
EXPOSE 8000 3000 3001

# Start Supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]