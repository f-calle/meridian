import { describe, expect, it } from "vitest";
import { formatFieldValue } from "./entity-ui";

describe("formatFieldValue", () => {
  it("reads a date-only value as the day it names", () => {
    // Formatted from the digits, never through a Date built from the string:
    // `new Date("2026-07-14")` is UTC midnight, which is the 13th for everyone
    // west of Greenwich.
    expect(formatFieldValue("2026-07-14", "date")).toBe("Jul 14, 2026");
  });

  it("reads a date stamped at UTC midnight as the same day", () => {
    // Some columns hold the calendar day as a full timestamp. It is still a
    // day, and it must not shift.
    expect(formatFieldValue("2026-07-14T00:00:00.000Z", "date")).toBe("Jul 14, 2026");
  });

  it("keeps a datetime as an instant", () => {
    const out = formatFieldValue("2026-07-14T15:30:00.000Z", "datetime");
    expect(out).not.toBe("—");
    expect(out).toMatch(/2026/);
    // A moment, unlike a day, carries a clock time.
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it("leaves an unparseable value alone rather than inventing a date", () => {
    expect(formatFieldValue("not a date", "date")).toBe("not a date");
    expect(formatFieldValue("", "date")).toBe("");
  });

  it("still handles the other types it always did", () => {
    expect(formatFieldValue(null)).toBe("—");
    expect(formatFieldValue(undefined)).toBe("—");
    expect(formatFieldValue(true)).toBe("Yes");
    expect(formatFieldValue(false)).toBe("No");
    expect(formatFieldValue(1500, "currency")).toBe("$1,500.00");
    expect(formatFieldValue(1500)).toBe("1,500");
    expect(formatFieldValue(["a", "b"])).toBe("a, b");
    // A plain string keeps its shape even when it looks date-ish, because
    // nothing said it was a date.
    expect(formatFieldValue("2026-07-14")).toBe("2026-07-14");
  });
});
