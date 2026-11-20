import { describe, expect, it } from "vitest";
import { draftEml, draftFileName } from "./draftEml";
import { TENANT_TEMPLATES, renderTenantEmail } from "./templates";

describe("the Outlook draft", () => {
  const t = TENANT_TEMPLATES[0];
  const eml = draftEml(t, "Winter Tips: please read");
  it("opens as an UNSENT message with no recipients and no From", () => {
    expect(eml.startsWith("X-Unsent: 1\r\n")).toBe(true);
    expect(eml).toMatch(/\r\nTo: \r\n/);
    expect(eml).not.toMatch(/^From:/m);
    expect(eml).toContain("Subject: Winter Tips: please read");
  });
  it("carries the same HTML the preview shows", () => {
    const part = eml.split("Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0];
    const html = new TextDecoder().decode(Uint8Array.from(atob(part.replace(/\r\n/g, "")), (c) => c.charCodeAt(0)));
    expect(html).toBe(renderTenantEmail(t).html);
  });
  it("names the file after the subject", () => {
    expect(draftFileName('Storm: "Tue/Wed"')).toBe("Storm TueWed.eml");
  });
});
