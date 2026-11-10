import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getSentInvoiceArchive } from "@/lib/invoicing/sentInvoiceArchive";
import { getAvidSent } from "@/lib/invoicing/avidSentStore";
import { getAvidSend } from "@/lib/invoicing/avidSendLog";
import { budgetUser } from "@/lib/financials/budgets/currentUser";

// The Credit Card invoices a statement month produced, for Expense History.
//   GET ?period=YYYY-MM                 → what was sent (archive, else the send ledger)
//   GET ?period=&file=<fileName>        → one archived PDF, inline
//   GET ?period=&zip=1                  → every archived PDF as a ZIP
// Greg (maint) sees only his own charges on that page, never the invoices.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE = "credit-card";

export async function GET(req: Request) {
  const who = await budgetUser();
  if (!who || who === "maint") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const u = new URL(req.url);
  const period = (u.searchParams.get("period") ?? "").trim();
  if (!/^\d{4}-\d{2}/.test(period)) return NextResponse.json({ error: "period required" }, { status: 400 });

  const archive = await getSentInvoiceArchive(SOURCE, period);
  const file = u.searchParams.get("file");
  if (file) {
    const inv = archive?.invoices.find((i) => i.fileName === file);
    if (!inv) return NextResponse.json({ error: "That invoice is not in the archive." }, { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(inv.pdfBase64, "base64")), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${u.searchParams.get("download") ? "attachment" : "inline"}; filename="${inv.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (u.searchParams.get("zip")) {
    if (!archive?.invoices.length) return NextResponse.json({ error: "No archived invoices for this month." }, { status: 404 });
    const zip = new JSZip();
    for (const inv of archive.invoices) zip.file(inv.fileName, Buffer.from(inv.pdfBase64, "base64"));
    const buf = await zip.generateAsync({ type: "uint8array" });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${period} - Credit Card Invoices.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const [ledger, log] = await Promise.all([getAvidSent(SOURCE, period).catch(() => null), getAvidSend(SOURCE, period).catch(() => null)]);
  return NextResponse.json({
    period,
    archived: !!archive,
    sentAt: archive?.sentAt ?? log?.sentAt ?? (Object.values(ledger?.invoices ?? {}).sort().pop() || null),
    sentBy: archive?.sentBy ?? log?.sentBy ?? null,
    total: log?.total ?? null,
    invoices: archive
      ? archive.invoices.map((i) => ({ fileName: i.fileName, propertyLabel: i.propertyLabel, code: i.code, amount: i.amount, sentAt: ledger?.invoices[i.fileName] ?? archive.sentAt }))
      : [],
    /** Sent before the archive existed: the file names the ledger recorded. */
    ledgerFiles: archive ? [] : Object.entries(ledger?.invoices ?? {}).map(([fileName, at]) => ({ fileName, sentAt: at })),
  });
}
