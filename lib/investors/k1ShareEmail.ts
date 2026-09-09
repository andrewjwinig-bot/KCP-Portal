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
      "You'll be asked for a 6-digit access PIN, which we'll send to you separately.",
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
