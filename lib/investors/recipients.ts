/**
 * How a K-1 send is ADDRESSED — not who receives it.
 *
 * An investor can nominate additional recipients (an accountant, a manager),
 * and every one of them receives the link either way. This only decides which
 * header carries them: everyone on To as co-addressees, or the investor on To
 * with the others visibly Cc'd, which is how that relationship actually works.
 *
 * Split out from the route so the invariant that matters can be tested: the
 * set of people reached must be IDENTICAL under both settings. A bug here
 * would silently drop someone from an email about their own tax document.
 */

export type Addressing = { to: string[]; cc: string[] };

/**
 * Narrow a send to the recipients a person actually ticked.
 *
 * An investor may nominate an accountant, and the reason to name them is often
 * that THEY are the one who needs this copy — "send it to my accountant" is a
 * real instruction and used to mean mailing the investor too.
 *
 * The selection is FILTERED against the addresses on file, never taken as the
 * list. A client-supplied address would otherwise be a way to mail an
 * investor's K-1 link anywhere, which is the same reason `personGroup` is
 * derived server-side. Anything not already on this owner's record is dropped
 * silently — it was never a legitimate recipient.
 *
 * `only` undefined means everyone, so an older caller that doesn't send the
 * field keeps the behaviour it had.
 */
export function selectRecipients(
  primary: string | null | undefined,
  secondary: readonly string[] | undefined,
  only: readonly string[] | undefined,
): { primary: string | null; secondary: string[] } {
  const p = (primary ?? "").trim();
  const rest = (secondary ?? []).map((e) => e.trim()).filter(Boolean).filter((e) => e !== p);
  if (!only) return { primary: p || null, secondary: rest };
  const wanted = new Set(only.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const keep = (e: string) => wanted.has(e.toLowerCase());
  return {
    // Dropping the investor is deliberate and supported: the accountant alone
    // is then the addressee, which `addressRecipients` already handles.
    primary: p && keep(p) ? p : null,
    secondary: rest.filter(keep),
  };
}

export function addressRecipients(
  primary: string | null | undefined,
  secondary: readonly string[] | undefined,
  ccSecondary: boolean,
): Addressing {
  const to0 = (primary ?? "").trim();
  const rest = (secondary ?? []).map((e) => e.trim()).filter(Boolean).filter((e) => e !== to0);
  if (!to0) {
    // No primary address: there is nothing to Cc *onto*, so anyone we do have
    // is addressed directly rather than being copied on a mail to nobody.
    return { to: rest, cc: [] };
  }
  return ccSecondary ? { to: [to0], cc: rest } : { to: [to0, ...rest], cc: [] };
}

/** Everyone the message reaches, whichever header carried them. */
export function reached(a: Addressing): string[] {
  return [...a.to, ...a.cc];
}
