// Passwords people choose for themselves, kept in the portal (owner, 11/2026:
// "let users create and change their own passwords without me getting
// involved"). Until now a personal password could only live in the
// SITE_USER_PASSWORDS env var, which only the owner could edit (and only by
// redeploying).
//
// Only a scrypt HASH is stored — never the password — one private document
// per user (`user-passwords/<id>`). `mustChange` marks a ONE-TIME password an
// admin issued (`issueTemporaryPassword`): signing in with it confines the
// session to /security until the person chooses their own.
//
// The ONE check for "is this the right password" is `checkPassword`, used by
// sign-in and by Change Password alike. The order is deliberate:
//   1. a password the user set in the portal — when there is one, it is the
//      ONLY one that works (no falling back to a shared password);
//   2. else their entry in SITE_USER_PASSWORDS (Vercel);
//   3. else the shared tier password (SITE_PASSWORD, or HISTORY_PASSWORD for
//      the admin tier).
// A failed read of the store THROWS rather than reading as "none set": a
// miss would let the shared password open an account whose owner replaced it.

import "server-only";
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "crypto";
import { getJSON, storeJSON, listJSON } from "@/lib/storage";
import { verifyUserPassword } from "@/lib/user-passwords";

const PREFIX = "user-passwords";

export type StoredPassword = {
  userId: string;
  hash: string;              // scrypt$<saltHex>$<hashHex>
  mustChange: boolean;       // a one-time password an admin issued
  updatedAt: string;
  updatedBy: string;         // the user themselves, or the admin who reset it
};

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(plain, salt, 32).toString("hex")}`;
}

function verifyHash(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const expected = Buffer.from(parts[2], "hex");
    if (!expected.length) return false;
    return timingSafeEqual(scryptSync(plain, Buffer.from(parts[1], "hex"), expected.length), expected);
  } catch {
    return false;
  }
}

function safeEqual(a: string, b: string): boolean {
  const k = randomBytes(32);
  return timingSafeEqual(createHmac("sha256", k).update(a).digest(), createHmac("sha256", k).update(b).digest());
}

export async function getStoredPassword(userId: string): Promise<StoredPassword | null> {
  return (await getJSON(PREFIX, userId, { retryOnMiss: true })) as StoredPassword | null;
}

export async function listStoredPasswords(): Promise<StoredPassword[]> {
  return ((await listJSON(PREFIX, { fresh: true }).catch(() => [])) as StoredPassword[]).filter((r) => r?.userId);
}

export async function setPassword(userId: string, plain: string, opts: { by: string; mustChange?: boolean }): Promise<StoredPassword> {
  const rec: StoredPassword = { userId, hash: hashPassword(plain), mustChange: !!opts.mustChange, updatedAt: new Date().toISOString(), updatedBy: opts.by };
  await storeJSON(PREFIX, userId, rec);
  return rec;
}

/** A one-time password an admin hands over — easy to read aloud, e.g.
 *  "Cedar-Summit-4821". The person must replace it at their next sign-in. */
export function generateTemporaryPassword(): string {
  const words = ["Harbor", "Maple", "Granite", "Summit", "Cedar", "Beacon", "Willow", "Falcon", "Meadow", "Copper", "River", "Orchard", "Aspen", "Bridge", "Canyon", "Lantern"];
  const w = () => words[randomInt(words.length)];
  return `${w()}-${w()}-${randomInt(1000, 10000)}`;
}

export async function issueTemporaryPassword(userId: string, by: string): Promise<string> {
  const temp = generateTemporaryPassword();
  await setPassword(userId, temp, { by, mustChange: true });
  return temp;
}

export type PasswordSource = "portal" | "vercel" | "shared";

/** Is `password` right for `userId`? Throws if the store can't be read. */
export async function checkPassword(userId: string, password: string, opts: { adminTier: boolean }): Promise<{ ok: boolean; source: PasswordSource; mustChange: boolean }> {
  const stored = await getStoredPassword(userId);
  if (stored?.hash) {
    return { ok: !!password && verifyHash(password, stored.hash), source: "portal", mustChange: !!stored.mustChange };
  }
  const env = verifyUserPassword(userId, password);
  if (env !== null) return { ok: env, source: "vercel", mustChange: false };
  const expected = opts.adminTier ? process.env.HISTORY_PASSWORD : process.env.SITE_PASSWORD;
  return { ok: !!password && !!expected && safeEqual(password, expected), source: "shared", mustChange: false };
}

/** A new password must not be one of the shared ones everyone else knows. */
export function isASharedPassword(plain: string): boolean {
  return [process.env.SITE_PASSWORD, process.env.HISTORY_PASSWORD].some((p) => !!p && safeEqual(plain, p));
}
