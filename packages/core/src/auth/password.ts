import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PREFIX = "scrypt";
const KEY_LENGTH = 64;

/** Hash a password with scrypt + random salt. Format: scrypt$<salt-hex>$<hash-hex> */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${SCRYPT_PREFIX}$${salt}$${hash}`;
}

/**
 * Verify a password against a stored hash. Supports legacy unsalted
 * SHA-256 hashes (pre-hardening) so existing users can still log in;
 * callers should re-hash with hashPassword() on successful legacy login.
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith(`${SCRYPT_PREFIX}$`)) {
    const [, salt, hash] = stored.split("$");
    if (!salt || !hash) return false;
    const candidate = scryptSync(password, salt, KEY_LENGTH);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }

  // Legacy unsalted SHA-256
  const candidate = createHash("sha256").update(password).digest();
  const expected = Buffer.from(stored, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith(`${SCRYPT_PREFIX}$`);
}
