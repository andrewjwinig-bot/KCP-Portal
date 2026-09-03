import { NextRequest, NextResponse } from "next/server";
import { checkTenantAccess } from "@/lib/cam/tenantLink/access";
import { getRun } from "@/lib/statements/store";
import { statementCharges } from "@/lib/statements/summary";
import { instructionsFor } from "@/lib/statements/payment";
import { makeReference, resolveSelection, isPayingInFull, METHOD_LABEL, type Remittance, type RemittanceMethod } from "@/lib/statements/remittance";
import { remittancesForUnit, saveRemittance } from "@/lib/statements/remittanceStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { sendMail, isMailConfigured } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;
const FROM = "dwinig@kormancommercial.com"; // verified Postmark sender

/** GET — this tenant's own declarations, newest first. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const access = await checkTenantAccess(params.token, req);
  if (!access.ok) return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  return NextResponse.json({ ok: true, remittances: await remittancesForUnit(access.payload!.u) });
}

/**
 * POST { period, charges: number[], method?, note? } — record what the tenant
 * says their payment covers.
 *
 * This records an INTENTION. It doesn't move money and never marks a charge
 * paid — staff reconcile it against the cheque when it lands. The amount is
 * computed here from the stored statement; a client-supplied total is ignored,
 * because this figure is what a payment gets applied against.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const access = await checkTenantAccess(params.token, req);
  if (!access.ok) return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  const { payload } = access;

  const body = await req.json().catch(() => ({}));
  const period = String(body?.period ?? "");
  const run = await getRun(period);
  if (!run || !run.published) return NextResponse.json({ error: "That statement isn't available." }, { status: 404 });
  const statement = run.statements.find((s) => s.unitRef.toUpperCase() === payload.u.toUpperCase());
  if (!statement) return NextResponse.json({ error: "That statement isn't available." }, { status: 404 });

  const charges = statementCharges(statement);
  const sel = resolveSelection(statement, charges, body?.charges);
  if (!sel.ok) return NextResponse.json({ error: sel.error }, { status: 400 });
  const paying = sel.paying ?? [];
  const holding = sel.holding ?? [];

  const method: RemittanceMethod = body?.method === "ach" ? "ach" : body?.method === "other" ? "other" : "check";
  const rec: Remittance = {
    id: "rm_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    reference: makeReference(),
    period,
    unitRef: statement.unitRef,
    propertyCode: statement.propertyCode,
    tenantName: statement.tenantName,
    submittedAt: new Date().toISOString(),
    method,
    amount: sel.amount ?? 0,
    statementTotal: statement.chargeTotal,
    paying,
    holding,
    note: String(body?.note ?? "").slice(0, 2000).trim(),
  };
  await saveRemittance(rec);

  // Tell AR straight away — the whole point is that the decision reaches us
  // before the cheque does. Never fail the tenant's submission on a mail error:
  // the declaration is saved and visible on the admin page regardless.
  const inFull = isPayingInFull(rec);
  try {
    const instructions = await instructionsFor(statement.propertyCode);
    if (isMailConfigured() && instructions.contactEmail) {
      const lines = (ls: typeof rec.paying) => ls.map((l) => `  ${l.dateISO ?? "—"}  ${l.description}  ${money(l.amount)}`).join("\n");
      await sendMail({
        from: FROM,
        to: instructions.contactEmail,
        subject: `Payment declared — ${statement.tenantName} (${statement.unitRef}) — ${money(rec.amount)} — ref ${rec.reference}`,
        isAutoReply: true,
        textBody: [
          `${statement.tenantName} has told us what their payment covers.`,
          ``,
          `Reference:   ${rec.reference}   (they've been asked to write this on the cheque)`,
          `Unit:        ${statement.unitRef} — ${propName(statement.propertyCode)}`,
          `Statement:   ${period}`,
          `Paying:      ${money(rec.amount)} by ${METHOD_LABEL[method]}`,
          `Open total:  ${money(statement.chargeTotal)}${inFull ? "  (paying in full)" : ""}`,
          ``,
          `APPLY TO`,
          lines(rec.paying),
          ...(rec.holding.length ? [``, `NOT PAYING`, lines(rec.holding)] : []),
          ...(rec.note ? [``, `THEIR NOTE`, rec.note] : []),
          ``,
          `This is a declaration, not a payment — nothing has been charged or marked paid.`,
        ].join("\n"),
      });
    }
  } catch {
    /* the record is saved; a mail failure must not lose the tenant's decision */
  }

  return NextResponse.json({ ok: true, remittance: rec, payingInFull: inFull }, { status: 201 });
}
