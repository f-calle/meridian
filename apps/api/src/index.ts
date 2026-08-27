import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
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
  startAutomationEngine,
} from "@meridian/core";
import { allEntities } from "@meridian/entities";
import { getFormConfig, getListColumns } from "@meridian/ui-schema";
import { OdooAdapter, importCsv, CSV_PRESETS } from "@meridian/migration";
import { AgentOrchestrator, generateBriefing } from "@meridian/ai";
import { hooks as examplePluginHooks } from "meridian-example-plugin";
import type { ActorContext } from "@meridian/core";

registerEntities(allEntities);
startAutomationEngine();

pluginManager.install(
  { name: "example-plugin", version: "1.0.0", hooks: { "deal.onCreate": "./hooks/log-deal.ts" } },
  examplePluginHooks,
);
pluginManager.enable("example-plugin");

const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000",
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ status: "ok", service: "meridian-api" }));

// Auth
app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  const db = getDb();

  const result = await db.execute(sql`
    SELECT u.id, u.email, u.name, u.role, u.tenant_id, u.password_hash, t.name as tenant_name, t.slug as tenant_slug
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
        tenant_name: string;
        tenant_slug: string;
      }
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

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

// Entity metadata
app.get("/api/entities", (c) => {
  const entities = entityRegistry.list().map((e) => ({
    name: e.name,
    label: e.label,
    pluralLabel: e.pluralLabel ?? `${e.label}s`,
  }));
  return c.json({ entities });
});

app.get("/api/entities/:name/schema", (c) => {
  const entity = entityRegistry.get(c.req.param("name"));
  if (!entity) return c.json({ error: "Entity not found" }, 404);
  return c.json(getFormConfig(entity));
});

app.get("/api/entities/:name/columns", (c) => {
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

          // filter.<field>=value query params become exact-match filters
          const filters: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(c.req.query())) {
            if (key.startsWith("filter.")) filters[key.slice("filter.".length)] = value;
          }

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
          await entityService.delete(entityName, c.req.param("id")!, actor);
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
      const message = (err as Error).message;
      const status = message.includes("Permission") ? 403 : message.includes("not found") ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });
}

// AI chat
app.post("/api/ai/chat", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  if (!process.env.ANTHROPIC_API_KEY) {
    return c.json({ error: "AI not configured — set ANTHROPIC_API_KEY" }, 503);
  }

  const { message, history } = await c.req.json<{
    message: string;
    history?: { role: "user" | "assistant"; content: string }[];
  }>();

  const orchestrator = new AgentOrchestrator(actor);
  const result = await orchestrator.chat(message, history ?? []);
  return c.json(result);
});

// Daily briefing: pipeline health, overdue work, open tasks
app.get("/api/ai/briefing", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  try {
    const briefing = await generateBriefing(actor);
    return c.json(briefing);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// CSV migration (ERPNext, Dolibarr, generic exports)
app.get("/api/migration/csv/presets", (c) => {
  return c.json({ presets: CSV_PRESETS });
});

app.post("/api/migration/csv/import", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{
    csv: string;
    preset?: string;
    entity?: string;
    mapping?: { column: string; field: string }[];
    externalIdColumn?: string;
    sourceSystem?: string;
    dryRun?: boolean;
  }>();

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

  const config = await c.req.json<{ url: string; database: string; username: string; password: string }>();
  const adapter = new OdooAdapter(config);

  try {
    await adapter.connect();
    const mappings = adapter.getAvailableMappings();
    const counts = await Promise.all(
      mappings.map(async (m) => ({
        model: m.odooModel,
        entity: m.meridianEntity,
        count: await adapter.fetchModelCount(m.odooModel),
      })),
    );
    return c.json({ connected: true, models: counts });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.post("/api/migration/odoo/import", async (c) => {
  const actor = getActor(c);
  if (!actor) return c.json({ error: "Unauthorized" }, 401);

  const { config, models, dryRun } = await c.req.json<{
    config: { url: string; database: string; username: string; password: string };
    models?: string[];
    dryRun?: boolean;
  }>();

  const adapter = new OdooAdapter(config);
  const report = await adapter.runMigration(actor, models, dryRun ?? false);
  return c.json(report);
});

app.get("/api/migration/odoo/mappings", (c) => {
  const adapter = new OdooAdapter({ url: "", database: "", username: "", password: "" });
  return c.json({ mappings: adapter.getAvailableMappings() });
});

// Plugins
app.get("/api/plugins", (c) => {
  return c.json({ plugins: pluginManager.list().map((p) => ({ name: p.manifest.name, state: p.state })) });
});

function getActor(c: { req: { header: (name: string) => string | undefined } }): ActorContext | null {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const payload = verifyToken(auth.slice(7));
  if (!payload) return null;

  return {
    id: payload.id,
    type: "user",
    tenantId: payload.tenantId,
    role: payload.role,
  };
}

const port = Number(process.env.PORT ?? 3001);
console.log(`Meridian API starting on port ${port}`);

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
