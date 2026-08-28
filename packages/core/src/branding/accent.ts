/**
 * Deriving a usable accent colour from a brand hue.
 *
 * A tenant picks a colour; we keep its hue and saturation and throw away its
 * lightness. That is not a liberty — it is the only way this can work. At a
 * fixed lightness a blue is dark and a yellow is nearly white, so honouring the
 * literal pick would give one tenant readable text and another an invisible
 * button. The existing tokens already prove the pattern: the same blue hue is
 * 50% light in the light theme and 64% in the dark one.
 *
 * So lightness is searched for, per theme, until the colour clears contrast
 * against the surface it sits on. The accent is used as body text — the active
 * nav item and the "Ask Meridian" action are both `text-primary` — so the bar
 * is 4.5:1, not the 3:1 a graphical object would need.
 *
 * The consequence worth stating in the UI: brand yellow comes back as a dark
 * olive in light mode. That is what "readable yellow text on white" is.
 */

export interface AccentVariant {
  /** `H S% L%` — the shape the CSS custom properties expect. */
  primary: string;
  primaryForeground: string;
  ring: string;
  /** Hex, because --viz-series-1 is consumed raw in style attributes. */
  viz: string;
  /** Measured contrast against the surface, for the settings preview. */
  contrast: number;
}

export interface AccentVariants {
  light: AccentVariant;
  dark: AccentVariant;
}

/** Surfaces the accent must be readable on, matching globals.css. */
const LIGHT_SURFACE = "#ffffff";
const DARK_SURFACE = "#1d2025";
const DARKEST_SURFACE = "222 14% 7%";
const TARGET_CONTRAST = 4.5;

export function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function relativeLuminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Walk lightness until the colour clears the target against `surface`.
 *
 * A linear scan in 1% steps rather than a binary search: only 101 steps exist,
 * and scanning outward returns the *least* extreme lightness that clears, which
 * keeps the result as close to the tenant's pick as the requirement allows.
 */
function searchLightness(h: number, s: number, surface: string, direction: -1 | 1): number {
  const start = direction === -1 ? 60 : 40;
  for (let step = 0; step <= 100; step++) {
    const l = start + direction * step;
    if (l < 0 || l > 100) break;
    if (contrastRatio(hslToHex(h, s, l), surface) >= TARGET_CONTRAST) return l;
  }
  // Unreachable for a real surface — black and white bracket every hue — but
  // returning a legible extreme beats returning something that fails.
  return direction === -1 ? 0 : 100;
}

function variantFor(h: number, s: number, surface: string, direction: -1 | 1): AccentVariant {
  const l = searchLightness(h, s, surface, direction);
  const hex = hslToHex(h, s, l);
  // Whichever of white or the darkest surface reads better *on* the accent.
  const onWhite = contrastRatio(hex, "#ffffff");
  const onDark = contrastRatio(hex, hslToHex(222, 14, 7));
  return {
    primary: `${h} ${s}% ${l}%`,
    primaryForeground: onWhite >= onDark ? "0 0% 100%" : DARKEST_SURFACE,
    ring: `${h} ${s}% ${l}%`,
    viz: hex,
    contrast: Math.round(contrastRatio(hex, surface) * 100) / 100,
  };
}

/** Both theme variants for a brand hue. Total: every input yields readable output. */
export function deriveAccent(hue: number, saturation: number): AccentVariants {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  // Above 95% saturation fringes on most displays; 0 is allowed because a
  // monochrome brand is legitimate and the search still guarantees contrast.
  const s = Math.max(0, Math.min(95, Math.round(saturation)));
  return {
    light: variantFor(h, s, LIGHT_SURFACE, -1),
    dark: variantFor(h, s, DARK_SURFACE, 1),
  };
}

/** Hues that collide with a reserved status colour. Advisory, never blocking. */
export function accentWarning(hue: number): string | null {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  const near = (target: number) => Math.min(Math.abs(h - target), 360 - Math.abs(h - target)) <= 15;
  if (near(0)) return "Close to the colour used for delete and error states.";
  if (near(120)) return "Close to the colour used for won deals and paid invoices.";
  return null;
}
