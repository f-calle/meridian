import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";

/**
 * Session revocation.
 *
 * Tokens are stateless and last a week, so without this a user removed from a
 * tenant — or one whose password was just changed after a compromise — keeps
 * full access until their token happens to expire. Each user carries a
 * `token_version`; tokens are stamped with the version current when they were
 * signed, and a token whose version is behind is refused.
 *
 * The version is read from the database and cached briefly. Checking on every
 * request would double the query load for a primary-key lookup that almost
 * never changes; caching it means a revocation takes effect within
 * MERIDIAN_SESSION_CACHE_MS rather than instantly. Seconds of delay is the
 * right trade against a round trip per request — and it is bounded and the same
 * on every instance, since each holds its own short-lived copy.
 */

interface CacheEntry {
  version: number | null;
  readAt: number;
}

const cache = new Map<string, CacheEntry>();

function ttlMs(): number {
  return Number(process.env.MERIDIAN_SESSION_CACHE_MS ?? 15_000);
}

/** Forget what we know about a user, so the next check re-reads. */
export function forgetSession(userId: string): void {
  cache.delete(userId);
}

export function clearSessionCache(): void {
  cache.clear();
}

/** Current token version for a user, or null when the user no longer exists. */
export async function currentTokenVersion(userId: string): Promise<number | null> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.readAt < ttlMs()) return cached.version;

  const rows = await getDb().execute(
    sql`SELECT token_version FROM users WHERE id = ${userId}::uuid LIMIT 1`,
  );
  const row = rows[0] as { token_version: number } | undefined;
  const version = row ? Number(row.token_version) : null;

  cache.set(userId, { version, readAt: Date.now() });
  if (cache.size > 10_000) {
    const cutoff = Date.now() - ttlMs();
    for (const [key, entry] of cache) if (entry.readAt < cutoff) cache.delete(key);
  }
  return version;
}

/**
 * Whether a token's version still entitles it to act.
 *
 * A token signed before this column existed carries no version; it reads as 0,
 * which is the column default, so upgrading did not sign everyone out.
 */
export async function isSessionCurrent(userId: string, tokenVersion: unknown): Promise<boolean> {
  const current = await currentTokenVersion(userId);
  if (current === null) return false; // user was removed
  return (typeof tokenVersion === "number" ? tokenVersion : 0) >= current;
}

/**
 * Invalidate every existing session for a user. Returns the new version.
 * Callers do this on a password change, a role change, or revoking access.
 */
export async function revokeSessions(userId: string): Promise<number> {
  const rows = await getDb().execute(
    sql`UPDATE users SET token_version = token_version + 1, updated_at = NOW()
        WHERE id = ${userId}::uuid
        RETURNING token_version`,
  );
  forgetSession(userId);
  return Number((rows[0] as { token_version: number } | undefined)?.token_version ?? 0);
}
