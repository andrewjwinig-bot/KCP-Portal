import { renderOfficeWorks } from "@/lib/officeWorks/render";

// The Office Works website (Claude Design handoff), public. Open offices are
// the live 4900 rent roll's on every request — see lib/officeWorks/offices.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  const html = await renderOfficeWorks();
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
