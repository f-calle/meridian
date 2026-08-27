import { createHmac, timingSafeEqual } from "node:crypto";

export interface TokenPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  tenantName?: string;
  /** Unix seconds */
  exp: number;
  [key: string]: unknown;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production");
  }
  return "meridian-dev-secret-do-not-use-in-production";
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(data: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(data).digest());
}

/** Sign a token: base64url(payload).hmac-sha256-signature */
export function signToken(
  payload: Omit<TokenPayload, "exp"> & { exp?: number },
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  const full = {
    ...payload,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + ttlSeconds,
  } as TokenPayload;
  const body = b64url(Buffer.from(JSON.stringify(full)));
  return `${body}.${sign(body, getSecret())}`;
}

/** Verify signature and expiry. Returns the payload or null. */
export function verifyToken(token: string): TokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(body, getSecret());

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.id || !payload.tenantId || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}
