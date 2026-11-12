import { describe, expect, it } from "vitest";
import { portalEmail } from "./portalEmail";

describe("portal emails", () => {
  const e = portalEmail({ subject: "s", eyebrow: "Bank Transfer", title: "New bank transfer", figure: { value: "$5,000.00" },
    rows: [{ label: "From", value: "JPM <x9629>" }, { label: "Bank", value: "" }], note: { label: "Details", text: "a\nb" }, link: { label: "Open", path: "/bank-transfers" } });
  it("escapes, drops empty rows and links into the portal", () => {
    expect(e.html).toContain("JPM &lt;x9629&gt;");
    expect(e.html).not.toContain(">Bank<");
    expect(e.html).toContain("a<br>b");
    expect(e.html).toMatch(/https:\/\/[^"]+\/bank-transfers/);
    expect(e.text).toContain("From: JPM <x9629>");
  });
});
