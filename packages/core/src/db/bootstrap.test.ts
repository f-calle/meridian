import { afterEach, describe, expect, it, vi } from "vitest";
import { demoAdminPassword } from "./bootstrap.js";

const saved = { pw: process.env.DEMO_ADMIN_PASSWORD, env: process.env.NODE_ENV };

afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries({
    DEMO_ADMIN_PASSWORD: saved.pw,
    NODE_ENV: saved.env,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("demoAdminPassword", () => {
  it("uses the configured password when one is set", () => {
    process.env.DEMO_ADMIN_PASSWORD = "chosen-by-the-operator";
    process.env.NODE_ENV = "production";
    expect(demoAdminPassword()).toBe("chosen-by-the-operator");
  });

  it("keeps the well-known password outside production", () => {
    delete process.env.DEMO_ADMIN_PASSWORD;
    process.env.NODE_ENV = "development";
    expect(demoAdminPassword()).toBe("demo1234");
  });

  it("never seeds the well-known password in production", () => {
    // AUTO_SEED is exactly what someone turns on for a first public deploy.
    delete process.env.DEMO_ADMIN_PASSWORD;
    process.env.NODE_ENV = "production";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const generated = demoAdminPassword();
    expect(generated).not.toBe("demo1234");
    expect(generated.length).toBeGreaterThanOrEqual(20);
    // Printed once, or the operator has no way in at all.
    expect(log.mock.calls.flat().join("\n")).toContain(generated);
  });

  it("generates a different password each time", () => {
    delete process.env.DEMO_ADMIN_PASSWORD;
    process.env.NODE_ENV = "production";
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(demoAdminPassword()).not.toBe(demoAdminPassword());
  });
});
