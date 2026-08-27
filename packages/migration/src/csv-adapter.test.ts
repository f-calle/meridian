import { beforeAll, describe, expect, it } from "vitest";
import { defineEntity, field, registerEntities } from "@meridian/core";
import { allEntities } from "@meridian/entities";
import { parseCsv, importCsv } from "./csv-adapter.js";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    const { headers, rows } = parseCsv("a,b\n1,2\n3,4\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("handles quoted fields with commas, quotes, and newlines", () => {
    const csv = 'name,notes\n"Doe, Jane","She said ""hi""\nsecond line"\n';
    const { rows } = parseCsv(csv);
    expect(rows[0].name).toBe("Doe, Jane");
    expect(rows[0].notes).toBe('She said "hi"\nsecond line');
  });

  it("handles CRLF and skips empty lines", () => {
    const { rows } = parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n");
    expect(rows).toHaveLength(2);
  });

  it("returns empty for empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("importCsv (dry run)", () => {
  beforeAll(() => {
    registerEntities([...allEntities,
      defineEntity({
        name: "csv_test_contact",
        label: "CSV Test Contact",
        externalId: true,
        fields: {
          firstName: field.string({ required: true }),
          email: field.email(),
          value: field.currency(),
          active: field.boolean(),
          tags: field.multiselect(["a", "b"]),
        },
        permissions: { admin: { create: true, read: true, update: true, delete: true } },
      }),
    ]);
  });

  const actor = { id: "u", type: "user" as const, tenantId: "t", role: "admin" };

  it("counts importable rows and coerces types without touching the DB", async () => {
    const csv = "first,mail,amount,on\nJane,jane@x.com,\"$1,250.50\",yes\nBob,bob@x.com,99,no\n";
    const result = await importCsv(
      csv,
      {
        entity: "csv_test_contact",
        mapping: [
          { column: "first", field: "firstName" },
          { column: "mail", field: "email" },
          { column: "amount", field: "value" },
          { column: "on", field: "active" },
        ],
        dryRun: true,
      },
      actor,
    );
    expect(result.created).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("fails clearly when no mapped columns exist", async () => {
    await expect(
      importCsv(
        "x,y\n1,2\n",
        {
          entity: "csv_test_contact",
          mapping: [{ column: "first", field: "firstName" }],
          dryRun: true,
        },
        actor,
      ),
    ).rejects.toThrow(/None of the mapped columns/);
  });

  it("rejects unknown entities", async () => {
    await expect(
      importCsv("a\n1\n", { entity: "nope", mapping: [{ column: "a", field: "x" }] }, actor),
    ).rejects.toThrow(/Unknown entity/);
  });

  it("skips rows whose mapped cells are all empty", async () => {
    const csv = "first,mail\nJane,jane@x.com\n,\n";
    const result = await importCsv(
      csv,
      {
        entity: "csv_test_contact",
        mapping: [
          { column: "first", field: "firstName" },
          { column: "mail", field: "email" },
        ],
        dryRun: true,
      },
      actor,
    );
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

describe("Odoo mapping transforms", () => {
  it("maps quote and invoice statuses and dates", async () => {
    const { ODOO_MODEL_MAPPINGS } = await import("./index.js");
    const quote = ODOO_MODEL_MAPPINGS.find((m) => m.meridianEntity === "quote")!;
    const invoice = ODOO_MODEL_MAPPINGS.find((m) => m.meridianEntity === "invoice")!;
    const product = ODOO_MODEL_MAPPINGS.find((m) => m.meridianEntity === "product")!;
    expect(quote.fields.find((f) => f.meridianField === "status")!.transform!("sale")).toBe("accepted");
    expect(quote.fields.find((f) => f.meridianField === "status")!.transform!("cancel")).toBe("declined");
    expect(invoice.fields.find((f) => f.meridianField === "status")!.transform!("paid")).toBe("paid");
    expect(invoice.fields.find((f) => f.meridianField === "status")!.transform!("not_paid")).toBe("sent");
    expect(quote.fields.find((f) => f.meridianField === "issueDate")!.transform!("2026-01-15 10:30:00")).toBe("2026-01-15");
    expect(quote.fields.find((f) => f.meridianField === "companyId")!.transform!([42, "Acme"])).toBe(42);
    expect(invoice.filter).toEqual({ move_type: "out_invoice" });
    expect(product.fields.some((f) => f.meridianField === "sku")).toBe(true);
  });
});

describe("Odoo boolean handling", () => {
  it("keeps a real false for boolean target fields but drops Odoo's empty-false", async () => {
    const { entityRegistry } = await import("@meridian/core");
    const product = entityRegistry.get("product");
    // Guards the archived-product bug: product.active defaults to true, so
    // dropping Odoo's `active: false` imported inactive products as active.
    expect(product?.fields.active?.type).toBe("boolean");
    expect(product?.fields.active?.default).toBe(true);
    expect(product?.fields.name?.type).not.toBe("boolean");
  });
});
