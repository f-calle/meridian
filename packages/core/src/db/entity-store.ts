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
  ];

  if (entity.externalId) {
    columns.push("external_id TEXT", "source_system TEXT");
  }

  for (const [fieldName, fieldDef] of Object.entries(entity.fields)) {
    const col = toSnakeCase(fieldName);
    switch (fieldDef.type) {
      case "string":
      case "email":
      case "phone":
      case "text":
      case "select":
      case "relation":
        columns.push(`${col} TEXT`);
        break;
      case "number":
        columns.push(`${col} INTEGER`);
        break;
      case "currency":
        columns.push(`${col} NUMERIC(15,2)`);
        break;
      case "boolean":
        columns.push(`${col} BOOLEAN`);
        break;
      case "date":
      case "datetime":
        columns.push(`${col} TIMESTAMPTZ`);
        break;
      case "multiselect":
      case "json":
        columns.push(`${col} JSONB`);
        break;
    }
  }

  const { sql } = await import("drizzle-orm");

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      ${columns.join(",\n      ")}
    )
  `));

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
