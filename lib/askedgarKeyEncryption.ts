import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const SCRYPT_SALT = "askedgar-v1";
const SCRYPT_N = 2 ** 16;

function derivedKey(): Buffer {
  const secret = process.env.ASKEDGAR_KEY_ENCRYPTION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "ASKEDGAR_KEY_ENCRYPTION_SECRET is not set (long random string, used to encrypt stored keys)"
    );
  }
  return scryptSync(secret, SCRYPT_SALT, 32, { N: SCRYPT_N, r: 8, p: 1 });
}

/**
 * base64(iv | ciphertext+authTag) — not reversible without server secret.
 */
export function encryptAskEdgarKey(plain: string): string {
  const key = derivedKey();
  const iv = randomBytes(IV_LEN);
  const c = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final(), c.getAuthTag()]);
  return Buffer.concat([iv, enc]).toString("base64");
}

export function decryptAskEdgarKey(stored: string): string {
  const key = derivedKey();
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, IV_LEN);
  const rest = raw.subarray(IV_LEN);
  const tag = rest.subarray(rest.length - 16);
  const data = rest.subarray(0, rest.length - 16);
  const d = createDecipheriv(ALGO, key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
