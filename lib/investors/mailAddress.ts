// Naming an additional recipient.
//
// An investor nominates an accountant or a trustee, and until now all we kept
// was the address. That shows up in two places where a bare address is worse
// than useless:
//
//   • the send confirm, where "cborgmann@gmmsfoundation.com" is the ONE thing
//     staff are meant to read before mailing somebody a tax document, and it
//     says nothing about who that is;
//   • the email itself, where a K-1 link arriving with no addressee reads like
//     something that leaked rather than something that was sent.
//
// The address stays the source of truth for WHO receives the mail — names are a
// label over it, stored separately and keyed by address, so nothing about
// delivery depends on a name being present or correct.

/** Display names for additional recipients, keyed by LOWERCASED address. */
export type AlsoNames = Record<string, string>;

const clean = (s: string | null | undefined) => (s ?? "").replace(/[\r\n]+/g, " ").trim();

/** The name on file for an address, or null. */
export function nameFor(email: string, names: AlsoNames | undefined): string | null {
  const n = clean(names?.[clean(email).toLowerCase()]);
  return n || null;
}

/**
 * One address as a mail header writes it: `"Claire Borgmann" <c@x.com>`.
 *
 * The display name is ALWAYS quoted and its quotes and backslashes escaped, so
 * a comma or a period in a name cannot split or truncate a joined To header.
 * CR and LF are stripped first: a header value is newline-delimited, so a name
 * carrying one would let whatever follows it become a header of its own.
 */
export function formatAddress(email: string, name?: string | null): string {
  const addr = clean(email);
  if (!addr) return "";
  const raw = clean(name);
  if (!raw) return addr;
  return `"${raw.replace(/["\\]/g, "\\$&")}" <${addr}>`;
}

/** A header value from several addresses, each named where a name is known. */
export function formatAddressList(emails: readonly string[], names: AlsoNames | undefined): string {
  return emails.map((e) => formatAddress(e, nameFor(e, names))).filter(Boolean).join(", ");
}

/** How an address reads on screen: the name when we have one, else the bare
 *  address. The address is always shown too — it is what actually receives. */
export function recipientLabel(email: string, names: AlsoNames | undefined): { name: string | null; email: string } {
  return { name: nameFor(email, names), email: clean(email) };
}

/** Keep only the names whose address is still a recipient, lower-cased. Stops
 *  a removed address leaving its name behind to reattach to a later one. */
export function pruneNames(alsoEmail: readonly string[], names: AlsoNames | undefined): AlsoNames {
  const live = new Set(alsoEmail.map((e) => clean(e).toLowerCase()).filter(Boolean));
  const out: AlsoNames = {};
  for (const [addr, name] of Object.entries(names ?? {})) {
    const k = clean(addr).toLowerCase();
    const v = clean(name);
    if (k && v && live.has(k)) out[k] = v;
  }
  return out;
}
