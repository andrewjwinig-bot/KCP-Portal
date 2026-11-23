import { NextRequest, NextResponse } from "next/server";
import { getJSON, deleteJSON } from "@/lib/storage";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { isPathAllowed } from "@/lib/users";

// One saved credit-card statement — every cardholder's charges. The API prefix
// also admits a cardholder's own page (Greg's My Card Charges reads
// `/api/statements?charges=1`, scoped to his card), so a whole statement is
// checked here: the coder or Expense History only (security audit 11/2026).
async function canRead() {
  const u = await budgetUser();
  return !!u && (isPathAllowed(u, "/expenses") || isPathAllowed(u, "/expenses/history"));
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await canRead())) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const data = await getJSON("statements", params.id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const u = await budgetUser();
  if (!u || !isPathAllowed(u, "/expenses")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const deleted = await deleteJSON("statements", params.id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
