import { describe, expect, it } from "vitest";
import { hostRewrite, websiteRoute } from "./hostRoutes";

describe("website domains are served from their section of the portal", () => {
  it("kormancommercial.com serves the rebuilt company site", () => {
    expect(hostRewrite("kormancommercial.com", "/")).toBe("/site");
    expect(hostRewrite("www.kormancommercial.com", "/company")).toBe("/site/company");
    expect(hostRewrite("kormancommercial.com", "/site/company")).toBeNull();
    expect(hostRewrite("kormancommercial.com", "/api/website/contact")).toBeNull();
  });
  it("the portal's own host is never rewritten", () => {
    expect(hostRewrite("portal.kormancommercial.com", "/")).toBeNull();
    expect(hostRewrite("kcp-portal.vercel.app", "/dashboard")).toBeNull();
  });
  it("an Office Works domain serves /office-works", () => {
    expect(hostRewrite("theofficeworks.com", "/", "theofficeworks.com")).toBe("/office-works");
    expect(hostRewrite("www.theofficeworks.com", "/", "theofficeworks.com")).toBe("/office-works");
    expect(hostRewrite("theofficeworks.com", "/office-works/assets/p-ext.jpg", "theofficeworks.com")).toBeNull();
    expect(hostRewrite("officeworks.example", "/", "")).toBeNull();
    expect(hostRewrite("officeworks.example", "/", "officeworks.example")).toBe("/office-works");
  });
});

describe("a website domain serves only the website", () => {
  const k = (p: string) => websiteRoute("kormancommercial.com", p);
  it("never serves a portal page or API there", () => {
    expect(k("/login")).toEqual({ kind: "rewrite", path: "/site/login" });
    expect(k("/dashboard")).toEqual({ kind: "rewrite", path: "/site/dashboard" });
    expect(k("/api/rentroll")).toEqual({ kind: "notFound" });
    expect(k("/api/investor-k1")).toEqual({ kind: "notFound" });
    expect(k("/api/site/login")).toEqual({ kind: "notFound" });
  });
  it("lets the website's own pages, forms and assets through", () => {
    for (const p of ["/site/company", "/api/website/contact", "/api/maintenance/submit", "/api/center-image",
      "/_next/static/x.js", "/centers/parkwood", "/office-works/assets/p-ext.jpg", "/site/img/a.webp"]) {
      expect(k(p), p).toEqual({ kind: "pass" });
    }
    for (const p of ["/service", "/submit", "/reserve", "/api/reservations/submit", "/api/reservations/tenants",
      "/api/tenants/lookup", "/api/tenants/companies"]) {
      expect(k(p), p).toEqual({ kind: "pass" });
    }
    expect(k("/api/tenants")).toEqual({ kind: "notFound" });
    expect(k("/api/reservations")).toEqual({ kind: "notFound" });
    expect(k("/wp-login.php")).toEqual({ kind: "notFound" });
    expect(k("/favicon.ico")).toEqual({ kind: "rewrite", path: "/site/favicon.ico" });
  });
  it("theofficeworks.com / .net serve The Office Works site", () => {
    for (const h of ["theofficeworks.com", "www.theofficeworks.com", "theofficeworks.net", "www.theofficeworks.net"]) {
      expect(websiteRoute(h, "/"), h).toEqual({ kind: "rewrite", path: "/office-works" });
      expect(websiteRoute(h, "/login"), h).toEqual({ kind: "notFound" });
      expect(websiteRoute(h, "/dashboard"), h).toEqual({ kind: "notFound" });
      expect(websiteRoute(h, "/api/rentroll"), h).toEqual({ kind: "notFound" });
      expect(websiteRoute(h, "/api/website/tour"), h).toEqual({ kind: "pass" });
      expect(websiteRoute(h, "/office-works/assets/p-ext.jpg"), h).toEqual({ kind: "pass" });
    }
  });
  it("the Brookwood domains serve the Brookwood page alone", () => {
    for (const h of ["brookwoodshoppingcenter.com", "www.brookwoodshoppingcenter.com", "brookwood-shopping.com", "www.brookwood-shopping.com"]) {
      expect(websiteRoute(h, "/"), h).toEqual({ kind: "rewrite", path: "/centers/brookwood" });
      expect(websiteRoute(h, "/login"), h).toEqual({ kind: "notFound" });
      expect(websiteRoute(h, "/api/rentroll"), h).toEqual({ kind: "notFound" });
      expect(websiteRoute(h, "/centers/brookwood/assets/x.png"), h).toEqual({ kind: "pass" });
      expect(websiteRoute(h, "/centers/_shared/jspdf.min.js"), h).toEqual({ kind: "pass" });
    }
  });
  it("the middleware's website matcher catches every website host, anchored", async () => {
    const { config } = await import("../middleware");
    const re = new RegExp((config.matcher[1] as { has: { value: string }[] }).has[0].value);
    for (const h of ["kormancommercial.com", "www.kormancommercial.com", "theofficeworks.com", "www.theofficeworks.net", "brookwoodshoppingcenter.com", "www.brookwood-shopping.com"]) expect(re.test(h), h).toBe(true);
    for (const h of ["portal.kormancommercial.com", "kcp-portal.vercel.app", "theofficeworks.com.evil.io"]) expect(re.test(h), h).toBe(false);
  });
  it("leaves the portal's own host alone", () => {
    expect(websiteRoute("portal.kormancommercial.com", "/login")).toBeNull();
  });
});
