import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseGeneralLedgerMonthly, summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { availableStatements, getMapping, resolveStatementKey } from "@/lib/financials/operating-statements/mappingStore";
import { resolvePropertyBudget, makeBudgetLookup } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { saveGl, latestGl, getGl, versionsFor, listGls, getNotes, getNoteSources, saveNote, saveTransactions } from "@/lib/financials/operating-statements/statementStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";

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

  // Budget columns: line up to the portal budget via the same masks. Falls back
  // to the nearest available budget year (so a 2025 sample shows the 2026
  // budget); the page labels the year used.
  const budget = await resolvePropertyBudget(mapping.propertyCode, year);
  const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
  const notes = await getNotes(key, year);
  const noteSources = await getNoteSources(key, year);

  const statement = computeStatement({
    mapping,
    propertyName: propertyName(key, mapping.entityName),
    year,
    period,
    gl,
    budgetLookup,
  });

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
    statement,
  });
}

// PATCH — save (or clear) a line note. Keyed by property/year + line key.
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { key, year, lineKey, note } = body ?? {};
    if (!key || !year || !lineKey) {
      return NextResponse.json({ error: "key, year and lineKey are required" }, { status: 400 });
    }
    await saveNote(String(key), Number(year), String(lineKey), typeof note === "string" ? note : "");
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
    });
    await saveTransactions(id, parsed.transactions);

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
