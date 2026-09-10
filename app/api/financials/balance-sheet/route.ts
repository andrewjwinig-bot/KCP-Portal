import { NextResponse } from "next/server";
import { assembledGlConsolidated, listGls, mergeAccountNames } from "@/lib/financials/operating-statements/statementStore";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { computeBalanceSheet } from "@/lib/financials/balance-sheet/compute";
import { getBsOverrides, setBsOverride } from "@/lib/financials/balance-sheet/overrideStore";
import { BS_GROUPS } from "@/lib/financials/balance-sheet/classify";
import { listLoans } from "@/lib/debt/storage";
import { scheduleBalanceAt } from "@/lib/debt/amortization";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Gated by SENSITIVE_API_PREFIXES: /api/financials → /financials, the same
// statement-page capability that governs the Operating Statement this sheet
// is delivered alongside.

/**
 * GET
 *   (no params) → the picker: every property with a GL, and the years it has.
 *   ?key&year[&month] → the balance sheet, plus the debt-schedule cross-check.
 * POST { key, account, group } → move one account (group "" keeps it off the
 *   sheet, null clears the correction).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const year = Number(url.searchParams.get("year"));

  const metas = await listGls();

  if (!key || !Number.isFinite(year)) {
    const mapped = await availableStatements();
    const byKey = new Map<string, Set<number>>();
    for (const m of metas) (byKey.get(m.key) ?? byKey.set(m.key, new Set()).get(m.key)!).add(m.year);
    const properties = mapped
      .filter((p) => byKey.has(p.key))
      .map((p) => ({
        key: p.key,
        name: PROPERTY_DEFS.find((d) => d.id === p.key)?.name ?? p.entityName,
        entityName: p.entityName,
        years: [...(byKey.get(p.key) ?? [])].sort((a, b) => b - a),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
    return NextResponse.json({ ok: true, properties, groups: BS_GROUPS });
  }

  const gl = await assembledGlConsolidated(key, year);
  if (!gl) return NextResponse.json({ ok: true, sheet: null, groups: BS_GROUPS, reason: "No General Ledger uploaded for this property and year." });

  // A GL uploaded before account-name capture has no names of its own. Codes
  // are consistent across properties, so a name captured anywhere labels the
  // same account here — the sheet stays readable instead of showing bare codes.
  const names = { ...mergeAccountNames(metas), ...(gl.names ?? {}) };

  const overrides = await getBsOverrides(key);
  const monthParam = Number(url.searchParams.get("month"));
  const sheet = computeBalanceSheet(
    { ...gl, names },
    { key, year, asOfMonth: Number.isFinite(monthParam) ? monthParam : undefined, overrides },
  );

  // Cross-check the ledger's mortgage balance against the debt schedule, which
  // is maintained independently from the lender's own statements. Two sources
  // agreeing is the strongest evidence the figure being certified is right;
  // disagreeing usually means a principal payment posted to the wrong month.
  const loans = (await listLoans()).filter((l) => l.property === key);
  const rows = loans.map((l) => ({
    id: l.id,
    lender: l.lender,
    collateral: l.collateral,
    /** null when the schedule starts after the as-of date — see scheduleBalanceAt. */
    projectedBalance: scheduleBalanceAt(l, sheet.asOfDate),
    anchorDate: l.anchorDate,
  }));
  // Only compare when EVERY loan can state a balance for this date. A partial
  // total read against the ledger's full mortgage balance would look like a
  // discrepancy and be nothing of the kind.
  const comparable = rows.length > 0 && rows.every((r) => r.projectedBalance != null);
  const debtCheck = rows.length
    ? {
        loans: rows,
        comparable,
        scheduleTotal: comparable ? rows.reduce((t, r) => t + (r.projectedBalance ?? 0), 0) : null,
        ledgerTotal: sheet.liabilities.find((g) => g.key === "mortgage")?.total ?? 0,
        /** The earliest date the schedule can speak to, when it cannot speak to this one. */
        earliestDate: rows.reduce((d, r) => (r.anchorDate > d ? r.anchorDate : d), ""),
      }
    : null;

  return NextResponse.json({
    ok: true,
    sheet,
    groups: BS_GROUPS,
    overrides,
    debtCheck,
    property: {
      key,
      name: PROPERTY_DEFS.find((d) => d.id === key)?.name ?? key,
      entityName: (await availableStatements()).find((p) => p.key === key)?.entityName ?? key,
      ein: PROPERTY_DEFS.find((d) => d.id === key)?.ein ?? null,
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const key = String(body?.key ?? "").trim();
  const account = String(body?.account ?? "").trim();
  if (!key || !account) return NextResponse.json({ error: "key and account are required" }, { status: 400 });
  const group = body?.group === null ? null : String(body?.group ?? "");
  const overrides = await setBsOverride(key, account, group);
  return NextResponse.json({ ok: true, overrides });
}
