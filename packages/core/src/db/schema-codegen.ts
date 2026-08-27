import type { EntityDefinition, FieldType } from "../types.js";
import { toColumnName } from "./naming.js";

/**
 * Entity tables are declared by `defineEntity`, not hand-written in a schema
 * file — so drizzle-kit has nothing to diff. This renders the registry into a
 * real drizzle schema module, which becomes the input to `drizzle-kit
 * generate`. The generated file is committed, so a schema change shows up as a
 * reviewable diff plus a versioned migration rather than surprise DDL at boot.
 *
 * Keep the column types here in lockstep with `sqlTypeFor` in entity-store.ts —
 * `schema-codegen.test.ts` fails if they drift apart.
 */

/** Drizzle column builder for a field type, or null if the type has no column. */
export function drizzleColumnFor(type: FieldType, column: string): string | null {
  const name = JSON.stringify(column);
  switch (type) {
    case "string":
    case "text":
    case "email":
    case "phone":
    case "select":
    case "relation":
      return `text(${name})`;
    case "number":
      return `integer(${name})`;
    case "currency":
      return `numeric(${name}, { precision: 15, scale: 2 })`;
    case "boolean":
      return `boolean(${name})`;
    case "date":
    case "datetime":
      return `timestamp(${name}, { withTimezone: true })`;
    case "multiselect":
    case "json":
      return `jsonb(${name})`;
    default:
      return null;
  }
}

/** `company` -> `companyTable`, so entity names can never shadow an import. */
export function tableConstName(entityName: string): string {
  const camel = entityName.replace(/[_-](\w)/g, (_, c: string) => c.toUpperCase());
  return `${camel}Table`;
}

function renderEntity(entity: EntityDefinition): string {
  const columns: string[] = [
    `  id: uuid("id").primaryKey().defaultRandom(),`,
    `  tenantId: uuid("tenant_id").notNull(),`,
    `  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),`,
    `  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),`,
  ];

  if (entity.externalId) {
    columns.push(`  externalId: text("external_id"),`, `  sourceSystem: text("source_system"),`);
  }

  // Entity fields are nullable at the database level even when `required` —
  // requiredness is enforced by zod on the way in, and adding a field to an
  // entity that already has rows must not need a backfill to deploy.
  for (const [fieldName, fieldDef] of Object.entries(entity.fields)) {
    const builder = drizzleColumnFor(fieldDef.type, toColumnName(fieldName));
    if (builder) columns.push(`  ${fieldName}: ${builder},`);
  }

  const indexes = [`    index("${entity.name}_tenant_idx").on(t.tenantId),`];
  if (entity.externalId) {
    indexes.push(
      `    uniqueIndex("${entity.name}_external_idx")`,
      `      .on(t.tenantId, t.externalId, t.sourceSystem)`,
      `      .where(sql\`external_id IS NOT NULL\`),`,
    );
  }

  return [
    `export const ${tableConstName(entity.name)} = pgTable(`,
    `  ${JSON.stringify(entity.name)},`,
    `  {`,
    ...columns.map((line) => `  ${line}`),
    `  },`,
    `  (t) => [`,
    ...indexes,
    `  ],`,
    `);`,
  ].join("\n");
}

/** Render the whole registry as a standalone drizzle schema module. */
export function renderEntitySchema(entities: EntityDefinition[]): string {
  const header = [
    `// GENERATED FILE — do not edit by hand.`,
    `// Produced from the entity registry by \`pnpm db:generate\`.`,
    `// Changing an entity? Run \`pnpm db:generate\` and commit both this file and`,
    `// the migration it produces under packages/core/drizzle/.`,
    ``,
    `import { sql } from "drizzle-orm";`,
    `import {`,
    `  boolean,`,
    `  index,`,
    `  integer,`,
    `  jsonb,`,
    `  numeric,`,
    `  pgTable,`,
    `  text,`,
    `  timestamp,`,
    `  uniqueIndex,`,
    `  uuid,`,
    `} from "drizzle-orm/pg-core";`,
  ].join("\n");

  // Sorted so the file is a stable function of the registry — registration
  // order must never show up as a spurious diff.
  const tables = [...entities]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(renderEntity)
    .join("\n\n");

  return `${header}\n\n${tables}\n`;
}
