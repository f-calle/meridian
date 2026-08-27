---
name: meridian
description: Skills for building and extending the Meridian AI-native ERP platform
---

# Meridian ERP Skills

Use these conventions when working with the Meridian codebase.

## Architecture

- **Entity engine**: All business data is defined via `defineEntity()` in `packages/entities/`
- **Auto-generated CRUD**: REST routes at `/api/:entity/{list|read|create|update|delete}`
- **Multi-tenant**: Every record has `tenant_id`; always pass actor context
- **Audit log**: All mutations are logged automatically
- **AI agents**: Use MCP tools, never raw SQL

## Adding a New Entity

1. Define in `packages/entities/src/` using `defineEntity()` and `field.*` helpers
2. Export from `packages/entities/src/index.ts`
3. Run `pnpm db:migrate` to create the table
4. UI auto-renders from JSON Schema at `/entities/:name`

## Entity Definition Pattern

```typescript
export const MyEntity = defineEntity({
  name: "my_entity",
  label: "My Entity",
  externalId: true,
  fields: {
    name: field.string({ required: true }),
  },
  permissions: {
    admin: { create: true, read: true, update: true, delete: true },
    sales: { create: true, read: true, update: true, delete: false },
  },
});
```

## CLI Commands

```bash
meridian entities    # List registered entities
meridian health      # Check API health
```

## MCP Tools

Each entity exposes: `{entity}_list`, `{entity}_read`, `{entity}_create`, `{entity}_update`, `{entity}_delete`

HTTP MCP server at `MCP_URL` (default: http://127.0.0.1:8080)

## Migration from Odoo

Use `@meridian/migration` OdooAdapter or the web UI at `/migration`.

Mapped models: res.partner → contact/company, crm.lead → deal, project.project → project, project.task → task

## Plugin Development

See `plugins/example-plugin/` for the template. Plugins register hooks via manifest.json.

## Automations

- Rules are records in the `automation` entity: `{ entity, event, conditions, actions, enabled }`
- Engine lives in `packages/core/src/automations/engine.ts`; started with `startAutomationEngine()` (api + worker)
- Actions run as a system actor; events from system actors are ignored, so automations never cascade
- On `updated` events a rule fires only when a condition field actually changed
- Hook contexts carry the full merged record in `data` and changed fields in `changes`

## Auth

- Tokens: HMAC-SHA256 signed via `signToken`/`verifyToken` (`packages/core/src/auth/token.ts`), secret from `AUTH_SECRET`
- Passwords: scrypt via `hashPassword`/`verifyPassword`; legacy sha256 hashes verify and are upgraded on login

## Gotchas

- Never re-apply field defaults on update paths (validation and `mapFieldsToDb` both guard this)
- All user-supplied sort/filter/groupBy field names must go through `resolveColumn` before touching SQL
- Tests are colocated `*.test.ts` files run by vitest (`pnpm test`); they must not require a database
