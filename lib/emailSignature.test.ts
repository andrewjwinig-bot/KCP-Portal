import { describe, expect, it } from "vitest";
import { SIGNATURES, signatureFor, signatureHtml, signatureText } from "./emailSignature";
import { renderReminderEmail } from "./statements/balanceReminder";

describe("email signature", () => {
  it("signs Tami and Drew with their own name and phone, the office and the logo", () => {
    expect(signatureFor("Tami Tomlinson").phone).toBe("P: 215.638.1050");
    expect(signatureFor("Drew Winig").phone).toBe("C: 484.470.8655");
    const html = signatureHtml(SIGNATURES.tami);
    expect(html).toContain("Tami Tomlinson");
    expect(html).toContain("8 Neshaminy Interplex | Suite 400 | Trevose, PA 19053");
    expect(html).toContain("korman-signature.png");
    expect(signatureText(SIGNATURES.drew).split("\n")).toEqual(["Drew Winig", "8 Neshaminy Interplex | Suite 400 | Trevose, PA 19053", "C: 484.470.8655", "Korman Commercial Properties"]);
  });

  it("is appended after the editable closing at render", () => {
    const acct = { charges: [], creditLines: [], credit: 0, net: 0 } as never;
    const r = renderReminderEmail(acct, null, "Hello,", "Thank you,", SIGNATURES.tami);
    expect(r.text.endsWith("Thank you,\nTami Tomlinson\n8 Neshaminy Interplex | Suite 400 | Trevose, PA 19053\nP: 215.638.1050\nKorman Commercial Properties")).toBe(true);
    expect(r.html.indexOf("P: 215.638.1050")).toBeGreaterThan(r.html.indexOf("Thank you,"));
  });
});
