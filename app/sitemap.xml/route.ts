import { headers } from "next/headers";
import { hostBase } from "@/lib/hostRoutes";
import { sitemapUrls, sitemapXml } from "@/lib/site/sitemap";
import { liveSiteListings } from "@/lib/site/liveListings";
import { spacePath } from "@/lib/site/spaces";

// sitemap.xml, by HOST: kormancommercial.com lists every page of the website
// (lib/site/sitemap.ts); a centre's or The Office Works' own domain lists its
// one page. The portal has none.
export const dynamic = "force-dynamic";

export async function GET() {
  const host = (headers().get("host") ?? "").toLowerCase().split(":")[0].replace(/^www\./, "");
  const base = hostBase(host);
  if (!base) return new Response("Not found", { status: 404 });
  const spaces = base === "/site" ? await liveSiteListings().then((ls) => ls.map(spacePath)).catch(() => []) : [];
  const urls = base === "/site" ? sitemapUrls(spaces) : [{ loc: `https://${host}/`, priority: 1, changefreq: "daily" as const }];
  return new Response(sitemapXml(urls), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
