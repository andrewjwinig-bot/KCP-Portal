import { NextRequest, NextResponse } from "next/server";
import { listLoans, saveLoans } from "@/lib/debt/storage";
import { LOAN_GROUPS, type Loan } from "@/lib/debt/amortization";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const loans = await listLoans();
    return NextResponse.json({ loans });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load loans" },
      { status: 500 },
    );
  }
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function cleanAmendment(raw: unknown): Loan["amendment"] {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  const startDate = String(a.startDate ?? "").trim();
  const endDate = String(a.endDate ?? "").trim();
  if (!startDate || !endDate) return undefined;
  return { startDate, endDate, principalPerMonth: num(a.principalPerMonth) };
}

function cleanLoan(raw: Partial<Loan>): Loan {
  const group = LOAN_GROUPS.includes(raw.group as never)
    ? (raw.group as Loan["group"])
    : "Business Parks";
  const loan: Loan = {
    id: String(raw.id ?? "").trim() || "loan_" + Date.now().toString(36),
    property: String(raw.property ?? "").trim(),
    partnership: String(raw.partnership ?? "").trim(),
    collateral: String(raw.collateral ?? "").trim(),
    lender: String(raw.lender ?? "").trim(),
    group,
    originalBalance: num(raw.originalBalance),
    annualRatePct: num(raw.annualRatePct),
    amortYears: num(raw.amortYears) || 25,
    scheduledPayment: num(raw.scheduledPayment),
    maturityDate: String(raw.maturityDate ?? "").trim(),
    anchorBalance: num(raw.anchorBalance),
    anchorDate: String(raw.anchorDate ?? "").trim(),
    interestOnly: !!raw.interestOnly,
    notes: String(raw.notes ?? ""),
  };
  const amendment = cleanAmendment(raw.amendment);
  if (amendment) loan.amendment = amendment;
  return loan;
}

// Full-list replace — the page sends the whole loan array on every save.
export async function PUT(req: NextRequest) {
  let body: { loans?: unknown };
  try {
    body = (await req.json()) as { loans?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.loans)) {
    return NextResponse.json({ error: "Expected { loans: [] }" }, { status: 400 });
  }
  const loans = (body.loans as Partial<Loan>[]).map(cleanLoan);
  for (const l of loans) {
    if (!l.partnership) {
      return NextResponse.json({ error: "Every loan needs a partnership name" }, { status: 400 });
    }
  }
  try {
    await saveLoans(loans);
    return NextResponse.json({ loans });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save loans" },
      { status: 500 },
    );
  }
}
