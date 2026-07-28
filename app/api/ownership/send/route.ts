import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canEditOwnership, type UserId } from "@/lib/users";
import { getEntityOverrides } from "@/lib/properties/entityOverrideStore";
import { getEstimates } from "@/lib/properties/estimateStore";
import { getContactOverrides, normContactKey } from "@/lib/properties/ownerContactsStore";
import { ownerContact } from "@/lib/properties/ownerContacts";
import { ownerStatementData } from "@/lib/properties/statementData";
import { buildStatementOfValuesPdf } from "@/lib/properties/statementPdf";
import { STATEMENT_AS_OF } from "@/lib/properties/entityValues";
import { isMailConfigured, sendMail, type MailAttachment } from "@/lib/mail";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

// POST { beneficiary } — email that owner their Statement of Values PDF. Manual,
// gated, one owner at a time; never fired automatically. The client confirms
// before calling this.
export async function POST(req: Request) {
  const user = await currentUser();
  if (user && !canEditOwnership(user)) {
    return NextResponse.json({ error: "You do not have permission to send statements." }, { status: 403 });
  }
  let body: { beneficiary?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const beneficiary = (body.beneficiary ?? "").toString().trim();
  if (!beneficiary) return NextResponse.json({ error: "beneficiary required" }, { status: 400 });

  // Resolve the send-to email (seed ⊕ override).
  const overrides = await getContactOverrides();
  const seed = ownerContact(beneficiary);
  const ov = overrides[normContactKey(beneficiary)];
  const contact = { ...seed, ...ov };
  const email = (contact.email ?? "").trim();
  if (!email) {
    return NextResponse.json({ error: `No email on file for ${beneficiary}. Add one first.` }, { status: 400 });
  }
  if (!isMailConfigured()) {
    return NextResponse.json({ error: "Mail is not configured." }, { status: 503 });
  }

  const [entOv, est] = await Promise.all([getEntityOverrides(), getEstimates()]);
  const { rows, totals } = ownerStatementData(beneficiary, entOv, est);
  if (rows.length === 0) {
    return NextResponse.json({ error: `${beneficiary} has no holdings to report.` }, { status: 400 });
  }

  const asOfYearEnd = longDate(STATEMENT_AS_OF);
  const asOfEstimate = est.asOf ? longDate(est.asOf) : "";
  const generatedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const pdf = await buildStatementOfValuesPdf({
    ownerName: beneficiary,
    ownerContact: contact.address || contact.email ? { address: contact.address, email: contact.email } : undefined,
    asOfYearEnd, asOfEstimate, generatedOn, rows, totals,
  });

  const attachment: MailAttachment = {
    name: `Statement of Values - ${beneficiary.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}.pdf`,
    content: pdf,
    contentType: "application/pdf",
  };
  const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const textBody = [
    `Dear ${contact.name ?? beneficiary},`,
    "",
    `Attached is your Statement of Values as of ${asOfYearEnd}${asOfEstimate ? ` (with an estimated value as of ${asOfEstimate})` : ""}.`,
    "",
    `Total equity value: ${money(totals.yearEnd)}`,
    "",
    "Please contact us with any questions.",
    "",
    "— Korman Commercial Properties",
  ].join("\n");

  const sent = await sendMail({
    to: email,
    subject: `Korman Commercial — Your Statement of Values (${asOfYearEnd})`,
    textBody,
    attachments: [attachment],
  });
  if (!sent) return NextResponse.json({ error: "Send failed." }, { status: 502 });

  await logAudit({ event: "ownership.statement.sent", user, ip: auditIp(req), detail: `${beneficiary} → ${email}` });
  return NextResponse.json({ ok: true, sentTo: email });
}
