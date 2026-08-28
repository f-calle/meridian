"use client";

import { useSyncExternalStore } from "react";

/**
 * Developer mode.
 *
 * Meridian shows people labels — "Deal Title", "Win Probability (%)". That is
 * right for the person doing the selling and wrong for the person wiring up an
 * import, writing an automation, or answering "why did this row come across
 * from Odoo like that". They need the field's actual name, its type, the full
 * record id, and where the row came from.
 *
 * So this is a lens, not a permission: it changes what the screen shows, never
 * what the API allows. It is stored per browser rather than per user, because
 * it is a property of how you are working right now — the same account is a
 * developer at the keyboard on Tuesday and a salesperson on a phone on
 * Wednesday, and neither should inherit the other's clutter.
 */

const STORAGE_KEY = "meridian-dev-mode";

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    // Private browsing, or storage disabled outright. Dev mode is a
    // convenience, so the answer is simply "off" rather than an error.
    return false;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function setDevMode(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "on");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: the in-memory subscribers below still flip, so the toggle works
    // for this session even where it cannot be remembered.
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab flipping the switch should not leave this one disagreeing.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Whether developer mode is on.
 *
 * The server snapshot is always `false`: localStorage does not exist during
 * SSR, and rendering the annotated version on the server would hydrate into a
 * mismatch on every machine that has the switch off.
 */
export function useDevMode(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
