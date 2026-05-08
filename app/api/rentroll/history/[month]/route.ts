import { NextResponse } from "next/server";
import { getJSON } from "@/lib/storage";

const HISTORY_PREFIX = "rentroll-history";

/** GET /api/rentroll/history/YYYY-MM → full rent roll data for that snapshot. */
export async function GET(_req: Request, ctx: { params: { month: string } }) {
  const month = (ctx.params.month ?? "").replace(/[^0-9-]/g, "");
  const data = await getJSON(HISTORY_PREFIX, month);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ rentroll: data });
}
