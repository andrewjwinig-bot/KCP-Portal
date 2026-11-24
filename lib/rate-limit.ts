// Per-IP rate limit for public endpoints (tenant submission form).
//
// In-memory sliding window keyed by IP. Each Vercel serverless instance
// has its own map, so the actual cap is roughly N * limit where N is the
// number of warm instances — acceptable while volume is low and the only
// downside is letting through a handful of extra submissions. Upgrade to
// Vercel KV if abuse becomes a real problem.

import "server-only";
import type { NextRequest } from "next/server";

type Bucket = { hits: number[] };

const BUCKETS = new Map<string, Bucket>();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/** Returns true if the request is within the limit; false if rate limited. */
export function checkRateLimit(ip: string, limit: number): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const bucket = BUCKETS.get(ip) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= limit) {
    BUCKETS.set(ip, bucket);
    return false;
  }
  bucket.hits.push(now);
  BUCKETS.set(ip, bucket);
  return true;
}

// ── Shared limit — for sign-in, password change and PIN checks ────────────────
// The map above is per server instance, so a guesser spread across warm
// instances got N × the limit (security audit 11/2026). These attempts are
// counted in the ONE Blob store every instance shares: a document per key per
// hour (`rate-limits/<hash>/<hour>.json`, the key hashed so no IP is stored).
// Two racing requests can each count once over the other — a few extra tries,
// never a multiple. If the store can't be reached it falls back to the
// in-memory limit, so a storage hiccup never locks everyone out.

import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";

export const RATE_LIMIT_ROOT = "rate-limits/";

export function rateLimitPath(key: string, now: number): string {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return `${RATE_LIMIT_ROOT}${hash}/${Math.floor(now / WINDOW_MS)}.json`;
}

/** Returns true if within the limit; false if rate limited. Counts across
 *  every server instance (fixed hourly window). */
export async function checkSharedRateLimit(key: string, limit: number): Promise<boolean> {
  if (!checkRateLimit(key, limit)) return false; // this instance alone is over
  if (!process.env.BLOB_READ_WRITE_TOKEN) return true;
  const now = Date.now();
  const p = rateLimitPath(key, now);
  try {
    const r = await get(p, { access: "private", useCache: false }).catch(() => null);
    let count = 0;
    if (r && r.statusCode === 200 && r.stream) {
      const doc = JSON.parse(Buffer.from(await new Response(r.stream).arrayBuffer()).toString("utf8")) as { count?: number };
      count = Number(doc.count) || 0;
    }
    if (count >= limit) return false;
    await put(p, JSON.stringify({ count: count + 1 }), {
      access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 0,
    });
    return true;
  } catch {
    return true; // the in-memory check above still applied
  }
}
