import { entityRegistry } from "../entity/registry.js";
import { registerEntityTable } from "./schema.js";
import { getDb } from "./client.js";

const ensured = new Set<string>();

export function ensureEntityTables(): void {
  for (const entity of entityRegistry.list()) {
    if (!ensured.has(entity.name)) {
      registerEntityTable(entity.name);
      ensured.add(entity.name);
    }
  }
}

export function getEntityTable(entityName: string): string {
  ensureEntityTables();
  if (!entityRegistry.get(entityName)) {
    throw new Error(`No table registered for entity: ${entityName}`);
  }
  return entityName;
}

export async function syncEntityTables(): Promise<void> {
  ensureEntityTables();
  const db = getDb();

  for (const entity of entityRegistry.list()) {
    await createTableIfNotExists(db, entity.name, entity);
  }
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** SQL type for a field, or null for types with no column representation. */
export function sqlTypeFor(type: import("../types.js").FieldType): string | null {
  switch (type) {
    case "string":
    case "email":
    case "phone":
    case "text":
    case "select":
    case "relation":
      return "TEXT";
    case "number":
      return "INTEGER";
    case "currency":
      return "NUMERIC(15,2)";
    case "boolean":
      return "BOOLEAN";
    case "date":
    case "datetime":
      return "TIMESTAMPTZ";
    case "multiselect":
    case "json":
      return "JSONB";
    default:
      return null;
  }
}

/** Every column an entity expects, as `name TYPE` pairs. */
export function expectedColumns(
  entity: import("../types.js").EntityDefinition,
): { name: string; type: string }[] {
  const columns: { name: string; type: string }[] = [];
  if (entity.externalId) {
    columns.push({ name: "external_id", type: "TEXT" }, { name: "source_system", type: "TEXT" });
  }
  for (const [fieldName, fieldDef] of Object.entries(entity.fields)) {
    const type = sqlTypeFor(fieldDef.type);
    if (type) columns.push({ name: toSnakeCase(fieldName), type });
  }
  return columns;
}

async function createTableIfNotExists(
  db: ReturnType<typeof getDb>,
  tableName: string,
  entity: import("../types.js").EntityDefinition,
): Promise<void> {
  const columns: string[] = [
    "id UUID PRIMARY KEY DEFAULT gen_random_uuid()",
    "tenant_id UUID NOT NULL",
    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    ...expectedColumns(entity).map((c) => `${c.name} ${c.type}`),
  ];

  const { sql } = await import("drizzle-orm");

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      ${columns.join(",\n      ")}
    )
  `));

  // CREATE TABLE IF NOT EXISTS does nothing for a table that already exists,
  // so adding a field to a shipped entity would otherwise never get a column
  // (and any index over it would fail at boot). Reconcile every run.
  for (const column of expectedColumns(entity)) {
    await db.execute(
      sql.raw(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}`),
    );
  }

  await db.execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS ${tableName}_tenant_idx ON ${tableName}(tenant_id)
  `));

  if (entity.externalId) {
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${tableName}_external_idx
      ON ${tableName}(tenant_id, external_id, source_system)
      WHERE external_id IS NOT NULL
    `));
  }
}
