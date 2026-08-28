import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  foreignKey,
  index,
  integer,
  unique,
} from "drizzle-orm/pg-core";

/**
 * System tables — the ones that exist independently of any entity definition.
 * Entity tables are generated into ./entity-schema.generated.ts.
 *
 * Constraint and index names here are pinned to the names the live databases
 * already carry, so migration 0000 adopts an existing deployment as a no-op
 * instead of trying to create a second copy of every uniqueness rule under a
 * drizzle-flavoured name.
 */

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique("tenants_slug_key"),
  /**
   * White-labelling: logo and accent colour.
   *
   * jsonb rather than columns because the next three branding knobs then cost
   * no migration, matching how agent_keys.permissions and plugins.manifest are
   * already shaped. Deliberately NOT added to the login query, which runs
   * before the password check — every failed attempt would detoast the logo.
   */
  branding: jsonb("branding").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /**
     * No default. It used to default to "admin", so any insert that forgot to
     * set a role — a script, a fix-up, a future signup path — silently created
     * an administrator. Callers must now say what they mean, and the check
     * constraint below rejects anything that is not a real role.
     */
    role: text("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    /**
     * Bumped whenever every existing session for this user should stop working
     * — a password change, a role change, an admin revoking access. Tokens
     * carry the version they were signed with; a token whose version is behind
     * is rejected. Tokens predating this column carry no version and read as 0,
     * which is the default, so existing sessions survive the migration.
     */
    tokenVersion: integer("token_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "users_tenant_id_fkey",
    }),
    unique("users_tenant_id_email_key").on(table.tenantId, table.email),
    index("users_tenant_idx").on(table.tenantId),
    check("users_role_check", sql`${table.role} IN ('owner','admin','finance','sales','member','viewer','agent')`),
  ],
);

export const agentKeys = pgTable(
  "agent_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    role: text("role").notNull().default("agent"),
    permissions: jsonb("permissions").$type<Record<string, unknown>>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "agent_keys_tenant_id_fkey",
    }),
    index("agent_keys_tenant_idx").on(table.tenantId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    entityName: text("entity_name").notNull(),
    recordId: uuid("record_id").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    actorType: text("actor_type").notNull(),
    diff: jsonb("diff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_tenant_idx").on(table.tenantId),
    index("audit_log_entity_idx").on(table.entityName, table.recordId),
  ],
);

export const plugins = pgTable(
  "plugins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    state: text("state").notNull().default("installed"),
    manifest: jsonb("manifest").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "plugins_tenant_id_fkey",
    }),
    unique("plugins_tenant_id_name_key").on(table.tenantId, table.name),
  ],
);

export const migrationJobs = pgTable(
  "migration_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    source: text("source").notNull(),
    status: text("status").notNull().default("pending"),
    config: jsonb("config").notNull(),
    report: jsonb("report"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("migration_jobs_tenant_idx").on(table.tenantId)],
);

// Entity tables are declared in ./entity-schema.generated.ts, which
// drizzle.config.ts loads alongside this file. They are deliberately not
// re-exported from here: drizzle-kit resolves schema modules as CJS and
// chokes on the ESM ".js" specifier a re-export would need.
export const entityTables: Record<string, unknown> = {};

export function registerEntityTable(entityName: string): void {
  entityTables[entityName] = entityName;
}
