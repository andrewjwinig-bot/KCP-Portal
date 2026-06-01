import { NextRequest, NextResponse } from "next/server";
import { reconcileBuilding } from "@/lib/cam/office/compute";
import { nextYearEstimate } from "@/lib/cam/office/exports";
import { assembleTenantInputs, type OfficeLeaseConfig, type ResetInfo } from "@/lib/cam/office/assemble";
import { OFFICE_RECON_FIXTURES, availableOfficeRecons } from "@/lib/cam/office/registry";
import { getOverrides, mergeConfig, saveOverride } from "@/lib/cam/office/configStore";
import { getContactOverrides, mergeContacts, saveContact } from "@/lib/cam/office/contactStore";
import { getExpenseOverrides, saveExpenseField } from "@/lib/cam/office/expenseStore";
import { finalsFromSummary, mergeExpenseSummary, type ExpenseOverride } from "@/lib/cam/office/expenseSummary";
import { listHistoricalOpEx, upsertHistoricalOpEx } from "@/lib/financials/historical-opex/storage";
import { getJSON } from "@/lib/storage";

/** Record a FINAL into the historical OpEx dataset for the recon year only,
 *  preserving every other year — prior years are already adjusted and stay
 *  locked. Matches an existing line by GL account, then by label. */
async function syncFinalToHistory(property: string, year: number, account: string, label: string, final: number) {
  const all = await listHistoricalOpEx();
  const existing =
    all.find((e) => e.glAccount && e.glAccount === account) ??
    all.find((e) => e.lineLabel.toLowerCase() === label.toLowerCase());
  const yearly = { ...(existing?.yearly ?? {}), [String(year)]: final };
  await upsertHistoricalOpEx({
    propertyCode: property,
    lineLabel: existing?.lineLabel ?? label,
    glAccount: account,
    yearly,
    source: existing?.source ?? "CAM reconciliation FINAL",
    updatedAt: new Date().toISOString(),
  });
}

/** Stored base-year resets keyed by unit ref. */
async function loadResets(): Promise<Record<string, ResetInfo>> {
  const s = (await getJSON("base-year-resets", "all")) as
    | { resets?: Record<string, { resetDate: string; originalBaseYear: number | null; newBaseYear: number }> }
    | null;
  return s?.resets ?? {};
}

export const runtime = "nodejs";

/** GET /api/cam-recon/office
 *    → { available: [{ propertyCode, name, years }] }
 *  GET /api/cam-recon/office?property=4070&year=2025
 *    → { result: BuildingReconResult, estimates: NextYearEstimate[] }
 *
 *  Assembles tenant inputs from the rent-roll roster + the lease config
 *  (seed merged with stored per-unit edits), reconciles server-side. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const property = searchParams.get("property");
  const year = Number(searchParams.get("year"));

  if (!property) {
    return NextResponse.json({ available: availableOfficeRecons() });
  }

  const fixture = OFFICE_RECON_FIXTURES[property];
  const reconYear = fixture?.byYear[year];
  if (!fixture || !reconYear) {
    return NextResponse.json({ error: `No ${year} recon for ${property}` }, { status: 404 });
  }

  const overrides = await getOverrides(property, year);
  const config = mergeConfig(reconYear.leaseConfig, overrides);
  const resets = await loadResets();
  const tenants = assembleTenantInputs(reconYear.roster, year, config, resets);

  // Final Expense Summary → per-account FINALs drive the current-year pool.
  const expenseSummary = mergeExpenseSummary(property, year, await getExpenseOverrides(property, year));
  const finals = expenseSummary.length ? finalsFromSummary(expenseSummary) : undefined;

  const result = reconcileBuilding(fixture.pool, tenants, year, finals);
  const estimates = result.tenants.map(nextYearEstimate);
  const contacts = mergeContacts(property, await getContactOverrides(property));
  return NextResponse.json({ result, estimates, contacts, expenseSummary });
}

const EDITABLE_FIELDS = new Set<keyof OfficeLeaseConfig>([
  "baseYear", "grossUp", "proRataPct", "opexEscrow", "retEscrow",
]);

/** POST /api/cam-recon/office
 *  Body: { property, year, unitRef, field, value }
 *  Saves a single per-unit lease-config override. value null clears it
 *  (revert to the seed / computed default). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const property = String(body?.property ?? "");
    const year = Number(body?.year);
    const unitRef = String(body?.unitRef ?? "");
    const field = String(body?.field ?? "");

    if (!OFFICE_RECON_FIXTURES[property]?.byYear[year]) {
      return NextResponse.json({ error: "Unknown property/year" }, { status: 400 });
    }

    // Final Expense Summary edits are keyed by GL account, not unit.
    const account = typeof body?.account === "string" ? body.account.trim() : "";
    if (account && (field === "excelAvid" || field === "final" || field === "description")) {
      let value: number | string | null;
      if (body?.value === null || body?.value === "") value = null;
      else if (field === "description") value = String(body.value).slice(0, 200);
      else {
        const n = Number(body.value);
        if (!Number.isFinite(n)) return NextResponse.json({ error: "Invalid value" }, { status: 400 });
        value = Math.round(n * 100) / 100;
      }
      await saveExpenseField(property, year, account, field as keyof ExpenseOverride, value);
      // Record the effective FINAL into history for this year only (prior
      // years stay locked).
      if (field === "final") {
        const merged = mergeExpenseSummary(property, year, await getExpenseOverrides(property, year));
        const row = merged.find((r) => r.account === account);
        if (row) await syncFinalToHistory(property, year, account, row.label, row.final);
      }
      return NextResponse.json({ ok: true });
    }

    // Contact fields (email / cc) are strings stored per-property, separate
    // from the per-year lease config.
    if (field === "email" || field === "cc") {
      const value = typeof body?.value === "string" ? body.value.trim().slice(0, 300) : "";
      await saveContact(property, unitRef, { [field]: value });
      return NextResponse.json({ ok: true });
    }

    if (!unitRef || !EDITABLE_FIELDS.has(field as keyof OfficeLeaseConfig)) {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 });
    }

    // Coerce per field type; null clears the override.
    let value: number | boolean | null;
    if (body?.value === null || body?.value === "") {
      value = null;
    } else if (field === "grossUp") {
      value = body.value === true || body.value === "true";
    } else {
      const n = Number(body.value);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: "Invalid value" }, { status: 400 });
      }
      value = field === "baseYear" ? Math.round(n) : n;
    }

    await saveOverride(property, year, unitRef, { [field]: value });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
