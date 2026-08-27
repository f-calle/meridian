import type { Context, Hono } from "hono";
import type { ActorContext } from "@meridian/core";

/**
 * Per-request values the middleware stack puts on the context.
 *
 * `actor` is resolved once by the auth middleware instead of each route
 * re-verifying the bearer token, which also lets the throttles key on the
 * signed-in user rather than a shared proxy IP.
 */
export type AppEnv = {
  Variables: {
    actor?: ActorContext;
    requestId: string;
  };
};

export type AppContext = Context<AppEnv>;
export type App = Hono<AppEnv>;
