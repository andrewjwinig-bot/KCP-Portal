import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, USERS, canEditCashSheet, type UserId } from "@/lib/users";
import { parseBankBalances, unreadablePdfText, UNREADABLE_PDF_MESSAGE, type ParsedStatement } from "@/lib/financials/bank-balances/parse";
import { saveImport, loadSnapshots } from "@/lib/financials/bank-balances/store";
import { portfolioTrend } from "@/lib/financials/bank-balances/trend";
import { ACCRUED_ACCOUNTS, accruedBalance } from "@/lib/financials/bank-balances/accrued";
import { accountId } from "@/lib/financials/bank-balances/entities";
import { buildBalanceView } from "@/lib/financials/bank-balances/view";
import { logAudit, auditIp } from "@/lib/audit";
import { pdfText } from "@/lib/pdf/pdfText";
import { recordImport } from "@/lib/tracker/importEvents";
import { markTaskComplete } from "@/lib/tracker/completionStore";
import { bankTaskOccurrence } from "@/lib/tracker/taskDefs";
import { maybeSendCashPosition } from "@/lib/financials/bank-balances/ownershipEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

export async function GET() {
  const user = await currentUser();
  try {
    const [view, snapshots] = await Promise.all([buildBalanceView(), loadSnapshots().catch(() => [])]);
    // The header tiles over time (clicked open on the page).
    const trend = portfolioTrend(snapshots, ACCRUED_ACCOUNTS.map((a) => ({ id: accountId(a.bank, a.last4), balanceOn: (d: string) => accruedBalance(a, d) })));
    return NextResponse.json({ ...view, trend, canEdit: !user || canEditCashSheet(user) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

/** POST (multipart `files`) — Chase / Liberty / M&T balance exports, as PDFs. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (user && !canEditCashSheet(user)) return NextResponse.json({ error: "You have view-only access to Bank Balances." }, { status: 403 });
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    const parsed: ParsedStatement[] = [];
    const results: { file: string; bank: string | null; accounts: number; total: number; error?: string }[] = [];
    for (const file of files) {
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        // Judged by CONTENT, not name: Chrome saves Chase's page as "Accounts - chase.com".
        if (buf.subarray(0, 1024).indexOf("%PDF") < 0) { results.push({ file: file.name, bank: null, accounts: 0, total: 0, error: "Not a PDF — save the bank's accounts page with Print → \"Save as PDF\" and import that file." }); continue; }
        const text = await pdfText(buf);
        const s = parseBankBalances(text);
        if ((!s || !s.accounts.length) && unreadablePdfText(text)) { results.push({ file: file.name, bank: null, accounts: 0, total: 0, error: UNREADABLE_PDF_MESSAGE }); continue; }
        if (!s || !s.accounts.length) { results.push({ file: file.name, bank: s?.bank ?? null, accounts: 0, total: 0, error: "No account balances found — is this a Chase, Liberty or M&T balance export?" }); continue; }
        parsed.push(s);
        results.push({ file: file.name, bank: s.bank, accounts: s.accounts.length, total: Math.round(s.accounts.reduce((t, a) => t + a.balance, 0) * 100) / 100 });
      } catch (e: any) {
        results.push({ file: file.name, bank: null, accounts: 0, total: 0, error: e?.message ?? "Could not read the PDF" });
      }
    }
    if (!parsed.length) return NextResponse.json({ error: results[0]?.error ?? "Nothing imported.", results }, { status: 400 });
    const by = user ? USERS[user]?.label ?? user : null;
    const saved = await saveImport(parsed, by);
    await logAudit({ event: "bank-balances.import", user: user ?? "?", ip: auditIp(req), detail: results.map((r) => `${r.bank ?? r.file}: ${r.accounts}`).join(" · ") }).catch(() => {});
    try { await recordImport("imp-bank", { at: new Date().toISOString(), by }); } catch { /* best-effort */ }
    // …and ticks this week's Monday "Bank Balances" task on everyone's tracker.
    try {
      const o = bankTaskOccurrence(new Date());
      await markTaskComplete(o.year, o.month0, o.id, { at: new Date().toISOString(), by: by ?? undefined, source: "bank-balances" });
    } catch { /* best-effort — the balances still imported */ }
    // Every bank in for the week → the Monday cash position goes to ownership.
    const email = await maybeSendCashPosition(by).catch((e) => ({ sent: false, reason: e?.message ?? "Email failed" }));
    return NextResponse.json({ ok: true, results, ...saved, email });
  } catch (err: any) {
    console.error("[POST /api/financials/bank-balances]", err?.stack ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
