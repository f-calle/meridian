import { describe, expect, it } from "vitest";
import { evaluateConditions, interpolate, ruleMatches } from "./engine.js";
import type { AutomationRule } from "./engine.js";
import type { HookContext } from "../types.js";

describe("evaluateConditions", () => {
  const data = { stage: "won", value: 5000, notes: "Big Deal", empty: "" };

  it("matches eq / neq", () => {
    expect(evaluateConditions([{ field: "stage", op: "eq", value: "won" }], data)).toBe(true);
    expect(evaluateConditions([{ field: "stage", op: "eq", value: "lost" }], data)).toBe(false);
    expect(evaluateConditions([{ field: "stage", op: "neq", value: "lost" }], data)).toBe(true);
  });

  it("eq compares loosely across types (numbers from JSON)", () => {
    expect(evaluateConditions([{ field: "value", op: "eq", value: "5000" }], data)).toBe(true);
  });

  it("matches numeric comparisons", () => {
    expect(evaluateConditions([{ field: "value", op: "gt", value: 1000 }], data)).toBe(true);
    expect(evaluateConditions([{ field: "value", op: "lte", value: 4999 }], data)).toBe(false);
  });

  it("matches contains case-insensitively", () => {
    expect(evaluateConditions([{ field: "notes", op: "contains", value: "big" }], data)).toBe(true);
  });

  it("matches is_set / not_set", () => {
    expect(evaluateConditions([{ field: "stage", op: "is_set" }], data)).toBe(true);
    expect(evaluateConditions([{ field: "empty", op: "is_set" }], data)).toBe(false);
    expect(evaluateConditions([{ field: "missing", op: "not_set" }], data)).toBe(true);
  });

  it("requires all conditions to hold", () => {
    expect(
      evaluateConditions(
        [
          { field: "stage", op: "eq", value: "won" },
          { field: "value", op: "gt", value: 999999 },
        ],
        data,
      ),
    ).toBe(false);
  });

  it("matches everything when there are no conditions", () => {
    expect(evaluateConditions([], data)).toBe(true);
  });
});

describe("ruleMatches", () => {
  const rule: AutomationRule = {
    id: "r1",
    name: "won deal",
    entity: "deal",
    event: "updated",
    conditions: [{ field: "stage", op: "eq", value: "won" }],
    actions: [],
  };
  const fullRecord = { title: "Acme", stage: "won", value: 100 };

  it("fires when the condition field changed to a matching value", () => {
    expect(
      ruleMatches(rule, "updated", { entityName: "deal", data: fullRecord, changes: { stage: "won" } }),
    ).toBe(true);
  });

  it("does not re-fire when an unrelated field changes on an already-won deal", () => {
    expect(
      ruleMatches(rule, "updated", { entityName: "deal", data: fullRecord, changes: { value: 200 } }),
    ).toBe(false);
  });

  it("ignores other entities and events", () => {
    expect(ruleMatches(rule, "created", { entityName: "deal", data: fullRecord })).toBe(false);
    expect(
      ruleMatches(rule, "updated", { entityName: "task", data: fullRecord, changes: { stage: "won" } }),
    ).toBe(false);
  });

  it("fires unconditional rules on any update", () => {
    const anyUpdate = { ...rule, conditions: [] };
    expect(
      ruleMatches(anyUpdate, "updated", { entityName: "deal", data: fullRecord, changes: { value: 1 } }),
    ).toBe(true);
  });
});

describe("interpolate", () => {
  const ctx: HookContext = {
    entityName: "deal",
    recordId: "rec-1",
    data: { title: "Acme deal", value: 5000 },
    actor: { id: "u1", type: "user", tenantId: "t1", role: "admin" },
    tenantId: "t1",
  };

  it("replaces field placeholders in strings", () => {
    expect(interpolate("Delivery: {{title}}", ctx)).toBe("Delivery: Acme deal");
  });

  it("exposes recordId and entity", () => {
    expect(interpolate("{{entity}}/{{recordId}}", ctx)).toBe("deal/rec-1");
  });

  it("recurses into objects and arrays", () => {
    expect(
      interpolate({ name: "P: {{title}}", tags: ["{{value}}"] }, ctx),
    ).toEqual({ name: "P: Acme deal", tags: ["5000"] });
  });

  it("leaves non-strings untouched and blanks unknown fields", () => {
    expect(interpolate(42, ctx)).toBe(42);
    expect(interpolate("{{missing}}", ctx)).toBe("");
  });
});
