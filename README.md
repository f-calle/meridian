# Meridian

**Meridian** is an AI-native ERP platform — CRM, project management, and business tools powered by intelligent agents. Built for businesses of all sizes with easy migration from Odoo and other ERPs.

## Features

- **CRM**: Contacts, companies, deals, activities, pipelines
- **Projects**: Projects, tasks, time entries, milestones
- **AI Assistant**: Natural language CRUD, smart search, daily briefings
- **Migration**: Import from Odoo via XML-RPC with field mapping
- **Plugin System**: Extensible architecture with lifecycle hooks
- **Multi-tenant**: Row-level isolation with role-based ACL
- **Audit Log**: Every mutation tracked with actor and diff

## Architecture

```
apps/web          Next.js frontend (public)
apps/api          Hono REST API + auth + AI orchestrator
apps/worker       BullMQ background jobs
apps/mcp          MCP tool server for AI agents (private)
packages/core     Entity engine, ACL, audit, events, plugins
packages/entities CRM + Projects entity definitions
packages/ai       Agent orchestrator + MCP server
packages/migration Odoo import adapter
packages/cli      meridian CLI
```

## Quickstart (Local)

Requirements: Node.js 22+, pnpm 9+, Docker with Compose v2.

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000 — login with `admin@demo.com` / `demo1234`

## Quickstart (Docker Compose — full stack)

```bash
cp .env.example .env
docker compose up --build -d
# Run migrations inside api container:
docker compose exec api node packages/core/dist/db/migrate.js
docker compose exec api node packages/core/dist/db/seed.js
```

## Environment Variables

See [`.env.example`](.env.example) for the full annotated list.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis for queues/cache |
| `API_URL` | Internal API address |
| `MCP_URL` | Internal MCP server (never public) |
| `ANTHROPIC_API_KEY` | AI assistant (optional) |
| `NEXT_PUBLIC_APP_URL` | Public web URL |

## Deploying to Railway

See [docs/deploy-railway.md](docs/deploy-railway.md) for step-by-step instructions.

## Adding Entities

Define in `packages/entities/`, register in index, run migrations:

```typescript
import { defineEntity, field } from "@meridian/core";

export const MyEntity = defineEntity({
  name: "my_entity",
  label: "My Entity",
  fields: { name: field.string({ required: true }) },
  permissions: { admin: { create: true, read: true, update: true, delete: true } },
});
```

## CLI

```bash
pnpm --filter @meridian/cli build
npx meridian entities
npx meridian health
```

## License

MIT
