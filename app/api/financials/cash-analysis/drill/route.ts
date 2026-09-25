import { NextResponse } from "next/server";
import { listFullGls, mergeAccountNames } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { breakdownForCode, CASH_FLOW_BUCKETS, type CashFlowCode } from "@/lib/financials/cash-analysis/compute";
import { glKeysFor } from "@/lib/financials/cash-analysis/funds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET ?key=&year=&period=&code=(1-8)(&ytd=1) — the GL accounts (code, name,
// amount) that make up one property's cash-flow bucket, for the drill-down. For
// a FUND row (PJV3 / PNIPLX) the displayed value sums the shell + every member
// building, so the breakdown aggregates the same set of GLs — otherwise a
// building-level line would show "no GL accounts behind it".
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  const year = Number(url.searchParams.get("year"));
  const period = Math.min(12, Math.max(1, Number(url.searchParams.get("period")) || 12));
  const code = Number(url.searchParams.get("code")) as CashFlowCode;
  const ytd = url.searchParams.get("ytd") === "1";
  const bucket = CASH_FLOW_BUCKETS.find((b) => b.code === code);
  if (!key || !year || !bucket) {
    return NextResponse.json({ error: "key, year and a valid code are required" }, { status: 400 });
  }

  const fulls = await listFullGls();
  const acctNames = mergeAccountNames(fulls);
  // Sum the per-account breakdown across the shell + member buildings (a fund),
  // or just the one key (everything else).
  const merged = new Map<string, { account: string; amount: number; name: string | null }>();
  for (const glKey of glKeysFor(key)) {
    const stored = assembleGls(fulls.filter((g) => g.key === glKey && g.year === year));
    if (!stored) continue;
    const p = Math.min(period, stored.maxPeriodInFile);
    for (const a of breakdownForCode(stored.monthly, p, code, { ytd })) {
      const prev = merged.get(a.account);
      const name = stored.names?.[a.account] ?? acctNames[a.account] ?? null;
      if (prev) prev.amount += a.amount;
      else merged.set(a.account, { account: a.account, amount: a.amount, name });
    }
  }
  const accounts = [...merged.values()]
    .filter((a) => a.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const total = accounts.reduce((s, a) => s + a.amount, 0);
  return NextResponse.json({ key, code, bucket: bucket.label, period, accounts, total });
}
