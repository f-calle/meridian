"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Palette, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useTheme } from "@/components/theme-provider";
import { applyBranding, readBrandingCache, writeBrandingCache } from "@/lib/branding";
import { api, type Branding } from "@/lib/api";

/**
 * Admin control for the tenant's logo and accent.
 *
 * The colour input hands back a hex; only its hue and saturation are sent. The
 * server derives a readable lightness per theme, so the swatch shown here is
 * what will actually be used — which matters because a brand yellow comes back
 * as a dark olive in light mode, and seeing that before saving beats
 * discovering it afterwards.
 */

const MAX_DIMENSION = 512;

function hexToHsl(hex: string): { h: number; s: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r!, g!, b!);
  const min = Math.min(r!, g!, b!);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g! - b!) / d + (g! < b! ? 6 : 0)) * 60;
  else if (max === g) h = ((b! - r!) / d + 2) * 60;
  else h = ((r! - g!) / d + 4) * 60;
  return { h: Math.round(h), s: Math.round(s * 100) };
}

/** Downscale in the browser so a 4000px logo never reaches the 256 KB cap. */
function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a readable image"));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Could not process that image"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function BrandingCard({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const { theme } = useTheme();
  const fileInput = useRef<HTMLInputElement>(null);

  const [branding, setBranding] = useState<Branding | null>(null);
  const [hex, setHex] = useState("#2a78d6");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getBranding()
      .then((b) => {
        setBranding(b);
        if (b.accent) setHex(b.variants?.light.viz ?? hex);
      })
      .catch(() => setBranding(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    async (body: Parameters<typeof api.updateBranding>[0], message: string) => {
      setSaving(true);
      try {
        const next = await api.updateBranding(body);
        setBranding(next);
        const cache = {
          variants: next.variants,
          logo: next.logo ? { dataUri: next.logo.dataUri, alt: next.logoAlt ?? "" } : null,
        };
        writeBrandingCache(cache);
        applyBranding(cache, theme);
        toast({ title: message });
      } catch (err) {
        toast({ title: "Couldn't save", description: (err as Error).message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [theme, toast],
  );

  async function handleFile(file: File) {
    try {
      await persist({ logo: await fileToDataUri(file), logoAlt: file.name }, "Logo updated");
    } catch (err) {
      toast({ title: "Couldn't read that image", description: (err as Error).message, variant: "destructive" });
    }
  }

  const preview = branding?.variants;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Palette className="h-4 w-4" aria-hidden="true" /> Branding
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Logo</Label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border/80 bg-muted/40">
              {branding?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logo.dataUri}
                  alt={branding.logoAlt ?? "Current logo"}
                  className="h-full w-full rounded-lg object-contain"
                />
              ) : (
                <span className="text-[10px] text-muted-foreground">None</span>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!canEdit || saving}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="mr-1 h-4 w-4" aria-hidden="true" /> Upload
            </Button>
            {branding?.logo && (
              <Button
                variant="ghost"
                size="sm"
                disabled={!canEdit || saving}
                onClick={() => void persist({ logo: null }, "Logo removed")}
              >
                <X className="mr-1 h-4 w-4" aria-hidden="true" /> Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            PNG or JPEG, scaled down to {MAX_DIMENSION}px before upload. SVG isn&apos;t accepted —
            it can carry script and phone home from the page.
          </p>
        </div>

        <div>
          <Label htmlFor="accent" className="text-xs uppercase tracking-wide text-muted-foreground">
            Accent colour
          </Label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              id="accent"
              type="color"
              value={hex}
              disabled={!canEdit || saving}
              onChange={(e) => setHex(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-border/80 bg-transparent disabled:cursor-not-allowed"
            />
            <Input
              value={hex}
              disabled={!canEdit || saving}
              onChange={(e) => setHex(e.target.value)}
              className="w-28 font-mono text-sm"
              aria-label="Accent colour hex"
            />
            <Button
              size="sm"
              disabled={!canEdit || saving}
              onClick={() => void persist({ accent: hexToHsl(hex) }, "Accent updated")}
            >
              Apply
            </Button>
            {branding?.accent && (
              <Button
                variant="ghost"
                size="sm"
                disabled={!canEdit || saving}
                onClick={() => void persist({ accent: null }, "Accent reset")}
              >
                Reset
              </Button>
            )}
          </div>

          {preview && (
            <div className="mt-3 flex flex-wrap gap-4 rounded-lg border border-border/80 p-3">
              {(["light", "dark"] as const).map((mode) => (
                <div key={mode} className="flex items-center gap-2">
                  <span
                    className="h-6 w-6 rounded"
                    style={{ background: preview[mode].viz }}
                    aria-hidden="true"
                  />
                  <span className="text-xs">
                    <span className="capitalize">{mode}</span>
                    <span className="ml-1 tabular-nums text-muted-foreground">
                      {preview[mode].contrast.toFixed(1)}:1
                    </span>
                  </span>
                </div>
              ))}
              <p className="w-full text-xs text-muted-foreground">
                Lightness is adjusted per theme so the accent stays readable as text — a bright
                yellow will come back darker here than you picked.
              </p>
            </div>
          )}
        </div>

        {!canEdit && (
          <p className="text-xs text-muted-foreground">Only admins can change branding.</p>
        )}
      </CardContent>
    </Card>
  );
}
