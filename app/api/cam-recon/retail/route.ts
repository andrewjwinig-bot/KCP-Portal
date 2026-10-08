import { NextRequest, NextResponse } from "next/server";
import { RETAIL_RECON_FIXTURES, availableRetailRecons } from "@/lib/cam/retail/registry";
import { loadRetailRecon } from "@/lib/cam/retail/loadResult";
import { saveEscrowOverride, type RetailEscrowField } from "@/lib/cam/retail/escrowStore";
import { savePoolOverride, type RetailPoolField } from "@/lib/cam/retail/poolStore";
import { saveFinalOverride } from "@/lib/cam/retail/finalStore";

export const runtime = "nodejs";

/** GET /api/cam-recon/retail            → { available: [...] }
 *  GET /api/cam-recon/retail?property=2300&year=2025
 *    → { result, contacts, allocation, expenseFinal }
 *
 *  The reconciliation itself (pool + configs + GL/overrides → reconcile) lives
 *  in loadRetailRecon, shared verbatim with the public tenant-link statement so
 *  both compute identical numbers from one place. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const property = searchParams.get("property");
  const year = Number(searchParams.get("year"));

  if (!property) {
    return NextResponse.json({ available: availableRetailRecons() });
  }

  const loaded = await loadRetailRecon(property, year);
  if (!loaded) {
    return NextResponse.json({ error: `No ${year} retail recon for ${property}` }, { status: 404 });
  }
  // { result, contacts, allocation, expenseFinal } — expenseFinal carries the
  // editable CAM lines + property insurance + RET pool for the Final Expense
  // Summary card.
  return NextResponse.json(loaded);
}

const EDITABLE_ESCROW = new Set<RetailEscrowField>(["camEscrow", "insEscrow", "retEscrow"]);
const EDITABLE_POOL = new Set<RetailPoolField>(["insAmount"]);

/** POST /api/cam-recon/retail
 *  Body: { property, year, field, value, unitRef? }
 *  Two kinds of override, distinguished by field:
 *   • per-unit escrow billed (camEscrow / insEscrow / retEscrow) — needs unitRef
 *   • property-wide pool (insAmount) — no unitRef
 *  value null clears it (revert to the seeded value). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const property = String(body?.property ?? "");
    const year = Number(body?.year);
    const unitRef = String(body?.unitRef ?? "");
    const field = String(body?.field ?? "");

    if (!RETAIL_RECON_FIXTURES[property]?.byYear[year]) {
      return NextResponse.json({ error: "Unknown property/year" }, { status: 400 });
    }

    // Final Expense Summary override — a CAM line (keyed by label) or the RET
    // pool (keyed by RET_FINAL_KEY). No unitRef. Stored to cents.
    if (field === "final") {
      const key = String(body?.account ?? "").trim();
      if (!key) return NextResponse.json({ error: "Missing account" }, { status: 400 });
      let value: number | null;
      if (body?.value === null || body?.value === "") {
        value = null;
      } else {
        const n = Number(body.value);
        if (!Number.isFinite(n)) return NextResponse.json({ error: "Invalid value" }, { status: 400 });
        value = Math.round(n * 100) / 100;
      }
      await saveFinalOverride(property, year, key, value);
      return NextResponse.json({ ok: true });
    }

    // Property-wide pool override (insurance) — no unitRef. Stored to cents.
    if (EDITABLE_POOL.has(field as RetailPoolField)) {
      let value: number | null;
      if (body?.value === null || body?.value === "") {
        value = null;
      } else {
        const n = Number(body.value);
        if (!Number.isFinite(n)) {
          return NextResponse.json({ error: "Invalid value" }, { status: 400 });
        }
        value = Math.round(n * 100) / 100;
      }
      await savePoolOverride(property, year, field as RetailPoolField, value);
      return NextResponse.json({ ok: true });
    }

    if (!unitRef || !EDITABLE_ESCROW.has(field as RetailEscrowField)) {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 });
    }

    // Coerce; null/empty clears the override. Escrow is billed in whole
    // dollars, so round to the nearest dollar.
    let value: number | null;
    if (body?.value === null || body?.value === "") {
      value = null;
    } else {
      const n = Number(body.value);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: "Invalid value" }, { status: 400 });
      }
      value = Math.round(n);
    }

    await saveEscrowOverride(property, year, unitRef, field as RetailEscrowField, value);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
