import { describe, expect, it } from "vitest";
import { isStaleBuildError } from "./stale-build.js";

describe("isStaleBuildError", () => {
  it("recognises webpack's named chunk failure", () => {
    expect(isStaleBuildError({ name: "ChunkLoadError", message: "Loading chunk 402 failed" })).toBe(true);
  });

  it("recognises the message alone, since the name varies by browser", () => {
    // Native ESM failures arrive as a plain TypeError with only the message.
    expect(isStaleBuildError({ name: "TypeError", message: "Failed to fetch dynamically imported module: /_next/x.js" })).toBe(true);
    expect(isStaleBuildError({ name: "TypeError", message: "Importing a module script failed." })).toBe(true);
    expect(isStaleBuildError({ name: "Error", message: "error loading dynamically imported module" })).toBe(true);
  });

  it("recognises a CSS chunk failure", () => {
    expect(isStaleBuildError({ name: "Error", message: "Loading CSS chunk 12 failed" })).toBe(true);
  });

  it("does not misread an ordinary bug as a stale build", () => {
    // Offering "Reload" for a real bug sends the user in a circle; offering
    // "Try again" for a missing chunk is a loop they cannot escape. Both
    // directions matter.
    expect(isStaleBuildError({ name: "TypeError", message: "Cannot read properties of undefined (reading 'id')" })).toBe(false);
    expect(isStaleBuildError({ name: "Error", message: "Request failed" })).toBe(false);
  });

  it("survives an error with no name or message", () => {
    expect(isStaleBuildError({})).toBe(false);
  });
});
