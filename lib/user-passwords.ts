// Per-user passwords (optional, backward-compatible).
//
// Set the SITE_USER_PASSWORDS env var to a JSON object mapping userId → secret,
// e.g.  {"nancy":"her-password","harry":"scrypt$<saltHex>$<hashHex>"}
// Each value may be a plaintext password (consistent with the existing
// SITE_PASSWORD model) OR a scrypt hash in the form "scrypt$<saltHex>$<hashHex>"
// (preferred — generate one with the helper below). When a user has an entry
// here, login verifies against it (so the signed-in identity is actually
// proven); when they don't, login falls back to the shared SITE_PASSWORD /
// HISTORY_PASSWORD. This lets per-user credentials roll out incrementally with
// zero risk of locking anyone out.
//
// Generate a scrypt hash for a password:
//   node -e "const c=require('crypto');const s=c.randomBytes(16);const p=process.argv[1];console.log('scrypt$'+s.toString('hex')+'$'+c.scryptSync(p,s,32).toString('hex'))" 'the-password'

import "server-only";
import { scryptSync, timingSafeEqual, createHmac, randomBytes } from "crypto";

let cache: Record<string, string> | null | undefined;

function load(): Record<string, string> | null {
  if (cache !== undefined) return cache;
  const raw = process.env.SITE_USER_PASSWORDS;
  if (!raw) { cache = null; return cache; }
  try {
    const parsed = JSON.parse(raw);
    cache = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
  } catch {
    cache = null;
  }
  return cache;
}

/** Constant-time, length-independent string equality. */
function safeEqual(a: string, b: string): boolean {
  const k = randomBytes(32);
  const da = createHmac("sha256", k).update(a).digest();
  const db = createHmac("sha256", k).update(b).digest();
  return timingSafeEqual(da, db);
}

function verifyScrypt(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    if (expected.length === 0) return false;
    const got = scryptSync(password, salt, expected.length);
    return timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

/** True when any per-user credential is configured. */
export function perUserConfigured(): boolean {
  const m = load();
  return !!m && Object.keys(m).length > 0;
}

/**
 * Verify a user's individual password.
 *  - returns true/false when the user HAS a per-user credential configured
 *  - returns null when they DON'T (caller should fall back to the shared password)
 */
export function verifyUserPassword(userId: string, password: string): boolean | null {
  const m = load();
  const stored = m?.[userId];
  if (!stored) return null;
  if (!password) return false;
  return stored.startsWith("scrypt$") ? verifyScrypt(password, stored) : safeEqual(password, stored);
}
