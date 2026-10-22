import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { checkTenantAccess } from "@/lib/cam/tenantLink/access";
import { loadRetailRecon } from "@/lib/cam/retail/loadResult";
import { loadOfficeRecon } from "@/lib/cam/office/loadResult";
import { drawTenantStatement } from "@/lib/cam/office/statementPdf";
import { drawRetailStatement } from "@/lib/cam/retail/statementPdf";
import { statementYearsForUnit } from "@/lib/cam/statementYears";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;
const safe = (s: string) => s.replace(/[^\w]+/g, "_");

/** Public — any prior/current year's CAM statement for the token's own unit, as
 *  a branded PDF. The requested year must be one this unit actually has a
 *  reconciliation for (statementYearsForUnit); anything else 404s. Same drawing
 *  routine as the current-year statement PDF. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }): Promise<Response> {
  const access = await checkTenantAccess(params.token, req);
  if (!access.ok) return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  const { payload } = access;

  const yearParam = Number(req.nextUrl.searchParams.get("year") ?? payload.y);
  const allowed = statementYearsForUnit(payload.k, payload.p, payload.u);
  const year = allowed.includes(yearParam) ? yearParam : payload.y;

  const propLabel = `${payload.p} — ${propName(payload.p)}`;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let suite = "", name = "";

  try {
    if (payload.k === "retail") {
      const loaded = await loadRetailRecon(payload.p, year);
      const t = loaded?.result.tenants.find((x) => x.unitRef === payload.u);
      if (!t) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
      suite = t.suite; name = t.name;
      drawRetailStatement(doc, t, year, propLabel, undefined, {
        subtitle: `${year} Year-End Statement`,
        footerRight: `${year} CAM / INS / RET Reconciliation  ·  Suite ${t.suite}`,
      });
    } else {
      const loaded = await loadOfficeRecon(payload.p, year);
      const t = loaded?.result.tenants.find((x) => x.unitRef === payload.u);
      if (!t) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
      suite = t.suite; name = t.name;
      drawTenantStatement(doc, t, year, propLabel, undefined, {
        subtitle: `${year} Year-End Statement`,
        baseColLabel: `B/Y ${t.noBaseStop ? "—" : t.baseYear}`,
        actualColLabel: `Actual ${year}`,
        footerRight: `${year} CAM / RET Reconciliation  ·  Suite ${t.suite}`,
      });
    }
    const bytes = Buffer.from(doc.output("arraybuffer"));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${payload.p}_${year}_Suite${safe(suite)}_${safe(name)}_CAM.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err: any) {
    console.error("[GET /api/portal/statement/pdf]", err?.message ?? err);
    return NextResponse.json({ error: "Could not generate the statement PDF." }, { status: 500 });
  }
}
