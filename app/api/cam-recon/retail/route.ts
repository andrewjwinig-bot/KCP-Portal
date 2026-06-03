import { NextRequest, NextResponse } from "next/server";
import { reconcileRetailBuilding } from "@/lib/cam/retail/compute";
import { assembleRetail } from "@/lib/cam/retail/assemble";
import { RETAIL_RECON_FIXTURES, availableRetailRecons } from "@/lib/cam/retail/registry";
import { getCamConfig } from "@/lib/cam/configStorage";
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

  const tenants = assembleRetail(fixture.pool, reconYear.roster, fixture.gla, configFor);
  const result = reconcileRetailBuilding(fixture.pool, tenants);

  // Statement recipients from the master Contacts directory (flagged
  // recipients), CC the internal default — same as the office side.
  const suiteContacts = await getSuiteContactsMap(reconYear.roster.map((u) => u.unitRef));
  const contacts: Record<string, { email: string; cc: string }> = {};
  for (const u of reconYear.roster) {
    contacts[u.unitRef] = { email: camRecipientEmails(suiteContacts[u.unitRef] ?? []), cc: DEFAULT_CC };
  }
  return NextResponse.json({ result, contacts });
}
