import { NextResponse } from "next/server";
import { listFullGls, mergeAccountNames } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { breakdownForCode, CASH_FLOW_BUCKETS, type CashFlowCode } from "@/lib/financials/cash-analysis/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET ?key=&year=&period=&code=(1-8)(&ytd=1) — the GL accounts (code, name,
// amount) that make up one property's cash-flow bucket, for the drill-down.
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
  const stored = assembleGls(fulls.filter((g) => g.key === key && g.year === year));
  if (!stored) return NextResponse.json({ key, code, bucket: bucket.label, accounts: [], total: 0 });
  const p = Math.min(period, stored.maxPeriodInFile);
  const acctNames = mergeAccountNames(fulls);
  const accounts = breakdownForCode(stored.monthly, p, code, { ytd }).map((a) => ({
    ...a,
    name: stored.names?.[a.account] ?? acctNames[a.account] ?? null,
  }));
  const total = accounts.reduce((s, a) => s + a.amount, 0);
  return NextResponse.json({ key, code, bucket: bucket.label, period: p, accounts, total });
}
