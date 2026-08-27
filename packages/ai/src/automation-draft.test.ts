import { beforeAll, describe, expect, it } from "vitest";
import { defineEntity, field, registerEntities } from "@meridian/core";
import { validateDraft, summarizeDraft } from "./automation-draft.js";

beforeAll(() => {
  registerEntities([
    defineEntity({
      name: "draft_deal",
      label: "Deal",
      fields: {
        title: field.string({ required: true }),
        value: field.currency(),
        stage: field.select(["lead", "won", "lost"]),
      },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    }),
    defineEntity({
      name: "draft_task",
      label: "Task",
      fields: { title: field.string({ required: true }) },
      permissions: { admin: { create: true, read: true, update: true, delete: true } },
    }),
  ]);
});

describe("validateDraft", () => {
  it("accepts a well-formed rule", () => {
    expect(
      validateDraft({
        name: "Big win",
        entity: "draft_deal",
        event: "updated",
        conditions: [{ field: "stage", op: "eq", value: "won" }],
        actions: [{ type: "create_record", entity: "draft_task", data: { title: "Review {{title}}" } }],
      }),
    ).toEqual([]);
  });

  it("rejects unknown entities, fields, and empty actions", () => {
    expect(validateDraft({ name: "x", entity: "nope", event: "created", conditions: [], actions: [] })[0]).toMatch(/Unknown entity/);
    expect(
      validateDraft({
        name: "x",
        entity: "draft_deal",
        event: "created",
        conditions: [{ field: "ghost", op: "eq", value: 1 }],
        actions: [{ type: "set_field", field: "ghost2", value: 1 }],
      }),
    ).toEqual([
      'Condition references unknown field "ghost" on draft_deal',
      'set_field targets unknown field "ghost2" on draft_deal',
    ]);
    expect(
      validateDraft({ name: "x", entity: "draft_deal", event: "created", conditions: [], actions: [] }),
    ).toContain("Rule has no actions");
  });

  it("requires values for comparison ops and validates create_record fields", () => {
    const errors = validateDraft({
      name: "x",
      entity: "draft_deal",
      event: "updated",
      conditions: [{ field: "value", op: "gt" }],
      actions: [{ type: "create_record", entity: "draft_task", data: { bogus: "y" } }],
    });
    expect(errors.some((e) => e.includes("needs a value"))).toBe(true);
    expect(errors.some((e) => e.includes('unknown field "bogus"'))).toBe(true);
  });
});

describe("summarizeDraft", () => {
  it("restates the rule in English", () => {
    const summary = summarizeDraft({
      name: "Big win",
      entity: "draft_deal",
      event: "updated",
      conditions: [{ field: "stage", op: "eq", value: "won" }],
      actions: [{ type: "create_record", entity: "draft_task", data: { title: "t" } }],
    });
    expect(summary).toBe('When a draft_deal is updated when stage eq "won": create a draft_task.');
  });
});
