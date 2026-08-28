"use client";

import { useEffect } from "react";
import { isStaleBuildError } from "@/lib/stale-build";

/**
 * Last-resort error page.
 *
 * Without this, an unhandled client error replaces the whole document with
 * Next's built-in "Application error: a client-side exception has occurred" —
 * unstyled, with no reload button and everything on screen destroyed.
 *
 * The case worth naming is a stale chunk. Deploying replaces the hashed JS
 * files, so a tab left open across a deploy can fail to load a chunk hours
 * later, on an interaction with nothing to do with the deploy. Next already
 * hard-reloads on navigation when it detects a new build, but an error thrown
 * mid-render lands here instead — and "Meridian was updated, reload" is a very
 * different message from "a client-side exception has occurred".
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[meridian] unhandled error", error);
  }, [error]);

  const isStaleBuild = isStaleBuildError(error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
            {isStaleBuild ? "Meridian was updated" : "Something went wrong"}
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#475569", margin: "0 0 20px" }}>
            {isStaleBuild
              ? "This tab is running an older version. Reload to pick up the new one."
              : "That page hit an error it couldn't recover from. Trying again usually works."}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={() => (isStaleBuild ? window.location.reload() : reset())}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: "#2a78d6",
                color: "#fff",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {isStaleBuild ? "Reload" : "Try again"}
            </button>
            <a
              href="/dashboard"
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                color: "#0f172a",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
          {error.digest && (
            <p style={{ marginTop: 20, fontSize: 11, color: "#94a3b8" }}>
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
