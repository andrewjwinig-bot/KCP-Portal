// NNN Quote — a vacant suite's estimated CAM / INS / RET (owner, 11/2026:
// "right now he comes to me and asks me what NNNs would be for a specific
// space"). GET gives the centres the viewer quotes; GET ?code= gives that centre's
// suites, budget pools, GLA, typical admin fee and NNN history. The math is
// `lib/leasing/nnnQuote.ts`, run in the page.
import { NextResponse } from "next/server";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";
import { loadNnnQuote, quoteProperties } from "@/lib/leasing/nnnQuoteLoad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const user = await budgetUser();
  const scope = user ? USERS[user]?.budgetScope?.codes ?? null : null;
  const properties = quoteProperties(scope);
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").toUpperCase();
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear() + 1;
  if (!code) return NextResponse.json({ ok: true, properties, budgetYear: year });
  if (!properties.some((p) => p.code === code)) return NextResponse.json({ error: "That centre is not one you quote." }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, properties, quote: await loadNnnQuote(code, year) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
