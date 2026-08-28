import { describe, expect, it } from "vitest";
import { normaliseLogo } from "./branding.js";

/** Smallest valid PNG header plus enough bytes for the IHDR dimensions. */
function png(width: number, height: number, padding = 0): string {
  const buf = Buffer.alloc(24 + padding);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

describe("normaliseLogo", () => {
  it("accepts a PNG and reports its real dimensions", () => {
    const result = normaliseLogo(png(512, 128));
    expect(result.mime).toBe("image/png");
    expect(result.width).toBe(512);
    expect(result.height).toBe(128);
  });

  it("rebuilds the prefix from the sniffed type, ignoring what the caller claimed", () => {
    // A caller posting `data:text/html;base64,<png bytes>` must not get that
    // string persisted — the stored value outlives the assumption that it is
    // only ever rendered in an <img>.
    const buf = png(64, 64).split(",")[1]!;
    const result = normaliseLogo(`data:text/html;base64,${buf}`);
    expect(result.dataUri.startsWith("data:image/png;base64,")).toBe(true);
    expect(result.dataUri).not.toContain("text/html");
  });

  it("rejects SVG", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>').toString("base64");
    expect(() => normaliseLogo(`data:image/svg+xml;base64,${svg}`)).toThrow(/PNG or JPEG/);
  });

  it("rejects a decompression bomb by its own header", () => {
    // A tiny file can declare 20000x20000 and exhaust memory when decoded.
    expect(() => normaliseLogo(png(20000, 20000))).toThrow(/4096px/);
  });

  it("rejects something too large", () => {
    expect(() => normaliseLogo(png(64, 64, 300 * 1024))).toThrow(/under 256 KB/);
  });

  it("rejects a non-image posing as one", () => {
    const text = Buffer.from("this is not an image at all").toString("base64");
    expect(() => normaliseLogo(`data:image/png;base64,${text}`)).toThrow(/PNG or JPEG/);
  });

  it("rejects malformed base64", () => {
    expect(() => normaliseLogo("data:image/png;base64,!!!!not base64!!!!")).toThrow(/valid base64/);
  });

  it("rejects a non-data-URI", () => {
    expect(() => normaliseLogo("https://example.com/logo.png")).toThrow(/data URI/);
    expect(() => normaliseLogo(42)).toThrow(/data URI/);
  });
});
