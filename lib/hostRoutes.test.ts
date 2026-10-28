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
    expect(hostRewrite("theofficeworks.com", "/", "")).toBeNull();
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
    expect(k("/wp-login.php")).toEqual({ kind: "notFound" });
  });
  it("leaves the portal's own host alone", () => {
    expect(websiteRoute("portal.kormancommercial.com", "/login")).toBeNull();
  });
});
