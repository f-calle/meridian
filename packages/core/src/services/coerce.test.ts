import { describe, expect, it } from "vitest";
import { coerceFromDb } from "./entity-service.js";

describe("coerceFromDb", () => {
  it("converts NUMERIC strings to numbers for currency and number fields", () => {
    expect(coerceFromDb("currency", "84000.00")).toBe(84000);
    expect(coerceFromDb("number", "42")).toBe(42);
    expect(coerceFromDb("currency", "-1250.75")).toBe(-1250.75);
  });

  it("leaves other field types untouched", () => {
    expect(coerceFromDb("string", "84000.00")).toBe("84000.00");
    expect(coerceFromDb("select", "won")).toBe("won");
    expect(coerceFromDb(undefined, "raw")).toBe("raw");
  });

  it("passes through null, undefined, and already-numeric values", () => {
    expect(coerceFromDb("currency", null)).toBeNull();
    expect(coerceFromDb("currency", undefined)).toBeUndefined();
    expect(coerceFromDb("currency", 500)).toBe(500);
  });

  it("keeps unparseable strings rather than producing NaN", () => {
    expect(coerceFromDb("currency", "not-a-number")).toBe("not-a-number");
  });
});
