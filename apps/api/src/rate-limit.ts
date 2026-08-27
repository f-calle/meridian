import { Redis } from "ioredis";

/**
 * Login throttle: counts FAILED attempts per key (ip + email) in a rolling
 * window; successful login clears the counter, so legitimate users are never
 * locked out by their own history. Redis-backed when REDIS_URL is set (shared
 * across instances), with an in-memory fallback for tests/dev.
 */
const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 10;

let redis: Redis | null = null;
let redisDisabled = false;

function getRedis(): Redis | null {
  if (redisDisabled) return null;
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisDisabled = true;
    return null;
  }
  redis = new Redis(url, { maxRetriesPerRequest: 1 });
  redis.on("error", (err) => console.error("[rate-limit] redis error:", err.message));
  return redis;
}

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryEntry(key: string) {
  const now = Date.now();
  const existing = memory.get(key);
  if (existing && existing.resetAt > now) return existing;
  const fresh = { count: 0, resetAt: now + WINDOW_SECONDS * 1000 };
  memory.set(key, fresh);
  return fresh;
}

export async function isLoginBlocked(
  key: string,
): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const r = getRedis();
  if (r) {
    try {
      const [count, ttl] = await Promise.all([r.get(`loginfail:${key}`), r.ttl(`loginfail:${key}`)]);
      if (Number(count ?? 0) >= MAX_FAILURES) {
        return { blocked: true, retryAfterSeconds: Math.max(1, ttl) };
      }
      return { blocked: false, retryAfterSeconds: 0 };
    } catch {
      // fall through to memory on redis failure
    }
  }
  const entry = memoryEntry(key);
  if (entry.count >= MAX_FAILURES) {
    return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000)) };
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

export async function recordLoginFailure(key: string): Promise<void> {
  const r = getRedis();
  if (r) {
    try {
      const count = await r.incr(`loginfail:${key}`);
      if (count === 1) await r.expire(`loginfail:${key}`, WINDOW_SECONDS);
      return;
    } catch {
      // fall through
    }
  }
  memoryEntry(key).count++;
}

export async function clearLoginFailures(key: string): Promise<void> {
  const r = getRedis();
  if (r) {
    try {
      await r.del(`loginfail:${key}`);
      return;
    } catch {
      // fall through
    }
  }
  memory.delete(key);
}

export const loginRateLimitConfig = { WINDOW_SECONDS, MAX_FAILURES };
