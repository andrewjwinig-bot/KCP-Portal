import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { checkTenantAccess } from "@/lib/cam/tenantLink/access";
import { getRun, PERIOD_RE } from "@/lib/statements/store";
import { instructionsFor } from "@/lib/statements/payment";
import { drawMonthlyStatement } from "@/lib/statements/monthlyStatementPdf";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;
const safe = (s: string) => s.replace(/[^\w]+/g, "_");

/** Public — the tenant's own monthly statement as a branded PDF, behind the
 *  signed link. `?period=YYYY-MM`; unpublished periods are not served. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }): Promise<Response> {
  const access = await checkTenantAccess(params.token, req);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  }
  const { payload } = access;

  const period = (new URL(req.url).searchParams.get("period") ?? "").trim();
  if (!PERIOD_RE.test(period)) return NextResponse.json({ error: "Invalid period." }, { status: 400 });

  const run = await getRun(period);
  if (!run || !run.published) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
  const st = run.statements.find((s) => s.unitRef.toUpperCase() === payload.u.toUpperCase());
  if (!st) return NextResponse.json({ error: "Statement not found." }, { status: 404 });

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  drawMonthlyStatement(doc, st, {
    propLabel: `${st.propertyCode} — ${propName(st.propertyCode)}`,
    period,
    payment: await instructionsFor(st.propertyCode),
  });

  return new NextResponse(Buffer.from(doc.output("arraybuffer")), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe(st.tenantName)}_${period}_Statement.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
