// Where a K-1 gets emailed.
//
// The contact data exists in two places that grew separately: the beneficiary
// contacts (`ownerContacts.ts`, keyed by Statement-of-Values name) and the
// trustee directory inside `INVESTOR_STRUCTURES`. Neither is keyed by the K-1
// owner roster, so the send path resolved only 4 of Parkwood's 21 owners.
//
// This reads both, and adds a per-OWNER-ID override on top. The override is the
// important part: keyed by owner id, it sidesteps name matching entirely for
// anything a person types in, and it lets one person's two interests carry
// different addresses when a trust's mail goes somewhere else.
//
// The lookups are deliberately conservative. A wrong address here mails one
// investor's K-1 link to another investor — the same class of mistake the
// filename matcher used to make — so a name match counts ONLY when it resolves
// to exactly one contact, and the resolved address plus WHERE it came from is
// always shown before anything is sent. No silent guessing.

import { ownerContact, ownerContactExact, type ContactOverrides } from "@/lib/properties/ownerContacts";
import { INVESTOR_STRUCTURES } from "@/lib/investors/structures";
import { pruneNames, type AlsoNames } from "./mailAddress";

export type EmailSource = "override" | "contacts" | "trustee-directory" | "none";

export type ResolvedEmail = {
  email: string | null;
  /**
   * Additional recipients on the investor's contact record — an accountant, a
   * manager, a trustee. They receive the same email, so each of them can open
   * this investor's K-1: the send lists them all before it goes.
   *
   * Only ever read from the CONTACT record, never inferred, and never carried
   * by the per-owner-id override, which exists to redirect one interest's mail
   * rather than to widen who sees it.
   */
  alsoEmail: string[];
  /**
   * Who each address belongs to, keyed by lowercased address — the PRIMARY
   * included, not just the extras.
   *
   * The primary address was assumed to be the investor's and went out with no
   * addressee at all. It often isn't theirs: plenty of investors have only
   * their accountant's or their trustee's address on file, and that person
   * should be the one the mail greets. So the name defaults to whoever the
   * address actually resolved THROUGH — the trustee when it came from the
   * trustee directory — falling back to the investor, and staff can set it
   * outright on the contact card.
   *
   * A label over the address: never what decides who receives.
   */
  recipientNames: AlsoNames;
  source: EmailSource;
  /** Shown on the roster so staff can see why an address was chosen. */
  note: string;
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** First + last word, punctuation and middle initials dropped: "Catherine
 *  Korman Altman" and "Catherine Altman" both reduce to "catherine altman". */
function shortKey(name: string): string {
  const parts = norm(name)
    .replace(/[.,]/g, "")
    .split(" ")
    .filter((w) => w.length > 1);           // drops "R", "J", middle initials
  if (parts.length < 2) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Every email the trustee directory knows, by trustee name — WITH the name,
 *  because an address resolved through a trustee should be addressed to that
 *  trustee rather than to the investor whose trust they act for. */
function directoryEmails(): Map<string, { name: string; email: string }> {
  const out = new Map<string, { name: string; email: string }>();
  for (const s of Object.values(INVESTOR_STRUCTURES)) {
    for (const r of s.directory?.rows ?? []) {
      if (r.email) out.set(norm(r.name), { name: r.name, email: r.email });
    }
  }
  return out;
}

/** Build the short-key index once, keeping ONLY keys that are unambiguous. */
function uniqueShortIndex(entries: [string, string][]): Map<string, string> {
  const byShort = new Map<string, Set<string>>();
  for (const [name, email] of entries) {
    const k = shortKey(name);
    if (!k) continue;
    const set = byShort.get(k) ?? new Set<string>();
    set.add(email);
    byShort.set(k, set);
  }
  const out = new Map<string, string>();
  // Two different people reducing to the same short key means the key proves
  // nothing — drop it rather than pick one.
  for (const [k, emails] of byShort) if (emails.size === 1) out.set(k, [...emails][0]);
  return out;
}

/**
 * Resolve where an owner's K-1 link should be emailed.
 *
 * @param ownerName  the roster name, e.g. "Catherine Korman Altman"
 * @param detailedName the trust / held-as line, checked against the trustee
 *                     directory because a trust's mail often goes to its trustee
 * @param override   a per-owner-id address someone entered by hand — always wins
 * @param contacts   the contact-hub edits (`getContactOverrides()`). Most
 *                   investors' details exist ONLY here — the seed covers a
 *                   dozen people — so a caller that omits them resolves "no
 *                   address on file" for someone whose email is on their row.
 *                   Every caller passes them.
 */
export function resolveOwnerEmail(
  ownerName: string,
  detailedName: string | null | undefined,
  override: string | null | undefined,
  contacts?: ContactOverrides,
): ResolvedEmail {
  // The contact record is the source of the extra recipients whichever way
  // the primary address resolves — redirecting one interest's mail with an
  // override must not silently drop the investor's accountant.
  const contact = ownerContact(ownerName, contacts);
  const also = contact?.alsoEmail ?? [];
  // Pruned to the live addresses, so a removed recipient's name can't reattach
  // itself to whatever address takes its place.
  const alsoNames = pruneNames(also, contact?.alsoNames);

  /** One result, with the primary address's name folded into the same map the
   *  extras use — so every consumer reads ONE lookup and none of them has to
   *  know which address was the primary. */
  const resolved = (email: string | null, source: EmailSource, note: string, name?: string | null): ResolvedEmail => {
    const recipientNames = { ...alsoNames };
    if (email) {
      // An explicit name on the contact record wins; then whoever the address
      // resolved through; then the investor themselves.
      const who = (contact?.emailName ?? "").trim() || (name ?? "").trim() || ownerName.trim();
      if (who) recipientNames[email.trim().toLowerCase()] = who;
    }
    return { email, alsoEmail: also, recipientNames, source, note };
  };

  const trimmed = (override ?? "").trim();
  if (trimmed) return resolved(trimmed, "override", "Entered here");

  const exactContact = ownerContactExact(ownerName, contacts)?.email;
  if (exactContact) return resolved(exactContact, "contacts", "Owner contacts");

  const dir = directoryEmails();
  for (const candidate of [detailedName, ownerName]) {
    const hit = candidate ? dir.get(norm(candidate)) : undefined;
    // Named for the TRUSTEE: the address is theirs, and "Dear <the trust's
    // beneficiary>" on a mail to their lawyer reads as a misdirected email.
    if (hit) return resolved(hit.email, "trustee-directory", "Trustee directory", hit.name);
  }

  // Relaxed, and only where the short name is unique across BOTH sources —
  // otherwise the key identifies nobody and we say so instead.
  // `ownerContact` carries its own unambiguous short-key index, so the contact
  // map is searched properly rather than probed with one guessed key.
  const relaxedContact = ownerContact(ownerName, contacts)?.email;
  if (relaxedContact) return resolved(relaxedContact, "contacts", "Matched on name — check it");

  const shortIndex = uniqueShortIndex([...dir.entries()].map(([n, v]) => [n, v.email] as [string, string]));
  const relaxed = shortIndex.get(shortKey(ownerName));
  if (relaxed) return resolved(relaxed, "trustee-directory", "Matched on name — check it");

  return resolved(null, "none", "No address on file");
}
