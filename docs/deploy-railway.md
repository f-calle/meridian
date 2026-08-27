# Meridian Railway Deployment Guide

Deploy Meridian to Railway using the same pattern as Adilade: Docker Compose locally, Railway in production, all configuration via env vars.

## Prerequisites

- [Railway account](https://railway.app)
- GitHub repository connected to Railway
- Anthropic API key (for AI features)

## Service Layout

| Service | Dockerfile | Public? | Port |
|---|---|---|---|
| web | `apps/web/Dockerfile` | Yes | 3000 |
| api | `apps/api/Dockerfile` | No | 3001 |
| worker | `apps/worker/Dockerfile` | No | — |
| mcp | `apps/mcp/Dockerfile` | No | 8080 |
| PostgreSQL | Railway plugin | No | — |
| Redis | Railway plugin | No | — |

## Step-by-Step Deploy

### 1. Create Railway Project

```bash
railway login
railway init
```

### 2. Add Database Plugins

In the Railway dashboard:
- Add **PostgreSQL** plugin
- Add **Redis** plugin

Railway auto-injects `DATABASE_URL` and `REDIS_URL`.

### 3. Deploy Services

Create four services from the repo, each pointing to its Dockerfile:

- **web** → `apps/web/Dockerfile`
- **api** → `apps/api/Dockerfile`
- **worker** → `apps/worker/Dockerfile`
- **mcp** → `apps/mcp/Dockerfile`

Only expose **web** publicly. All other services use Railway private networking.

### 4. Set Environment Variables

Copy from [`.env.example`](../.env.example):

| Variable | Service | Value |
|---|---|---|
| `DATABASE_URL` | api, worker, mcp | Auto-injected by Postgres plugin |
| `REDIS_URL` | api, worker | Auto-injected by Redis plugin |
| `API_URL` | web | `http://api.railway.internal:3001` |
| `MCP_URL` | web, worker | `http://mcp.railway.internal:8080` |
| `NEXT_PUBLIC_API_URL` | web | Your public API URL or internal |
| `NEXT_PUBLIC_APP_URL` | web | `https://your-app.up.railway.app` |
| `AUTH_SECRET` | api | Long random string (signs session tokens) |
| `ANTHROPIC_API_KEY` | api | Your Anthropic key |
| `MERIDIAN_LLM_MODEL` | api | `claude-sonnet-4-20250514` |

### 5. Run Migrations

```bash
railway run pnpm db:migrate
railway run pnpm db:seed
```

### 6. Verify

- Web: `https://your-app.up.railway.app`
- API health (internal): `http://api.railway.internal:3001/health`
- MCP health (internal): `http://mcp.railway.internal:8080/health`

Login with seeded credentials: `admin@demo.com` / `demo1234`

## Security Notes

- **Never expose MCP publicly** — it has no auth of its own
- API should use Railway private networking; web proxies authenticated requests
- Rotate `AUTH_SECRET` and demo credentials in production

## Local Development Parity

```bash
cp .env.example .env
docker compose up --build -d
pnpm db:migrate
pnpm db:seed
# → http://localhost:3000
```

## Cost Estimates

| Tier | Services | Est. Cost |
|---|---|---|
| Dev/staging | web + api + Postgres | ~$5–10/mo |
| Small business | All services | ~$20–40/mo |
| Growth | Scaled replicas | Usage-based |
