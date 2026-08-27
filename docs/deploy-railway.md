# Meridian Railway Deployment Guide

One Railway project, four services built from this repo's Dockerfiles, plus
managed Postgres and Redis. All configuration is env vars; migrations and
seeding run automatically on API boot.

## Service Layout

| Service | Dockerfile | Public? | Notes |
|---|---|---|---|
| web | `apps/web/Dockerfile` | Yes | Next.js UI |
| api | `apps/api/Dockerfile` | Yes | The browser calls it directly; CORS locks it to the web origin |
| worker | `apps/worker/Dockerfile` | No | BullMQ jobs |
| mcp | `apps/mcp/Dockerfile` | **Never** | No auth of its own — private networking only |
| Postgres | Railway template | No | provides `DATABASE_URL` |
| Redis | Railway template | No | provides `REDIS_URL` |

Each service is created from the same repo; what distinguishes them is the
service variable `RAILWAY_DOCKERFILE_PATH` (e.g. `apps/api/Dockerfile`).

## Environment Variables

| Variable | Service | Value |
|---|---|---|
| `DATABASE_URL` | api, worker, mcp | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | api, worker | `${{Redis.REDIS_URL}}` |
| `AUTH_SECRET` | api | long random string (`openssl rand -hex 32`) — required |
| `AUTO_MIGRATE` | api | `true` — applies pending migrations on boot (see [schema-migrations.md](schema-migrations.md)) |
| `AUTO_SEED` | api | `true` for the demo tenant; remove for a blank instance |
| `NEXT_PUBLIC_API_URL` | web | the api service's public URL (build-time) |
| `NEXT_PUBLIC_APP_URL` | web, api | the web service's public URL (build-time on web; CORS origin on api) |
| `ANTHROPIC_API_KEY` | api | optional — enables AI chat + LLM briefings |
| `MERIDIAN_LLM_MODEL` | api | optional model override |
| `WORKER_CONCURRENCY` | worker | optional, default 5 |

`NEXT_PUBLIC_*` values are inlined into the web bundle at build time — the
web Dockerfile declares them as build args, and Railway passes service
variables to Docker builds, so setting them as web service variables is
enough. Changing them requires a redeploy of web.

## Deploy with the CLI

```bash
railway login            # or set RAILWAY_API_TOKEN
railway init --name meridian
railway add --database postgres
railway add --database redis
# create each app service from the repo, e.g.:
railway add --service api --variables RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
railway up --service api   # repeat for worker, mcp, web
# generate public domains for web and api:
railway domain --service web
railway domain --service api
```

Then set the variables from the table above (`railway variables --set ... --service <name>`)
and redeploy web so the `NEXT_PUBLIC_*` values bake in.

## Deploy from the Dashboard

1. New Project → Deploy from GitHub repo → pick `f-calle/meridian` (repeat to add four services from the same repo).
2. On each service → Settings → Build, or add the `RAILWAY_DOCKERFILE_PATH` variable pointing at that service's Dockerfile.
3. Add Postgres and Redis from the template gallery.
4. Set the env vars above; generate public domains for **web** and **api** only.

## Verify

- `https://<api-domain>/health` → `{"status":"ok"}`
- `https://<web-domain>` → login with `admin@demo.com` / `demo1234` (if `AUTO_SEED=true`)

## Security Notes

- **Never expose mcp publicly** — it has no auth of its own
- Set a strong `AUTH_SECRET`; the API refuses to run in production without one
- Change the demo password after first login (or set `DEMO_ADMIN_PASSWORD` before first boot, or skip `AUTO_SEED`)

## Local Development Parity

```bash
cp .env.example .env
docker compose up --build -d
# migrations/seed run automatically if AUTO_MIGRATE/AUTO_SEED are set;
# otherwise: pnpm db:migrate && pnpm db:seed
# → http://localhost:3000
```
