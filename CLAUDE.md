# Meridian

AI-native ERP. pnpm workspaces + Turborepo, Node 22, TypeScript strict with
`noUncheckedIndexedAccess`.

- `apps/api` — Hono. `apps/web` — Next 15 App Router. `apps/worker` — BullMQ.
  `apps/mcp` — MCP bridge.
- `packages/core` — entity service, ACL, auth, migrations, dashboards.
  `packages/entities` — the entity registry. `packages/ai`, `packages/migration`,
  `packages/ui-schema`, `packages/cli`.

## Code style

**Apply `.claude/skills/cyclomatic-complexity` to every change**, not only when
asked to refactor. Measure the functions you touch, keep them under the
thresholds in that skill, and prefer guard clauses, extracted functions with
names that say what, and lookup tables over branching. Do not game the metric:
complexity should move into well-named units, never into a dense one-liner.

Beyond that skill:

- Comments explain **why**, not what. A comment that restates the code earns
  nothing; one that records the bug you avoided or the alternative you rejected
  earns its line.
- Match the surrounding file's idiom, naming, and comment density.

## Before you push

    pnpm build && pnpm test && pnpm db:check

`db:check` verifies the generated drizzle schema still matches the entity
registry. Schema changes need a migration: `pnpm db:generate`, then commit the
SQL under `packages/core/drizzle/`. Never hand-edit an applied migration.

## Things that have bitten us

- **Dates.** A `date` field is a calendar day, not an instant. Format it from
  its digits; `new Date("2026-07-14")` is UTC midnight and reads as the 13th
  west of Greenwich. A `datetime` is a real instant and converts to local time.
- **Day boundaries.** The server runs in UTC and the user does not. Anything
  meaning "today" takes the day window from the browser.
- **Hydration.** Never read `localStorage` during render — it is empty on the
  server, so the first client render disagrees and React discards the server
  HTML for the whole page. Read it in an effect, or via `useSyncExternalStore`
  with a server snapshot.
- **Money.** "Owed" has one definition, in `packages/core/src/services/money.ts`.
  Two pages computing it separately is how they came to disagree.
- **The Odoo integration is read-only.** Only `authenticate`, `search_count`
  and `search_read`. Never `write`, `create`, or `unlink`.
