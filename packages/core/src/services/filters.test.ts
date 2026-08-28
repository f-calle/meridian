import { describe, expect, it } from "vitest";
import { compileFilters, parseFilterParams } from "./filters.js";
import { defineEntity, field } from "../entity/define-entity.js";
import type { EntityDefinition } from "../types.js";

const invoice = defineEntity({
  name: "filter_invoice",
  label: "Invoice",
  externalId: true,
  fields: {
    number: field.string(),
    status: field.select(["draft", "sent", "paid", "cancelled"]),
    dueDate: field.date(),
    total: field.currency(),
  },
  permissions: { admin: { create: true, read: true, update: true, delete: true } },
});

/** The same whitelist entity-service uses: registry fields plus system columns. */
const SYSTEM = new Set(["id", "created_at", "updated_at", "external_id", "source_system"]);
function resolveColumn(entity: EntityDefinition, name: string): string | null {
  const snake = name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  if (entity.fields[name]) return snake;
  return SYSTEM.has(snake) ? snake : null;
}

const compile = (filters: Record<string, unknown>, start = 1) =>
  compileFilters(invoice, filters, resolveColumn, start);

describe("compileFilters", () => {
  it("treats a bare value as equality", () => {
    const { clause, params } = compile({ status: "paid" });
    expect(clause).toBe(" AND status = $2");
    expect(params).toEqual(["paid"]);
  });

  it("leaves a colon-bearing value alone", () => {
    // externalId values look like `quote:<uuid>`. Parsing an operator out of the
    // value would break the quote-to-invoice link.
    const { clause, params } = compile({ externalId: "quote:2f1c-44" });
    expect(clause).toBe(" AND external_id = $2");
    expect(params).toEqual(["quote:2f1c-44"]);
  });

  it("compiles comparisons", () => {
    const { clause, params } = compile({ dueDate: { op: "lt", value: "2026-08-28" } });
    expect(clause).toBe(" AND due_date < $2");
    expect(params).toEqual(["2026-08-28"]);
  });

  it("numbers placeholders from where the caller left off", () => {
    const { clause, params } = compile({ status: "paid", dueDate: { op: "gte", value: "x" } }, 3);
    expect(clause).toBe(" AND status = $4 AND due_date >= $5");
    expect(params).toEqual(["paid", "x"]);
  });

  it("keeps NULLs on the right side of a not-equals", () => {
    // `status <> 'paid'` drops rows where status is null — which is exactly the
    // unsent invoice the caller was looking for.
    const { clause } = compile({ status: { op: "ne", value: "paid" } });
    expect(clause).toBe(" AND (status IS NULL OR status <> $2)");
  });

  it("handles in and not-in", () => {
    expect(compile({ status: { op: "in", value: ["draft", "sent"] } }).clause).toBe(
      " AND status IN ($2, $3)",
    );
    expect(compile({ status: { op: "nin", value: ["paid", "cancelled"] } }).params).toEqual([
      "paid",
      "cancelled",
    ]);
  });

  it("does not emit IN () for an empty set", () => {
    // `IN ()` is a syntax error, not an empty result.
    expect(compile({ status: { op: "in", value: [] } }).clause).toBe(" AND FALSE");
    expect(compile({ status: { op: "nin", value: [] } }).clause).toBe(" AND TRUE");
  });

  it("handles null checks with no placeholder", () => {
    expect(compile({ dueDate: null }).clause).toBe(" AND due_date IS NULL");
    expect(compile({ dueDate: { op: "notnull" } }).clause).toBe(" AND due_date IS NOT NULL");
    expect(compile({ dueDate: { op: "notnull" } }).params).toEqual([]);
  });

  it("wraps a contains in wildcards", () => {
    expect(compile({ number: { op: "contains", value: "INV-2" } }).params).toEqual(["%INV-2%"]);
  });

  it("skips undefined so callers can pass optional filters straight through", () => {
    expect(compile({ status: undefined }).clause).toBe("");
  });

  it("refuses a field that is not on the entity", () => {
    expect(() => compile({ password: "x" })).toThrow(/Unknown filter field/);
  });

  it("emits nothing for no filters", () => {
    expect(compile({})).toEqual({ clause: "", params: [] });
  });
});

describe("parseFilterParams", () => {
  it("reads a plain filter as equality", () => {
    expect(parseFilterParams({ "filter.status": "paid" })).toEqual({ status: "paid" });
  });

  it("reads the operator from the key, not the value", () => {
    expect(parseFilterParams({ "filter.dueDate.lt": "2026-08-28" })).toEqual({
      dueDate: { op: "lt", value: "2026-08-28" },
    });
    // The value keeps its colon.
    expect(parseFilterParams({ "filter.externalId": "quote:2f1c" })).toEqual({
      externalId: "quote:2f1c",
    });
  });

  it("splits comma-separated values for in and not-in", () => {
    expect(parseFilterParams({ "filter.status.nin": "paid,cancelled" })).toEqual({
      status: { op: "nin", value: ["paid", "cancelled"] },
    });
  });

  it("ignores params that are not filters", () => {
    expect(parseFilterParams({ page: "2", search: "acme" })).toEqual({});
  });

  it("rejects an operator it does not know", () => {
    expect(() => parseFilterParams({ "filter.total.drop": "1" })).toThrow(/Unknown filter operator/);
  });
});
