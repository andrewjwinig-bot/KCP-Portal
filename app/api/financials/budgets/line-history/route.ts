import { NextResponse } from "next/server";
import { lineHistory } from "@/lib/financials/budgets/lineHistory";
import { lineInsight } from "@/lib/financials/budgets/lineInsight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60; // reads a GL and a budget per trailing year

// GET ?key=&code=&label=&mask=&sign=&year=&back=
// One budget line's trailing years — budget AND actual per year, so next
// year's number is argued from the line's own history rather than from last
// year grown by a percentage.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const propertyCode = url.searchParams.get("code") ?? "";
  const mask = url.searchParams.get("mask");
  const label = url.searchParams.get("label") ?? "";
  const throughYear = Number(url.searchParams.get("year"));
  const sign = url.searchParams.get("sign") === "-1" ? -1 : 1;
  const back = Math.min(8, Math.max(2, Number(url.searchParams.get("back")) || 5));
  if (!key || !mask || !throughYear) {
    return NextResponse.json({ error: "key, mask and year are required" }, { status: 400 });
  }
  try {
    const history = await lineHistory({ key, propertyCode, label, mask, sign, throughYear, back });
    // The reading travels WITH the history, so the modal cannot show a table
    // and a conclusion that disagree.
    return NextResponse.json({ ...history, insight: lineInsight(history) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
