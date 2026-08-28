import { describe, expect, it } from "vitest";
import { rankAttention, type AttentionItem } from "./attention.js";

function item(partial: Partial<AttentionItem>): AttentionItem {
  return {
    kind: "invoice_overdue",
    entity: "invoice",
    recordId: "id",
    title: "t",
    detail: "d",
    daysOverdue: 0,
    severity: "info",
    ...partial,
  };
}

describe("rankAttention", () => {
  it("puts severity ahead of lateness", () => {
    // A 60-day-old unpaid invoice outranks a task due yesterday, however urgent
    // the task claims to be.
    const ranked = rankAttention([
      item({ recordId: "task", severity: "info", daysOverdue: 90 }),
      item({ recordId: "invoice", severity: "critical", daysOverdue: 1 }),
    ]);
    expect(ranked.map((i) => i.recordId)).toEqual(["invoice", "task"]);
  });

  it("puts the later item first within a severity", () => {
    const ranked = rankAttention([
      item({ recordId: "b", severity: "warning", daysOverdue: 3 }),
      item({ recordId: "a", severity: "warning", daysOverdue: 30 }),
    ]);
    expect(ranked.map((i) => i.recordId)).toEqual(["a", "b"]);
  });

  it("breaks a tie on money", () => {
    // Of two equally late invoices, chase the larger one.
    const ranked = rankAttention([
      item({ recordId: "small", severity: "warning", daysOverdue: 10, amount: 500 }),
      item({ recordId: "large", severity: "warning", daysOverdue: 10, amount: 50_000 }),
    ]);
    expect(ranked.map((i) => i.recordId)).toEqual(["large", "small"]);
  });

  it("treats an item with no amount as worth nothing in the tiebreak", () => {
    const ranked = rankAttention([
      item({ recordId: "none", severity: "info", daysOverdue: 2 }),
      item({ recordId: "some", severity: "info", daysOverdue: 2, amount: 1 }),
    ]);
    expect(ranked.map((i) => i.recordId)).toEqual(["some", "none"]);
  });

  it("does not mutate the input", () => {
    const items = [
      item({ recordId: "a", severity: "info" }),
      item({ recordId: "b", severity: "critical" }),
    ];
    rankAttention(items);
    expect(items.map((i) => i.recordId)).toEqual(["a", "b"]);
  });

  it("handles an empty queue", () => {
    expect(rankAttention([])).toEqual([]);
  });
});
