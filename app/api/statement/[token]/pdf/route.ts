import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { checkTenantAccess } from "@/lib/cam/tenantLink/access";
import { loadRetailRecon } from "@/lib/cam/retail/loadResult";
import { loadOfficeRecon } from "@/lib/cam/office/loadResult";
import { drawTenantStatement } from "@/lib/cam/office/statementPdf";
import { drawRetailStatement } from "@/lib/cam/retail/statementPdf";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;
const safe = (s: string) => s.replace(/[^\w]+/g, "_");

/** Public — the tenant's own CAM statement as a branded PDF, behind the signed
 *  link. Same drawing routine as the internal per-tenant PDF, minus the internal
 *  "Statement to:" recipient line. */
export async function GET(req: NextRequest, { params }: { params: { token: string } }): Promise<Response> {
  const access = await checkTenantAccess(params.token, req);
  if (!access.ok) return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  const { payload } = access;

  const propLabel = `${payload.p} — ${propName(payload.p)}`;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let suite = "", name = "";

  try {
    if (payload.k === "retail") {
      const loaded = await loadRetailRecon(payload.p, payload.y);
      const t = loaded?.result.tenants.find((x) => x.unitRef === payload.u);
      if (!t) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
      suite = t.suite; name = t.name;
      drawRetailStatement(doc, t, payload.y, propLabel, undefined, {
        subtitle: `${payload.y} Year-End Statement`,
        footerRight: `${payload.y} CAM / INS / RET Reconciliation  ·  Suite ${t.suite}`,
      });
    } else {
      const loaded = await loadOfficeRecon(payload.p, payload.y);
      const t = loaded?.result.tenants.find((x) => x.unitRef === payload.u);
      if (!t) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
      suite = t.suite; name = t.name;
      drawTenantStatement(doc, t, payload.y, propLabel, undefined, {
        subtitle: `${payload.y} Year-End Statement`,
        baseColLabel: `B/Y ${t.noBaseStop ? "—" : t.baseYear}`,
        actualColLabel: `Actual ${payload.y}`,
        footerRight: `${payload.y} CAM / RET Reconciliation  ·  Suite ${t.suite}`,
      });
    }
    const bytes = Buffer.from(doc.output("arraybuffer"));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${payload.p}_${payload.y}_Suite${safe(suite)}_${safe(name)}_CAM.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err: any) {
    console.error("[GET /api/statement/pdf]", err?.message ?? err);
    return NextResponse.json({ error: "Could not generate the statement PDF." }, { status: 500 });
  }
}
