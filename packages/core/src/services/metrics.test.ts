import { afterEach, describe, expect, it, vi } from "vitest";
import { collectMetrics } from "./metrics.js";
import { entityService } from "./entity-service.js";
import type { ActorContext } from "../types.js";

const actor: ActorContext = { id: "u", type: "user", tenantId: "t", role: "admin" };

type Row = { group: string | null; count: number; value: number | null };

/**
 * Stub aggregate by what it was asked for: stage breakdown, weighted forecast,
 * or outstanding invoices.
 */
function stubAggregate(options: {
  stages?: Row[];
  forecast?: number;
  outstanding?: number;
}) {
  return vi
    .spyOn(entityService, "aggregate")
    .mockImplementation(async (entity, opts): Promise<Row[]> => {
      if (entity === "invoice") return [{ group: null, count: 0, value: options.outstanding ?? 0 }];
      if (opts.metric === "weighted_sum") {
        return [{ group: null, count: 0, value: options.forecast ?? 0 }];
      }
      return options.stages ?? [];
    });
}

afterEach(() => vi.restoreAllMocks());

describe("collectMetrics", () => {
  it("sums only the open stages into pipeline value", async () => {
    stubAggregate({
      stages: [
        { group: "lead", count: 2, value: 100 },
        { group: "qualified", count: 1, value: 200 },
        { group: "won", count: 3, value: 900 },
        { group: "lost", count: 1, value: 50 },
      ],
    });
    const metrics = await collectMetrics(actor);
    expect(metrics.openCount).toBe(3);
    expect(metrics.openValue).toBe(300);
    expect(metrics.wonValue).toBe(900);
  });

  it("orders the pipeline by stage, not by size", async () => {
    // Sorted by value this reads proposal → lead → qualified, which is not a
    // funnel any more.
    stubAggregate({
      stages: [
        { group: "proposal", count: 1, value: 900 },
        { group: "lead", count: 1, value: 100 },
        { group: "qualified", count: 1, value: 500 },
      ],
    });
    const metrics = await collectMetrics(actor);
    expect(metrics.pipeline.map((p) => p.stage)).toEqual(["lead", "qualified", "proposal"]);
  });

  it("computes a win rate from closed deals only", async () => {
    stubAggregate({
      stages: [
        { group: "lead", count: 10, value: 0 },
        { group: "won", count: 3, value: 0 },
        { group: "lost", count: 1, value: 0 },
      ],
    });
    // 3 of 4 closed — the ten still open are not losses.
    expect((await collectMetrics(actor)).winRate).toBe(0.75);
  });

  it("reports no win rate before anything has closed", async () => {
    // 0% would read as "we lose everything", which is a different claim.
    stubAggregate({ stages: [{ group: "lead", count: 5, value: 0 }] });
    expect((await collectMetrics(actor)).winRate).toBeNull();
  });

  it("passes the weighted forecast through", async () => {
    stubAggregate({ stages: [{ group: "lead", count: 1, value: 1000 }], forecast: 250 });
    const metrics = await collectMetrics(actor);
    expect(metrics.openValue).toBe(1000);
    expect(metrics.weightedForecast).toBe(250);
  });

  it("omits a stage nothing sits in", async () => {
    stubAggregate({ stages: [{ group: "lead", count: 1, value: 1 }] });
    expect((await collectMetrics(actor)).pipeline).toHaveLength(1);
  });

  it("survives a role that cannot read deals", async () => {
    vi.spyOn(entityService, "aggregate").mockImplementation(async () => {
      throw Object.assign(new Error("denied"), { name: "PermissionError" });
    });
    const metrics = await collectMetrics(actor);
    expect(metrics.openValue).toBe(0);
    expect(metrics.winRate).toBeNull();
  });
});
