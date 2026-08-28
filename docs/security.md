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

Sessions can be revoked. Each user carries a `token_version`; tokens are stamped
with the version current when they were signed, and a token whose version is
behind is refused — as is any token for a user that no longer exists. The
version is bumped on a password change (which therefore signs the user out
everywhere, including the browser that made the change), on a role change (the
old token still carries the old role, and the role is what the ACL reads), and
implicitly on removal.

The version is read from the database and cached for
`MERIDIAN_SESSION_CACHE_MS` (default 15s), so a revocation lands within that
window on every instance rather than instantly — the alternative is a primary
key lookup on every request for a value that almost never changes. The instance
that performs the revocation drops its own cache entry immediately.

**Known gap:** the 15-second window above. Shorten it with
`MERIDIAN_SESSION_CACHE_MS` if a deployment needs revocation to be tighter than
that; setting it to 0 makes revocation immediate at the cost of one indexed
lookup per request.

## Authorization

Roles are defined once, in `packages/core/src/acl/roles.ts`, against what a kind
of data **is** rather than against each table:

| Class | Holds |
| --- | --- |
| `crm` | customers, deals, quotes |
| `finance` | invoices and the product catalogue |
| `delivery` | projects, tasks, time, milestones |
| `collaboration` | comments and logged activity |
| `config` | automations, pipeline definitions |

| Role | Does |
| --- | --- |
| `owner` | Everything, plus billing. Cannot be demoted or removed by an admin. |
| `admin` | Everything except billing. Invites and removes people. |
| `finance` | Owns invoices and the catalogue. Reads the rest. |
| `sales` | Owns customers, deals and quotes. Reads invoices. |
| `member` | Does the work: projects, tasks, time. Reads customers and documents. |
| `viewer` | Reads everything, changes nothing. |
| `agent` | AI and automation. Reads broadly, drafts work, never writes money or config. |

This replaced a permission matrix on every entity, a mechanism that had already
failed: `member` was read-only in the CRM and commerce files but
create-read-update in the projects file, because each declared its own local
constant. The same role meant two things depending on which file an entity
happened to live in. Adding a role was fourteen edits across four files, and
missing one produced a 403 on exactly one entity — on a dashboard, an invisible
empty section rather than an error.

Two separations are deliberate. **Sales can write quotes but not invoices**: the
person who closes the deal should not also be the person who bills for it and
marks it paid. **The agent role cannot write money documents at all**, so an
unattended AI actor is never in a position to change what a customer owes.

An entity may still declare a `permissions` map as an explicit exception; the
central table is the default, and an entity that classifies itself as nothing is
treated as config — admin-only — so a third-party entity is closed until someone
says otherwise.

`ActorContext.permissions` is a **ceiling, not a grant**. It used to sit in front
of the role and win outright, so anything that could attach a permission map to
an actor could hand itself rights its role did not have, with nothing bounding
what went in it. It can now only narrow.

Every query is scoped to the actor's `tenant_id`. Sort, filter and group-by
column names are resolved against the entity definition rather than
interpolated, so a query parameter cannot reach the SQL.

`users.role` carries a check constraint and no longer defaults to `admin` — any
insert that forgot to set a role previously created an administrator.

**Lockout is not reachable.** Neither changing a role nor deleting a user may
leave a workspace with nobody holding `manage:users`, counted over the
capability rather than the literal string "admin". Only an owner may add, demote
or remove another owner — except in a workspace that has none, where an admin
may appoint the first, after which the rule closes behind them. Deleting
previously had no guard at all beyond self-deletion, so with two admins either
could simply delete the other.

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

## The MCP bridge

`apps/mcp` exposes the entity engine over HTTP for MCP clients. Every request
authenticates with the same signed bearer token the main API uses, and the actor
is derived from that token alone. `/health` is the only unauthenticated route.

It binds to loopback unless `MCP_BIND` says otherwise, so reaching it from
another container is a deliberate configuration step rather than the default.

This route previously read the acting identity out of the request body and had
no authentication at all, which meant anyone who could reach the port could
declare themselves admin of any tenant and get unrestricted CRUD, with audit
rows attributed to whatever actor id they chose. It was never given a public
domain, so it was reachable only from inside the deployment's private network —
but that is containment by configuration, not by design, and it is one click
from being wrong.

## Odoo import

The Odoo adapter is strictly read-only. It calls `authenticate`, `search_count`
and `search_read` and nothing else — no `write`, `create`, or `unlink` — so
importing cannot alter the source system. Connection errors are logged and
answered with a fixed message, because the request that produced them carried
Odoo credentials.

## Tenant branding

Logos are stored as data URIs on the tenant row, not in object storage — the
deployment story is that Postgres is the only stateful dependency, and this
keeps `pg_dump` a complete backup.

Uploads are restricted to PNG and JPEG, identified by sniffing the file's own
magic bytes; the `data:` prefix is rebuilt from what was sniffed, so a caller
posting `data:text/html;base64,…` cannot get that string persisted and echoed
back. Dimensions are read from the image header and capped at 4096px, which
rejects a decompression bomb before anything decodes it. Size is capped at
256 KB decoded, checked after a base64 round-trip so padding tricks don't slip
past.

SVG is refused rather than sanitised. Nothing in the API's dependencies can
sanitise it; even script-inert SVG can fetch an external resource from an
`<img>`, making the logo a tracking beacon that fires for every user in the
tenant; and the stored value outlives the assumption that it is only ever put
in an `<img>` — the quote and invoice PDFs are the obvious next consumer.

Only admins can write branding; any signed-in user can read their own tenant's.
There is no unauthenticated branding endpoint, because one keyed by tenant slug
would let anyone enumerate the tenants on a deployment.

## Operational notes

- The demo tenant (`admin@demo.com`) takes its password from
  `DEMO_ADMIN_PASSWORD`. Unset, a local instance gets `demo1234` and a
  production one gets a random password printed once in the boot log —
  `AUTO_SEED` is exactly the setting someone turns on for a first public deploy,
  so it must not produce an instance anyone can sign into.
- Secrets belong in the platform's environment configuration. A key that has
  been pasted into a chat, a terminal, or a commit should be rotated.
- `MERIDIAN_SESSION_CACHE_MS` trades revocation latency against per-request
  database load. The default of 15s suits most deployments.
