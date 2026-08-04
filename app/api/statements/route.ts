import { NextRequest, NextResponse } from "next/server";
import { storeJSON, listJSON, deleteJSON } from "@/lib/storage";

// Always read fresh — otherwise Next caches the GET and the dashboard freezes on
// a stale "most recent CC statement".
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const all = await listJSON("statements");
    const items = all
      .map((d) => ({
        id: d.id,
        savedAt: d.savedAt,
        periodText: d.periodText,
        statementMonth: d.statementMonth,
        source: d.source ?? "manual",
        txCount: (d.tx ?? []).length,
        total: (d.tx ?? []).reduce((a: number, t: any) => a + (t.amount ?? 0), 0),
      }))
      .sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1));
    return NextResponse.json(items);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to list statements" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { periodText, statementMonth, tx, source } = body;
    if (!tx || !Array.isArray(tx)) {
      return NextResponse.json({ error: "tx array is required" }, { status: 400 });
    }
    // Upsert by statement month: re-generating / re-saving the same statement
    // replaces its prior history entry instead of piling up duplicates. (Entries
    // with no statementMonth just append.)
    const month = typeof statementMonth === "string" ? statementMonth.trim() : "";
    if (month) {
      const all = await listJSON("statements");
      await Promise.all(all.filter((d) => d.statementMonth === month).map((d) => deleteJSON("statements", d.id)));
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const statement = {
      id,
      savedAt: new Date().toISOString(),
      periodText: periodText ?? "",
      statementMonth: statementMonth ?? "",
      source: source === "generated" ? "generated" : "manual",
      tx,
    };
    await storeJSON("statements", id, statement);
    return NextResponse.json({ id, savedAt: statement.savedAt });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 });
  }
}
