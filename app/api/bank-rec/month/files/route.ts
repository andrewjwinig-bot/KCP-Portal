import { NextRequest, NextResponse } from "next/server";
import { ingestFile } from "@/lib/bank-rec/month";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST multipart { period, file } — read ONE file of the month (a statement,
// one of Marie's Skyline recs, or the Checking Account Report). The page sends
// a dropped folder one file at a time, so no request nears the size limit.
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const period = String(fd.get("period") ?? "");
    const file = fd.get("file");
    if (!/^\d{4}-\d{2}$/.test(period) || !(file instanceof File)) return NextResponse.json({ error: "period and file are required" }, { status: 400 });
    const user = await budgetUser();
    const res = await ingestFile(period, file.name, Buffer.from(await file.arrayBuffer()), user ? USERS[user]?.label ?? user : null);
    return NextResponse.json({ ok: true, result: res });
  } catch (e) {
    console.error("[POST /api/bank-rec/month/files]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
