import { describe, expect, it } from "vitest";
import { expectedColumns } from "./entity-store.js";
import { defineEntity, field } from "../entity/define-entity.js";

describe("expectedColumns", () => {
  it("includes external identity columns when the entity opts in", () => {
    // Regression: adding externalId to an already-shipped entity produced no
    // column (CREATE TABLE IF NOT EXISTS is a no-op on an existing table), so
    // the unique index over it failed and the API crashed at boot.
    const withExternal = defineEntity({
      name: "drift_probe",
      label: "Probe",
      externalId: true,
      fields: { body: field.text() },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    });
    const names = expectedColumns(withExternal).map((c) => c.name);
    expect(names).toContain("external_id");
    expect(names).toContain("source_system");
    expect(names).toContain("body");
  });

  it("omits external identity columns when the entity does not opt in", () => {
    const plain = defineEntity({
      name: "drift_plain",
      label: "Plain",
      fields: { name: field.string() },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    });
    expect(expectedColumns(plain).map((c) => c.name)).toEqual(["name"]);
  });

  it("maps field types to their SQL types", () => {
    const typed = defineEntity({
      name: "drift_types",
      label: "Types",
      fields: {
        amount: field.currency(),
        qty: field.number(),
        when: field.datetime(),
        flag: field.boolean(),
        blob: field.json(),
      },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    });
    const byName = Object.fromEntries(expectedColumns(typed).map((c) => [c.name, c.type]));
    expect(byName).toEqual({
      amount: "NUMERIC(15,2)",
      qty: "INTEGER",
      when: "TIMESTAMPTZ",
      flag: "BOOLEAN",
      blob: "JSONB",
    });
  });
});
