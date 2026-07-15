import { NextRequest, NextResponse } from "next/server";
import { reconcileBuilding } from "@/lib/cam/office/compute";
import { nextYearEstimate } from "@/lib/cam/office/exports";
import { assembleTenantInputs, type OfficeLeaseConfig, type ResetInfo, type SnowExclusionInfo } from "@/lib/cam/office/assemble";
import { createMapStore } from "@/lib/collectionStore";
import { OFFICE_RECON_FIXTURES, availableOfficeRecons } from "@/lib/cam/office/registry";
import { getOverrides, mergeConfig, saveOverride } from "@/lib/cam/office/configStore";
import { getUnitConfigs } from "@/lib/cam/office/unitConfig";
import { getContactOverrides, mergeContacts, saveContact } from "@/lib/cam/office/contactStore";
import { DEFAULT_CC } from "@/lib/cam/office/contacts";
import { getSuiteContactsMap } from "@/lib/suites/contactsStorage";
import { camRecipientEmails } from "@/lib/suites/contacts";
import { getExpenseOverrides, saveExpenseField } from "@/lib/cam/office/expenseStore";
import { finalsFromSummary, mergeExpenseSummary, mergeExpenseSummaryFromPool, type ExpenseOverride } from "@/lib/cam/office/expenseSummary";
import { listHistoricalOpEx, upsertHistoricalOpEx } from "@/lib/financials/historical-opex/storage";
import { SEED_EXPENSES, expenseYears } from "@/lib/rentroll/baseYearExpenses";
import { getJSON } from "@/lib/storage";
import { assembledGl } from "@/lib/financials/operating-statements/statementStore";

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

/** Stored snow base-year exclusions keyed by unit ref (same store the tool writes). */
const snowExclusionStore = createMapStore<{ effectiveMonth: number; effectiveYear: number }>({ prefix: "snow-base-exclusions" });
async function loadSnowExclusions(): Promise<Record<string, SnowExclusionInfo>> {
  try {
    const all = await snowExclusionStore.all();
    const out: Record<string, SnowExclusionInfo> = {};
    for (const [unitRef, ex] of Object.entries(all)) {
      if (ex && Number.isFinite(ex.effectiveMonth) && Number.isFinite(ex.effectiveYear)) {
        out[unitRef] = { effectiveMonth: ex.effectiveMonth, effectiveYear: ex.effectiveYear };
      }
    }
    return out;
  } catch { return {}; }
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

  // Precedence (low → high): seed lease config < per-unit lease-level config
  // edited on the tenant detail page (pro-rata share, gross-up — year-
  // agnostic) < per-building/year recon-time override.
  const unitConfigs = await getUnitConfigs();
  const seededWithUnit: Record<string, OfficeLeaseConfig> = {};
  for (const [unitRef, base] of Object.entries(reconYear.leaseConfig)) {
    const uc = unitConfigs[unitRef] ?? {};
    seededWithUnit[unitRef] = {
      ...base,
      ...(uc.proRataPct != null ? { proRataPct: uc.proRataPct } : {}),
      ...(uc.grossUp != null ? { grossUp: uc.grossUp } : {}),
    };
  }

  const overrides = await getOverrides(property, year);
  const config = mergeConfig(seededWithUnit, overrides);
  // Seeded resets, overridden by any recorded via the base-year-reset tool.
  const resets = { ...reconYear.resets, ...(await loadResets()) };
  const snowExclusions = await loadSnowExclusions();
  const tenants = assembleTenantInputs(reconYear.roster, year, config, resets, snowExclusions);

  // The Condo expense (6990) only applies to the JV III condo buildings
  // (3610 / 3620 / 3640); hide it everywhere else (NI LLC + shopping centers).
  const JV_III = new Set(["3610", "3620", "3640"]);
  const pool = JV_III.has(property)
    ? fixture.pool
    : { ...fixture.pool, opexLines: fixture.pool.opexLines.filter((l) => !l.glAccount.startsWith("6990")) };

  // Final Expense Summary. For 2025 the historic operating-expense pool IS the
  // final — the schedule is derived straight from the expense history (every
  // column equals the booked figure, zero variance) and shown read-only; the
  // reconciliation uses the pool directly (no FINAL overrides). The GL/Avid
  // adjustment capability only applies from 2026 on, when a budget/GL pull may
  // differ from the booked history.
  const ADJUSTMENTS_FROM_YEAR = 2026;
  const expenseEditable = year >= ADJUSTMENTS_FROM_YEAR;
  const expenseSummary = (expenseEditable
    ? mergeExpenseSummary(property, year, await getExpenseOverrides(property, year))
    : mergeExpenseSummaryFromPool(pool, year, {})
  ).filter((r) => r.account !== "6990-8502" || JV_III.has(property));
  const finals = expenseEditable && expenseSummary.length ? finalsFromSummary(expenseSummary) : undefined;

  // Trend columns for the Final Expense Summary: the up-to-3 years before the
  // recon year from the already-saved operating-expense history
  // (baseYearExpenses) — the same source the Operating Expense History page
  // uses. Moving window. Per row by GL account (RET from the ret series).
  const hx = SEED_EXPENSES[property];
  const expenseHistoryYears = hx ? expenseYears(hx).filter((y) => y < year).slice(-3).reverse() : [];
  const histValuesFor = (account: string): Record<string, number> => {
    if (!hx) return {};
    if (account.startsWith("6410")) return hx.ret;
    return hx.lines.find((l) => l.glAccount === account)?.values ?? {};
  };
  // Live GL actual per account for the recon year (from the same operating-
  // statement GL store) — a READ-ONLY reference beside the FINAL so staff can
  // reconcile the booked history against what's actually posted. Does not drive
  // the recon math; office FINAL stays on the expense-history dataset.
  const glLive = expenseEditable ? await assembledGl(property, year) : null;
  const glActualByAccount: Record<string, number> = {};
  if (glLive) for (const [acct, nets] of Object.entries(glLive.monthly)) glActualByAccount[acct] = Math.round(nets.reduce((a, n) => a + (n || 0), 0));

  const expenseSummaryWithHistory = expenseSummary.map((r) => ({
    ...r,
    history: expenseHistoryYears.map((hy) => {
      const v = histValuesFor(r.account)[String(hy)];
      return v != null ? v : null;
    }),
    glActual: glLive ? (glActualByAccount[r.account] ?? 0) : null,
  }));

  const result = reconcileBuilding(pool, tenants, year, finals);
  const estimates = result.tenants.map(nextYearEstimate);

  // Statement recipients come from the master Contacts directory on each
  // tenant's rent-roll page (the contacts flagged as CAM/RET recipients), so
  // there's one source of truth. CC is always the internal default (Drew +
  // Greg), applied at send time — not shown per tenant. A legacy per-property
  // override email still wins if one was set before this switch.
  const legacy = mergeContacts(property, await getContactOverrides(property));
  const suiteContacts = await getSuiteContactsMap(result.tenants.map((t) => t.unitRef));
  const contacts: Record<string, { email: string; cc: string }> = {};
  for (const t of result.tenants) {
    const fromDirectory = camRecipientEmails(suiteContacts[t.unitRef] ?? []);
    contacts[t.unitRef] = {
      email: legacy[t.unitRef]?.email || fromDirectory,
      cc: DEFAULT_CC,
    };
  }

  // Data-integrity warnings surfaced to staff:
  //  • an occupied roster unit with no lease config that isn't a declared
  //    exclusion (a tenant silently dropped from the reconciliation), and
  //  • per-tenant warnings from the engine (e.g. base year predating history).
  const warnings: { unitRef: string; name: string; kind: string; message: string }[] = [];
  const excluded = reconYear.excludedUnits ?? {};
  for (const u of reconYear.roster) {
    if (u.isVacant) continue;
    if (config[u.unitRef]) continue;
    if (excluded[u.unitRef]) continue;
    warnings.push({
      unitRef: u.unitRef,
      name: u.occupantName,
      kind: "missing-config",
      message: `${u.occupantName || u.unitRef} (${u.unitRef}) is on the rent roll but has no lease config — it's not being reconciled. Add its base year / pro-rata share, or declare it an intentional exclusion.`,
    });
  }
  for (const t of result.tenants) {
    for (const w of t.dataWarnings ?? []) {
      warnings.push({ unitRef: t.unitRef, name: t.name, kind: "base-year", message: `${t.name} (${t.unitRef}): ${w}` });
    }
  }

  return NextResponse.json({ result, estimates, contacts, expenseSummary: expenseSummaryWithHistory, expenseEditable, expenseHistoryYears, warnings, glImport: glLive ? { at: glLive.uploadedAt, by: glLive.uploadedBy ?? null } : null });
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

    // Final Expense Summary edits are keyed by GL account, not unit. Expense
    // adjustments only apply from 2026 on — for 2025 the historic pool is the
    // final, so reject edits to keep that year locked to the expense history.
    const account = typeof body?.account === "string" ? body.account.trim() : "";
    if (account && (field === "excelAvid" || field === "final" || field === "description")) {
      if (year < 2026) {
        return NextResponse.json({ error: "Expense adjustments apply from 2026 on; 2025 uses the expense history as final." }, { status: 400 });
      }
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
      // Base year and escrow (billed in whole dollars) round to integers;
      // pro-rata share keeps its decimals.
      value = field === "baseYear" || field === "opexEscrow" || field === "retEscrow" ? Math.round(n) : n;
    }

    await saveOverride(property, year, unitRef, { [field]: value });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
