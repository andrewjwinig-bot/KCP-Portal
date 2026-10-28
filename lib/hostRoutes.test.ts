import { describe, expect, it } from "vitest";
import { hostRewrite } from "./hostRoutes";

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
