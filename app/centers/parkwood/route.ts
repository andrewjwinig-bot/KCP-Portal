import { renderDesignedCenter } from "@/lib/centers/designed/render";

// Parkwood Shopping Center's designed page (Claude Design handoff), served
// whole in place of the /centers/[slug] template. Tenancy and SF are the live
// rent roll's on every request — see lib/centers/designed/sync.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  const html = await renderDesignedCenter("parkwood");
  if (!html) return new Response("Not found", { status: 404 });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
