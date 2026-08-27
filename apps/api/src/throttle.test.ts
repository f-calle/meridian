import { beforeEach, describe, expect, it } from "vitest";
import { hit } from "./throttle.js";

// No REDIS_URL in tests, so this exercises the in-memory path — the one that
// protects a single-instance or local deployment.
beforeEach(() => {
  delete process.env.REDIS_URL;
});

describe("hit", () => {
  it("allows exactly up to the limit, then refuses", async () => {
    const key = `spec-${Math.random()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hit(key, 3, 60));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
  });

  it("counts down the remaining allowance", async () => {
    const key = `spec-${Math.random()}`;
    expect((await hit(key, 3, 60)).remaining).toBe(2);
    expect((await hit(key, 3, 60)).remaining).toBe(1);
    expect((await hit(key, 3, 60)).remaining).toBe(0);
  });

  it("never reports a zero retry-after, which a client would busy-loop on", async () => {
    const key = `spec-${Math.random()}`;
    await hit(key, 1, 60);
    const blocked = await hit(key, 1, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate keys separate", async () => {
    const a = `spec-a-${Math.random()}`;
    const b = `spec-b-${Math.random()}`;
    await hit(a, 1, 60);
    expect((await hit(a, 1, 60)).allowed).toBe(false);
    expect((await hit(b, 1, 60)).allowed).toBe(true);
  });

  it("starts a fresh window once the old one expires", async () => {
    const key = `spec-${Math.random()}`;
    await hit(key, 1, 1);
    expect((await hit(key, 1, 1)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await hit(key, 1, 1)).allowed).toBe(true);
  });
});
