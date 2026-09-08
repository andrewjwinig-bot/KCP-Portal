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

import { ownerContact } from "@/lib/properties/ownerContacts";
import { INVESTOR_STRUCTURES } from "@/lib/investors/structures";

export type EmailSource = "override" | "contacts" | "trustee-directory" | "none";

export type ResolvedEmail = {
  email: string | null;
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

/** Every email the trustee directory knows, by trustee name. */
function directoryEmails(): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of Object.values(INVESTOR_STRUCTURES)) {
    for (const r of s.directory?.rows ?? []) {
      if (r.email) out.set(norm(r.name), r.email);
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
 */
export function resolveOwnerEmail(
  ownerName: string,
  detailedName: string | null | undefined,
  override: string | null | undefined,
): ResolvedEmail {
  const trimmed = (override ?? "").trim();
  if (trimmed) return { email: trimmed, source: "override", note: "Entered here" };

  const exactContact = ownerContact(ownerName)?.email;
  if (exactContact) return { email: exactContact, source: "contacts", note: "Owner contacts" };

  const dir = directoryEmails();
  for (const candidate of [detailedName, ownerName]) {
    const hit = candidate ? dir.get(norm(candidate)) : undefined;
    if (hit) return { email: hit, source: "trustee-directory", note: "Trustee directory" };
  }

  // Relaxed, and only where the short name is unique across BOTH sources —
  // otherwise the key identifies nobody and we say so instead.
  const contactEntries: [string, string][] = [];
  // ownerContacts has no iterator; probe it with the names we actually have.
  const c = ownerContact(shortKey(ownerName));
  if (c?.email) contactEntries.push([shortKey(ownerName), c.email]);
  const shortIndex = uniqueShortIndex([
    ...contactEntries,
    ...[...dir.entries()].map(([n, e]) => [n, e] as [string, string]),
  ]);
  const relaxed = shortIndex.get(shortKey(ownerName));
  if (relaxed) return { email: relaxed, source: "trustee-directory", note: "Matched on name — check it" };

  return { email: null, source: "none", note: "No address on file" };
}
