import type { AccentVariants } from "@/lib/api";

/**
 * Applying tenant branding without a flash.
 *
 * The accent tokens are defined under `.light` / `.dark` class selectors, so an
 * inline style on <html> beats both without needing `!important`. Both theme
 * variants are computed server-side and cached here, which means the pre-paint
 * script in app/layout.tsx does nothing but assign four strings — no colour
 * maths duplicated into an inline string, and nothing to go stale when the base
 * palette changes.
 */

export const BRANDING_KEY = "meridian-branding";

export interface BrandingCache {
  variants: AccentVariants | null;
  logo: { dataUri: string; alt: string } | null;
}

export function readBrandingCache(): BrandingCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BRANDING_KEY);
    return raw ? (JSON.parse(raw) as BrandingCache) : null;
  } catch {
    return null;
  }
}

export function writeBrandingCache(cache: BrandingCache): void {
  try {
    window.localStorage.setItem(BRANDING_KEY, JSON.stringify(cache));
  } catch {
    /* private windows and blocked site data: branding simply is not remembered */
  }
}

/**
 * Paint the accent for one theme.
 *
 * Called from applyTheme as well as on load, because the light and dark
 * variants are different colours — toggling the theme has to re-assign, in the
 * same synchronous call, or the accent lags a frame behind the surfaces.
 */
/** The theme currently on <html>, for callers outside the theme provider. */
export function currentTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyBranding(cache: BrandingCache | null, theme: "light" | "dark"): void {
  const style = document.documentElement.style;
  const variant = cache?.variants?.[theme];
  if (!variant) {
    for (const token of ["--primary", "--primary-foreground", "--ring", "--viz-series-1"]) {
      style.removeProperty(token);
    }
    return;
  }
  style.setProperty("--primary", variant.primary);
  style.setProperty("--primary-foreground", variant.primaryForeground);
  style.setProperty("--ring", variant.ring);
  style.setProperty("--viz-series-1", variant.viz);
}
