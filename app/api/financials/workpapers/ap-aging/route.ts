import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { pdfPages } from "@/lib/pdf/pdfText";
import { listGls, assembledGl, assembledTransactions } from "@/lib/financials/operating-statements/statementStore";
import { parseApAging, apAgingFromPdfPages, placeApSections, type ApAgingFile, type ApCandidate, type Row } from "@/lib/financials/workpapers/apAging";
import { saveApAging, listApAgings, type StoredApSection } from "@/lib/financials/workpapers/apAgingStore";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Gated with the statement pages (/api/financials → /financials).

/** GET → the AP agings imported so far. */
export async function GET() {
  return NextResponse.json({ ok: true, imports: await listApAgings() });
}

/** Trade accounts payable — what the vendor aging lists (2110-*). */
const isPayable = (code: string) => /^211\d-\d{4}$/.test(code);

/**
 * POST multipart `file` — Skyline's AP Aged Trial Balance, PDF (preferred: it
 * names every property) or Excel (names only the first; the rest are placed by
 * their total against each property's payables, then by vendors).
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose the AP Aged Trial Balance to import." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());

  let parsed: ApAgingFile;
  try {
    if (buf.subarray(0, 4).toString() === "%PDF") parsed = apAgingFromPdfPages((await pdfPages(buf)).pages);
    else {
      const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
      parsed = parseApAging(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true }) as Row[]);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Couldn't read that file." }, { status: 400 });
  }
  if (!parsed.asOf) return NextResponse.json({ error: "Couldn't find the \"Balance as of\" date in this file." }, { status: 400 });
  if (!parsed.sections.length) return NextResponse.json({ error: "No properties found in this file." }, { status: 400 });

  // Each section must add up to the total Skyline printed for it.
  const untied = parsed.sections.filter((s) => Math.abs(s.invoices.reduce((a, i) => a + i.amount, 0) - s.total) > 0.01);

  // Evidence for sections the file doesn't name: each property's payables at
  // the as-of date, and (only if still needed) the vendors on its 2110 account.
  const year = Number(parsed.asOf.slice(0, 4));
  const month = Number(parsed.asOf.slice(5, 7));
  let candidates: ApCandidate[] = [];
  if (parsed.sections.some((s) => !s.code)) {
    const keys = [...new Set((await listGls()).filter((g) => g.year === year).map((g) => g.key))];
    candidates = await Promise.all(keys.map(async (key) => {
      const gl = await assembledGl(key, year).catch(() => null);
      if (!gl) return { key, owed: null };
      let owed = 0, any = false;
      for (const code of new Set([...Object.keys(gl.monthly ?? {}), ...Object.keys(gl.beginning ?? {})])) {
        if (!isPayable(code)) continue;
        any = true;
        let b = gl.beginning?.[code] ?? 0;
        for (let i = 0; i < month; i++) b += gl.monthly?.[code]?.[i] || 0;
        owed -= b;
      }
      return { key, owed: any ? Math.round(owed * 100) / 100 : 0 };
    }));
    const first = placeApSections(parsed, candidates);
    if (first.some((p) => !p.key)) {
      candidates = await Promise.all(candidates.map(async (c) => {
        const tx = await assembledTransactions(c.key, year).catch(() => ({} as Record<string, { vendor?: string; description: string }[]>));
        const vendors = Object.entries(tx).filter(([code]) => isPayable(code)).flatMap(([, list]) => list.map((t) => t.vendor || t.description)).filter(Boolean);
        return { ...c, vendors };
      }));
    }
  }
  const placements = placeApSections(parsed, candidates);

  const user = await budgetUser().catch(() => null);
  const sections: Record<string, StoredApSection> = {};
  for (const p of placements) {
    if (!p.key) continue;
    const s = parsed.sections[p.index - 1];
    sections[p.key] = { code: p.key, name: s.name, total: s.total, invoices: s.invoices, placedBy: p.by ?? "" };
  }
  await saveApAging({
    asOf: parsed.asOf,
    importedAt: new Date().toISOString(),
    by: user ? (USERS[user]?.label ?? user) : null,
    file: file.name,
    portfolioTotal: parsed.portfolioTotal,
    sections,
  });
  return NextResponse.json({
    ok: true,
    asOf: parsed.asOf,
    format: buf.subarray(0, 4).toString() === "%PDF" ? "pdf" : "excel",
    properties: placements.filter((p) => p.key).length,
    total: parsed.portfolioTotal,
    unplaced: placements.filter((p) => !p.key).map((p) => ({ index: p.index, total: parsed.sections[p.index - 1].total })),
    untied: untied.map((s) => ({ index: s.index, code: s.code ?? null, total: s.total })),
  });
}
