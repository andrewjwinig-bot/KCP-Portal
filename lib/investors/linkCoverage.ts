import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { linkOwnerIds, type InvestorLink } from "@/lib/investors/k1Link";

/**
 * Every interest a link covers — resolved through the PERSON, now, rather than
 * from the snapshot taken when the link was minted.
 *
 * A link belongs to the investor, not to a partnership. `ownerIds` is written
 * once at mint time from `personGroup`, so a link minted before an interest
 * existed does not list it: when 0800 was keyed in, every link already issued
 * stopped covering its holders' new 0800 rows. The roster then showed "no link"
 * for people who hold one, and the portal would have omitted a K-1 they should
 * see — a stale snapshot presented as an absence.
 *
 * The rule here is the SAME rule `personGroup` applies at mint time (normalised
 * name across the whole ownership roster), just evaluated at read time. So it
 * widens coverage only to interests the mint would have included had they
 * existed; it never groups people the mint would have kept apart.
 *
 * Widening coverage does NOT widen what an investor can read. A document is
 * only visible once PUBLISHED, and publishing happens per owner per year as
 * part of a deliberate send — so a newly covered interest shows nothing until
 * someone sends it.
 */
export function coveredOwnerIds(link: Pick<InvestorLink, "ownerId" | "ownerIds" | "ownerName">): string[] {
  const stored = linkOwnerIds(link);
  const all = PROPERTY_OWNERSHIP.flatMap((p) => p.owners);

  // The person is identified from the ids the link already carries; the link's
  // own `ownerName` is the fallback for a link whose interests have since been
  // removed from the roster entirely.
  const names = new Set(
    all.filter((o) => stored.includes(o.id)).map((o) => normName(o.name)),
  );
  if (names.size === 0 && link.ownerName) names.add(normName(link.ownerName));
  if (names.size === 0) return stored;

  const out = new Set(stored);
  for (const o of all) if (names.has(normName(o.name))) out.add(o.id);
  return [...out];
}

/** Case- and spacing-insensitive, matching `personGroup` in the share route. */
export function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
