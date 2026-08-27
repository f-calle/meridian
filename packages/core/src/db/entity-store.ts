/**
 * Entity tables are created by versioned migrations (packages/core/drizzle),
 * not at runtime. What is left here is the naming and column-shape knowledge
 * two other places need: the drizzle schema codegen, and the boot-time drift
 * check that compares the live database against the registry.
 */
import { entityRegistry } from "../entity/registry.js";
import { registerEntityTable } from "./schema.js";
import { toColumnName } from "./naming.js";

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
    if (type) columns.push({ name: toColumnName(fieldName), type });
  }
  return columns;
}
