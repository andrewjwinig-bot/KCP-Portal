// TOTP (RFC 6238) implemented with Node crypto — no third-party OTP library.
// Standard 6-digit, 30-second, SHA-1 codes, compatible with Authy / Google /
// Microsoft Authenticator.

import "server-only";
import { createHmac, randomBytes } from "crypto";

const DIGITS = 6;
const PERIOD = 30;
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/,"").replace(/\s/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A fresh 20-byte (160-bit) secret, base32-encoded for authenticator apps. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeForCounter(secretB32: string, counter: number): string {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/** Verify a code against the secret, allowing ±`window` steps for clock drift. */
export function verifyTotp(secretB32: string, code: string, window = 1): boolean {
  const trimmed = (code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(trimmed)) return false;
  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  for (let w = -window; w <= window; w++) {
    const c = counter + w;
    if (c < 0) continue;
    if (codeForCounter(secretB32, c) === trimmed) return true;
  }
  return false;
}

/** otpauth:// URI for QR enrollment. */
export function otpauthUri(account: string, secretB32: string, issuer = "KCP Portal"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(PERIOD) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
