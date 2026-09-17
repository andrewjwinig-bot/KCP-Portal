import { NextResponse } from "next/server";
import { basisForLine, type RentCheckBasis } from "@/lib/financials/operating-statements/rentCheck";
import { loadRentCheckContext, runRentCheck } from "@/lib/financials/operating-statements/rentCheckRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — the rent-roll check behind a billed line: what each suite's rent roll
// says it owes against what was actually charged. A THIN WRAPPER over
// `runRentCheck`, which the statement's "?" also calls, so the table and the
// mark cannot disagree about whether a suite ties.
//
// Open A/R is deliberately absent: it is a tenant's whole account balance,
// every charge type and unaged, so beside one line's figures it can only
// mislead. Collections lives on Monthly Statements.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const property = url.searchParams.get("property");
  const year = Number(url.searchParams.get("year"));
  const mask = url.searchParams.get("mask");
  const period = Number(url.searchParams.get("period")) || 12;
  const scope = url.searchParams.get("scope") === "month" ? "month" : "ytd";
  const sign = url.searchParams.get("sign") === "-1" ? -1 : 1;
  const versionId = url.searchParams.get("version");
  // WHICH rent-roll column to expect. Sent by the caller, but resolved here
  // from the line's own label + mask when it isn't, so the answer cannot
  // differ between the page and the API.
  const label = url.searchParams.get("label") ?? "";
  const sent = url.searchParams.get("basis");
  const basis: RentCheckBasis =
    (sent === "cam" || sent === "ret" || sent === "other" || sent === "base")
      ? sent
      : (basisForLine(label, mask ?? "") ?? "base");

  if (!key || !year || !mask) {
    return NextResponse.json({ error: "key, year and mask are required" }, { status: 400 });
  }

  const ctx = await loadRentCheckContext(key, year, versionId);
  if (!ctx) return NextResponse.json({ rows: [], totals: null, noRentRoll: true });

  const result = runRentCheck(ctx, { property, year, period, scope, mask, sign, basis });
  return NextResponse.json({ ...result, basis });
}
