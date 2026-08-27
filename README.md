# Meridian

**Meridian** is an AI-native ERP platform — CRM, project management, and business tools powered by intelligent agents. Built for businesses of all sizes with easy migration from Odoo and other ERPs.

## Features

- **CRM**: Contacts, companies, deals, activities, pipelines
- **Projects**: Projects, tasks, time entries, milestones
- **AI Assistant**: Natural language CRUD, aggregations ("pipeline value by stage"), confirmed deletes, daily briefings (`GET /api/ai/briefing`)
- **Automations**: Event-driven rules — "when a deal is updated to won, create a kickoff project". Conditions + actions (`set_field`, `create_record`, `webhook`) with `{{field}}` templating, managed like any other entity at `/entities/automation`
- **Migration**: Import from Odoo via XML-RPC (with relation resolution), or CSV imports with presets for ERPNext, Dolibarr, and generic exports
- **Plugin System**: Extensible architecture with lifecycle hooks
- **Multi-tenant**: Row-level isolation with role-based ACL
- **Secure auth**: HMAC-signed session tokens (`AUTH_SECRET`), scrypt password hashing
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
| `AUTH_SECRET` | Signs session tokens — required in production |
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

## Automations

Rules live in the `automation` entity (UI at `/entities/automation`):

```json
{
  "name": "Won deal → kickoff project",
  "entity": "deal",
  "event": "updated",
  "conditions": [{ "field": "stage", "op": "eq", "value": "won" }],
  "actions": [
    { "type": "create_record", "entity": "project",
      "data": { "name": "Delivery: {{title}}", "status": "planning" } }
  ],
  "enabled": true
}
```

Condition ops: `eq, neq, gt, gte, lt, lte, contains, is_set, not_set`.
On `updated` events a rule only fires when one of its condition fields
actually changed (transition semantics). Actions run as a system actor and
never cascade into other automations.

## CSV Migration

```bash
curl -X POST $API/api/migration/csv/import \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"preset": "erpnext-contact", "csv": "...", "dryRun": true}'
```

`GET /api/migration/csv/presets` lists presets (ERPNext contacts/customers/leads,
Dolibarr third parties, generic contacts). Custom imports take `entity` +
`mapping` (column → field) instead of `preset`; values are coerced to field
types, and `externalIdColumn` makes re-imports idempotent.

## Testing

```bash
pnpm test    # vitest across packages (auth, validation, ACL, automations, CSV)
```

## CLI

```bash
pnpm --filter @meridian/cli build
npx meridian entities
npx meridian health
```

## License

MIT
