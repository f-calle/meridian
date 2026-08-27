import { sql } from "drizzle-orm";
import { getDb } from "./client.js";
import { syncEntityTables } from "./entity-store.js";
import { hashPassword } from "../auth/password.js";

/**
 * Create all system tables and (via syncEntityTables) one table per
 * registered entity. Idempotent — safe to run on every boot. Callers must
 * register entities first; the API/worker do that at startup.
 */
export async function runMigrations(): Promise<void> {
  const db = getDb();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, email)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent',
      permissions JSONB,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      entity_name TEXT NOT NULL,
      record_id UUID NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      diff JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_log_tenant_idx ON audit_log(tenant_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log(entity_name, record_id)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS plugins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'installed',
      manifest JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, name)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS migration_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      config JSONB NOT NULL,
      report JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  await syncEntityTables();
}

/**
 * Seed the demo tenant, admin user, and example automation. Idempotent —
 * skips entirely if the demo tenant exists. Password defaults to demo1234;
 * override with DEMO_ADMIN_PASSWORD.
 */
export async function seedDemoTenant(): Promise<boolean> {
  const db = getDb();

  const existing = await db.execute(sql`SELECT id FROM tenants WHERE slug = 'demo' LIMIT 1`);
  if (existing.length > 0) return false;

  const tenantResult = await db.execute(sql`
    INSERT INTO tenants (name, slug) VALUES ('Demo Company', 'demo') RETURNING id
  `);
  const tenantId = (tenantResult[0] as { id: string }).id;

  const passwordHash = hashPassword(process.env.DEMO_ADMIN_PASSWORD ?? "demo1234");
  await db.execute(sql`
    INSERT INTO users (tenant_id, email, name, role, password_hash)
    VALUES (${tenantId}, 'admin@demo.com', 'Demo Admin', 'admin', ${passwordHash})
  `);

  // Demo automation: winning a deal spins up a delivery project automatically
  await db.execute(sql`
    INSERT INTO automation (tenant_id, name, entity, event, conditions, actions, enabled)
    VALUES (
      ${tenantId},
      'Won deal → kickoff project',
      'deal',
      'updated',
      ${JSON.stringify([{ field: "stage", op: "eq", value: "won" }])}::jsonb,
      ${JSON.stringify([
        {
          type: "create_record",
          entity: "project",
          data: { name: "Delivery: {{title}}", status: "planning", description: "Auto-created from won deal {{recordId}}" },
        },
      ])}::jsonb,
      true
    )
  `);

  return true;
}
