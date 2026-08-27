import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { hashPassword, verifyPassword, isLegacyHash } from "./password.js";
import { signToken, verifyToken } from "./token.js";

describe("password hashing", () => {
  it("hashes and verifies with scrypt", () => {
    const hash = hashPassword("s3cret!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("s3cret!", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces unique salts", () => {
    expect(hashPassword("same")).not.toEqual(hashPassword("same"));
  });

  it("verifies legacy unsalted sha256 hashes", () => {
    const legacy = createHash("sha256").update("demo1234").digest("hex");
    expect(isLegacyHash(legacy)).toBe(true);
    expect(verifyPassword("demo1234", legacy)).toBe(true);
    expect(verifyPassword("nope", legacy)).toBe(false);
  });
});

describe("signed tokens", () => {
  const payload = {
    id: "u1",
    email: "a@b.c",
    name: "A",
    role: "admin",
    tenantId: "t1",
  };

  it("round-trips a valid token", () => {
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded?.id).toBe("u1");
    expect(decoded?.tenantId).toBe("t1");
    expect(decoded?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects tampered payloads", () => {
    const token = signToken(payload);
    const [body, sig] = token.split(".");
    const forged = JSON.parse(Buffer.from(body, "base64url").toString());
    forged.role = "admin";
    forged.tenantId = "other-tenant";
    const forgedToken = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
    expect(verifyToken(forgedToken)).toBeNull();
  });

  it("rejects unsigned base64 tokens (the pre-hardening format)", () => {
    const legacy = Buffer.from(JSON.stringify(payload)).toString("base64");
    expect(verifyToken(legacy)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = signToken({ ...payload, exp: Math.floor(Date.now() / 1000) - 10 });
    expect(verifyToken(token)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyToken("not-a-token")).toBeNull();
    expect(verifyToken("a.b")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });
});
