import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseGeneralLedgerMonthly, parseGeneralLedgerByYear, summaryForPeriod, reconcileGl, type GlReconciliation } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { availableStatements, getMapping, resolveStatementKey } from "@/lib/financials/operating-statements/mappingStore";
import { resolvePropertyBudget, makeBudgetLookup } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { saveGl, getGl, versionsFor, listFullGls, mergeAccountNames, getNotesBundle, saveNote, saveTransactions, getDismissedFlags, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { detectPostingFormat, parsePostingReport } from "@/lib/financials/operating-statements/postingReport";
import { savePostingDelta, type PostingDelta } from "@/lib/financials/operating-statements/postingDeltaStore";
import crypto from "node:crypto";
import { cashAtStartOfMonth } from "@/lib/financials/operating-statements/cash";
import { lineMonthly } from "@/lib/financials/operating-statements/lineSeries";
import { trendFlags } from "@/lib/financials/operating-statements/trends";
import { mortgagePaymentsFor } from "@/lib/financials/cash-sheet/mortgage";
import { PROPERTY_DEFS, ALLOC_PCT } from "@/lib/properties/data";
import { FUND_BUILDINGS } from "@/lib/financials/cash-analysis/funds";
import { logAudit, auditIp } from "@/lib/audit";
import { savePendingGl } from "@/lib/allocated-invoicer/pendingGlStore";
import { markTaskComplete } from "@/lib/tracker/completionStore";
import { expectedPostedThrough } from "@/lib/financials/operating-statements/outstanding";
import { recordImport } from "@/lib/tracker/importEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function propertyName(key: string, fallback: string): string {
  return PROPERTY_DEFS.find((p) => p.id === key)?.name ?? fallback;
}

/** Compact 12-month + full-year-total payload for the Operating Statements
 *  "Full Year" period option. Each figure is display-oriented (revenue +,
 *  expense +), matching the single-month statement and the reprojection. */
type FullYearCell = { monthly: number[]; total: number; budget: number | null; variance: number | null };
type FullYearPayload = {
  sections: {
    name: string;
    role: import("@/lib/financials/operating-statements/types").SectionRole;
    lines: { label: string; mask: string; accounts: string[]; monthly: number[]; total: number; budget: number | null; variance: number | null }[];
    subtotalMonthly: number[];
    subtotalTotal: number;
    subtotalBudget: number | null;
    subtotalVariance: number | null;
  }[];
  rollups: Record<
    "totalRevenues" | "totalOperatingExpenses" | "netOperatingIncome" | "cashFlowBeforeDebtService" | "totalDebtService" | "cashFlowAfterDebtService",
    FullYearCell
  >;
};


/** Sum several entities' GLs (shell + buildings) into one consolidated GL —
 *  account-level addition of monthly nets, beginning + YTD balances. P&L masks
 *  match across the office buildings; inter-entity accounts aren't on the P&L. */
function combineGls(gls: StoredGl[]): StoredGl {
  const monthly: Record<string, number[]> = {};
  const beginning: Record<string, number> = {};
  const ytdTotal: Record<string, number> = {};
  const names: Record<string, string> = {};
  let maxPeriodInFile = 0, coverageEnd = 0;
  let coverageStartMonth: number | undefined;
  for (const g of gls) {
    for (const [a, nets] of Object.entries(g.monthly)) {
      const arr = (monthly[a] ??= new Array(12).fill(0));
      for (let i = 0; i < 12; i++) arr[i] += nets[i] ?? 0;
    }
    if (g.beginning) for (const [a, v] of Object.entries(g.beginning)) beginning[a] = (beginning[a] ?? 0) + v;
    if (g.ytdTotal) for (const [a, v] of Object.entries(g.ytdTotal)) ytdTotal[a] = (ytdTotal[a] ?? 0) + v;
    if (g.names) for (const [a, n] of Object.entries(g.names)) if (n && !names[a]) names[a] = n;
    maxPeriodInFile = Math.max(maxPeriodInFile, g.maxPeriodInFile || 0);
    coverageEnd = Math.max(coverageEnd, g.coverageEnd ?? g.maxPeriodInFile ?? 0);
    if (g.coverageStartMonth != null) coverageStartMonth = Math.min(coverageStartMonth ?? 12, g.coverageStartMonth);
  }
  return { ...gls[gls.length - 1], monthly, beginning, ytdTotal, names, maxPeriodInFile, coverageEnd, coverageStartMonth };
}

// GET — without params: the picker payload (every mapped property/fund + which
// have uploads + the years available). With ?key&year[&period][&version]:
// the computed statement for that selection.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const year = Number(url.searchParams.get("year"));

  const [mappings, fulls] = await Promise.all([availableStatements(), listFullGls()]);
  const yearsByKey = new Map<string, Set<number>>();
  const byKeyYear = new Map<string, Map<number, StoredGl[]>>();
  for (const g of fulls) {
    if (!yearsByKey.has(g.key)) yearsByKey.set(g.key, new Set());
    yearsByKey.get(g.key)!.add(g.year);
    let ym = byKeyYear.get(g.key);
    if (!ym) byKeyYear.set(g.key, (ym = new Map()));
    const arr = ym.get(g.year);
    if (arr) arr.push(g); else ym.set(g.year, [g]);
  }
  // Latest imported period per property — the last ACTUAL month (assembled
  // across uploads), so a full-year GL range doesn't read as "December".
  const latestByKey = new Map<string, { year: number; period: number }>();
  for (const [k, ym] of byKeyYear) {
    const latestYear = Math.max(...ym.keys());
    const asm = assembleGls(ym.get(latestYear)!);
    if (asm) latestByKey.set(k, { year: latestYear, period: asm.maxPeriodInFile });
  }
  const available = mappings.map((m) => ({
    key: m.key,
    propertyCode: m.propertyCode,
    entityName: m.entityName,
    name: propertyName(m.key, m.entityName),
    years: [...(yearsByKey.get(m.key) ?? [])].sort((a, b) => b - a),
    latest: latestByKey.get(m.key) ?? null,
  }));

  // Coverage matrix — per property, per year, how many months are imported
  // (0 = none). Powers the "what still needs uploading" grid for backfills.
  const coverageByKey = new Map<string, Record<number, number>>();
  for (const [k, ym] of byKeyYear) {
    const rec: Record<number, number> = {};
    for (const [yr, arr] of ym) { const asm = assembleGls(arr); if (asm) rec[yr] = asm.maxPeriodInFile; }
    coverageByKey.set(k, rec);
  }
  const coverage = mappings.map((m) => {
    const fundParts = FUND_BUILDINGS[m.key];
    let years = coverageByKey.get(m.key) ?? {};
    if (fundParts) {
      // A fund has no GL of its own — a year is covered only to the MIN period
      // across its member buildings (all members needed for a full consolidation).
      const rec: Record<number, number> = {};
      const allYears = new Set<number>();
      for (const mem of fundParts) for (const y of Object.keys(coverageByKey.get(mem) ?? {})) allYears.add(Number(y));
      for (const y of allYears) rec[y] = Math.min(...fundParts.map((mem) => (coverageByKey.get(mem) ?? {})[y] ?? 0));
      years = rec;
    }
    return { key: m.key, propertyCode: m.propertyCode, name: propertyName(m.key, m.entityName), isFund: !!fundParts, years };
  });

  if (!key || !year) return NextResponse.json({ available, coverage });

  const mapping = await getMapping(key);
  if (!mapping) return NextResponse.json({ available, error: "No mapping for that property" }, { status: 404 });

  const versionId = url.searchParams.get("version");
  // Default view merges every uploaded month (cumulative or month-by-month);
  // picking a specific version shows just that upload. Reuse `fulls` (already
  // loaded) for the merge — current year and the prior year for YoY signals.
  // A fund key rolls up its member buildings + the shell into one consolidated
  // GL (the shell holds only swept cash; the buildings hold the P&L + debt).
  const fundParts = FUND_BUILDINGS[key];
  const assembleFor = (k: string, yr: number) => assembleGls(fulls.filter((g) => g.key === k && g.year === yr));
  const consolidateFund = (yr: number): StoredGl | null => {
    const parts = [key, ...fundParts!].map((k) => assembleFor(k, yr)).filter((g): g is StoredGl => !!g);
    return parts.length ? combineGls(parts) : null;
  };
  const stored = versionId ? await getGl(versionId) : (fundParts ? consolidateFund(year) : assembleFor(key, year));
  const storedPY = versionId ? null : (fundParts ? consolidateFund(year - 1) : assembleFor(key, year - 1));
  const versions = await versionsFor(key, year);
  if (!stored) {
    return NextResponse.json({ available, versions, statement: null, message: "No GL uploaded for this property/year yet." });
  }

  const requested = Number(url.searchParams.get("period")) || stored.maxPeriodInFile;
  const period = Math.min(Math.max(1, requested), stored.maxPeriodInFile);
  const gl = summaryForPeriod(stored.monthly, period);

  // Starting Cash — OPENING balance of the Cash-Operating account (0110-0000)
  // for the selected month: the year's opening + net activity of every prior
  // month, so a multi-month GL shows the true running balance for each month
  // (Mar-open, Apr-open, …) rather than one static year-end figure. Shared with
  // the Cash Sheet so the two always agree. Null for uploads with no captured
  // opening balance (older files). Balance-sheet account → not on the P&L.
  const operatingCash = cashAtStartOfMonth(stored, period);

  // Budget columns: line up to the portal budget via the same masks. Falls back
  // to the nearest available budget year (so a 2025 sample shows the 2026
  // budget); the page labels the year used.
  // For a fund key, resolve the budget across its member buildings (the same
  // set the GL consolidates) so a fund statement gets a consolidated budget
  // instead of "no budget" — the budget is stored per member building, not
  // under the fund code.
  const budgetCodes = fundParts ? [key, ...fundParts, mapping.propertyCode] : mapping.propertyCode;
  const budget = await resolvePropertyBudget(budgetCodes, year);
  // Only compare against a SAME-YEAR budget. A different year's budget (the
  // nearest-year fallback) is misleading on a statement — comparing, say, 2024
  // actuals to the 2026 plan — so when the only budget is another year we hide
  // the Budget/Variance columns instead. Import that year's budget to compare.
  const sameYearBudget = budget && !budget.fallback ? budget : null;
  const budgetHidden = !!(budget && budget.fallback);
  const budgetLookup = sameYearBudget ? makeBudgetLookup(sameYearBudget, period) : undefined;
  const { notes, sources: rawSources, meta: noteMeta } = await getNotesBundle(key, year, period);
  // Every existing note gets a source. A note with no recorded source can only
  // be an AI note — manual saves always stamp "user" — so default missing to
  // "ai". Keeps the ✨ on auto-explained notes across refreshes (incl. notes
  // written before sources were tracked), and self-corrects: a manual edit
  // flips it to "user" and drops the sparkle.
  const noteSources: Record<string, "user" | "ai"> = {};
  for (const lk of Object.keys(notes)) noteSources[lk] = rawSources[lk] ?? "ai";

  const statement = computeStatement({
    mapping,
    propertyName: propertyName(key, mapping.entityName),
    year,
    period,
    gl,
    budgetLookup,
  });
  // "Looks off this month" markers — a "?" on lines whose amount jumps vs recent
  // months or swings vs the same month last year. (Cheap: amount + YoY only; the
  // richer transaction-count checks run inside auto-explain.) Lines the user has
  // investigated + dismissed are suppressed.
  const dismissed = new Set(await getDismissedFlags(key, year, period));
  for (const sec of statement.sections) {
    const sign = sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1;
    for (const l of sec.lines) {
      if (dismissed.has(`${sec.name}::${l.label}`)) continue;
      const amounts = lineMonthly(stored.monthly, l.mask, sign, period);
      const pyAmounts = storedPY ? lineMonthly(storedPY.monthly, l.mask, sign, 12) : [];
      const pySame = pyAmounts.length >= period ? pyAmounts[period - 1] : null;
      const flags = trendFlags(amounts, [], amounts[period - 1] ?? null, pySame);
      if (flags.length) l.flags = flags;
    }
  }

  // Full-Year view — 12 monthly columns + a full-year total, all from the SAME
  // engine as the single-month statement. Each month's column is that month's
  // `periodActual`; the Full-Year total/budget/variance are the year's figures
  // through December. This ties out to the Reprojections "Full-Year Actuals"
  // for a closed year BY CONSTRUCTION: both share the line masks, the roleSign,
  // and the consolidated GL — reproject.actual[i] === this month's periodActual,
  // and the Full-Year total === Σ of the 12 months === reproject.reprojTotal.
  let fullYear: FullYearPayload | null = null;
  if (url.searchParams.get("fullYear") === "1") {
    const nameFor = propertyName(key, mapping.entityName);
    const perMonth = Array.from({ length: 12 }, (_, i) =>
      computeStatement({ mapping, propertyName: nameFor, year, period: i + 1, gl: summaryForPeriod(stored.monthly, i + 1) })
    );
    // Period 12 gives the section/line structure + full-year figures (ytdActual
    // through December, ytdBudget = Σ of the 12 budget months = reproject's
    // budgetTotal, ytdVariance = the favorability-signed full-year variance).
    const full = computeStatement({
      mapping, propertyName: nameFor, year, period: 12,
      gl: summaryForPeriod(stored.monthly, 12),
      budgetLookup: sameYearBudget ? makeBudgetLookup(sameYearBudget, 12) : undefined,
    });
    const ROLLUP_KEYS = ["totalRevenues", "totalOperatingExpenses", "netOperatingIncome", "cashFlowBeforeDebtService", "totalDebtService", "cashFlowAfterDebtService"] as const;
    fullYear = {
      sections: full.sections.map((s, si) => ({
        name: s.name,
        role: s.role,
        lines: s.lines.map((l, li) => ({
          label: l.label,
          mask: l.mask,
          accounts: l.accounts,
          monthly: perMonth.map((pm) => pm.sections[si].lines[li].periodActual),
          total: l.ytdActual,
          budget: l.ytdBudget,
          variance: l.ytdVariance,
        })),
        subtotalMonthly: perMonth.map((pm) => pm.sections[si].subtotal.periodActual),
        subtotalTotal: s.subtotal.ytdActual,
        subtotalBudget: s.subtotal.ytdBudget,
        subtotalVariance: s.subtotal.ytdVariance,
      })),
      rollups: Object.fromEntries(ROLLUP_KEYS.map((rk) => [rk, {
        monthly: perMonth.map((pm) => pm.rollups[rk].periodActual),
        total: full.rollups[rk].ytdActual,
        budget: full.rollups[rk].ytdBudget,
        variance: full.rollups[rk].ytdVariance,
      }])) as FullYearPayload["rollups"],
    };
  }

  // Label the unmapped (non-operating) accounts with their GL account name,
  // falling back to names captured on any other property's GL (codes are shared).
  const acctNames = mergeAccountNames(fulls);
  statement.unmappedAccounts = statement.unmappedAccounts.map((u) => ({
    ...u,
    name: stored.names?.[u.account] ?? acctNames[u.account] ?? null,
  }));

  // Debt check — this property carries a loan (scheduled P&I from the Debt
  // Tracker) but $0 debt service posted this month means the charge is missing.
  const debtByCode = await mortgagePaymentsFor(year, period);
  const scheduledDebt = debtByCode[key.toUpperCase()] ?? debtByCode[(mapping.propertyCode || "").toUpperCase()] ?? 0;
  let postedDebt = 0;
  for (const sec of statement.sections) {
    if (sec.role === "debt-service") for (const l of sec.lines) postedDebt += l.periodActual;
  }
  const debtCheck = { scheduled: scheduledDebt, posted: postedDebt, missing: scheduledDebt > 0 && Math.round(postedDebt) === 0 };

  // Allocated G&A — this property's slice of the 2000 G&A pool (accounts ending
  // -9301/-9302/-9303) for the period, by the 9303 basis (ALLOC_PCT). It's a
  // MEMO, not folded into the GL-based totals: the cost posts to this property's
  // own GL only once the allocation invoice is processed, so folding it in would
  // double-count. Surfaced so the coming overhead is visible on the statement.
  const allocPct = ALLOC_PCT[mapping.propertyCode]?.["9303"] ?? 0;
  let allocatedGA: { pct: number; periodShare: number; ytdShare: number; poolPeriod: number; poolYtd: number } | null = null;
  if (allocPct > 0) {
    const gl2000 = assembleGls(fulls.filter((g) => g.propertyCode === "2000" && g.year === year));
    if (gl2000) {
      let poolPeriod = 0, poolYtd = 0;
      for (const [acct, nets] of Object.entries(gl2000.monthly)) {
        if (!/-(9301|9302|9303)$/.test(acct)) continue;
        poolPeriod += nets[period - 1] ?? 0;
        for (let i = 0; i < period; i++) poolYtd += nets[i] ?? 0;
      }
      if (Math.abs(poolPeriod) > 0.5 || Math.abs(poolYtd) > 0.5) {
        allocatedGA = { pct: allocPct, periodShare: poolPeriod * allocPct, ytdShare: poolYtd * allocPct, poolPeriod, poolYtd };
      }
    }
  }

  return NextResponse.json({
    debtCheck,
    allocatedGA,
    available,
    versions,
    selectedVersion: stored.id,
    maxPeriodInFile: stored.maxPeriodInFile,
    uploadedAt: stored.uploadedAt,
    uploadedBy: stored.uploadedBy ?? null,
    budgetYear: budget?.budgetYear ?? null,
    budgetFallback: budget?.fallback ?? false,
    budgetHidden,
    notes,
    noteSources,
    noteMeta,
    operatingCash,
    statement,
    fullYear,
  });
}

// PATCH — save (or clear) a line note. Keyed by property/year/PERIOD + line key.
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { key, year, period, lineKey, note, editedBy } = body ?? {};
    if (!key || !year || !period || !lineKey) {
      return NextResponse.json({ error: "key, year, period and lineKey are required" }, { status: 400 });
    }
    await saveNote(String(key), Number(year), Number(period), String(lineKey), typeof note === "string" ? note : "", "user", typeof editedBy === "string" ? editedBy : undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save note" }, { status: 500 });
  }
}

/** Import one Skyline Posting Report (single-property A/P or multi-property GL):
 *  parse it, resolve each property to its mapping key, and store a per-property
 *  interim delta. Reports which months are new vs already covered by a full GL
 *  (the full GL wins). Idempotent by content id. */
async function importPostingReport(
  rows: (string | number | null)[][],
  file: File,
  form: FormData,
  req: Request,
): Promise<NextResponse> {
  const parsed = parsePostingReport(rows);
  if (!parsed.year) {
    return NextResponse.json({ error: "Could not read a reporting year from the posting report." }, { status: 400 });
  }
  const uploadedByRaw = form.get("uploadedBy");
  const uploadedBy = typeof uploadedByRaw === "string" ? uploadedByRaw : undefined;
  const ts = new Date().toISOString();
  const year = parsed.year;
  const fulls = await listFullGls();

  const applied: { property: string; key: string; newMonths: number[]; heldMonths: number[] }[] = [];
  const skipped: { property: string; reason: string }[] = [];

  for (const prop of parsed.properties) {
    const key = await resolveStatementKey(prop.property);
    if (!key) { skipped.push({ property: prop.property, reason: "no statement mapping" }); continue; }

    // Which months a full GL already covers for this property/year (it wins).
    const base = assembleGls(fulls.filter((g) => g.key === key && g.year === year));
    const covered = base?.coverageEnd ?? base?.maxPeriodInFile ?? 0;
    const newMonths = prop.months.filter((m) => m > covered);
    const heldMonths = prop.months.filter((m) => m <= covered);

    const id = crypto.createHash("sha1")
      .update(JSON.stringify({ key, year, postThru: parsed.postThru, monthly: prop.monthly }))
      .digest("hex").slice(0, 16);
    const rec: PostingDelta = {
      id: `pd-${key}-${year}-${id}`,
      key, year, importedAt: ts, importedBy: uploadedBy,
      postThru: parsed.postThru, sourceName: file.name,
      monthly: prop.monthly, transactions: prop.transactions, months: prop.months,
    };
    await savePostingDelta(rec);
    applied.push({ property: prop.property, key, newMonths, heldMonths });
  }

  await logAudit({ event: "gl.posting-report", user: uploadedBy ?? "import", ip: auditIp(req), detail: `${file.name} · ${applied.length} properties · ${year}` });

  return NextResponse.json({
    ok: true,
    postingReport: true,
    format: parsed.format,
    balanced: parsed.balanced,
    year,
    postThru: parsed.postThru,
    applied,
    skipped,
    propertyCount: applied.length,
  });
}

// POST — multipart upload of one property's Skyline GL export. Parses, stores a
// new version, and returns its metadata. One file per property; versions kept.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as (string | number | null)[][];

    // A Skyline "Posting Report" is an interim journal feed between full GL
    // uploads — parse it and store per-property deltas rather than a full GL.
    if (detectPostingFormat(rows)) {
      return await importPostingReport(rows, file, form, req);
    }

    // Split into one GlMonthly PER YEAR the file covers — a Multi-Year GL
    // spanning several years imports each year on its own; a single-year file
    // yields a one-element array (unchanged behaviour). The range's END year is
    // the primary (used for header/key resolution + the month-close hooks).
    const parsedYears = parseGeneralLedgerByYear(rows);
    const primary = parsedYears[parsedYears.length - 1];
    // The GL header's Property/Company code is authoritative; fall back to the
    // viewing selection only if the header had none.
    const keyRaw = form.get("key");
    const rawCode = primary.propertyCode || (typeof keyRaw === "string" && keyRaw.trim() ? keyRaw.trim() : null);
    if (!rawCode) {
      return NextResponse.json({ error: "Could not determine the property — the GL header had no Property/Company code." }, { status: 400 });
    }
    if (!primary.year) {
      return NextResponse.json({ error: "Could not read the reporting year from the GL header." }, { status: 400 });
    }
    // Resolve the GL's property code to the canonical mapping key (handles fund
    // ledgers whose header code differs, e.g. FJVIII → PJV3, PIIICO → CONDO).
    const key = await resolveStatementKey(rawCode);
    if (!key) {
      return NextResponse.json({ error: `No statement mapping exists for property ${rawCode}.` }, { status: 400 });
    }

    const uploadedByRaw = form.get("uploadedBy");
    const uploadedBy = typeof uploadedByRaw === "string" ? uploadedByRaw : undefined;
    // "Monthly totals only" — skip storing the (storage-heavy) transaction
    // detail. The monthly nets that power every statement/comparison are still
    // saved; only the per-line drill-down is unavailable for this import.
    const leanRaw = form.get("lean");
    const lean = leanRaw === "1" || leanRaw === "true";
    const ts = new Date().toISOString();

    // Store each year separately + reconcile each; aggregate the tie-out.
    const savedYears: { year: number; maxPeriodInFile: number; accounts: number; reconciliation: { checked: number; reconciled: number; mismatchCount: number; mismatches: GlReconciliation["mismatches"] } }[] = [];
    let aggChecked = 0, aggReconciled = 0;
    const aggMismatches: GlReconciliation["mismatches"] = [];
    for (const py of parsedYears) {
      if (!py.year) continue;
      const rec = reconcileGl(py);
      aggChecked += rec.checked; aggReconciled += rec.reconciled; aggMismatches.push(...rec.mismatches);
      const id = `gl-${key}-${py.year}-${Date.now()}`;
      await saveGl({
        id, key, propertyCode: py.propertyCode, year: py.year, uploadedAt: ts, uploadedBy,
        fileName: file.name, maxPeriodInFile: py.maxPeriodInFile,
        monthly: py.monthly, beginning: py.beginning, ytdTotal: py.ytdTotal, names: py.names,
        transactionsStored: !lean,
      });
      if (!lean) await saveTransactions(id, py.transactions);
      savedYears.push({ year: py.year, maxPeriodInFile: py.maxPeriodInFile, accounts: Object.keys(py.monthly).length, reconciliation: { checked: rec.checked, reconciled: rec.reconciled, mismatchCount: rec.mismatches.length, mismatches: rec.mismatches.slice(0, 8) } });
    }
    const recon = { checked: aggChecked, reconciled: aggReconciled, mismatchCount: aggMismatches.length, mismatches: aggMismatches.slice(0, 8) };
    await logAudit({ event: "gl.upload", user: uploadedBy ?? key, ip: auditIp(req), detail: `${key} ${savedYears.map((s) => s.year).join(",")} · ${file.name}` });

    // The 2000 G&A GL is the same Detailed GL the Allocated Expense Invoicer
    // runs on. Stash it so the invoicer can pick it up (prompt to generate the
    // allocated invoices) instead of re-uploading the identical file.
    // Exporting a month's Detailed GL from Skyline is only possible AFTER posting
    // + closing that period — so importing the prior-month GL is proof those
    // tracker tasks are done. When the GL brings a property current through the
    // expected prior month, auto-complete Post PM & AP, Close Prior Month, and
    // Operating Statements for the month the work falls in (idempotent).
    let tasksCompleted: string[] = [];
    try {
      const now = new Date();
      const expected = expectedPostedThrough(now);
      if (primary.year === expected.year && primary.maxPeriodInFile === expected.period) {
        tasksCompleted = ["m-post", "m-close", "m-opstmt"];
        for (const taskId of tasksCompleted) {
          await markTaskComplete(now.getFullYear(), now.getMonth(), taskId, { at: now.toISOString(), source: "gl-upload" });
        }
      }
    } catch { /* best-effort — the statement upload still succeeds */ }

    // Mark the GL import reminder satisfied (and the 2000 G&A GL reminder when
    // it's the G&A entity) for the weekly digest / dashboard.
    const importedBy = typeof uploadedByRaw === "string" ? uploadedByRaw : null;
    try { await recordImport("imp-gl", { at: ts, by: importedBy }); } catch { /* best-effort */ }

    // The G&A ledger is the only one carrying the 9301/9302/9303 allocation
    // accounts, so detect it by content too — not just a literal "2000" code
    // (the header company code can differ). This is what the Allocated Expense
    // Invoicer runs on, so a match hands the file off to it.
    const hasAllocAccounts = Object.keys(primary.monthly).some((a) => /-(9301|9302|9303)$/.test(a));
    const isGandA = rawCode === "2000" || primary.propertyCode === "2000" || key === "2000" || hasAllocAccounts;
    if (isGandA) {
      try { await recordImport("imp-alloc-gl", { at: ts, by: importedBy }); } catch { /* best-effort */ }
      try {
        await savePendingGl({
          fileBase64: buf.toString("base64"),
          fileName: file.name,
          propertyCode: primary.propertyCode || "2000",
          year: primary.year,
          month: primary.maxPeriodInFile,
          uploadedAt: ts,
          uploadedBy: typeof uploadedByRaw === "string" ? uploadedByRaw : null,
        });
      } catch { /* best-effort — the statement upload still succeeds */ }
    }

    return NextResponse.json({
      ok: true,
      key,
      year: primary.year,
      maxPeriodInFile: primary.maxPeriodInFile,
      accounts: Object.keys(primary.monthly).length,
      allocatedGlReady: isGandA,
      tasksCompleted,
      // Import health: aggregate tie-out across every year stored.
      reconciliation: recon,
      // Every calendar year imported from this file (a Multi-Year GL yields
      // several); single-year files return one.
      years: savedYears.map((s) => s.year).sort((a, b) => a - b),
      perYear: savedYears,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to parse GL" },
      { status: 500 }
    );
  }
}
