import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isPermissionError, isReferentialIntegrityError } from "@meridian/core";

/**
 * One place that decides what an error becomes on the wire.
 *
 * Routes used to return `err.message` with a 400 whatever went wrong, which
 * meant a driver error handed the caller a fragment of the failing SQL and a
 * genuine permission denial arrived as a validation failure. Errors we raise
 * ourselves are safe to show; anything else is summarised, and the detail goes
 * to the log with the request id so it can still be found.
 */

/** Errors thrown deliberately by a route, with the status it should carry. */
export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
  }
}

interface DriverError {
  code?: string;
  severity?: string;
}

/** Postgres SQLSTATEs worth translating into something a user can act on. */
const DRIVER_STATUS: Record<string, { status: ContentfulStatusCode; message: string }> = {
  "23505": { status: 409, message: "A record with those values already exists." },
  "23503": { status: 409, message: "Another record still refers to this one." },
  "22P02": { status: 400, message: "One of the values wasn't in the format this field expects." },
  "22003": { status: 400, message: "A number in this record is out of range." },
  "57014": { status: 503, message: "That request took too long and was stopped. Try narrowing it." },
};

export interface ResolvedError {
  status: ContentfulStatusCode;
  /** Safe to return to the caller. */
  message: string;
  /** True when the cause is worth a server-side log line. */
  unexpected: boolean;
}

export function resolveError(err: unknown): ResolvedError {
  if (err instanceof ApiError) {
    return { status: err.status, message: err.message, unexpected: false };
  }
  if (isPermissionError(err)) {
    return { status: 403, message: (err as Error).message, unexpected: false };
  }
  if (isReferentialIntegrityError(err)) {
    return { status: 409, message: (err as Error).message, unexpected: false };
  }

  const driver = DRIVER_STATUS[(err as DriverError)?.code ?? ""];
  if (driver) return { ...driver, unexpected: false };

  const message = (err as Error)?.message ?? "";
  if (/not found/i.test(message)) return { status: 404, message, unexpected: false };
  // Query-shaping errors name a field, sort or operator the caller asked for and
  // the entity does not have. That is a malformed request, not a server fault,
  // and the message is safe to return — it only ever quotes what was sent.
  if (/^Unknown (filter|sort|groupBy|entity)/i.test(message)) {
    return { status: 400, message, unexpected: false };
  }
  if (/^Validation failed/.test(message) || /is required|must be|invalid/i.test(message)) {
    return { status: 400, message, unexpected: false };
  }

  return {
    status: 500,
    message: "Something went wrong handling that request.",
    unexpected: true,
  };
}

/** Send an error response, logging the detail when the cause was unexpected. */
export function respondToError(c: Context, err: unknown) {
  const resolved = resolveError(err);
  if (resolved.unexpected) {
    console.error(
      JSON.stringify({
        level: "error",
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
        error: (err as Error)?.message,
        stack: (err as Error)?.stack,
      }),
    );
  }
  // The id lets a user quote one string and have the matching log line found,
  // without the response itself carrying anything about the failure.
  return c.json(
    resolved.unexpected
      ? { error: resolved.message, requestId: c.get("requestId") }
      : { error: resolved.message },
    resolved.status,
  );
}
