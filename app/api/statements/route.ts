import { NextRequest, NextResponse } from "next/server";
import { storeJSON, listJSON, deleteJSON } from "@/lib/storage";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { isPathAllowed } from "@/lib/users";
import { cardholderOf } from "@/lib/expenses/coding";

// Always read fresh — otherwise Next caches the GET and the dashboard freezes on
// a stale "most recent CC statement".
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const all = await listJSON("statements");
    // ?charges=1 — every saved charge, flattened and tagged with its statement,
    // for Expense History's search (owner: "sort and filter historic charges in
    // periods to help find something specific").
    if (req.nextUrl.searchParams.get("charges") === "1") {
      // The whole archive for the Credit Card page; anyone else (Greg, on My
      // Card Charges) gets ONLY the charges on their own card.
      const user = await budgetUser();
      if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401 });
      const full = isPathAllowed(user, "/expenses");
      const charges = all.flatMap((d) =>
        (Array.isArray(d.tx) ? d.tx : []).map((t: any) => ({
          statementId: d.id,
          statementMonth: d.statementMonth ?? "",
          periodText: d.periodText ?? "",
          date: t.date ?? "",
          cardMember: t.cardMember ?? "",
          description: t.description ?? "",
          codedDescription: t.codedDescription ?? "",
          category: t.category ?? "",
          propertyId: t.propertyId ?? "",
          suite: t.suite ?? "",
          amount: Number(t.amount) || 0,
          cam: t.cam === true,
        })),
      ).filter((c) => full || cardholderOf(c.cardMember) === user);
      return NextResponse.json({ charges });
    }
    const items = all
      .map((d) => ({
        id: d.id,
        savedAt: d.savedAt,
        savedBy: d.savedBy ?? null,
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
    const { periodText, statementMonth, tx, source, savedBy } = body;
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
      // Who saved it — the dashboard says "Processed Sep 1 by HARRY" from
      // this rather than assuming from who usually does it.
      savedBy: typeof savedBy === "string" && savedBy.trim() ? savedBy.trim() : null,
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
