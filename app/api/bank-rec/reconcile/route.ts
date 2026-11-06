import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { loadBookSide } from "@/lib/financials/bank-rec/bookSide";
import { reconcile } from "@/lib/financials/bank-rec/reconcile";
import { parseChaseCsv } from "@/lib/financials/bank-rec/chaseCsv";
import { getJSON, storeJSON } from "@/lib/storage";
import { bankRecKey } from "@/lib/bank-rec/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function authed(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/bank-rec") ? (id as UserId) : null;
}

/** GET ?key=&year= → the GL cash accounts + coverage available for a property,
 *  so the page can populate the cash-account picker before running. */
export async function GET(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  try {
    const book = await loadBookSide(key, year, 1, "0110-0000"); // month/code irrelevant for the account list
    if (!book) return NextResponse.json({ hasGl: false, cashAccounts: [], coverageStartMonth: 1, coverageEnd: 0 });
    return NextResponse.json({ hasGl: true, cashAccounts: book.cashAccounts, coverageStartMonth: book.coverageStartMonth, coverageEnd: book.coverageEnd });
  } catch (err: any) {
    console.error("[GET /api/bank-rec/reconcile]", err?.message ?? err);
    return NextResponse.json({ hasGl: false, cashAccounts: [], coverageStartMonth: 1, coverageEnd: 0 });
  }
}

/** POST { key, year, month, cashAccount, statementEnd?, bankCsv } → reconciliation. */
export async function POST(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  try {
    const body = await req.json();
    const key = String(body?.key ?? "");
    const year = Number(body?.year) || new Date().getFullYear();
    const month = Number(body?.month);
    const cashAccount = String(body?.cashAccount ?? "0110-0000");
    const bankCsv = String(body?.bankCsv ?? "");
    if (!key || !month || month < 1 || month > 12) return NextResponse.json({ error: "key and month (1–12) are required" }, { status: 400 });
    if (!bankCsv.trim()) return NextResponse.json({ error: "Paste or upload the bank CSV" }, { status: 400 });

    const book = await loadBookSide(key, year, month, cashAccount);
    if (!book) return NextResponse.json({ error: `No GL found for ${key} ${year}. Import it on Operating Statements first.` }, { status: 200 });

    const { txns: bankTxns, endingBalance: csvEndingBalance } = parseChaseCsv(bankCsv);
    if (bankTxns.length === 0) return NextResponse.json({ error: "No transactions found in the CSV (expected a Chase activity export)." }, { status: 200 });

    const statementEnd = Number.isFinite(Number(body?.statementEnd)) && body?.statementEnd !== "" && body?.statementEnd != null
      ? Number(body.statementEnd)
      : (csvEndingBalance ?? book.ending);

    const result = reconcile(book.txns, bankTxns, statementEnd, book.ending);

    // When it ties out, auto-check the Bank Acc Tracker's "reconciled" box for
    // this account + period (keyed last4|YYYY-MM), so the tracker reflects it.
    let trackerUpdated = false;
    const last4 = String(body?.last4 ?? "").trim();
    if (result.inBalance && last4) {
      try {
        const period = `${year}-${String(month).padStart(2, "0")}`;
        const map = ((await getJSON("bank-rec", "checked")) as Record<string, boolean> | null) ?? {};
        const k = bankRecKey(last4, period);
        if (!map[k]) { map[k] = true; await storeJSON("bank-rec", "checked", map); }
        trackerUpdated = true;
      } catch { /* best-effort — the rec still stands */ }
    }

    return NextResponse.json({
      result,
      book: { opening: book.opening, ending: book.ending, cashAccounts: book.cashAccounts, coverageStartMonth: book.coverageStartMonth, coverageEnd: book.coverageEnd },
      csvEndingBalance,
      statementEnd,
      bankCount: bankTxns.length,
      trackerUpdated,
    });
  } catch (err: any) {
    console.error("[POST /api/bank-rec/reconcile]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
