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
