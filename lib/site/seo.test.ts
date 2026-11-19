import { describe, expect, it } from "vitest";
import { canonicalUrl, centerCanonical, designedHead, withDesignedHead, pageMeta, organizationLd, ldJson } from "./seo";
import { sitemapUrls, sitemapXml } from "./sitemap";

describe("one canonical address per page", () => {
  it("the website's paths canonicalize to kormancommercial.com at the root", () => {
    expect(canonicalUrl("/")).toBe("https://kormancommercial.com");
    expect(canonicalUrl("/site")).toBe("https://kormancommercial.com");
    expect(canonicalUrl("/site/company")).toBe("https://kormancommercial.com/company");
    expect(canonicalUrl("/retail/island-ave")).toBe("https://kormancommercial.com/retail/island-ave");
  });
  it("a centre with its own domain canonicalizes there; the rest on kormancommercial.com", () => {
    expect(centerCanonical("brookwood")).toBe("https://brookwoodshoppingcenter.com");
    expect(centerCanonical("grays-ferry")).toBe("https://graysferryshoppingcenter.com");
    expect(centerCanonical("lafayette-hill")).toBe("https://kormancommercial.com/centers/lafayette-hill");
    expect(centerCanonical("parkwood-professional")).toBe("https://kormancommercial.com/centers/parkwood-commons");
  });
  it("page metadata carries the canonical and a share card", () => {
    const m = pageMeta({ title: "Company", description: "d", path: "/company" });
    expect(m.alternates?.canonical).toBe("https://kormancommercial.com/company");
    expect((m.openGraph as { url?: string }).url).toBe("https://kormancommercial.com/company");
  });
});

describe("designed pages get a full head", () => {
  it("description, canonical, share card and JSON-LD go before the title; the old description goes", () => {
    const head = designedHead({ title: "Brookwood", description: "A \"centre\" & more", canonical: "https://brookwoodshoppingcenter.com", jsonLd: [organizationLd()] });
    const html = withDesignedHead(`<meta name="description" content="old"><title>Brookwood</title><body>x</body>`, head);
    expect(html.startsWith("<!doctype html>\n<html lang=\"en\">")).toBe(true);
    expect(html).toContain('<link rel="canonical" href="https://brookwoodshoppingcenter.com">');
    expect(html).toContain("A &quot;centre&quot; &amp; more");
    expect(html).not.toContain('content="old"');
    expect(html.indexOf("application/ld+json")).toBeLessThan(html.indexOf("<title>"));
  });
  it("JSON-LD can never close its script tag", () => {
    expect(ldJson({ x: "</script><b>" })).not.toContain("</script>");
  });
});

describe("the sitemap", () => {
  it("lists every page once, at its canonical, and no page that redirects", () => {
    const urls = sitemapUrls().map((u) => u.loc);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("https://kormancommercial.com/available-space");
    expect(urls).toContain("https://kormancommercial.com/office/neshaminy-interplex");
    expect(urls).toContain("https://kormancommercial.com/centers/lafayette-hill");
    expect(urls).not.toContain("https://kormancommercial.com/retail/brookwood-shopping-center");
    expect(urls.some((u) => u.includes("/site/"))).toBe(false);
    expect(sitemapXml(sitemapUrls(), "2026-11-19")).toContain("<lastmod>2026-11-19</lastmod>");
  });
});
