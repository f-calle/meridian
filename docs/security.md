# Security posture

What the API enforces, and why each control is there. Anything listed as a known
gap is a gap, not an oversight to be discovered later.

## Authentication

Session tokens are HMAC-SHA256 signed with `AUTH_SECRET` and carry an expiry.
The API refuses to start in production without `AUTH_SECRET`, because the
fallback would be a secret an attacker also knows.

Passwords are hashed with scrypt (`scrypt$salt$hash`). Hashes written by an
earlier unsalted SHA-256 scheme still verify, and are transparently rehashed on
the next successful login.

Failed logins are throttled per IP + email: 10 failures in 15 minutes returns a
429 with `Retry-After`. A successful login clears the counter, so a user is never
locked out by their own history.

**Known gap:** tokens are stateless, so they stay valid until they expire.
Changing a password or removing a user does not revoke tokens already issued.
Closing this needs a token version on the user record, checked at verify time.

## Authorization

Every entity declares a per-role permission matrix, checked on create, read,
update and delete. Denials surface as 403 — a distinct status from 400 — so a
client can tell "you may not" from "your input was wrong".

Every query is scoped to the actor's `tenant_id`. Sort, filter and group-by
column names are resolved against the entity definition rather than
interpolated, so a query parameter cannot reach the SQL.

Metadata endpoints (`/api/entities`, `/api/entities/:name/schema`,
`/api/plugins`, the migration preset lists) require authentication. They describe
the shape of the whole deployment, which is not something to serve anonymously.

## Request handling

- **Origins.** CORS is an allowlist from `MERIDIAN_CORS_ORIGINS` (or
  `NEXT_PUBLIC_APP_URL`). Production defaults to allowing nothing and warns at
  boot, rather than falling back to localhost.
- **Headers.** `Content-Security-Policy: default-src 'none'`, `frame-ancestors
  'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, and HSTS in production.
- **Body size.** 1 MB by default; 10 MB on the two import routes that carry a
  whole CSV. Oversized bodies are rejected before being buffered into the heap.
- **Rate limits.** AI routes 30/min, migration routes 20/min, all other writes
  300/min — keyed on the authenticated actor, so a limit follows the account
  rather than a shared proxy address. Redis-backed across instances, with an
  in-memory fallback.

## Errors and logging

One classifier decides what an error becomes on the wire. Errors Meridian raises
itself — validation, permission, referential integrity — are returned verbatim,
because the user needs them. Postgres driver errors are translated to a message
that names no SQL. Anything unrecognised becomes a generic 500 carrying a request
id, with the real message and stack going to the log under that same id.

Each request logs one JSON line: id, method, path, status, duration, tenant,
actor, IP. Query strings and request bodies are deliberately not logged — they
carry customer data.

## Data integrity

Deleting a record that others still point at is refused with a 409 naming what
depends on it ("1 contact and 1 deal still link to it"). Clearing those links is
a separate, explicit `?detach=true`, surfaced in the UI as a second button rather
than as the default.

Schema changes are versioned migrations; nothing creates or alters a table at
runtime, and the API refuses to boot against a database that does not match the
entity definitions. See [schema-migrations.md](schema-migrations.md).

## Database connections

Pools are bounded (`MERIDIAN_DB_POOL_MAX`, default 10) because a hosted
Postgres connection cap is global and shared. The request-path pool carries a
statement timeout (`MERIDIAN_STATEMENT_TIMEOUT_MS`, default 30s) so a
pathological query cannot pin a connection; the migration pool deliberately has
none, since an index build is allowed to take as long as it takes.

## Odoo import

The Odoo adapter is strictly read-only. It calls `authenticate`, `search_count`
and `search_read` and nothing else — no `write`, `create`, or `unlink` — so
importing cannot alter the source system. Connection errors are logged and
answered with a fixed message, because the request that produced them carried
Odoo credentials.

## Operational notes

- The demo tenant (`admin@demo.com`) is seeded with a well-known password unless
  `DEMO_ADMIN_PASSWORD` is set. Set it, or don't enable `AUTO_SEED`, on any
  deployment reachable from the internet.
- Secrets belong in the platform's environment configuration. A key that has
  been pasted into a chat, a terminal, or a commit should be rotated.
