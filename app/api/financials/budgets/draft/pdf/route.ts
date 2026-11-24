import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { buildBudgetDraft } from "@/lib/financials/budgets/draft";
import { buildBookDrafts } from "@/lib/financials/budgets/bookDrafts";
import { consolidateDrafts } from "@/lib/financials/budgets/consolidate";
import { bookById, bookForProperty } from "@/lib/financials/budgets/books";
import { bookCategory, draftToPropertyBudget } from "@/lib/financials/budgets/publish";
import { generateBudgetDownloadPdf } from "@/lib/financials/budgets/budgetPdf";
import type { BudgetWorkbook, PropertyBudget } from "@/lib/financials/budgets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// A book builds every property's draft.
export const maxDuration = 300;

// GET /api/financials/budgets/draft/pdf?key=<property key>&year=
//     /api/financials/budgets/draft/pdf?book=<book id>&year=
// The Budget Draft as the presentation-ready budget PDF — the SAME renderer
// (and look) as a published budget's PDF download, marked DRAFT on every page,
// for sharing with investors before the budget is adopted. The draft is run
// through `draftToPropertyBudget` (the publish step's own conversion), so the
// PDF is exactly what publishing would produce: the budget's lines and totals
// only — no reprojection, no change columns, and no distributions / bank
// balance (the draft's cash section is not part of a budget). A book is one
// PDF: its roll-up first, then each property.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear() + 1;
  const key = url.searchParams.get("key");
  const bookId = url.searchParams.get("book");
  try {
    const shell = (category: BudgetWorkbook["category"], label: string): BudgetWorkbook => ({
      id: `draft-${year}`, label, kind: "published", category, year,
      uploadedAt: now.toISOString(), properties: [],
    } as BudgetWorkbook);

    if (bookId) {
      const book = bookById(bookId);
      // The LIK payroll book is per-employee pay, not a property budget — and it
      // is Drew's and Alison's alone. It has no draft PDF.
      if (!book || book.id === "lik-payroll") return NextResponse.json({ error: "No such budget book." }, { status: 404 });
      const drafts = await buildBookDrafts(book, year, 3);
      if (!drafts.length) return NextResponse.json({ error: "No drafts to print for that book." }, { status: 404 });
      const wb = shell(bookCategory(book.id), `${book.name} ${year} Draft Operating Budget`);
      const parts: PropertyBudget[] = [];
      const all = book.rollsUp ? consolidateDrafts(`All ${book.name}`, drafts) : null;
      if (all) parts.push(draftToPropertyBudget(all, null, "CONSOLIDATED").property);
      for (const d of drafts) parts.push(draftToPropertyBudget(d, null).property);
      const out = await PDFDocument.create();
      out.setTitle(`${year} DRAFT Operating Budget — ${book.name}`);
      out.setProducer("KCP Portal");
      for (const p of parts) {
        const src = await PDFDocument.load(await generateBudgetDownloadPdf(wb, p, { draft: true }));
        for (const pg of await out.copyPages(src, src.getPageIndices())) out.addPage(pg);
      }
      return pdfResponse(await out.save(), `${year} DRAFT Budget - ${book.name}.pdf`);
    }

    if (!key) return NextResponse.json({ error: "?key=<property> or ?book=<book> required" }, { status: 400 });
    const draft = await buildBudgetDraft(key, year, 3);
    if (!draft) return NextResponse.json({ error: `No ${year - 1} basis to build a ${year} draft from.` }, { status: 404 });
    const book = bookForProperty(draft.propertyCode);
    const wb = shell(book ? bookCategory(book.id) : ("Shopping Centers" as BudgetWorkbook["category"]), `${draft.propertyName} ${year} Draft Operating Budget`);
    const property = draftToPropertyBudget(draft, null).property;
    return pdfResponse(await generateBudgetDownloadPdf(wb, property, { draft: true }),
      `${year} DRAFT Budget - ${draft.propertyCode} ${draft.propertyName}.pdf`);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build the draft PDF" }, { status: 500 });
  }
}

function pdfResponse(buf: Uint8Array, filename: string) {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/["\r\n]/g, "")}"`,
    },
  });
}
