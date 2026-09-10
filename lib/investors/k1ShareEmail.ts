/**
 * The K-1 share email, composed in ONE place.
 *
 * Staff preview and edit this before it goes out, so the draft they read has
 * to be the draft that sends — a preview composed separately from the sender
 * is a preview of nothing. `composeK1ShareEmail` is therefore the only place
 * the wording lives: the preview endpoint calls it, the send calls it, and an
 * edited draft is carried through as an override of its output rather than as
 * a second way of building one.
 */

export type K1ShareEmail = { subject: string; body: string };

export type K1ShareEmailInput = {
  ownerName: string;
  /** The partnership the send was made from — names a single-K-1 subject. */
  propertyName: string;
  /** How many K-1s this link now opens for them. */
  documentCount: number;
  taxYear: number;
  url: string;
};

export function composeK1ShareEmail(i: K1ShareEmailInput): K1ShareEmail {
  const many = i.documentCount > 1;
  return {
    subject: many
      ? `Your ${i.taxYear} Schedule K-1s — Korman Commercial Properties`
      : `Your ${i.taxYear} Schedule K-1 — ${i.propertyName}`,
    body: [
      `Hello ${i.ownerName},`,
      "",
      many
        ? `Your ${i.documentCount} Schedule K-1s are ready in your secure investor portal — one link covers every partnership you hold an interest in.`
        : `Your Schedule K-1 for ${i.propertyName} is ready in your secure investor portal.`,
      "",
      i.url,
      "",
      "You'll be asked for a 6-digit access PIN. It arrives in a separate email, just after this one.",
      "",
      "This link is private to you. Please don't forward it — if you need a copy sent elsewhere, reply and we'll arrange it.",
      "",
      "— Korman Commercial Properties",
    ].join("\n"),
  };
}

/** Hard ceilings on an edited draft, so a paste accident can't post a novel. */
export const MAX_SUBJECT = 200;
export const MAX_BODY = 8000;

/**
 * Fold a staff edit into the canonical draft.
 *
 * The one thing an edit may NOT do is lose the link: an email that arrives
 * without it is a K-1 notification the investor cannot act on, and they have
 * no other way to reach the document. So an edited body that no longer
 * contains the signed URL gets it appended rather than being rejected —
 * the edit is honoured, the link survives.
 */
export function applyK1EmailEdit(
  canonical: K1ShareEmail,
  edit: { subject?: unknown; body?: unknown } | null | undefined,
  url: string,
): { email: K1ShareEmail; edited: boolean } {
  const subject = typeof edit?.subject === "string" ? edit.subject.trim().slice(0, MAX_SUBJECT) : "";
  const bodyRaw = typeof edit?.body === "string" ? edit.body.slice(0, MAX_BODY).trim() : "";
  if (!subject && !bodyRaw) return { email: canonical, edited: false };

  const body = bodyRaw
    ? (bodyRaw.includes(url) ? bodyRaw : `${bodyRaw}\n\n${url}`)
    : canonical.body;
  const email = { subject: subject || canonical.subject, body };
  return { email, edited: email.subject !== canonical.subject || email.body !== canonical.body };
}


/**
 * The PIN, as its OWN email.
 *
 * Sent automatically, immediately after the link email — because a delivery
 * step that depends on someone remembering to make a phone call is a step that
 * gets missed, and an investor holding a link they cannot open is a support
 * call either way.
 *
 * The two messages are deliberately DISJOINT, and `k1ShareEmail.test.ts` pins
 * that: the link email carries no PIN, and this one carries no link. That is
 * what the split still buys once both go to the same mailbox — a forwarded
 * link email does not hand the recipient access, and neither message on its
 * own is enough. It is weaker than a genuinely separate channel (a text), and
 * if a real second channel is ever added this is the function it replaces.
 */
export function composeK1PinEmail(i: { ownerName: string; pin: string }): K1ShareEmail {
  return {
    subject: "Your access PIN — Korman Commercial Properties",
    body: [
      `Hello ${i.ownerName},`,
      "",
      "This is the 6-digit PIN for the secure investor portal link we've just sent you:",
      "",
      `    ${i.pin}`,
      "",
      "It stays the same each time you visit, so keep it somewhere you can find it.",
      "",
      "If you weren't expecting this, please let us know — and don't share the PIN with anyone.",
      "",
      "— Korman Commercial Properties",
    ].join("\n"),
  };
}

/**
 * The same message, as a `mailto:` your own mail client opens.
 *
 * The portal sending for you is the right default at 21 owners; sending it
 * yourself is the right answer when the message matters more than the volume.
 * It comes from your real mailbox, so it inherits your domain's deliverability
 * rather than the app's, it lands in your Sent Items — which is a better
 * record than anything the app can keep — and the investor can just reply.
 *
 * Deliberately NOT a second wording: it opens the draft this module already
 * composed, so the Outlook route and the portal route say the same thing.
 */
export function mailtoUrl(email: K1ShareEmail, to: string[], cc: string[] = []): string {
  const q = new URLSearchParams();
  q.set("subject", email.subject);
  q.set("body", email.body);
  if (cc.length) q.set("cc", cc.join(","));
  // URLSearchParams encodes spaces as "+", which mail clients render literally
  // in a subject line; mailto wants percent-encoding throughout.
  return `mailto:${encodeURIComponent(to.join(","))}?${q.toString().replace(/\+/g, "%20")}`;
}
