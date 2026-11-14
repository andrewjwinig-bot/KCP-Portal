// The credit-card statement being coded (`workingStore.ts`). Harry (anyone
// with the Credit Card page) reads and writes the whole of it; a cardholder
// without the page — Greg, Drew — reads and codes ONLY the charges on their
// own card (`cardholderOf`). Enforced here: /api/expenses is not page-gated.
import { NextResponse } from "next/server";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { isPathAllowed, type UserId } from "@/lib/users";
import { cardholderOf, type Tx } from "@/lib/expenses/coding";
import { getWorking, saveWorking, patchCharge, clearWorking } from "@/lib/expenses/workingStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fullAccess = (u: UserId) => isPathAllowed(u, "/expenses");
const owns = (u: UserId, t: Tx) => cardholderOf(t.cardMember) === u;

export async function GET() {
  const user = await budgetUser();
  if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const doc = await getWorking();
  if (fullAccess(user)) return NextResponse.json({ ok: true, full: true, ...doc });
  return NextResponse.json({
    ok: true, full: false,
    statementPeriodText: doc.statementPeriodText, importedAt: doc.importedAt, importedBy: doc.importedBy,
    tx: doc.tx.filter((t) => Number(t.amount) > 0 && owns(user, t)),
  });
}

/** Code one charge: { id, patch }. Harry codes any; a cardholder their own. */
export async function PATCH(req: Request) {
  const user = await budgetUser();
  if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const doc = await getWorking();
  const t = doc.tx.find((x) => x.id === id);
  if (!t) return NextResponse.json({ error: "That charge is no longer on the statement." }, { status: 404 });
  if (!fullAccess(user) && !owns(user, t)) return NextResponse.json({ error: "That charge is not on your card." }, { status: 403 });
  const saved = await patchCharge(id, body.patch ?? {});
  return NextResponse.json({ ok: true, tx: saved });
}

/** Harry's page: { action: "import", tx, statementPeriodText, fileName, importedBy }
 *  adds a statement's charges ahead of any already here (the page's own
 *  upsert); { action: "replace", ... } puts a whole statement (the one-time
 *  move of a statement still sitting in his browser). */
export async function POST(req: Request) {
  const user = await budgetUser();
  if (!user || !fullAccess(user)) return NextResponse.json({ error: "Only the Credit Card page imports a statement." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const incoming: Tx[] = Array.isArray(body.tx) ? body.tx : [];
  const doc = await getWorking();
  const known = new Set(doc.tx.map((t) => t.id));
  const tx = body.action === "replace" ? incoming : [...incoming.filter((t) => !known.has(t.id)), ...doc.tx];
  const saved = await saveWorking({
    ...doc, tx,
    statementPeriodText: String(body.statementPeriodText ?? doc.statementPeriodText ?? ""),
    fileName: String(body.fileName ?? doc.fileName ?? ""),
    importedAt: body.importedAt ?? doc.importedAt ?? new Date().toISOString(),
    importedBy: body.importedBy ?? doc.importedBy ?? null,
  });
  return NextResponse.json({ ok: true, ...saved });
}

export async function DELETE() {
  const user = await budgetUser();
  if (!user || !fullAccess(user)) return NextResponse.json({ error: "Only the Credit Card page clears a statement." }, { status: 403 });
  await clearWorking();
  return NextResponse.json({ ok: true });
}
