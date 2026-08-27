import { beforeAll, describe, expect, it } from "vitest";
import { defineEntity, field, registerEntities } from "@meridian/core";
import { validateCsvMapping } from "./csv-mapping.js";

beforeAll(() => {
  registerEntities([
    defineEntity({
      name: "map_contact",
      label: "Contact",
      fields: {
        firstName: field.string({ required: true }),
        email: field.email(),
      },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    }),
  ]);
});

describe("validateCsvMapping", () => {
  const headers = ["First", "Mail", "Ref"];

  it("accepts a valid mapping", () => {
    expect(
      validateCsvMapping(
        {
          entity: "map_contact",
          mapping: [
            { column: "First", field: "firstName" },
            { column: "Mail", field: "email" },
          ],
          externalIdColumn: "Ref",
        },
        headers,
      ),
    ).toEqual([]);
  });

  it("rejects unknown entities, columns, and fields", () => {
    expect(validateCsvMapping({ entity: "nope", mapping: [] }, headers)[0]).toMatch(/Unknown entity/);
    const errors = validateCsvMapping(
      {
        entity: "map_contact",
        mapping: [{ column: "Ghost", field: "phantom" }],
        externalIdColumn: "AlsoGhost",
      },
      headers,
    );
    expect(errors).toContain('Mapped column "Ghost" is not in the CSV');
    expect(errors).toContain('Mapped field "phantom" does not exist on map_contact');
    expect(errors).toContain('External ID column "AlsoGhost" is not in the CSV');
  });

  it("rejects empty mappings", () => {
    expect(validateCsvMapping({ entity: "map_contact", mapping: [] }, headers)).toContain(
      "No columns were mapped",
    );
  });
});
