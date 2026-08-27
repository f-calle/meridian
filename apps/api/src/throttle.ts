import type { Context, MiddlewareHandler } from "hono";
import { Redis } from "ioredis";
import { clientIp } from "./security.js";

/**
 * General-purpose fixed-window throttle, separate from the login throttle
 * (which counts failures rather than requests).
 *
 * The case that needs it most is AI: every call to /api/ai/* costs real money
 * and takes seconds, so one authenticated account in a retry loop is both a
 * bill and a queue for everyone else. Writes get a looser limit to keep a
 * runaway client or an import script from saturating the database.
 *
 * Redis-backed so the limit holds across instances, with an in-memory fallback
 * that still protects a single-instance or local deployment.
 */

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
  redis.on("error", (err) => console.error("[throttle] redis error:", err.message));
  return redis;
}

const memory = new Map<string, { count: number; resetAt: number }>();

function hitMemory(key: string, windowMs: number): { count: number; resetAt: number } {
  const now = Date.now();
  const existing = memory.get(key);
  if (existing && existing.resetAt > now) {
    existing.count++;
    return existing;
  }
  const fresh = { count: 1, resetAt: now + windowMs };
  memory.set(key, fresh);
  // Bound the map: without this, a stream of distinct keys is a slow leak.
  if (memory.size > 10_000) {
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  }
  return fresh;
}

export interface ThrottleResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Count one hit against `key`; report whether it stays inside `limit`. */
export async function hit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<ThrottleResult> {
  const r = getRedis();
  if (r) {
    try {
      const redisKey = `throttle:${key}`;
      const count = await r.incr(redisKey);
      if (count === 1) await r.expire(redisKey, windowSeconds);
      const ttl = count > limit ? await r.ttl(redisKey) : 0;
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: Math.max(1, ttl),
      };
    } catch {
      // fall through to memory rather than failing the request open-ended
    }
  }
  const entry = hitMemory(key, windowSeconds * 1000);
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000)),
  };
}

/**
 * Throttle by authenticated actor, falling back to client IP.
 *
 * Keying on the actor rather than the IP is what makes this useful behind a
 * proxy, where every request shares one source address.
 */
export function throttle(options: {
  name: string;
  limit: number;
  windowSeconds: number;
}): MiddlewareHandler {
  return async (c, next) => {
    const result = await hit(
      `${options.name}:${throttleSubject(c)}`,
      options.limit,
      options.windowSeconds,
    );
    c.header("X-RateLimit-Limit", String(options.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json(
        {
          error: `Too many requests. Try again in ${result.retryAfterSeconds}s.`,
        },
        429,
      );
    }
    await next();
  };
}

/** Who a limit applies to: the signed-in actor if there is one, else the IP. */
export function throttleSubject(c: Context): string {
  const actor = c.get("actor") as { id?: string; tenantId?: string } | undefined;
  if (actor?.id) return `${actor.tenantId}:${actor.id}`;
  return `ip:${clientIp(c)}`;
}
