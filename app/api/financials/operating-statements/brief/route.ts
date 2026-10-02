import { NextResponse } from "next/server";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { assembledGl, saveNote, getNotesBundle } from "@/lib/financials/operating-statements/statementStore";
import { summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { resolvePropertyBudget, makeBudgetLookup } from "@/lib/financials/operating-statements/budgetCrosswalk";
import type { StatementTotals } from "@/lib/financials/operating-statements/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const r0 = (v: number | null) => (v == null ? null : Math.round(v));

/**
 * POST { key, year, period } → a short AI "monthly brief" for one property:
 * how NOI is tracking vs budget (period + YTD), the biggest drivers, and what
 * to watch. Sample of the portfolio-brief idea — computes the numbers in code,
 * AI only writes the narrative.
 */
export async function POST(req: Request) {
  let body: { key?: string; year?: number; period?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const { key, year } = body;
  if (!key || !year) return NextResponse.json({ error: "key and year are required" }, { status: 400 });

  const mapping = await getMapping(key);
  const stored = await assembledGl(key, year);
  if (!mapping || !stored) return NextResponse.json({ error: "No statement to summarize." }, { status: 404 });

  const period = Math.min(Math.max(1, body.period || stored.maxPeriodInFile), stored.maxPeriodInFile);
  const gl = summaryForPeriod(stored.monthly, period);
  const budget = await resolvePropertyBudget(mapping.propertyCode, year);
  const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
  const statement = computeStatement({ mapping, propertyName: mapping.entityName, year, period, gl, budgetLookup });

  const totals = (t: StatementTotals) => ({
    periodActual: r0(t.periodActual), periodBudget: r0(t.periodBudget), periodVariance: r0(t.periodVariance),
    ytdActual: r0(t.ytdActual), ytdBudget: r0(t.ytdBudget), ytdVariance: r0(t.ytdVariance),
  });

  // Biggest period swings vs budget, both directions — the drivers to talk about.
  const lines: { line: string; section: string; periodVariance: number; periodActual: number; periodBudget: number | null }[] = [];
  for (const sec of statement.sections) {
    for (const l of sec.lines) {
      if (l.periodVariance == null || Math.abs(l.periodVariance) < 500) continue;
      lines.push({ line: l.label, section: sec.name, periodVariance: Math.round(l.periodVariance), periodActual: Math.round(l.periodActual), periodBudget: l.periodBudget == null ? null : Math.round(l.periodBudget) });
    }
  }
  lines.sort((a, b) => Math.abs(b.periodVariance) - Math.abs(a.periodVariance));
  const drivers = lines.slice(0, 8);

  const payload = {
    property: `${statement.propertyCode} ${statement.propertyName}`,
    month: MONTHS[period - 1], year,
    netOperatingIncome: totals(statement.rollups.netOperatingIncome),
    totalRevenues: totals(statement.rollups.totalRevenues),
    totalOperatingExpenses: totals(statement.rollups.totalOperatingExpenses),
    biggestDrivers: drivers,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI isn't configured (ANTHROPIC_API_KEY not set)." }, { status: 503 });

  const prompt =
    `You are a commercial real-estate asset manager writing a brief monthly note to the owner about ${payload.property} for ${payload.month} ${year} (YTD through ${payload.month}).\n\n` +
    `Write 80–120 words, plain and direct. Cover: (1) how Net Operating Income is tracking for the month and YTD vs budget — favorable variance = good; (2) the 2–3 biggest drivers (name the specific line, e.g. "insurance ran over after the renewal"); (3) one or two things to watch next month. ` +
    `A "favorable" variance means revenue over budget or expense under budget. Do NOT dump every number or restate the totals table — synthesize. No greeting, no sign-off, no bullet headers; 1–2 short paragraphs.\n\n` +
    `A positive periodVariance/ytdVariance is favorable. Amounts are dollars.\n\nDATA:\n${JSON.stringify(payload, null, 1)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return NextResponse.json({ error: `Brief failed (${res.status}).` }, { status: 502 });
    const j = await res.json();
    const brief: string = (j?.content ?? []).filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "").join("").trim();
    if (!brief) return NextResponse.json({ error: "Empty brief." }, { status: 502 });

    // Persist the brief as a special note so it survives a reload (keyed __brief__).
    try { await saveNote(key, year, period, "__brief__", brief, "ai"); } catch { /* best-effort */ }
    return NextResponse.json({ brief });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Brief failed" }, { status: 500 });
  }
}

/** GET ?key&year&period → the saved brief (if one was generated). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const year = Number(url.searchParams.get("year"));
  const period = Number(url.searchParams.get("period"));
  if (!key || !year || !period) return NextResponse.json({ brief: null });
  try {
    const { notes } = await getNotesBundle(key, year, period);
    return NextResponse.json({ brief: notes["__brief__"] ?? null });
  } catch {
    return NextResponse.json({ brief: null });
  }
}
