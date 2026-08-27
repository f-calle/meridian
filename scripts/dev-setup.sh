#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

set -a
source .env
set +a

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Starting Postgres and Redis with Docker Compose..."
  docker compose up -d postgres redis
else
  echo "Docker unavailable — using local Postgres/Redis if installed."
  if command -v pg_isready >/dev/null 2>&1; then
    sudo service postgresql start 2>/dev/null || true
  fi
  if command -v redis-cli >/dev/null 2>&1; then
    sudo service redis-server start 2>/dev/null || true
  fi
fi

pnpm install
pnpm build
pnpm db:migrate
pnpm db:seed

echo
echo "Meridian is ready."
echo "  pnpm --filter @meridian/api dev   # API on http://127.0.0.1:3001"
echo "  pnpm --filter @meridian/web dev   # Web on http://127.0.0.1:3000"
echo "  Login: admin@demo.com / demo1234"
