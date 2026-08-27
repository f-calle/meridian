import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

/**
 * Allowed browser origins.
 *
 * MERIDIAN_CORS_ORIGINS takes a comma-separated list so a deployment can serve
 * an app domain and a marketing domain; NEXT_PUBLIC_APP_URL remains the
 * single-origin shorthand. In production an unset value is a configuration
 * error rather than a quiet fallback to localhost — a browser would be told to
 * trust an origin nobody is serving, which reads as a CORS bug for every user.
 */
export function allowedOrigins(): string[] {
  const configured = process.env.MERIDIAN_CORS_ORIGINS ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured?.trim()) {
    return configured
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === "production") return [];
  return ["http://127.0.0.1:3000", "http://localhost:3000"];
}

/** CORS restricted to the configured allowlist. */
export function corsMiddleware(): MiddlewareHandler {
  const origins = allowedOrigins();
  return cors({
    origin: (origin) => (origins.includes(origin.replace(/\/$/, "")) ? origin : null),
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 600,
  });
}

/**
 * Security headers for a JSON API.
 *
 * The API serves no HTML, so the CSP is the restrictive one that suits a
 * response nothing should ever embed or execute: deny everything, and forbid
 * framing outright.
 */
export function securityHeaders(): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
    crossOriginResourcePolicy: "same-site",
    referrerPolicy: "no-referrer",
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    // Only meaningful over TLS, and setting it on a plain-HTTP dev server would
    // pin localhost to https in the developer's browser.
    strictTransportSecurity:
      process.env.NODE_ENV === "production" ? "max-age=31536000; includeSubDomains" : false,
  });
}

/** Client IP as far as the proxy in front of us reports it. */
export function clientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip")?.trim() ??
    "unknown"
  );
}
