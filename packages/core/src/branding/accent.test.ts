import { describe, expect, it } from "vitest";
import { accentWarning, contrastRatio, deriveAccent, hslToHex } from "./accent.js";

const LIGHT_SURFACE = "#ffffff";
const DARK_SURFACE = "#1d2025";

function hexOf(variant: { primary: string }): string {
  const [h, s, l] = variant.primary.split(" ");
  return hslToHex(Number(h), Number(s!.replace("%", "")), Number(l!.replace("%", "")));
}

describe("deriveAccent", () => {
  it("returns a readable accent for every hue on the wheel", () => {
    // The whole promise of the feature: whatever a tenant picks, the UI stays
    // usable. Spot-checking a few blues would prove nothing — yellow and cyan
    // are the ones that break naive implementations.
    for (let hue = 0; hue < 360; hue += 5) {
      const { light, dark } = deriveAccent(hue, 80);
      expect(contrastRatio(hexOf(light), LIGHT_SURFACE), `hue ${hue} light`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(hexOf(dark), DARK_SURFACE), `hue ${hue} dark`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("holds up across saturations, including grey", () => {
    for (const saturation of [0, 25, 50, 75, 95]) {
      const { light, dark } = deriveAccent(217, saturation);
      expect(contrastRatio(hexOf(light), LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(hexOf(dark), DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("darkens yellow in light mode rather than shipping it unreadable", () => {
    // Brand yellow on white is the canonical failure. It comes back dark.
    const { light } = deriveAccent(50, 95);
    const lightness = Number(light.primary.split(" ")[2]!.replace("%", ""));
    expect(lightness).toBeLessThan(50);
    expect(contrastRatio(hexOf(light), LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it("lightens for dark mode and darkens for light — opposite directions", () => {
    const { light, dark } = deriveAccent(217, 83);
    const lightL = Number(light.primary.split(" ")[2]!.replace("%", ""));
    const darkL = Number(dark.primary.split(" ")[2]!.replace("%", ""));
    expect(darkL).toBeGreaterThan(lightL);
  });

  it("picks a foreground that is readable on the accent itself", () => {
    for (const hue of [0, 50, 120, 217, 280]) {
      const { light, dark } = deriveAccent(hue, 85);
      for (const variant of [light, dark]) {
        const fg = variant.primaryForeground === "0 0% 100%" ? "#ffffff" : hslToHex(222, 14, 7);
        expect(contrastRatio(hexOf(variant), fg), `hue ${hue}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("normalises hues outside 0-359 and clamps saturation", () => {
    expect(deriveAccent(370, 200).light.primary.startsWith("10 95%")).toBe(true);
    expect(deriveAccent(-10, -5).light.primary.startsWith("350 0%")).toBe(true);
  });

  it("emits the viz token as hex, not an HSL triple", () => {
    // --viz-series-1 is consumed raw inside style attributes; a triple is invalid there.
    expect(deriveAccent(217, 83).light.viz).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("reports the contrast it achieved so the settings page can show it", () => {
    expect(deriveAccent(217, 83).light.contrast).toBeGreaterThanOrEqual(4.5);
  });
});

describe("accentWarning", () => {
  it("warns on hues that collide with reserved status colours", () => {
    expect(accentWarning(2)).toMatch(/delete/i);
    expect(accentWarning(358)).toMatch(/delete/i);
    expect(accentWarning(125)).toMatch(/won/i);
  });

  it("stays quiet for an ordinary brand hue", () => {
    expect(accentWarning(217)).toBeNull();
    expect(accentWarning(280)).toBeNull();
  });
});
