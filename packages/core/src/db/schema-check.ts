import { entityRegistry } from "../entity/registry.js";
import { expectedColumns } from "./entity-store.js";
import { getSql } from "./raw-sql.js";

/**
 * Boot-time check that the database actually matches the entity registry.
 *
 * Adding `externalId: true` to a shipped entity once took production down: the
 * column was never created, and the first query against it 500'd with
 * `column "external_id" does not exist` — a message that says nothing about the
 * cause. Migrations prevent that, but only if they were actually generated and
 * shipped. This is the backstop for when they weren't: it fails at startup, with
 * the missing column named and the fix spelled out, instead of at the first
 * request that happens to touch the new field.
 */

export interface SchemaDrift {
  missingTables: string[];
  missingColumns: { table: string; column: string; type: string }[];
  wrongTypes: { table: string; column: string; expected: string; actual: string }[];
}

/** information_schema.data_type for each SQL type expectedColumns emits. */
const INFORMATION_SCHEMA_TYPE: Record<string, string> = {
  TEXT: "text",
  INTEGER: "integer",
  "NUMERIC(15,2)": "numeric",
  BOOLEAN: "boolean",
  TIMESTAMPTZ: "timestamp with time zone",
  JSONB: "jsonb",
};

export function isDriftFree(drift: SchemaDrift): boolean {
  return (
    drift.missingTables.length === 0 &&
    drift.missingColumns.length === 0 &&
    drift.wrongTypes.length === 0
  );
}

/** Compare every registered entity against the live schema. */
export async function describeSchemaDrift(): Promise<SchemaDrift> {
  const sql = getSql();
  const rows = await sql<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;

  const live = new Map<string, Map<string, string>>();
  for (const row of rows) {
    let columns = live.get(row.table_name);
    if (!columns) {
      columns = new Map();
      live.set(row.table_name, columns);
    }
    columns.set(row.column_name, row.data_type);
  }

  const drift: SchemaDrift = { missingTables: [], missingColumns: [], wrongTypes: [] };

  for (const entity of entityRegistry.list()) {
    const columns = live.get(entity.name);
    if (!columns) {
      drift.missingTables.push(entity.name);
      continue;
    }
    for (const expected of expectedColumns(entity)) {
      const actual = columns.get(expected.name);
      if (actual === undefined) {
        drift.missingColumns.push({ table: entity.name, column: expected.name, type: expected.type });
        continue;
      }
      const wanted = INFORMATION_SCHEMA_TYPE[expected.type];
      // An unmapped SQL type is a gap in this table, not a drift finding —
      // don't fail a boot over a type we simply don't know how to compare.
      if (wanted && actual !== wanted) {
        drift.wrongTypes.push({ table: entity.name, column: expected.name, expected: wanted, actual });
      }
    }
  }

  return drift;
}

/** Human-readable drift report, or null when the schema is in step. */
export function formatSchemaDrift(drift: SchemaDrift): string | null {
  if (isDriftFree(drift)) return null;
  const lines: string[] = ["The database does not match the entity definitions."];

  if (drift.missingTables.length > 0) {
    lines.push("", "Missing tables:");
    for (const table of drift.missingTables) lines.push(`  - ${table}`);
  }
  if (drift.missingColumns.length > 0) {
    lines.push("", "Missing columns:");
    for (const c of drift.missingColumns) lines.push(`  - ${c.table}.${c.column} (${c.type})`);
  }
  if (drift.wrongTypes.length > 0) {
    lines.push("", "Wrong column types:");
    for (const c of drift.wrongTypes) {
      lines.push(`  - ${c.table}.${c.column} is ${c.actual}, expected ${c.expected}`);
    }
  }

  lines.push(
    "",
    "An entity definition changed without a migration to match. Run:",
    "  pnpm db:generate",
    "and commit the generated schema plus the new migration under packages/core/drizzle/.",
  );
  return lines.join("\n");
}

/** Throw a readable error if the live schema has drifted from the registry. */
export async function assertSchemaMatchesRegistry(): Promise<void> {
  const report = formatSchemaDrift(await describeSchemaDrift());
  if (report) throw new Error(report);
}
