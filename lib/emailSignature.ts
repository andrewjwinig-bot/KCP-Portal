// The company email signature, as the team signs by hand (owner, 11/2026:
// "add the right email signatures. replace the name and phone"):
//
//   Drew Winig
//   8 Neshaminy Interplex | Suite 400 | Trevose, PA 19053
//   C: 484.470.8655
//   [KORMAN | COMMERCIAL PROPERTIES]
//
// Pure (no server-only), so a page's preview draws the same block the send
// does. The signature is appended at RENDER, after the editable closing, so
// typing over the closing can never drop or garble it.

export type EmailSignature = { name: string; phone: string };

export const OFFICE_ADDRESS = "8 Neshaminy Interplex | Suite 400 | Trevose, PA 19053";

export const SIGNATURES = {
  drew: { name: "Drew Winig", phone: "C: 484.470.8655" },
  tami: { name: "Tami Tomlinson", phone: "P: 215.638.1050" },
} satisfies Record<string, EmailSignature>;

/** The signature for a sender, by name; anyone else gets name + office line. */
export function signatureFor(name: string): EmailSignature {
  const n = name.trim().toLowerCase();
  const hit = Object.values(SIGNATURES).find((s) => s.name.toLowerCase() === n);
  return hit ?? { name: name.trim(), phone: "" };
}

/** A hosted PNG — mail clients do not draw SVG. Served from the public
 *  `/site` folder on the company's own domain (the sending domain). */
export const SIGNATURE_LOGO_URL = "https://kormancommercial.com/site/email/korman-signature.png";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function signatureHtml(sig: EmailSignature): string {
  const line = (t: string, extra = "") => `<div style="margin:0;${extra}">${esc(t)}</div>`;
  return `<div style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#111827">`
    + line(sig.name, "font-weight:700;font-size:14px")
    + line(OFFICE_ADDRESS)
    + (sig.phone ? line(sig.phone) : "")
    + `<div style="margin:10px 0 0"><img src="${SIGNATURE_LOGO_URL}" alt="Korman Commercial Properties" width="220" height="27" style="display:block;width:220px;height:27px;border:0"></div>`
    + `</div>`;
}

export function signatureText(sig: EmailSignature): string {
  return [sig.name, OFFICE_ADDRESS, ...(sig.phone ? [sig.phone] : []), "Korman Commercial Properties"].join("\n");
}
