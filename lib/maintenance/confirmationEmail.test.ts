import { describe, expect, it } from "vitest";
import { confirmationEmail, isInterplex } from "./confirmationEmail";

const base = { firstName: "Drew", propertyCode: "4080", propertyName: "Building 8", tenantSuite: "400", description: "Leak <b>here</b>\nsecond line", requestId: "req_1", submittedAt: new Date("2026-11-12T00:34:00Z") };

describe("service request confirmation", () => {
  it("uses the Interplex logo for its buildings and Korman's elsewhere", () => {
    expect(isInterplex("4080")).toBe(true);
    expect(isInterplex("4900")).toBe(true);
    expect(confirmationEmail(base).html).toContain("logo-interplex.png");
    expect(confirmationEmail({ ...base, propertyCode: "9510" }).html).toContain("korman-signature.png");
  });
  it("escapes the tenant's text and keeps their line breaks", () => {
    const { html } = confirmationEmail(base);
    expect(html).toContain("Leak &lt;b&gt;here&lt;/b&gt;<br>second line");
    expect(html).not.toContain("<b>here</b>");
  });
  it("dates the request in Eastern time", () => {
    expect(confirmationEmail(base).text).toContain("Submitted: Wednesday, November 11 at 7:34 PM");
  });
});

import { statusEmail } from "./confirmationEmail";
describe("status update emails", () => {
  const base = { tenantName: "Drew Winig", propertyCode: "4080", propertyName: "Building 8", tenantSuite: "400", summary: "Test", requestId: "req_1", submittedAt: new Date("2026-11-12T00:34:00Z"), completedAt: null };
  it("says work has started, with the emergency block", () => {
    const m = statusEmail({ ...base, status: "In Progress" });
    expect(m.subject).toBe("Work has started on your service request — Building 8");
    expect(m.html).toContain("Good news, Drew.");
    expect(m.html).toContain("An emergency?");
    expect(m.text).not.toMatch(/portal|reply/i);
  });
  it("says it's done, without it", () => {
    const m = statusEmail({ ...base, status: "Complete", completedAt: new Date("2026-11-13T15:00:00Z") });
    expect(m.html).toContain("All set, Drew.");
    expect(m.html).not.toContain("An emergency?");
    expect(m.text).toContain("Completed: Friday, November 13 at 10:00 AM");
  });
});
