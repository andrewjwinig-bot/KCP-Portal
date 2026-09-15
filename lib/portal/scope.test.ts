import { describe, expect, it } from "vitest";
import { serviceRequestMatchesTenant, reservationMatchesTenant, normCompany } from "./scope";

// Guardrail: a signed portal token must only ever surface its OWN tenant's
// records. These lock the scoping predicates so a refactor can't widen them
// into a cross-tenant leak.

const tenant = { company: "Robert Half International, Inc", propertyCode: "7010", unitRef: "7010-201" };
const sr = (o: Partial<{ tenantCompany: string; propertyCode: string | null; tenantSuite: string }>) => ({
  tenantCompany: o.tenantCompany ?? "",
  propertyCode: o.propertyCode ?? null,
  tenantSuite: o.tenantSuite ?? "",
});

describe("serviceRequestMatchesTenant", () => {
  it("matches the tenant's own company (case/space-insensitive)", () => {
    expect(serviceRequestMatchesTenant(sr({ tenantCompany: "  robert half international, INC " }), tenant)).toBe(true);
  });

  it("matches by exact unit on the same property even if the company differs", () => {
    expect(serviceRequestMatchesTenant(sr({ tenantCompany: "Someone Else", propertyCode: "7010", tenantSuite: "7010-201, 7010-202" }), tenant)).toBe(true);
  });

  it("excludes another company's request", () => {
    expect(serviceRequestMatchesTenant(sr({ tenantCompany: "Acme Dental" }), tenant)).toBe(false);
  });

  it("excludes a different suite on the same property", () => {
    expect(serviceRequestMatchesTenant(sr({ tenantCompany: "Acme Dental", propertyCode: "7010", tenantSuite: "7010-305" }), tenant)).toBe(false);
  });

  it("excludes the same suite ref on a different property", () => {
    expect(serviceRequestMatchesTenant(sr({ tenantCompany: "Acme", propertyCode: "1100", tenantSuite: "7010-201" }), tenant)).toBe(false);
  });

  it("never matches when the tenant has no company and no unit overlap", () => {
    const anon = { company: "", propertyCode: "7010", unitRef: "" };
    expect(serviceRequestMatchesTenant(sr({ tenantCompany: "", propertyCode: "7010", tenantSuite: "7010-201" }), anon)).toBe(false);
  });

  it("does not treat a suite substring as a match", () => {
    // tenantSuite "7010-2010" must not match unitRef "7010-201"
    expect(serviceRequestMatchesTenant(sr({ tenantCompany: "X", propertyCode: "7010", tenantSuite: "7010-2010" }), tenant)).toBe(false);
  });
});

describe("reservationMatchesTenant", () => {
  it("matches the tenant's own company (case/space-insensitive)", () => {
    expect(reservationMatchesTenant({ tenantCompany: "ROBERT HALF INTERNATIONAL, INC" }, tenant)).toBe(true);
  });

  it("excludes another company's reservation", () => {
    expect(reservationMatchesTenant({ tenantCompany: "Acme Dental" }, tenant)).toBe(false);
  });

  it("never matches when the tenant company is empty", () => {
    expect(reservationMatchesTenant({ tenantCompany: "" }, { company: "" })).toBe(false);
    expect(reservationMatchesTenant({ tenantCompany: "Anyone" }, { company: "" })).toBe(false);
  });
});

describe("normCompany", () => {
  it("trims and lowercases", () => {
    expect(normCompany("  Foo BAR ")).toBe("foo bar");
  });
});
