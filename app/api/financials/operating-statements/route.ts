import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseGeneralLedgerMonthly, summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { availableStatements, getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { resolvePropertyBudget, makeBudgetLookup } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { saveGl, latestGl, getGl, versionsFor, listGls, getNotesBundle, saveNote, saveTransactions } from "@/lib/financials/operating-statements/statementStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function propertyName(key: string, fallback: string): string {
  return PROPERTY_DEFS.find((p) => p.id === key)?.name ?? fallback;
}

// GET — without params: the picker payload (every mapped property/fund + which
// have uploads + the years available). With ?key&year[&period][&version]:
// the computed statement for that selection.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const year = Number(url.searchParams.get("year"));

  const [mappings, gls] = await Promise.all([availableStatements(), listGls()]);
  const yearsByKey = new Map<string, Set<number>>();
  for (const g of gls) {
    if (!yearsByKey.has(g.key)) yearsByKey.set(g.key, new Set());
    yearsByKey.get(g.key)!.add(g.year);
  }
  const available = mappings.map((m) => ({
    key: m.key,
    propertyCode: m.propertyCode,
    entityName: m.entityName,
    name: propertyName(m.key, m.entityName),
    years: [...(yearsByKey.get(m.key) ?? [])].sort((a, b) => b - a),
  }));

  if (!key || !year) return NextResponse.json({ available });

  const mapping = await getMapping(key);
  if (!mapping) return NextResponse.json({ available, error: "No mapping for that property" }, { status: 404 });

  const versionId = url.searchParams.get("version");
  const stored = versionId ? await getGl(versionId) : await latestGl(key, year);
  const versions = await versionsFor(key, year);
  if (!stored) {
    return NextResponse.json({ available, versions, statement: null, message: "No GL uploaded for this property/year yet." });
  }

  const requested = Number(url.searchParams.get("period")) || stored.maxPeriodInFile;
  const period = Math.min(Math.max(1, requested), stored.maxPeriodInFile);
  const gl = summaryForPeriod(stored.monthly, period);

  // Operating Cash — ending balance of the Cash-Operating account (0110-0000),
  // read straight off the GL's "YTD Total" row (which already = beginning +
  // YTD activity). Falls back to beginning + YTD net for older uploads that
  // didn't capture the YTD Total. Balance-sheet account → not on the P&L.
  const CASH_ACCT = "0110-0000";
  const cashNets = stored.monthly[CASH_ACCT];
  const operatingCash = stored.ytdTotal?.[CASH_ACCT] ??
    (cashNets ? (stored.beginning?.[CASH_ACCT] ?? 0) + cashNets.slice(0, period).reduce((a, n) => a + n, 0) : null);

  // Budget columns: line up to the portal budget via the same masks. Falls back
  // to the nearest available budget year (so a 2025 sample shows the 2026
  // budget); the page labels the year used.
  const budget = await resolvePropertyBudget(mapping.propertyCode, year);
  const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
  const { notes, sources: rawSources, meta: noteMeta } = await getNotesBundle(key, year);
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
  // Label the unmapped (non-operating) accounts with their GL account name.
  statement.unmappedAccounts = statement.unmappedAccounts.map((u) => ({
    ...u,
    name: stored.names?.[u.account] ?? null,
  }));

  return NextResponse.json({
    available,
    versions,
    selectedVersion: stored.id,
    maxPeriodInFile: stored.maxPeriodInFile,
    uploadedAt: stored.uploadedAt,
    budgetYear: budget?.budgetYear ?? null,
    budgetFallback: budget?.fallback ?? false,
    notes,
    noteSources,
    noteMeta,
    operatingCash,
    statement,
  });
}

// PATCH — save (or clear) a line note. Keyed by property/year + line key.
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { key, year, lineKey, note, editedBy } = body ?? {};
    if (!key || !year || !lineKey) {
      return NextResponse.json({ error: "key, year and lineKey are required" }, { status: 400 });
    }
    await saveNote(String(key), Number(year), String(lineKey), typeof note === "string" ? note : "", "user", typeof editedBy === "string" ? editedBy : undefined);
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
    const key = parsed.propertyCode || (typeof keyRaw === "string" && keyRaw.trim() ? keyRaw.trim() : null);
    if (!key) {
      return NextResponse.json({ error: "Could not determine the property — the GL header had no Property/Company code." }, { status: 400 });
    }
    if (!parsed.year) {
      return NextResponse.json({ error: "Could not read the reporting year from the GL header." }, { status: 400 });
    }
    if (!(await getMapping(key))) {
      return NextResponse.json({ error: `No statement mapping exists for property ${key}.` }, { status: 400 });
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

    return NextResponse.json({
      ok: true,
      key,
      year: parsed.year,
      maxPeriodInFile: parsed.maxPeriodInFile,
      accounts: Object.keys(parsed.monthly).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to parse GL" },
      { status: 500 }
    );
  }
}
