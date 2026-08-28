import { describe, expect, it } from "vitest";
import { DealEntity } from "./index.js";

const derive = DealEntity.derive!;
const today = new Date().toISOString().slice(0, 10);

describe("deal.closedAt", () => {
  it("stamps when a deal is won", () => {
    expect(derive({ stage: "won" }, { stage: "proposal" })).toEqual({ closedAt: today });
  });

  it("stamps when a deal is lost — a loss is a close too", () => {
    expect(derive({ stage: "lost" }, { stage: "qualified" })).toEqual({ closedAt: today });
  });

  it("stamps a deal created straight into a closed stage", () => {
    // Imports land here: an Odoo migration brings closed deals in as closed.
    expect(derive({ stage: "won" }, undefined)).toEqual({ closedAt: today });
  });

  it("does not re-stamp a deal that is already closed", () => {
    // Otherwise fixing a typo on a deal won last March moves it to today, and
    // every month's bookings silently drift forward.
    expect(derive({ notes: "fixed a typo" }, { stage: "won", closedAt: "2026-03-01" })).toBeUndefined();
    expect(derive({ stage: "won" }, { stage: "won", closedAt: "2026-03-01" })).toBeUndefined();
  });

  it("clears the date when a closed deal is reopened", () => {
    expect(derive({ stage: "proposal" }, { stage: "won", closedAt: "2026-03-01" })).toEqual({
      closedAt: null,
    });
  });

  it("leaves an open deal alone", () => {
    expect(derive({ stage: "proposal" }, { stage: "lead" })).toBeUndefined();
    expect(derive({ value: 100 }, { stage: "lead" })).toBeUndefined();
  });

  it("reads the stage off the stored record when the payload omits it", () => {
    // A partial update that touches only `value` must not look like a reopen.
    expect(derive({ value: 5000 }, { stage: "won", closedAt: "2026-03-01" })).toBeUndefined();
  });

  it("does nothing when there is no stage to judge", () => {
    expect(derive({ value: 1 }, undefined)).toBeUndefined();
  });
});
