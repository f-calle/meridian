import { sql } from "drizzle-orm";
import { getDb, deriveAccent } from "@meridian/core";
import type { ActorContext } from "@meridian/core";
import type { App, AppContext } from "./app-env.js";
import { ApiError } from "./errors.js";

/**
 * Per-tenant logo and accent colour.
 *
 * The logo is a data URI in Postgres rather than an object store. Meridian's
 * deployment story is "Postgres is the only stateful dependency", and making
 * every self-hoster provision a bucket, credentials and a signing story to
 * serve one image per tenant is a bad trade. It also keeps `pg_dump` a complete
 * backup. Serving it as a binary route would additionally collide with the
 * API's `Cross-Origin-Resource-Policy: same-site`, which blocks an <img> on the
 * web app's origin.
 */

/** 256 KB decoded — comfortably inside the 1 MB body limit once base64'd. */
const MAX_LOGO_BYTES = 256 * 1024;
const MAX_LOGO_DIMENSION = 4096;

/**
 * PNG and JPEG only. SVG is rejected outright rather than sanitised: nothing in
 * the API's dependencies can sanitise it, and even script-inert SVG can phone
 * home from an <img> via an external `href` — a tracking beacon firing for
 * every user in the tenant. The stored string also outlives the assumption that
 * it is only ever put in an <img>; the quote/invoice PDF is the obvious next
 * consumer, and pdfkit cannot embed SVG anyway.
 */
const ALLOWED_MIME = new Set(["image/png", "image/jpeg"]);

interface DecodedImage {
  mime: string;
  bytes: number;
  width: number;
  height: number;
}

/** Identify and measure an image from its own bytes, never from what the caller claimed. */
function inspectImage(buffer: Buffer): DecodedImage {
  // >= 24: the IHDR width and height end at byte 24, so exactly 24 is enough.
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return {
      mime: "image/png",
      bytes: buffer.length,
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    // Walk the JPEG segments to the start-of-frame, which carries the size.
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1]!;
      const length = buffer.readUInt16BE(offset + 2);
      // SOF0-SOF15, excluding the non-frame markers in that range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {
          mime: "image/jpeg",
          bytes: buffer.length,
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
    throw new ApiError(400, "That JPEG could not be read.");
  }

  throw new ApiError(400, "Logo must be a PNG or JPEG.");
}

/** Validate a submitted logo and rebuild its data URI from what we measured. */
export function normaliseLogo(dataUri: unknown): { dataUri: string } & DecodedImage {
  if (typeof dataUri !== "string" || !dataUri.startsWith("data:")) {
    throw new ApiError(400, "Logo must be a data URI.");
  }
  const comma = dataUri.indexOf(",");
  if (comma === -1) throw new ApiError(400, "Logo data URI is malformed.");

  const base64 = dataUri.slice(comma + 1);
  const buffer = Buffer.from(base64, "base64");
  // Base64 decoding silently tolerates junk, so re-encode and compare.
  if (buffer.toString("base64").replace(/=+$/, "") !== base64.replace(/=+$/, "")) {
    throw new ApiError(400, "Logo data URI is not valid base64.");
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new ApiError(400, `Logo must be under ${MAX_LOGO_BYTES / 1024} KB.`);
  }

  const image = inspectImage(buffer);
  if (!ALLOWED_MIME.has(image.mime)) throw new ApiError(400, "Logo must be a PNG or JPEG.");
  // A 40 KB PNG can decode to 20000x20000. Reject the bomb by its own header.
  if (image.width > MAX_LOGO_DIMENSION || image.height > MAX_LOGO_DIMENSION) {
    throw new ApiError(400, `Logo must be under ${MAX_LOGO_DIMENSION}px on each side.`);
  }

  // The prefix is reconstructed from the sniffed type — a caller-supplied
  // `data:text/html;base64,` must never be what gets persisted and echoed back.
  return { ...image, dataUri: `data:${image.mime};base64,${buffer.toString("base64")}` };
}

export interface TenantBranding {
  accent?: { h: number; s: number };
  logo?: { dataUri: string; mime: string; bytes: number; width: number; height: number };
  logoAlt?: string;
}

/** Branding plus the derived accent variants the client applies verbatim. */
function withVariants(branding: TenantBranding) {
  return {
    ...branding,
    variants: branding.accent ? deriveAccent(branding.accent.h, branding.accent.s) : null,
  };
}

async function readBranding(tenantId: string): Promise<TenantBranding> {
  const rows = await getDb().execute(
    sql`SELECT branding FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1`,
  );
  return ((rows[0] as { branding?: TenantBranding } | undefined)?.branding ?? {}) as TenantBranding;
}

export function registerBrandingRoutes(
  app: App,
  getActor: (c: AppContext) => ActorContext | null,
): void {
  // Any signed-in user needs this to paint their own UI.
  app.get("/api/branding", async (c) => {
    const actor = getActor(c);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);
    return c.json(withVariants(await readBranding(actor.tenantId)));
  });

  app.post("/api/branding", async (c) => {
    const actor = getActor(c);
    if (!actor) return c.json({ error: "Unauthorized" }, 401);
    if (actor.role !== "admin") return c.json({ error: "Admin access required" }, 403);

    let body: { accent?: { h?: number; s?: number } | null; logo?: string | null; logoAlt?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const current = await readBranding(actor.tenantId);
    const next: TenantBranding = { ...current };

    if (body.accent === null) {
      delete next.accent;
    } else if (body.accent) {
      const h = Number(body.accent.h);
      const s = Number(body.accent.s);
      if (!Number.isFinite(h) || !Number.isFinite(s)) {
        return c.json({ error: "accent needs numeric h and s" }, 400);
      }
      // Only hue and saturation are stored. Lightness is derived per theme, so
      // a later change to the base palette re-derives instead of going stale.
      next.accent = { h: ((Math.round(h) % 360) + 360) % 360, s: Math.max(0, Math.min(95, Math.round(s))) };
    }

    if (body.logo === null) {
      delete next.logo;
      delete next.logoAlt;
    } else if (body.logo !== undefined) {
      next.logo = normaliseLogo(body.logo);
      if (typeof body.logoAlt === "string") next.logoAlt = body.logoAlt.slice(0, 120);
    }

    await getDb().execute(
      sql`UPDATE tenants SET branding = ${JSON.stringify(next)}::jsonb, updated_at = NOW()
          WHERE id = ${actor.tenantId}::uuid`,
    );
    return c.json(withVariants(next));
  });
}
