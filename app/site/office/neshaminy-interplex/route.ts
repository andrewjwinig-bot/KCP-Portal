import { renderInterplex } from "@/lib/interplex/render";

// The Neshaminy Interplex Business Center website (Claude Design handoff),
// public. Its Available Space table is the live rent roll's on every request —
// see lib/interplex/spaces.ts. A static route, so it wins over the website's
// [category]/[slug] template for this one property.
export const dynamic = "force-dynamic";

export async function GET() {
  const html = await renderInterplex();
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
