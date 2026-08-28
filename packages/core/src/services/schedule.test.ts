import { describe, expect, it } from "vitest";
import { parseDayWindow, rankSchedule, serverDayWindow, type ScheduleItem } from "./schedule.js";

function item(partial: Partial<ScheduleItem>): ScheduleItem {
  return {
    kind: "activity",
    entity: "activity",
    recordId: "id",
    title: "t",
    detail: "call",
    at: null,
    past: false,
    ...partial,
  };
}

describe("rankSchedule", () => {
  it("reads the day top to bottom", () => {
    const ranked = rankSchedule([
      item({ recordId: "afternoon", at: "2026-08-28T15:00:00.000Z" }),
      item({ recordId: "morning", at: "2026-08-28T09:00:00.000Z" }),
      item({ recordId: "noon", at: "2026-08-28T12:00:00.000Z" }),
    ]);
    expect(ranked.map((i) => i.recordId)).toEqual(["morning", "noon", "afternoon"]);
  });

  it("puts everything with a time above everything without one", () => {
    // A task merely due today has no place in a sequence of appointments, so it
    // sits below them rather than being sorted as if it happened at midnight.
    const ranked = rankSchedule([
      item({ kind: "task", recordId: "task", at: null }),
      item({ recordId: "late-meeting", at: "2026-08-28T23:30:00.000Z" }),
    ]);
    expect(ranked.map((i) => i.recordId)).toEqual(["late-meeting", "task"]);
  });

  it("orders untimed items by priority, not alphabetically", () => {
    // SQL would sort the select values as text — high, low, medium, urgent —
    // which is not priority order, so the ordering has to happen here.
    const ranked = rankSchedule([
      item({ kind: "task", recordId: "low", priority: "low", at: null }),
      item({ kind: "task", recordId: "urgent", priority: "urgent", at: null }),
      item({ kind: "task", recordId: "medium", priority: "medium", at: null }),
      item({ kind: "task", recordId: "high", priority: "high", at: null }),
    ]);
    expect(ranked.map((i) => i.recordId)).toEqual(["urgent", "high", "medium", "low"]);
  });

  it("does not mutate its input", () => {
    const items = [
      item({ recordId: "b", at: "2026-08-28T15:00:00.000Z" }),
      item({ recordId: "a", at: "2026-08-28T09:00:00.000Z" }),
    ];
    rankSchedule(items);
    expect(items.map((i) => i.recordId)).toEqual(["b", "a"]);
  });
});

describe("parseDayWindow", () => {
  const now = new Date("2026-08-28T18:00:00.000Z");

  it("takes the browser's day over the server's", () => {
    // A user at UTC-7 is still in the 28th at 6pm UTC on the 29th's doorstep;
    // the server's own midnight would name the wrong day for them.
    const day = parseDayWindow(
      "2026-08-28T07:00:00.000Z",
      "2026-08-29T07:00:00.000Z",
      "2026-08-28",
      now,
    );
    expect(day.date).toBe("2026-08-28");
    expect(day.start.toISOString()).toBe("2026-08-28T07:00:00.000Z");
  });

  it("keeps the client's calendar date rather than deriving it", () => {
    // Local midnight in Auckland (UTC+12) is the previous afternoon in UTC, so
    // slicing the start instant would name the 27th for a day that is the 28th.
    const day = parseDayWindow(
      "2026-08-27T12:00:00.000Z",
      "2026-08-28T12:00:00.000Z",
      "2026-08-28",
      now,
    );
    expect(day.date).toBe("2026-08-28");
  });

  it("falls back to the server day when a bound is missing", () => {
    expect(parseDayWindow(undefined, undefined, undefined, now)).toEqual(serverDayWindow(now));
    expect(parseDayWindow("2026-08-28T00:00:00.000Z", undefined, "2026-08-28", now)).toEqual(
      serverDayWindow(now),
    );
  });

  it("rejects a span wide enough to turn the panel into a full table scan", () => {
    const day = parseDayWindow(
      "2020-01-01T00:00:00.000Z",
      "2030-01-01T00:00:00.000Z",
      "2020-01-01",
      now,
    );
    expect(day).toEqual(serverDayWindow(now));
  });

  it("rejects an inverted window and unparseable input", () => {
    expect(
      parseDayWindow("2026-08-29T00:00:00.000Z", "2026-08-28T00:00:00.000Z", "2026-08-29", now),
    ).toEqual(serverDayWindow(now));
    expect(parseDayWindow("not-a-date", "2026-08-29T00:00:00.000Z", "2026-08-28", now)).toEqual(
      serverDayWindow(now),
    );
    expect(
      parseDayWindow("2026-08-28T00:00:00.000Z", "2026-08-29T00:00:00.000Z", "28/08/2026", now),
    ).toEqual(serverDayWindow(now));
  });
});

describe("serverDayWindow", () => {
  it("spans exactly one day", () => {
    const day = serverDayWindow(new Date("2026-08-28T18:00:00.000Z"));
    expect(day.end.getTime() - day.start.getTime()).toBe(86_400_000);
  });

  it("names the date in its own timezone, not UTC", () => {
    const day = serverDayWindow(new Date("2026-08-28T18:00:00.000Z"));
    const pad = (n: number) => String(n).padStart(2, "0");
    const expected = `${day.start.getFullYear()}-${pad(day.start.getMonth() + 1)}-${pad(day.start.getDate())}`;
    expect(day.date).toBe(expected);
  });
});
