import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getRun } from "@/lib/statements/store";
import { instructionsFor } from "@/lib/statements/payment";
import { drawMonthlyStatement } from "@/lib/statements/monthlyStatementPdf";
import { periodLabel } from "@/lib/statements/summary";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;
const safe = (s: string) => s.replace(/[^\w]+/g, "_");

/** GET ?unitRef=…  → that tenant's monthly statement PDF.
 *  GET ?property=…  → every tenant in that property, one page each.
 *  GET (neither)    → the whole period. */
export async function GET(req: NextRequest, { params }: { params: { period: string } }) {
  const run = await getRun(params.period);
  if (!run) return NextResponse.json({ error: "No statements for that period." }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const unitRef = (searchParams.get("unitRef") ?? "").trim().toUpperCase();
  const property = (searchParams.get("property") ?? "").trim();

  let tenants = run.statements;
  if (unitRef) tenants = tenants.filter((s) => s.unitRef.toUpperCase() === unitRef);
  else if (property) tenants = tenants.filter((s) => s.propertyCode === property);
  if (tenants.length === 0) return NextResponse.json({ error: "No matching tenant." }, { status: 404 });

  const codes = [...new Set(tenants.map((s) => s.propertyCode))];
  const payment = Object.fromEntries(await Promise.all(codes.map(async (c) => [c, await instructionsFor(c)] as const)));

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  tenants.forEach((st, i) => {
    if (i > 0) doc.addPage();
    drawMonthlyStatement(doc, st, {
      propLabel: `${st.propertyCode} — ${propName(st.propertyCode)}`,
      period: run.period,
      payment: payment[st.propertyCode],
    });
  });

  const name = unitRef
    ? `${safe(tenants[0].tenantName)}_${params.period}_Statement.pdf`
    : `${safe(property || "All")}_${params.period}_Statements.pdf`;
  return new NextResponse(Buffer.from(doc.output("arraybuffer")), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "X-Statement-Period": periodLabel(run.period),
    },
  });
}
