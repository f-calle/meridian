# Schema migrations

Meridian's tables come from entity definitions, not from hand-written SQL. That
makes adding a business object cheap, and it used to make changing one
dangerous: the old boot sequence ran `CREATE TABLE IF NOT EXISTS` for every
registered entity, which is a no-op on a table that already exists. Adding a
field to a shipped entity therefore created no column, and the first query that
touched it failed. That is exactly how a production deploy went down: adding
`externalId: true` to `comment` left `external_id` uncreated, the unique index
over it failed at boot, and the API 502'd.

Schema changes are now versioned migrations. Nothing creates or alters a table
at runtime.

## Changing an entity

1. Edit the entity definition under `packages/entities/src/`.
2. Run `pnpm db:generate`.
3. Review the generated SQL, then commit **both** the regenerated schema and the
   new migration.

```
pnpm db:generate
git add packages/core/src/db/entity-schema.generated.ts packages/core/drizzle
```

`db:generate` does two things:

- renders the entity registry into
  `packages/core/src/db/entity-schema.generated.ts` — a real drizzle schema, so
  drizzle-kit has something to diff;
- runs `drizzle-kit generate`, which diffs that against the last snapshot and
  writes a numbered migration into `packages/core/drizzle/`.

Migrations get a generated name unless you supply one, and a named migration is
much easier to find later:

```
pnpm db:generate --name=user_token_version
```

**Run it in a terminal.** When a change looks like it could be a rename,
drizzle-kit stops and asks whether `notes → internal_notes` is a rename or a
drop-and-create. Answering is the point: the two produce the same schema and
very different data. It is the one command here that is interactive, and CI
never runs it.

## What gets applied, and when

`runMigrations()` applies every pending migration in order, exactly once, and
records what it applied in `drizzle.__drizzle_migrations`. It runs:

- on API boot when `AUTO_MIGRATE=true`;
- from `pnpm db:migrate` for a local database;
- in CI against a throwaway Postgres, so a migration that does not apply to a
  clean database fails the pull request.

Concurrent instances are safe — the migrator holds a lock for the duration.

## The two guards

Migrations only help if they were actually generated. Two checks make skipping
that step impossible to miss:

**`pnpm db:check`** (in CI) re-renders the schema from the entity registry and
fails if it differs from the committed file. An entity that changed without
`db:generate` being run cannot merge.

**The boot-time drift check** compares the live database against the registry
after migrations have applied, and refuses to start if a table or column is
missing or has the wrong type:

```
The database does not match the entity definitions.

Missing columns:
  - comment.external_id (TEXT)

An entity definition changed without a migration to match. Run:
  pnpm db:generate
and commit the generated schema plus the new migration under packages/core/drizzle/.
```

That is the same failure that took production down, reported at startup with the
column named and the fix stated, instead of as a 502 on an unrelated request.

## Migration 0000 is special

`0000_baseline.sql` is the only migration written idempotently
(`CREATE TABLE IF NOT EXISTS`, catalog-guarded foreign keys). It has to land on
two kinds of database: a brand-new one, and a deployment whose tables the old
boot-time DDL already created. Every object name in it matches the name that
older DDL produced, so adopting a live database applies nothing but the three
indexes that DDL never got around to creating.

Every migration from 0001 on is generated, non-idempotent, and applied once —
a test enforces that distinction. `0001_user_token_version.sql` is what a normal
one looks like: a single `ALTER TABLE ... ADD COLUMN`, produced by adding one
field to the `users` table in `schema.ts`.

## Column types

`field.*` types map to Postgres like this:

| Field type            | Column              |
| --------------------- | ------------------- |
| `string`, `text`, `email`, `phone`, `select`, `relation` | `text` |
| `number`              | `integer`           |
| `currency`            | `numeric(15,2)`     |
| `boolean`             | `boolean`           |
| `date`, `datetime`    | `timestamptz`       |
| `multiselect`, `json` | `jsonb`             |

Entity columns are nullable in the database even when the field is `required` —
requiredness is enforced by zod on the way in, so adding a required field to an
entity that already has rows does not need a backfill before it can deploy.

Two places encode this mapping: the codegen that writes the drizzle schema, and
the drift check that reads the live database. `schema-codegen.test.ts` fails if
they ever disagree.
