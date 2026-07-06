import { NextRequest, NextResponse } from "next/server";
import { reconcileRetailBuilding } from "@/lib/cam/retail/compute";
import { assembleRetail } from "@/lib/cam/retail/assemble";
import { RETAIL_RECON_FIXTURES, availableRetailRecons } from "@/lib/cam/retail/registry";
import { allocationFor } from "@/lib/cam/retail/allocation";
import { getCamConfig } from "@/lib/cam/configStorage";
import { getEscrowOverrides, saveEscrowOverride, type RetailEscrowField } from "@/lib/cam/retail/escrowStore";
import { getPoolOverride, savePoolOverride, type RetailPoolField } from "@/lib/cam/retail/poolStore";
import { getFinalOverrides, saveFinalOverride, RET_FINAL_KEY } from "@/lib/cam/retail/finalStore";
import { retailHistoryYears, retailLineHistory, retailInsHistory, retailRetHistory } from "@/lib/cam/retail/expenseHistory";
import { seedCamConfig } from "@/lib/cam/retailConfigSeed";
import { emptyCamConfig } from "@/lib/cam/config";
import { getSuiteContactsMap } from "@/lib/suites/contactsStorage";
import { camRecipientEmails } from "@/lib/suites/contacts";
import { DEFAULT_CC } from "@/lib/cam/office/contacts";
import { assembledGl } from "@/lib/financials/operating-statements/statementStore";

// From this year on, the Final Expense Summary's CAM lines + RET pull live from
// the property GL by account (the "workbook" base); a FINAL override then backs
// out anything that doesn't apply. Earlier years stay locked to the seeded
// workbook / expense history.
const GL_FROM_YEAR = 2026;

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

  // Property-wide insurance-pool override wins over the seeded pool for every
  // tenant — except outparcels with their own per-tenant insAmountOverride,
  // which still win via the assemble/compute precedence.
  const poolOverride = await getPoolOverride(property, year);
  // Final Expense Summary overrides: per CAM line (by label) + the RET pool.
  const finals = await getFinalOverrides(property, year);

  // From 2026 on, the "workbook" base for each CAM line + RET is the property
  // GL's full-year actual for that account (the prior years stay seeded). A line
  // with no GL entry reads $0 (the GL is the source of truth that year).
  const gl = year >= GL_FROM_YEAR ? await assembledGl(property, year) : null;
  const glFull: Record<string, number> = {};
  if (gl) for (const [acct, nets] of Object.entries(gl.monthly)) glFull[acct] = Math.round(nets.reduce((a, n) => a + (n || 0), 0));
  const glBase = (account: string, seed: number) => (gl ? (glFull[account] ?? 0) : seed);

  const pool = {
    ...fixture.pool,
    camLines: fixture.pool.camLines.map((l) =>
      finals[l.label] != null ? { ...l, amount: finals[l.label] } : { ...l, amount: glBase(l.glAccount, l.amount) },
    ),
    insAmount: poolOverride.insAmount ?? fixture.pool.insAmount,
    retAmount: finals[RET_FINAL_KEY] ?? glBase("6410-8502", fixture.pool.retAmount),
  };

  const tenants = assembleRetail(pool, roster, fixture.gla, configFor);
  const result = reconcileRetailBuilding(pool, tenants);

  // Final Expense Summary rows for the property view: effective amount, seed,
  // and whether it's been overridden (so the page can edit / show a revert).
  // Moving expense-history window: the up-to-3 years before the recon year.
  const histYears = retailHistoryYears(property, year, 3);
  const expenseFinal = {
    historyYears: histYears,
    fromGl: !!gl,
    glImport: gl ? { at: gl.uploadedAt, by: gl.uploadedBy ?? null } : null,
    lines: fixture.pool.camLines.map((l) => {
      const base = glBase(l.glAccount, l.amount);
      return {
        account: l.glAccount,
        label: l.label,
        amount: finals[l.label] ?? base,
        seed: base,
        overridden: finals[l.label] != null,
        history: retailLineHistory(property, l.label, histYears),
      };
    }),
    // Property insurance pool — edited here (stored in poolStore, not finalStore)
    // and shown in the same card, just before RET.
    ins: {
      account: "—",
      label: "Property Insurance",
      amount: pool.insAmount,
      seed: fixture.pool.insAmount,
      overridden: poolOverride.insAmount != null,
      history: retailInsHistory(property, histYears),
    },
    ret: {
      account: "6410",
      label: "Real Estate Taxes",
      amount: finals[RET_FINAL_KEY] ?? glBase("6410-8502", fixture.pool.retAmount),
      seed: glBase("6410-8502", fixture.pool.retAmount),
      overridden: finals[RET_FINAL_KEY] != null,
      history: retailRetHistory(property, histYears),
    },
  };

  // Statement recipients from the master Contacts directory (flagged
  // recipients), CC the internal default — same as the office side.
  const suiteContacts = await getSuiteContactsMap(reconYear.roster.map((u) => u.unitRef));
  const contacts: Record<string, { email: string; cc: string }> = {};
  for (const u of reconYear.roster) {
    contacts[u.unitRef] = { email: camRecipientEmails(suiteContacts[u.unitRef] ?? []), cc: DEFAULT_CC };
  }
  return NextResponse.json({
    result,
    contacts,
    allocation: allocationFor(fixture.pool.propertyCode),
    // expenseFinal carries the editable CAM lines + property insurance + RET
    // pool for the Final Expense Summary card (insurance row included).
    expenseFinal,
  });
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
