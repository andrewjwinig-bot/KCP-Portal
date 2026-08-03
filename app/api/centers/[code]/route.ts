import { NextRequest, NextResponse } from "next/server";
import { centerByCode } from "@/lib/centers/registry";
import { getCenterOverride, saveCenterOverride, type CenterOverride } from "@/lib/centers/store";
import type { MarketedSpace } from "@/lib/centers/registry";

// Read/write the staff-managed overrides for a shopping center's public page
// (photos, site plan, marketed availabilities, DBA display names). Gated by
// site auth (any signed-in staff) via middleware; not a sensitive prefix.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const profile = centerByCode(params.code);
  if (!profile) return NextResponse.json({ error: "Unknown center" }, { status: 404 });
  const override = await getCenterOverride(profile.code);
  return NextResponse.json({
    code: profile.code,
    slug: profile.slug,
    name: profile.name,
    override,
    defaults: {
      availabilities: profile.marketedSpaces,
      displayNames: profile.displayNames ?? {},
      neighborhood: profile.neighborhood.map((n) => ({ title: n.title, img: n.img })),
    },
  });
}

function sanitizeSpaces(input: unknown): MarketedSpace[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      const s = raw as Record<string, unknown>;
      return {
        suite: String(s.suite ?? "").trim().slice(0, 60),
        sf: Math.max(0, Math.round(Number(s.sf) || 0)),
        kind: String(s.kind ?? "").trim().slice(0, 60),
        frontage: String(s.frontage ?? "").trim().slice(0, 80),
        notes: String(s.notes ?? "").trim().slice(0, 200),
      };
    })
    .filter((s) => s.suite || s.sf || s.notes);
}

function sanitizeAvailDesc(input: unknown): Record<string, { kind: string; frontage: string; notes: string }> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, { kind: string; frontage: string; notes: string }> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = String(k).trim().slice(0, 80);
    if (!key) continue;
    const d = (v ?? {}) as Record<string, unknown>;
    const kind = String(d.kind ?? "").trim().slice(0, 60);
    const frontage = String(d.frontage ?? "").trim().slice(0, 80);
    const notes = String(d.notes ?? "").trim().slice(0, 200);
    if (kind || frontage || notes) out[key] = { kind, frontage, notes };
  }
  return out;
}

function sanitizeDba(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = String(k).trim().slice(0, 80);
    const val = String(v ?? "").trim().slice(0, 120);
    if (key && val) out[key] = val;
  }
  return out;
}

export async function PUT(req: NextRequest, { params }: { params: { code: string } }) {
  const profile = centerByCode(params.code);
  if (!profile) return NextResponse.json({ error: "Unknown center" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const assetsIn = (body.assets ?? {}) as Record<string, unknown>;
  const next: CenterOverride = {
    assets: {
      hero: assetsIn.hero ? String(assetsIn.hero).slice(0, 2000) : undefined,
      sitePlan: assetsIn.sitePlan ? String(assetsIn.sitePlan).slice(0, 2000) : undefined,
      neighborhood: Array.isArray(assetsIn.neighborhood)
        ? (assetsIn.neighborhood as unknown[]).map((u) => String(u ?? "").slice(0, 2000))
        : undefined,
    },
    availabilities: sanitizeSpaces(body.availabilities),
    availDesc: sanitizeAvailDesc(body.availDesc),
    dba: sanitizeDba(body.dba),
  };

  const saved = await saveCenterOverride(profile.code, next);
  // The public page renders per-request (force-dynamic), so the change is live
  // on the next page load — no revalidation needed.
  return NextResponse.json({ ok: true, override: saved });
}
