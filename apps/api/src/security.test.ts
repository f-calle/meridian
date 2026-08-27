import { afterEach, describe, expect, it } from "vitest";
import { allowedOrigins } from "./security.js";

const saved = {
  origins: process.env.MERIDIAN_CORS_ORIGINS,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  nodeEnv: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    MERIDIAN_CORS_ORIGINS: saved.origins,
    NEXT_PUBLIC_APP_URL: saved.appUrl,
    NODE_ENV: saved.nodeEnv,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("allowedOrigins", () => {
  it("splits a comma-separated list and trims trailing slashes", () => {
    process.env.MERIDIAN_CORS_ORIGINS = "https://app.example.com/, https://admin.example.com";
    expect(allowedOrigins()).toEqual(["https://app.example.com", "https://admin.example.com"]);
  });

  it("falls back to the single app URL", () => {
    delete process.env.MERIDIAN_CORS_ORIGINS;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    expect(allowedOrigins()).toEqual(["https://app.example.com"]);
  });

  it("allows localhost in development", () => {
    delete process.env.MERIDIAN_CORS_ORIGINS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "development";
    expect(allowedOrigins()).toContain("http://127.0.0.1:3000");
  });

  it("allows nothing in production when unconfigured", () => {
    // Defaulting to localhost in production would tell a browser to trust an
    // origin nobody serves — better to allow nothing and warn at boot.
    delete process.env.MERIDIAN_CORS_ORIGINS;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NODE_ENV = "production";
    expect(allowedOrigins()).toEqual([]);
  });
});
