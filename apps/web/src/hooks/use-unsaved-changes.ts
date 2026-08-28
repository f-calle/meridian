"use client";

import { useEffect } from "react";

/**
 * Warn before leaving with unsaved work.
 *
 * Meridian holds real user input in component state — a record being edited, a
 * pasted CSV and its AI-generated column mapping, an AI conversation — and none
 * of it survives a reload. That matters more than it looks: Next hard-reloads
 * the page by itself when it notices a tab is running an older build, so this
 * protects against the framework's own recovery as much as against a stray
 * click.
 *
 * `beforeunload` cannot stop an in-app route change, so this is deliberately
 * only the browser-level guard: closing the tab, reloading, following an
 * external link.
 */
export function useUnsavedChanges(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers show their own wording; a non-empty returnValue is what asks.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);
}
