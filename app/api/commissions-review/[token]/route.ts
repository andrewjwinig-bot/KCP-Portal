import { NextResponse } from "next/server";
import { commissionReviewSecret, verifyCommissionReviewToken } from "@/lib/commissions/reviewLink";
import { approveQuarter, quarterReview, reviewerEmail, REVIEWER_NAME } from "@/lib/commissions/quarterReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Alison's commission review link (public — the signed token is the gate, and
// it opens ONE quarter). GET lists the quarter's invoices; POST approves the
// ones she was shown and sends them to AvidXchange.

async function quarterOf(token: string): Promise<string | null> {
  return verifyCommissionReviewToken(token, commissionReviewSecret());
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const q = await quarterOf(params.token);
  if (!q) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
  const { rows: _rows, ...review } = await quarterReview(q);
  return NextResponse.json({ ...review, reviewer: REVIEWER_NAME, reviewerEmail: reviewerEmail() });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const q = await quarterOf(params.token);
  if (!q) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown): x is string => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Nothing selected to send." }, { status: 400 });
  const res = await approveQuarter(q, REVIEWER_NAME, ids);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 409 });
  const avid = res.avidBill as { ok: boolean; reason?: string } | null;
  const { rows: _rows, ...review } = await quarterReview(q);
  return NextResponse.json({ ok: !avid || avid.ok, reason: avid && !avid.ok ? avid.reason : undefined, review });
}
