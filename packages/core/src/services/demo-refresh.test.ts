import { describe, expect, it } from "vitest";
import { shiftInstantToDay, toIsoInstant, DEMO_SOURCE_SYSTEM } from "./demo-refresh.js";

describe("shiftInstantToDay", () => {
  it("keeps the clock time and moves the day", () => {
    const moved = shiftInstantToDay("2026-08-28T09:00:00.000Z", new Date("2026-09-14T22:41:03.000Z"));
    expect(moved).toBe("2026-09-14T09:00:00.000Z");
  });

  it("keeps minutes as well as hours", () => {
    const moved = shiftInstantToDay("2026-08-28T15:05:00.000Z", new Date("2026-09-14T00:00:00.000Z"));
    expect(moved).toBe("2026-09-14T15:05:00.000Z");
  });

  it("drops seconds so a re-dated record lands on the minute", () => {
    // Seeded rows are appointments, not measurements. Carrying 37.412 seconds
    // forward for a year would be noise dressed as precision.
    const moved = shiftInstantToDay("2026-08-28T09:00:37.412Z", new Date("2026-09-14T00:00:00.000Z"));
    expect(moved).toBe("2026-09-14T09:00:00.000Z");
  });

  it("reads and writes the hour in UTC, so a DST boundary cannot drift it", () => {
    // The target day is on the other side of the northern DST change from the
    // source. A civil-time round trip would move a 09:00 standup to 08:00.
    const summer = "2026-07-01T09:00:00.000Z";
    const winter = new Date("2026-12-01T00:00:00.000Z");
    expect(shiftInstantToDay(summer, winter)).toBe("2026-12-01T09:00:00.000Z");
  });

  it("is idempotent — re-running on the same day changes nothing", () => {
    // The refresher skips a record whose new date equals its old one, so this
    // is what keeps a nightly job from writing an audit entry every night.
    const day = new Date("2026-09-14T04:00:00.000Z");
    const once = shiftInstantToDay("2026-08-28T09:00:00.000Z", day);
    expect(shiftInstantToDay(once!, day)).toBe(once);
  });

  it("returns null rather than a guess for an unparseable instant", () => {
    expect(shiftInstantToDay("not-a-date", new Date("2026-09-14T00:00:00.000Z"))).toBeNull();
    expect(shiftInstantToDay("", new Date("2026-09-14T00:00:00.000Z"))).toBeNull();
  });
});

describe("toIsoInstant", () => {
  it("normalises the Date the driver actually returns", () => {
    // This is the bug the helper exists for. The Postgres driver hands back a
    // Date, whose String() form is "Sun Aug 30 2026 09:00:00 GMT+0000" — never
    // equal to an ISO string, so the refresher's skip check never fired and it
    // rewrote every seeded record on every run.
    expect(toIsoInstant(new Date("2026-08-30T09:00:00.000Z"))).toBe("2026-08-30T09:00:00.000Z");
  });

  it("passes an ISO string through unchanged", () => {
    expect(toIsoInstant("2026-08-30T09:00:00.000Z")).toBe("2026-08-30T09:00:00.000Z");
  });

  it("reads a date-only column as UTC midnight, so slicing names the right day", () => {
    expect(toIsoInstant("2026-08-30")?.slice(0, 10)).toBe("2026-08-30");
  });

  it("returns null for absent or unusable values rather than an epoch date", () => {
    expect(toIsoInstant(null)).toBeNull();
    expect(toIsoInstant(undefined)).toBeNull();
    expect(toIsoInstant("")).toBeNull();
    expect(toIsoInstant("not-a-date")).toBeNull();
    expect(toIsoInstant(new Date("nonsense"))).toBeNull();
  });
});

describe("DEMO_SOURCE_SYSTEM", () => {
  it("is the marker the seed writes, and the only rows the refresher touches", () => {
    // Pinned deliberately: the seed writes this string and the refresher
    // filters on it, and they live in different packages. Changing one without
    // the other would silently widen or empty the refresh.
    expect(DEMO_SOURCE_SYSTEM).toBe("demo-seed");
  });
});
