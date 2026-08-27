import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSessionCache, forgetSession, isSessionCurrent } from "./sessions.js";
import * as client from "../db/client.js";

/** Stand in for the users table with a controllable token_version. */
function stubDb(rowsByCall: (unknown[] | undefined)[]) {
  let call = 0;
  const execute = vi.fn(async () => rowsByCall[Math.min(call++, rowsByCall.length - 1)] ?? []);
  vi.spyOn(client, "getDb").mockReturnValue({ execute } as never);
  return execute;
}

afterEach(() => {
  vi.restoreAllMocks();
  clearSessionCache();
});

describe("isSessionCurrent", () => {
  it("accepts a token stamped with the current version", async () => {
    stubDb([[{ token_version: 3 }]]);
    expect(await isSessionCurrent("user-1", 3)).toBe(true);
  });

  it("refuses a token from before the last revocation", async () => {
    stubDb([[{ token_version: 4 }]]);
    expect(await isSessionCurrent("user-1", 3)).toBe(false);
  });

  it("refuses any token for a user that no longer exists", async () => {
    // The removed-employee case: the signature is still valid, the account is not.
    stubDb([[]]);
    expect(await isSessionCurrent("gone", 0)).toBe(false);
  });

  it("treats a token with no version as version 0", async () => {
    // Tokens issued before revocation existed carry no `v`. Version 0 is the
    // column default, so upgrading must not sign everyone out.
    stubDb([[{ token_version: 0 }]]);
    expect(await isSessionCurrent("user-1", undefined)).toBe(true);
  });

  it("still refuses a versionless token once the user has been revoked", async () => {
    stubDb([[{ token_version: 1 }]]);
    expect(await isSessionCurrent("user-1", undefined)).toBe(false);
  });

  it("reads the database once per user within the cache window", async () => {
    const execute = stubDb([[{ token_version: 0 }]]);
    await isSessionCurrent("user-1", 0);
    await isSessionCurrent("user-1", 0);
    await isSessionCurrent("user-1", 0);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("re-reads after the cached entry is dropped", async () => {
    const execute = stubDb([[{ token_version: 0 }], [{ token_version: 1 }]]);
    expect(await isSessionCurrent("user-1", 0)).toBe(true);
    forgetSession("user-1");
    expect(await isSessionCurrent("user-1", 0)).toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("caches per user, not globally", async () => {
    const execute = stubDb([[{ token_version: 0 }], [{ token_version: 9 }]]);
    expect(await isSessionCurrent("user-1", 0)).toBe(true);
    expect(await isSessionCurrent("user-2", 0)).toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("honours MERIDIAN_SESSION_CACHE_MS", async () => {
    const previous = process.env.MERIDIAN_SESSION_CACHE_MS;
    process.env.MERIDIAN_SESSION_CACHE_MS = "0";
    try {
      const execute = stubDb([[{ token_version: 0 }]]);
      await isSessionCurrent("user-1", 0);
      await isSessionCurrent("user-1", 0);
      expect(execute).toHaveBeenCalledTimes(2);
    } finally {
      if (previous === undefined) delete process.env.MERIDIAN_SESSION_CACHE_MS;
      else process.env.MERIDIAN_SESSION_CACHE_MS = previous;
    }
  });
});
