#!/usr/bin/env bash
# Uruchamiane NA MIKRUSIE (przez GitHub Actions albo ręcznie).
# Pobiera najnowszy kod z main, buduje i restartuje aplikację w PM2.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/proem-quiz}"
cd "$APP_DIR"
set -a; [ -f .env ] && . ./.env; set +a

echo "→ git pull"
git fetch --quiet origin main
git reset --hard origin/main

echo "→ npm ci"
npm ci --no-audit --no-fund

echo "→ build"
APP_VERSION="$(git rev-parse --short HEAD)" npm run build

echo "→ restart"
export APP_VERSION="$(git rev-parse --short HEAD)"
if pm2 describe proem-quiz > /dev/null 2>&1; then
	pm2 reload ecosystem.config.cjs --update-env
else
	pm2 start ecosystem.config.cjs
	pm2 save
fi

sleep 2
curl -fsS "http://127.0.0.1:${PORT:-3000}/health" && echo && echo "✔ Wdrożono $APP_VERSION"
