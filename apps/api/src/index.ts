import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { sql } from "drizzle-orm";
import {
  registerEntities,
  entityRegistry,
  entityService,
  getDb,
  getEntityUiMeta,
  pluginManager,
  hashPassword,
  verifyPassword,
  isLegacyHash,
  signToken,
  verifyToken,
  isSessionCurrent,
  startAutomationEngine,
  checkPermission,
  collectAttention,
  collectMetrics,
  collectRelated,
  parseFilterParams,
} from "@meridian/core";
import { allEntities } from "@meridian/entities";
import { getFormConfig, getListColumns } from "@meridian/ui-schema";
import { OdooAdapter, importCsv, parseCsv, CSV_PRESETS } from "@meridian/migration";
import { AgentOrchestrator, generateBriefing, draftAutomation, draftCsvMapping } from "@meridian/ai";
import { isLoginBlocked, recordLoginFailure, clearLoginFailures } from "./rate-limit.js";
import { allowedOrigins, corsMiddleware, securityHeaders, clientIp } from "./security.js";
import { requestLogger } from "./observability.js";
import { throttle } from "./throttle.js";
import { ApiError, respondToError } from "./errors.js";
import type { App, AppContext, AppEnv } from "./app-env.js";
import { registerUserRoutes } from "./users.js";
import { registerPdfRoutes } from "./pdf.js";
import { runMigrations, seedDemoTenant } from "@meridian/core";
import { hooks as examplePluginHooks } from "meridian-example-plugin";
import type { ActorContext } from "@meridian/core";

registerEntities(allEntities);
startAutomationEngine();

pluginManager.install(
  { name: "example-plugin", version: "1.0.0", hooks: { "deal.onCreate": "./hooks/log-deal.ts" } },
  examplePluginHooks,
);
pluginManager.enable("example-plugin");

const app = new Hono<AppEnv>();

// Order matters: an id first so every later log line and error body can quote
// it, then the logger so it observes the final status, then the headers and
// origin checks that a rejected request should still receive.
app.use("*", requestId());
app.use("*", requestLogger());
app.use("*", securityHeaders());
app.use("*", corsMiddleware());

/**
 * A JSON API has no legitimate megabyte-scale request, so bodies are capped
 * before they are buffered into the heap. Imports are the exception — they
 * carry a whole CSV — and the limit is chosen per path rather than by
 * registering two middlewares, because the first one registered would reject an
 * import before the more permissive one ever ran.
 */
const IMPORT_PATHS = new Set(["/api/migration/csv/import", "/api/ai/migration/map"]);
const generalBodyLimit = bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: "Request body too large" }, 413),
});
const importBodyLimit = bodyLimit({
  maxSize: 10 * 1024 * 1024,
  onError: (c) =>
    c.json({ error: "That file is too large to import in one request (10 MB max)" }, 413),
});
app.use("/api/*", (c, next) =>
  IMPORT_PATHS.has(c.req.path) ? importBodyLimit(c, next) : generalBodyLimit(c, next),
);

// Resolve the bearer token once per request. Routes read c.get("actor"); the
// throttles read it too, so a limit follows the account rather than the proxy.
app.use("/api/*", async (c, next) => {
  const verified = actorFromRequest(c);
  // A valid signature is not enough: the user may have been removed, or every
  // session invalidated by a password or role change since the token was signed.
  if (verified && (await isSessionCurrent(verified.actor.id, verified.tokenVersion))) {
    c.set("actor", verified.actor);
  }
  await next();
});

app.onError((err, c) => respondToError(c, err));

/**
 * Rate limits, tightest where a request is most expensive.
 *
 * AI calls cost money and take seconds, so one account in a retry loop is both
 * a bill and a queue for everyone else. Imports touch thousands of rows per
 * call.
 *
 * The write ceiling is set for a scripted client rather than a typing human:
 * agents and seed scripts legitimately write in bursts, and 10/second still
 * bounds a runaway loop long before it saturates the database.
 */
app.use("/api/ai/*", throttle({ name: "ai", limit: 30, windowSeconds: 60 }));
app.use("/api/migration/*", throttle({ name: "migration", limit: 20, windowSeconds: 60 }));
app.use("/api/*", async (c, next) =>
  c.req.method === "GET"
    ? next()
    : throttle({ name: "write", limit: 600, windowSeconds: 60 })(c, next),
);

app.get("/health", (c) => c.json({ status: "ok", service: "meridian-api" }));

// Auth
app.post("/api/auth/login", async (c) => {
  let email: string;
  let password: string;
  try {
    ({ email, password } = await c.req.json<{ email: string; password: string }>());
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const throttleKey = `${clientIp(c)}:${(email ?? "").toLowerCase()}`;

  const { blocked, retryAfterSeconds } = await isLoginBlocked(throttleKey);
  if (blocked) {
    c.header("Retry-After", String(retryAfterSeconds));
    return c.json({ error: "Too many failed attempts. Try again later." }, 429);
  }

  const db = getDb();

  const result = await db.execute(sql`
    SELECT u.id, u.email, u.name, u.role, u.tenant_id, u.password_hash, u.token_version,
           t.name as tenant_name, t.slug as tenant_slug
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE u.email = ${email}
    LIMIT 1
  `);

  const user = result[0] as
    | {
        id: string;
        email: string;
        name: string;
        role: string;
        tenant_id: string;
        password_hash: string;
        token_version: number;
        tenant_name: string;
        tenant_slug: string;
      }
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    await recordLoginFailure(throttleKey);
    return c.json({ error: "Invalid credentials" }, 401);
  }
  await clearLoginFailures(throttleKey);

  // Transparently upgrade legacy unsalted hashes on successful login
  if (isLegacyHash(user.password_hash)) {
    await db.execute(sql`
      UPDATE users SET password_hash = ${hashPassword(password)} WHERE id = ${user.id}
    `);
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenant_id,
    tenantName: user.tenant_name,
    v: Number(user.token_version ?? 0),
  });

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
    },
  });
});

app.get("/api/auth/me", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ user: actor });
});

// Entity metadata. Behind auth: the field-level schema of every business
// object is a map of the deployment, not something to hand out anonymously.
app.get("/api/entities", (c) => {
  if (!getActor(c)) return c.json({ error: "Unauthorized" }, 401);
  const entities = entityRegistry.list().map((e) => ({
    name: e.name,
    label: e.label,
    pluralLabel: e.pluralLabel ?? `${e.label}s`,
  }));
  return c.json({ entities });
});

app.get("/api/entities/:name/schema", (c) => {
  if (!getActor(c)) return c.json({ error: "Unauthorized" }, 401);
  const entity = entityRegistry.get(c.req.param("name"));
  if (!entity) return c.json({ error: "Entity not found" }, 404);
  return c.json(getFormConfig(entity));
});

app.get("/api/entities/:name/columns", (c) => {
  if (!getActor(c)) return c.json({ error: "Unauthorized" }, 401);
  const entity = entityRegistry.get(c.req.param("name"));
  if (!entity) return c.json({ error: "Entity not found" }, 404);
  return c.json({ columns: getListColumns(entity) });
});

// Generic CRUD routes
const crudActions = ["list", "read", "create", "update", "delete", "search"] as const;

for (const action of crudActions) {
  const method = action === "list" || action === "read" || action === "search" ? "get" : action === "delete" ? "delete" : "post";
  const path =
    action === "list"
      ? "/api/:entity/list"
      : action === "read"
        ? "/api/:entity/read/:id"
        : action === "delete"
          ? "/api/:entity/delete/:id"
          : `/api/:entity/${action}`;

  app.on(method.toUpperCase() as "GET" | "POST" | "DELETE", path, async (c) => {
    const actor = getActor(c);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);

    const entityName = c.req.param("entity")!;
    if (!entityRegistry.get(entityName)) {
      return c.json({ error: "Entity not found" }, 404);
    }

    try {
      switch (action) {
        case "list": {
          const page = Number(c.req.query("page") ?? 1);
          const pageSize = Number(c.req.query("pageSize") ?? 20);
          const search = c.req.query("search") ?? undefined;
          const sortBy = c.req.query("sortBy") ?? undefined;
          const sortOrder = c.req.query("sortOrder") === "asc" ? "asc" as const : c.req.query("sortOrder") === "desc" ? "desc" as const : undefined;

          // filter.<field>=value, or filter.<field>.<op>=value for comparisons
          const filters = parseFilterParams(c.req.query());

          const result = await entityService.list(
            entityName,
            {
              tenantId: actor.tenantId,
              page,
              pageSize,
              search,
              sortBy,
              sortOrder,
              filters: Object.keys(filters).length > 0 ? filters : undefined,
            },
            actor,
          );
          return c.json(result);
        }
        case "read": {
          const record = await entityService.read(entityName, c.req.param("id")!, actor);
          return c.json(record);
        }
        case "create": {
          const data = await c.req.json();
          const record = await entityService.create(entityName, data, actor);
          return c.json(record, 201);
        }
        case "update": {
          const data = await c.req.json();
          const record = await entityService.update(entityName, c.req.param("id") ?? data.id, data, actor);
          return c.json(record);
        }
        case "delete": {
          // Deleting refuses by default when other records still point here.
          // ?detach=true is the caller saying they mean to clear those links.
          await entityService.delete(entityName, c.req.param("id")!, actor, {
            detach: c.req.query("detach") === "true",
          });
          return c.json({ success: true });
        }
        case "search": {
          const q = c.req.query("q") ?? "";
          const result = await entityService.list(
            entityName,
            { tenantId: actor.tenantId, search: q },
            actor,
          );
          return c.json(result);
        }
      }
    } catch (err) {
      return respondToError(c, err);
    }
  });
}

// Audit log for a record
app.get("/api/:entity/audit/:id", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  const entityName = c.req.param("entity")!;
  const recordId = c.req.param("id")!;
  const entity = entityRegistry.get(entityName);
  if (!entity) {
    return c.json({ error: "Entity not found" }, 404);
  }

  try {
    // Audit diffs contain full field values — same ACL as reading the record
    checkPermission(entity, actor, "read");

    const db = getDb();
    const result = await db.execute(sql`
      SELECT id, action, actor_id, actor_type, diff, created_at
      FROM audit_log
      WHERE tenant_id = ${actor.tenantId}
        AND entity_name = ${entityName}
        AND record_id = ${recordId}::uuid
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const entries = (result as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actor_id,
      actorType: row.actor_type,
      diff: row.diff,
      createdAt: row.created_at,
    }));

    return c.json({ entries });
  } catch (err) {
    return respondToError(c, err);
  }
});

// Bulk delete records
app.post("/api/:entity/bulk-delete", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  const entityName = c.req.param("entity")!;
  if (!entityRegistry.get(entityName)) {
    return c.json({ error: "Entity not found" }, 404);
  }

  let ids: string[];
  try {
    ({ ids } = await c.req.json<{ ids: string[] }>());
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: "ids must be a non-empty array" }, 400);
  }
  if (ids.length > 100) {
    return c.json({ error: "Cannot delete more than 100 records at once" }, 400);
  }

  const detach = c.req.query("detach") === "true";
  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      await entityService.delete(entityName, id, actor, { detach });
      deleted.push(id);
    } catch (err) {
      failed.push({ id, error: (err as Error).message });
    }
  }

  return c.json({ deleted, failed, success: failed.length === 0 });
});

// AI chat
app.post("/api/ai/chat", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  if (!process.env.ANTHROPIC_API_KEY) {
    return c.json({ error: "AI not configured — set ANTHROPIC_API_KEY" }, 503);
  }

  let message: string;
  let history: { role: "user" | "assistant"; content: string }[] | undefined;
  try {
    ({ message, history } = await c.req.json());
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof message !== "string" || message.trim() === "") {
    return c.json({ error: "message is required" }, 400);
  }

  const orchestrator = new AgentOrchestrator(actor);
  const result = await orchestrator.chat(message, history ?? []);
  return c.json(result);
});

registerUserRoutes(app, getActor);
registerPdfRoutes(app, getActor);

// Draft an automation rule from an English description
app.post("/api/ai/automation/draft", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  if (!process.env.ANTHROPIC_API_KEY) {
    return c.json({ error: "AI not configured — set ANTHROPIC_API_KEY" }, 503);
  }

  let body: { prompt?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.prompt?.trim()) return c.json({ error: "prompt is required" }, 400);

  try {
    const draft = await draftAutomation(body.prompt.trim());
    return c.json(draft);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Aggregations for reports and dashboards
app.get("/api/:entity/aggregate", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  const entityName = c.req.param("entity")!;
  if (!entityRegistry.get(entityName)) return c.json({ error: "Entity not found" }, 404);

  const metricParam = c.req.query("metric");
  const metric =
    metricParam === "sum" || metricParam === "avg" || metricParam === "count" ? metricParam : "count";

  try {
    const filters = parseFilterParams(c.req.query());
    const rows = await entityService.aggregate(
      entityName,
      {
        groupBy: c.req.query("groupBy") ?? undefined,
        metric,
        metricField: c.req.query("metricField") ?? undefined,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      },
      actor,
    );
    return c.json({ rows });
  } catch (err) {
    return respondToError(c, err);
  }
});

// Daily briefing: pipeline health, overdue work, open tasks
app.get("/api/ai/briefing", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  try {
    const briefing = await generateBriefing(actor, undefined, {
      refresh: c.req.query("refresh") === "true",
    });
    return c.json(briefing);
  } catch (err) {
    return respondToError(c, err);
  }
});

/**
 * What needs the user today: overdue invoices, lapsing quotes, deals past their
 * close date, late activities and tasks. This is what the dashboard leads with,
 * so it is deliberately a single request.
 */
app.get("/api/dashboard/attention", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  try {
    const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 12)));
    return c.json(await collectAttention(actor, { limit }));
  } catch (err) {
    return respondToError(c, err);
  }
});

/** The figures the dashboard leads with: pipeline, forecast, win rate, money owed. */
app.get("/api/dashboard/metrics", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json(await collectMetrics(actor));
  } catch (err) {
    return respondToError(c, err);
  }
});

/** Records pointing at this one, plus rolled-up value — for a detail page. */
app.get("/api/:entity/related/:id", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  const entityName = c.req.param("entity")!;
  const entity = entityRegistry.get(entityName);
  if (!entity) return c.json({ error: "Entity not found" }, 404);

  try {
    // Seeing a record's relations means seeing the record.
    checkPermission(entity, actor, "read");
    return c.json(await collectRelated(entityName, c.req.param("id")!, actor));
  } catch (err) {
    return respondToError(c, err);
  }
});

// Convert an accepted quote into a draft invoice
app.post("/api/quote/:id/convert", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  try {
    const quote = await entityService.read("quote", c.req.param("id")!, actor);

    // One invoice per quote: reuse the existing one rather than duplicating
    const existing = await entityService.list(
      "invoice",
      { tenantId: actor.tenantId, filters: { externalId: `quote:${quote.id}` }, pageSize: 1 },
      actor,
    );
    if (existing.data[0]) {
      return c.json({ invoice: existing.data[0], created: false });
    }

    const issued = new Date();
    const due = new Date(issued.getTime() + 30 * 86_400_000);
    const invoice = await entityService.create(
      "invoice",
      {
        number: `INV-${String(quote.number ?? "").replace(/^Q-?/i, "") || Date.now()}`,
        status: "draft",
        companyId: quote.companyId ?? undefined,
        contactId: quote.contactId ?? undefined,
        issueDate: issued.toISOString().slice(0, 10),
        dueDate: due.toISOString().slice(0, 10),
        lines: quote.lines ?? [],
        subtotal: quote.subtotal ?? 0,
        tax: quote.tax ?? 0,
        total: quote.total ?? 0,
        notes: quote.notes ?? undefined,
        externalId: `quote:${quote.id}`,
        sourceSystem: "meridian",
      },
      actor,
    );
    return c.json({ invoice, created: true }, 201);
  } catch (err) {
    return respondToError(c, err);
  }
});

// AI column mapping for arbitrary CSV files
app.post("/api/ai/migration/map", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);
  if (!process.env.ANTHROPIC_API_KEY) {
    return c.json({ error: "AI not configured — set ANTHROPIC_API_KEY" }, 503);
  }

  let body: { csv?: string; entity?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.csv?.trim()) return c.json({ error: "csv is required" }, 400);

  try {
    const { headers, rows } = parseCsv(body.csv);
    if (headers.length === 0) return c.json({ error: "Could not read any columns from the CSV" }, 400);
    const draft = await draftCsvMapping(headers, rows.slice(0, 3), body.entity);
    return c.json(draft);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// CSV migration (ERPNext, Dolibarr, generic exports)
app.get("/api/migration/csv/presets", (c) => {
  if (!getActor(c)) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ presets: CSV_PRESETS });
});

app.post("/api/migration/csv/import", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  let body: {
    csv: string;
    preset?: string;
    entity?: string;
    mapping?: { column: string; field: string }[];
    externalIdColumn?: string;
    sourceSystem?: string;
    dryRun?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof body.csv !== "string" || body.csv.trim() === "") {
    return c.json({ error: "csv is required" }, 400);
  }

  try {
    let options;
    if (body.preset) {
      const preset = CSV_PRESETS.find((p) => p.name === body.preset);
      if (!preset) return c.json({ error: `Unknown preset: ${body.preset}` }, 400);
      options = {
        entity: preset.entity,
        mapping: preset.mapping,
        externalIdColumn: preset.externalIdColumn,
        sourceSystem: preset.sourceSystem,
        dryRun: body.dryRun,
      };
    } else {
      if (!body.entity || !body.mapping?.length) {
        return c.json({ error: "Provide either a preset or entity + mapping" }, 400);
      }
      options = {
        entity: body.entity,
        mapping: body.mapping,
        externalIdColumn: body.externalIdColumn,
        sourceSystem: body.sourceSystem,
        dryRun: body.dryRun,
      };
    }

    const result = await importCsv(body.csv, options, actor);
    return c.json(result);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Migration
app.post("/api/migration/odoo/connect", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  let config: { url: string; database: string; username: string; password: string };
  try {
    config = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!config?.url) return c.json({ error: "url is required" }, 400);
  const adapter = new OdooAdapter(config);

  try {
    await adapter.connect();
    const mappings = adapter.getAvailableMappings();
    const counts = await Promise.all(
      mappings.map(async (m) => ({
        model: m.odooModel,
        entity: m.meridianEntity,
        count: await adapter.fetchModelCount(m.odooModel, OdooAdapter.domainFor(m)),
      })),
    );
    return c.json({ connected: true, models: counts });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "warn",
        requestId: c.get("requestId"),
        route: "odoo/connect",
        error: (err as Error).message,
      }),
    );
    return c.json({ error: "Could not connect to Odoo. Check the URL, database, and credentials." }, 400);
  }
});

app.post("/api/migration/odoo/import", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  let body: {
    config: { url: string; database: string; username: string; password: string };
    models?: string[];
    dryRun?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.config?.url) return c.json({ error: "config.url is required" }, 400);

  try {
    const adapter = new OdooAdapter(body.config);
    return c.json(await adapter.runMigration(actor, body.models, body.dryRun ?? false));
  } catch (err) {
    // Never echo the adapter error as-is: the request carried Odoo credentials
    // and a driver-level message can quote the connection it was handed.
    console.error(
      JSON.stringify({
        level: "error",
        requestId: c.get("requestId"),
        route: "odoo/import",
        error: (err as Error).message,
      }),
    );
    throw new ApiError(400, "The Odoo import failed. Check the connection details and try again.");
  }
});

app.get("/api/migration/odoo/mappings", (c) => {
  if (!getActor(c)) return c.json({ error: "Unauthorized" }, 401);
  const adapter = new OdooAdapter({ url: "", database: "", username: "", password: "" });
  return c.json({ mappings: adapter.getAvailableMappings() });
});

// Plugins
app.get("/api/plugins", (c) => {
  if (!getActor(c)) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ plugins: pluginManager.list().map((p) => ({ name: p.manifest.name, state: p.state })) });
});

/** Verify the bearer token's signature and expiry. No database access. */
function actorFromRequest(
  c: AppContext,
): { actor: ActorContext; tokenVersion: unknown } | null {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const payload = verifyToken(auth.slice(7));
  if (!payload) return null;

  return {
    actor: {
      id: payload.id,
      type: "user",
      tenantId: payload.tenantId,
      role: payload.role,
    },
    tokenVersion: payload.v,
  };
}

/** The signed-in actor for this request, or null. */
function getActor(c: AppContext): ActorContext | null {
  return c.get("actor") ?? null;
}

const port = Number(process.env.PORT ?? 3001);

if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  console.error("FATAL: AUTH_SECRET must be set in production — refusing to start");
  process.exit(1);
}

// Not fatal: an API-only deployment driving agents over API keys has no browser
// origin to allow. But a deployment that does serve the web app and forgot this
// fails every request from it, so say so at boot rather than in a console tab.
if (allowedOrigins().length === 0) {
  console.warn(
    "WARNING: no browser origins allowed — set MERIDIAN_CORS_ORIGINS (or NEXT_PUBLIC_APP_URL). " +
      "Requests from a browser will be rejected by CORS.",
  );
}

// Railway-friendly bootstrap: migrate/seed on boot when enabled, no shell needed
if (process.env.AUTO_MIGRATE === "true") {
  console.log("AUTO_MIGRATE=true — running migrations");
  await runMigrations();
  console.log("Migrations complete");
}
if (process.env.AUTO_SEED === "true") {
  const seeded = await seedDemoTenant();
  console.log(seeded ? "Seeded demo tenant (admin@demo.com)" : "Demo tenant already present, seed skipped");
}

console.log(`Meridian API starting on port ${port}`);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
