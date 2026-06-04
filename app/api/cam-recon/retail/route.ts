import { NextRequest, NextResponse } from "next/server";
import { reconcileRetailBuilding } from "@/lib/cam/retail/compute";
import { assembleRetail } from "@/lib/cam/retail/assemble";
import { RETAIL_RECON_FIXTURES, availableRetailRecons } from "@/lib/cam/retail/registry";
import { allocationFor } from "@/lib/cam/retail/allocation";
import { getCamConfig } from "@/lib/cam/configStorage";
import { getEscrowOverrides, saveEscrowOverride, type RetailEscrowField } from "@/lib/cam/retail/escrowStore";
import { seedCamConfig } from "@/lib/cam/retailConfigSeed";
import { emptyCamConfig } from "@/lib/cam/config";
import { getSuiteContactsMap } from "@/lib/suites/contactsStorage";
import { camRecipientEmails } from "@/lib/suites/contacts";
import { DEFAULT_CC } from "@/lib/cam/office/contacts";

export const runtime = "nodejs";

/** GET /api/cam-recon/retail            → { available: [...] }
 *  GET /api/cam-recon/retail?property=2300&year=2025
 *    → { result: RetailBuildingResult }
 *
 *  PRS comes from propertyRules; admin/exclusions/cap come from the stored CAM
 *  config (a manually edited card wins; otherwise the CAMPRep seed); pools +
 *  escrow + discounts come from the fixture. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const property = searchParams.get("property");
  const year = Number(searchParams.get("year"));

  if (!property) {
    return NextResponse.json({ available: availableRetailRecons() });
  }

  const fixture = RETAIL_RECON_FIXTURES[property];
  const reconYear = fixture?.byYear[year];
  if (!fixture || !reconYear) {
    return NextResponse.json({ error: `No ${year} retail recon for ${property}` }, { status: 404 });
  }

  // Pre-load saved configs for the roster so the (sync) assembler can resolve
  // each tenant's config: saved card wins, else CAMPRep seed, else empty.
  const saved = new Map(
    await Promise.all(
      reconYear.roster.map(async (u) => [u.unitRef, await getCamConfig(u.unitRef)] as const),
    ),
  );
  const configFor = (unitRef: string) =>
    saved.get(unitRef) ?? seedCamConfig(unitRef) ?? emptyCamConfig(unitRef);

  // Recon-time escrow overrides win over the roster-seeded escrow billed.
  const escrowOverrides = await getEscrowOverrides(property, year);
  const roster = reconYear.roster.map((u) => {
    const ov = escrowOverrides[u.unitRef];
    if (!ov) return u;
    return {
      ...u,
      ...(ov.camEscrow != null ? { camEscrow: ov.camEscrow } : {}),
      ...(ov.insEscrow != null ? { insEscrow: ov.insEscrow } : {}),
      ...(ov.retEscrow != null ? { retEscrow: ov.retEscrow } : {}),
    };
  });

  const tenants = assembleRetail(fixture.pool, roster, fixture.gla, configFor);
  const result = reconcileRetailBuilding(fixture.pool, tenants);

  // Statement recipients from the master Contacts directory (flagged
  // recipients), CC the internal default — same as the office side.
  const suiteContacts = await getSuiteContactsMap(reconYear.roster.map((u) => u.unitRef));
  const contacts: Record<string, { email: string; cc: string }> = {};
  for (const u of reconYear.roster) {
    contacts[u.unitRef] = { email: camRecipientEmails(suiteContacts[u.unitRef] ?? []), cc: DEFAULT_CC };
  }
  return NextResponse.json({ result, contacts, allocation: allocationFor(fixture.pool.propertyCode) });
}

const EDITABLE_ESCROW = new Set<RetailEscrowField>(["camEscrow", "insEscrow", "retEscrow"]);

/** POST /api/cam-recon/retail
 *  Body: { property, year, unitRef, field, value }
 *  Saves a single per-unit escrow override (CAM/INS/RET escrow billed).
 *  value null clears it (revert to the roster-seeded escrow). */
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
