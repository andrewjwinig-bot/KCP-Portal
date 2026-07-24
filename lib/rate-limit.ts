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
