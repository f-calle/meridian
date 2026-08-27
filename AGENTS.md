# Agent Instructions — Meridian

When working on frontend UI in `apps/web/**`, attach these skills:

- **`@design-taste-frontend`** — visual polish, layout, typography, motion (low variance/motion, medium-high density for ERP)
- **`@meridian-web-guidelines`** — Vercel Web Interface Guidelines + Meridian ERP UX rules (accessibility, forms, loading states, navigation)

Run the `@meridian-web-guidelines` audit on all touched files before opening a PR.

Design workflow: use Superdesign (`.superdesign/` context) for canvas drafts; implement in code only after approval or when explicitly told to skip design.

## Schema changes

Entity tables come from versioned migrations, never from runtime DDL. After
editing anything under `packages/entities/`, run `pnpm db:generate` in a
terminal (it prompts on renames) and commit both the regenerated
`packages/core/src/db/entity-schema.generated.ts` and the new migration under
`packages/core/drizzle/`. `pnpm db:check` is what CI runs to catch a miss.

Full workflow and rationale: [docs/schema-migrations.md](docs/schema-migrations.md).
