import { describe, expect, it } from "vitest";
import { drizzleColumnFor, renderEntitySchema, tableConstName } from "./schema-codegen.js";
import { sqlTypeFor } from "./entity-store.js";
import { defineEntity, field } from "../entity/define-entity.js";
import type { FieldType } from "../types.js";

const ALL_FIELD_TYPES: FieldType[] = [
  "string",
  "text",
  "email",
  "phone",
  "number",
  "currency",
  "boolean",
  "date",
  "datetime",
  "select",
  "multiselect",
  "relation",
  "json",
];

/** Postgres type each drizzle builder resolves to, for the lockstep check. */
const BUILDER_TO_SQL: Record<string, string> = {
  text: "TEXT",
  integer: "INTEGER",
  numeric: "NUMERIC(15,2)",
  boolean: "BOOLEAN",
  timestamp: "TIMESTAMPTZ",
  jsonb: "JSONB",
};

describe("schema codegen", () => {
  it("agrees with sqlTypeFor for every field type", () => {
    // The generated drizzle schema decides what migrations create; sqlTypeFor
    // decides what the boot-time drift check expects to find. If the two ever
    // disagree, every boot fails on a column that was created correctly.
    for (const type of ALL_FIELD_TYPES) {
      const builder = drizzleColumnFor(type, "probe");
      const expected = sqlTypeFor(type);
      expect(builder, `no drizzle column for ${type}`).not.toBeNull();
      const fn = builder!.slice(0, builder!.indexOf("("));
      expect(BUILDER_TO_SQL[fn], `unmapped builder ${fn} for ${type}`).toBe(expected);
    }
  });

  it("names table constants so entity names can never shadow an import", () => {
    expect(tableConstName("company")).toBe("companyTable");
    expect(tableConstName("time_entry")).toBe("timeEntryTable");
    expect(tableConstName("index")).toBe("indexTable");
  });

  it("emits external identity columns and a partial unique index when opted in", () => {
    const entity = defineEntity({
      name: "codegen_external",
      label: "External",
      externalId: true,
      fields: { body: field.text() },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    });
    const out = renderEntitySchema([entity]);
    expect(out).toContain('externalId: text("external_id")');
    expect(out).toContain('sourceSystem: text("source_system")');
    expect(out).toContain('uniqueIndex("codegen_external_external_idx")');
    expect(out).toContain("external_id IS NOT NULL");
  });

  it("leaves external identity out when the entity does not opt in", () => {
    const entity = defineEntity({
      name: "codegen_plain",
      label: "Plain",
      fields: { name: field.string() },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    });
    const out = renderEntitySchema([entity]);
    expect(out).not.toContain("external_id");
    expect(out).toContain('index("codegen_plain_tenant_idx")');
  });

  it("converts camelCase fields to snake_case columns", () => {
    const entity = defineEntity({
      name: "codegen_naming",
      label: "Naming",
      fields: { expectedCloseDate: field.date(), amountDue: field.currency() },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    });
    const out = renderEntitySchema([entity]);
    expect(out).toContain('expectedCloseDate: timestamp("expected_close_date", { withTimezone: true })');
    expect(out).toContain('amountDue: numeric("amount_due", { precision: 15, scale: 2 })');
  });

  it("is a stable function of the registry, not of registration order", () => {
    const a = defineEntity({
      name: "codegen_a",
      label: "A",
      fields: { name: field.string() },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    });
    const b = defineEntity({
      name: "codegen_b",
      label: "B",
      fields: { name: field.string() },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    });
    expect(renderEntitySchema([a, b])).toBe(renderEntitySchema([b, a]));
  });
});
