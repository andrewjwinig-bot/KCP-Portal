// Tenants with no email on file — the list, the fill-in workbook and its
// import back (owner, 11/2026). Harry: shopping centres + residential; Nancy:
// office; anyone else who can open units sees both.
//
//   GET ?group=sc|office                 → the tenants with no email
//   GET ?group=…&format=xlsx             → the fill-in workbook
//   POST (multipart, file)               → import a filled workbook
//   POST { unitRef, emails, name? }      → add one tenant's email(s)

import { NextRequest, NextResponse } from "next/server";
import { addSuiteEmails, splitEmails, tenantsWithoutEmail, type ContactGroup } from "@/lib/suites/missingEmails";
import { buildFillSheet, readFillSheet } from "@/lib/suites/missingEmailsXlsx";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";
import { logAudit, auditIp } from "@/lib/audit";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Harry and Nancy each see their own; everyone else may pick. */
function defaultGroupFor(user: string | null): ContactGroup | null {
  if (user === "harry") return "sc";
  if (user === "nancy") return "office";
  return null;
}

const GROUP_LABEL: Record<ContactGroup, string> = { sc: "Shopping Centers & Residential", office: "Office" };

async function scope(req: NextRequest): Promise<{ user: string | null; group: ContactGroup | undefined }> {
  const user = await budgetUser();
  const fixed = defaultGroupFor(user);
  const asked = req.nextUrl.searchParams.get("group");
  const group = fixed ?? (asked === "sc" || asked === "office" ? asked : undefined);
  return { user, group };
}

export async function GET(req: NextRequest) {
  const { user, group } = await scope(req);
  const rows = await tenantsWithoutEmail(group);
  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    const asOf = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });
    const bytes = await buildFillSheet(rows, { who: group ? GROUP_LABEL[group] : "All Properties", asOf });
    const name = `Tenant Emails to Add - ${group ? GROUP_LABEL[group] : "All"}.xlsx`.replace(/&/g, "and");
    return new Response(Buffer.from(bytes), {
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}"` },
    });
  }
  return NextResponse.json({ ok: true, group: group ?? null, fixed: !!defaultGroupFor(user), rows });
}

export async function POST(req: NextRequest) {
  const user = await budgetUser();
  const by = user ? USERS[user]?.label ?? user : null;
  // Only suites on the current rent roll take an address from here.
  const roll = await resolveCurrentRentroll();
  const known = new Map<string, string>();
  for (const p of roll?.properties ?? []) for (const u of p.units ?? []) known.set(u.unitRef.toUpperCase(), u.unitRef);

  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
    let entries;
    try { entries = await readFillSheet(Buffer.from(await file.arrayBuffer())); }
    catch { return NextResponse.json({ error: "Could not read that file — use the Excel downloaded from this page." }, { status: 400 }); }
    if (!entries.length) return NextResponse.json({ error: "No emails found — fill the Email column of the downloaded sheet, then import it." }, { status: 400 });
    let tenants = 0, added = 0;
    const problems: { row: number; unitRef: string; problem: string }[] = [];
    for (const e of entries) {
      const ref = known.get(e.unitRef.toUpperCase());
      if (!ref) { problems.push({ row: e.row, unitRef: e.unitRef, problem: "Not a suite on the current rent roll" }); continue; }
      const { emails, bad } = splitEmails(e.email);
      if (bad.length) problems.push({ row: e.row, unitRef: ref, problem: `Not an email address: ${bad.join(", ")}` });
      if (!emails.length) continue;
      added += await addSuiteEmails(ref, emails, e.name);
      tenants++;
    }
    await logAudit({ event: "suites.emails-import", user: by, ip: auditIp(req), detail: `${file.name} · ${tenants} tenants · ${added} new addresses` });
    return NextResponse.json({ ok: true, tenants, added, problems });
  }

  const b = await req.json().catch(() => ({}));
  const ref = known.get(String(b?.unitRef ?? "").toUpperCase());
  if (!ref) return NextResponse.json({ error: "That suite is not on the current rent roll." }, { status: 404 });
  const { emails, bad } = splitEmails(String(b?.emails ?? ""));
  if (bad.length) return NextResponse.json({ error: `Not an email address: ${bad.join(", ")}` }, { status: 400 });
  if (!emails.length) return NextResponse.json({ error: "Type an email address." }, { status: 400 });
  const added = await addSuiteEmails(ref, emails, typeof b?.name === "string" ? b.name : null);
  await logAudit({ event: "suites.emails-add", user: by, ip: auditIp(req), detail: `${ref} · ${emails.join(", ")}` });
  return NextResponse.json({ ok: true, added });
}
