import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS } from "@/lib/users";
import { QUARTERLY_BILLINGS, QUARTERS, type Quarter } from "@/lib/cam/retail/quarterly";
import { detailFor, previewQuarter, sendQuarter } from "@/lib/cam/retail/quarterlySend";
import { buildQuarterlyDetailPdf } from "@/lib/cam/retail/quarterlyDetail";
import { buildQuarterlyPdf } from "@/lib/cam/retail/quarterlyPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function currentUser(): Promise<string | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? id : null;
}

function parse(key: unknown, year: unknown, quarter: unknown) {
  const k = String(key ?? "");
  const y = Number(year);
  const q = String(quarter ?? "") as Quarter;
  const def = QUARTERLY_BILLINGS[k];
  if (!def || !def.years.includes(y) || !QUARTERS.includes(q)) return null;
  return { key: k, year: y, quarter: q };
}

/** GET ?key=&year=&quarter= → the confirm: recipients, the email as it will
 *  send, the quarter's figures, whether its GL is posted, anything that would
 *  hold an automatic send, and the send on record. `&pdf=1` → the PDF itself,
 *  the same bytes the email attaches. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const a = parse(sp.get("key"), sp.get("year"), sp.get("quarter"));
  if (!a) return NextResponse.json({ error: "Unknown billing, year or quarter" }, { status: 404 });
  if (sp.get("detail")) {
    const d = await detailFor(a.key, a.year, a.quarter);
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const def = QUARTERLY_BILLINGS[a.key];
    const bytes = buildQuarterlyDetailPdf(def, d.detail);
    const name = `${def.storeName} ${a.quarter} ${a.year} GL Detail.pdf`.replace(/[#/\\]/g, "");
    return new Response(Buffer.from(bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"` },
    });
  }
  const p = await previewQuarter(a.key, a.year, a.quarter);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sp.get("pdf")) {
    const { def, effective, computed } = p.loaded;
    const bytes = buildQuarterlyPdf(def, effective, computed, a.quarter, a.year);
    return new Response(Buffer.from(bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${p.attachmentName}"` },
    });
  }
  const { loaded: _loaded, ...preview } = p;
  return NextResponse.json(preview);
}

/* `&detail=1` → the GL charges behind the quarter (frozen at its send). */

/** POST { key, year, quarter, force? } → send it now (from Drew to the tenant,
 *  PDF attached, Bcc Drew) and record it. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const a = parse(body?.key, body?.year, body?.quarter);
  if (!a) return NextResponse.json({ error: "Unknown billing, year or quarter" }, { status: 400 });
  const r = await sendQuarter(a.key, a.year, a.quarter, { by: await currentUser(), force: !!body?.force });
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
