import { NextResponse } from "next/server";
import { reviewFlaggedLines } from "@/lib/financials/operating-statements/review";
import { buildReviewChecklistXlsx } from "@/lib/financials/operating-statements/reviewWorkbook";
import { canReadChecklist } from "@/lib/financials/operating-statements/reviewAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

// GET ?year= — the SAME workbook the import emails, as a download. The page
// used to build its own unthemed sheet, so the file you downloaded and the file
// you were mailed were two different documents describing one checklist.
export async function GET(req: Request) {
  if (!(await canReadChecklist())) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getFullYear();
  try {
    const buf = await buildReviewChecklistXlsx(await reviewFlaggedLines(year));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Operating Statements - Items to Resolve - ${year}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build the checklist" }, { status: 500 });
  }
}
