// The website's "Send Us a Message" form. The vendor's version posted to
// web3forms behind an hCaptcha with no required fields; ours posts to
// /api/website/contact, guarded by a honeypot + per-IP rate limit, and asks
// for the three fields a reply actually needs. Pure, so it is tested alone.

export const CONTACT_TO_DEFAULT = "info@kormancommercial.com";

export type ContactInput = { name: string; email: string; message: string; website: string };

export type ContactCheck =
  | { ok: true; spam: boolean; value: Omit<ContactInput, "website"> }
  | { ok: false; error: string };

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function checkContact(body: Record<string, unknown>): ContactCheck {
  const website = clean(body.website, 200);
  const name = clean(body.name, 200);
  const email = clean(body.email, 200);
  const message = clean(body.message, 5000);
  // A filled honeypot is accepted and dropped, so a bot learns nothing.
  if (website) return { ok: true, spam: true, value: { name, email, message } };
  if (!name) return { ok: false, error: "Please enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!message) return { ok: false, error: "Please enter a message." };
  return { ok: true, spam: false, value: { name, email, message } };
}

/** Comma-separated SITE_CONTACT_TO, else info@. */
export function contactRecipients(env: string | undefined = process.env.SITE_CONTACT_TO): string[] {
  const list = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : [CONTACT_TO_DEFAULT];
}

export function contactEmailText(v: Omit<ContactInput, "website">): string {
  return [
    "New message from the website contact form (kormancommercial.com).",
    "",
    `Name:   ${v.name}`,
    `Email:  ${v.email}`,
    "",
    "Message:",
    v.message,
  ].join("\n");
}
