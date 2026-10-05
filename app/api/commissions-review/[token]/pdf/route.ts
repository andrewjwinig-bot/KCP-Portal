import { NextResponse } from "next/server";
import { commissionReviewSecret, verifyCommissionReviewToken } from "@/lib/commissions/reviewLink";
import { invoiceFileName, quarterInvoiceRows, renderQuarterInvoice } from "@/lib/commissions/sendQuarterToAvidBill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One invoice PDF from Alison's review link — only an invoice IN the link's
 *  quarter, and the same bytes AvidXchange receives. */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const q = await verifyCommissionReviewToken(params.token, commissionReviewSecret());
  if (!q) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
  const id = new URL(req.url).searchParams.get("id");
  const row = (await quarterInvoiceRows(q)).find((r) => r.entry.id === id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = await renderQuarterInvoice(row);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceFileName(row.entry).replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
