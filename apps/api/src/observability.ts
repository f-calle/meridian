import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./app-env.js";
import { clientIp } from "./security.js";

/**
 * One JSON line per request.
 *
 * Structured rather than pretty because these land in Railway's log viewer,
 * where the useful question is "show me the 5xx for tenant X" and that needs
 * fields, not prose. The request id is echoed in the `x-request-id` response
 * header and in any 500 body, so a user-reported failure can be found.
 *
 * Deliberately absent: query strings and request bodies. Both carry customer
 * data — search terms, filter values, imported CSV rows — and none of it
 * belongs in a log.
 */
export function requestLogger(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const started = Date.now();
    await next();

    const status = c.res.status;
    // Health checks fire constantly and say nothing when they pass.
    if (c.req.path === "/health" && status < 400) return;

    // Read after next(): the auth middleware runs downstream of this one.
    const actor = c.get("actor");

    console.log(
      JSON.stringify({
        level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs: Date.now() - started,
        tenantId: actor?.tenantId,
        actorId: actor?.id,
        ip: clientIp(c),
      }),
    );
  };
}
