import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseGeneralLedgerMonthly, summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { availableStatements, getMapping, resolveStatementKey } from "@/lib/financials/operating-statements/mappingStore";
import { resolvePropertyBudget, makeBudgetLookup } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { saveGl, getGl, versionsFor, listFullGls, mergeAccountNames, getNotesBundle, saveNote, saveTransactions, getDismissedFlags, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function propertyName(key: string, fallback: string): string {
  return PROPERTY_DEFS.find((p) => p.id === key)?.name ?? fallback;
}


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

  if (!key || !year) return NextResponse.json({ available });

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
  const budget = await resolvePropertyBudget(mapping.propertyCode, year);
  const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
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
    notes,
    noteSources,
    noteMeta,
    operatingCash,
    statement,
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

    const parsed = parseGeneralLedgerMonthly(rows);
    // The GL header's Property/Company code is authoritative; fall back to the
    // viewing selection only if the header had none.
    const keyRaw = form.get("key");
    const rawCode = parsed.propertyCode || (typeof keyRaw === "string" && keyRaw.trim() ? keyRaw.trim() : null);
    if (!rawCode) {
      return NextResponse.json({ error: "Could not determine the property — the GL header had no Property/Company code." }, { status: 400 });
    }
    if (!parsed.year) {
      return NextResponse.json({ error: "Could not read the reporting year from the GL header." }, { status: 400 });
    }
    // Resolve the GL's property code to the canonical mapping key (handles fund
    // ledgers whose header code differs, e.g. FJVIII → PJV3, PIIICO → CONDO).
    const key = await resolveStatementKey(rawCode);
    if (!key) {
      return NextResponse.json({ error: `No statement mapping exists for property ${rawCode}.` }, { status: 400 });
    }

    const uploadedByRaw = form.get("uploadedBy");
    const ts = new Date().toISOString();
    const id = `gl-${key}-${parsed.year}-${Date.now()}`;
    await saveGl({
      id,
      key,
      propertyCode: parsed.propertyCode,
      year: parsed.year,
      uploadedAt: ts,
      uploadedBy: typeof uploadedByRaw === "string" ? uploadedByRaw : undefined,
      fileName: file.name,
      maxPeriodInFile: parsed.maxPeriodInFile,
      monthly: parsed.monthly,
      beginning: parsed.beginning,
      ytdTotal: parsed.ytdTotal,
      names: parsed.names,
    });
    await saveTransactions(id, parsed.transactions);
    await logAudit({ event: "gl.upload", user: typeof uploadedByRaw === "string" ? uploadedByRaw : key, ip: auditIp(req), detail: `${key} ${parsed.year} · ${file.name}` });

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
      if (parsed.year === expected.year && parsed.maxPeriodInFile === expected.period) {
        tasksCompleted = ["m-post", "m-close", "m-opstmt"];
        for (const taskId of tasksCompleted) {
          await markTaskComplete(now.getFullYear(), now.getMonth(), taskId, { at: now.toISOString(), source: "gl-upload" });
        }
      }
    } catch { /* best-effort — the statement upload still succeeds */ }

    const isGandA = rawCode === "2000" || parsed.propertyCode === "2000" || key === "2000";
    if (isGandA) {
      try {
        await savePendingGl({
          fileBase64: buf.toString("base64"),
          fileName: file.name,
          propertyCode: parsed.propertyCode || "2000",
          year: parsed.year,
          month: parsed.maxPeriodInFile,
          uploadedAt: ts,
          uploadedBy: typeof uploadedByRaw === "string" ? uploadedByRaw : null,
        });
      } catch { /* best-effort — the statement upload still succeeds */ }
    }

    return NextResponse.json({
      ok: true,
      key,
      year: parsed.year,
      maxPeriodInFile: parsed.maxPeriodInFile,
      accounts: Object.keys(parsed.monthly).length,
      allocatedGlReady: isGandA,
      tasksCompleted,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to parse GL" },
      { status: 500 }
    );
  }
}
