import { NextRequest, NextResponse } from "next/server";
import { getUnitConfig, saveUnitConfig } from "@/lib/cam/office/unitConfig";
import { OFFICE_RECON_FIXTURES } from "@/lib/cam/office/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unitRefOf(params: { unitRef: string }): string {
  return decodeURIComponent(params.unitRef).trim();
}

/** Seed lease-level config for a unit, looked up from the most recent recon
 *  year of its building fixture. Property is the unit-ref prefix
 *  ("4070-103" → "4070"). Returns the lease-level fields the unit card edits
 *  (pro-rata share + gross-up) so the card can show the seeded default
 *  beneath any stored override. */
function seedFor(unitRef: string): { proRataPct: number | null; grossUp: boolean | null; baseYear: number | null } {
  const property = unitRef.split("-")[0];
  const fixture = OFFICE_RECON_FIXTURES[property];
  if (!fixture) return { proRataPct: null, grossUp: null, baseYear: null };
  const years = Object.keys(fixture.byYear).map(Number).sort((a, b) => b - a);
  for (const y of years) {
    const cfg = fixture.byYear[y]?.leaseConfig[unitRef];
    if (cfg) return { proRataPct: cfg.proRataPct, grossUp: cfg.grossUp, baseYear: cfg.baseYear };
  }
  return { proRataPct: null, grossUp: null, baseYear: null };
}

/** GET → { override, seed, effective } where effective merges the stored
 *  per-unit override over the seed. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { unitRef: string } },
) {
  const unitRef = unitRefOf(params);
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });

  const seed = seedFor(unitRef);
  const override = await getUnitConfig(unitRef);
  const effective = {
    proRataPct: override.proRataPct ?? seed.proRataPct,
    grossUp: override.grossUp ?? seed.grossUp ?? false,
  };
  return NextResponse.json({ override, seed, effective });
}

/** PUT body: { proRataPct?, grossUp? } — null on a field clears that
 *  override (revert to the seed). */
export async function PUT(
  req: NextRequest,
  { params }: { params: { unitRef: string } },
) {
  const unitRef = unitRefOf(params);
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, number | boolean | null> = {};
  if ("proRataPct" in body) {
    if (body.proRataPct === null || body.proRataPct === "") patch.proRataPct = null;
    else {
      const n = Number(body.proRataPct);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json({ error: "Invalid proRataPct" }, { status: 400 });
      }
      patch.proRataPct = Math.round(n * 1000) / 1000;
    }
  }
  if ("grossUp" in body) {
    patch.grossUp = body.grossUp === null ? null : body.grossUp === true || body.grossUp === "true";
  }

  const override = await saveUnitConfig(unitRef, patch);
  const seed = seedFor(unitRef);
  const effective = {
    proRataPct: override.proRataPct ?? seed.proRataPct,
    grossUp: override.grossUp ?? seed.grossUp ?? false,
  };
  return NextResponse.json({ override, seed, effective });
}
