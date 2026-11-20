// A credit-card charge's receipt, kept in the portal so whoever codes the
// charge (Harry, Greg, Drew) attaches it and the CAM invoice carries it to the
// tenants' backup (owner: "make the user attach a receipt before finishing").
//   POST   { id, url, name, contentType, size }  attach (already uploaded to Blob)
//   DELETE ?id=                                  remove
//   GET    ?id=                                  the file
// Who may: anyone with the Credit Card page, or the charge's own cardholder —
// the same rule as coding it (`/api/expenses/working`).
import { NextResponse } from "next/server";
import { del, get } from "@vercel/blob";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { isPathAllowed, type UserId } from "@/lib/users";
import { cardholderOf, type Tx } from "@/lib/expenses/coding";
import { getWorking, setReceipt } from "@/lib/expenses/workingStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fullAccess = (u: UserId) => isPathAllowed(u, "/expenses");
const owns = (u: UserId, t: Tx) => cardholderOf(t.cardMember) === u;

async function chargeFor(id: string) {
  const user = await budgetUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  const t = (await getWorking()).tx.find((x) => x.id === id);
  if (!t) return { error: NextResponse.json({ error: "That charge is no longer on the statement." }, { status: 404 }) };
  if (!fullAccess(user) && !owns(user, t)) return { error: NextResponse.json({ error: "That charge is not on your card." }, { status: 403 }) };
  return { user, t };
}

export async function GET(req: Request) {
  const r = await chargeFor(new URL(req.url).searchParams.get("id") ?? "");
  if ("error" in r) return r.error;
  if (!r.t.receipt?.url) return NextResponse.json({ error: "No receipt on this charge." }, { status: 404 });
  const res = await get(r.t.receipt.url, { access: "private" }).catch(() => null);
  if (!res) return NextResponse.json({ error: "The receipt file is missing." }, { status: 404 });
  return new Response(res.stream, {
    headers: {
      "Content-Type": r.t.receipt.contentType || res.blob.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${r.t.receipt.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const r = await chargeFor(String(b.id ?? ""));
  if ("error" in r) return r.error;
  const url = String(b.url ?? "");
  if (!/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\/cc-receipts\//i.test(url)) {
    return NextResponse.json({ error: "Not an uploaded receipt." }, { status: 400 });
  }
  const old = r.t.receipt?.url;
  const tx = await setReceipt(r.t.id, {
    url, name: String(b.name || "receipt").slice(0, 200), contentType: String(b.contentType || "application/octet-stream"),
    size: Number(b.size) || 0, uploadedAt: new Date().toISOString(), by: r.user,
  });
  if (old && old !== url) await del(old).catch(() => {});
  return NextResponse.json({ ok: true, tx });
}

export async function DELETE(req: Request) {
  const r = await chargeFor(new URL(req.url).searchParams.get("id") ?? "");
  if ("error" in r) return r.error;
  const old = r.t.receipt?.url;
  const tx = await setReceipt(r.t.id, null);
  if (old) await del(old).catch(() => {});
  return NextResponse.json({ ok: true, tx });
}
