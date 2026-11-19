import { headers } from "next/headers";
import { hostBase } from "@/lib/hostRoutes";

// robots.txt, by HOST (lib/site/seo.ts): a website domain is open to search
// engines and names its sitemap; the portal (portal.kormancommercial.com and
// any other host) is closed — its public copy of the website points search at
// kormancommercial.com through each page's canonical anyway.
export const dynamic = "force-dynamic";

export function GET() {
  const host = (headers().get("host") ?? "").toLowerCase().split(":")[0];
  const body = hostBase(host)
    ? ["User-agent: *", "Allow: /", "Disallow: /api/", "", `Sitemap: https://${host.replace(/^www\./, "")}/sitemap.xml`, ""].join("\n")
    : ["User-agent: *", "Disallow: /", ""].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
