import { NextResponse } from "next/server";
import { buildBalanceView } from "@/lib/financials/bank-balances/view";
import { asOfOf, buildBalancePdf, buildBalanceXlsx } from "@/lib/financials/bank-balances/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?format=xlsx|pdf — the cash position as the page shows it. */
export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  try {
    const view = await buildBalanceView();
    const name = `Cash Position ${asOfOf(view) ?? new Date().toISOString().slice(0, 10)}`;
    if (format === "pdf") {
      return new NextResponse(buildBalancePdf(view), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"` },
      });
    }
    return new NextResponse(await buildBalanceXlsx(view), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/financials/bank-balances/export]", err?.stack ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
