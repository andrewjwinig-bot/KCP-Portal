import type { PropertyOwner } from "../../lib/properties/ownership";

/**
 * How a property's ownership table reads.
 *
 * Where every partner is a person the table is one flat list, as it always
 * was. Where a partner is itself a partnership the table sections instead —
 * the entity heads a band with its share of the property and its investors
 * beneath it, then the partners who hold the property directly follow under
 * their own heading. That is how the K-1 schedule prints, and reading a
 * corporate partner in alphabetical order between two individuals loses the
 * fact that twenty-four people sit behind it.
 */
export type OwnerSection = {
  key: string;
  /** Set on a section headed by an entity partner; its rows are that entity's investors. */
  entity?: PropertyOwner;
  /** Set on a plain heading (the direct partners). */
  label?: string;
  /** The section's share of the PROPERTY. */
  frac: number;
  owners: PropertyOwner[];
};

const byName = (a: PropertyOwner, b: PropertyOwner) => a.name.localeCompare(b.name);

export function ownerSections(owners: PropertyOwner[]): OwnerSection[] {
  const entities = owners.filter((o) => (o.subOwners?.length ?? 0) > 0);
  const direct = owners.filter((o) => !(o.subOwners?.length ?? 0));
  // No entity partners: one flat, unheaded section — every other property.
  if (entities.length === 0) return [{ key: "all", frac: 1, owners: direct }];

  const sections: OwnerSection[] = entities
    .slice()
    .sort((a, b) => (b.ownerPct ?? 0) - (a.ownerPct ?? 0))
    .map((e) => ({ key: e.id, entity: e, frac: e.ownerPct ?? 0, owners: (e.subOwners ?? []).slice().sort(byName) }));

  if (direct.length) {
    sections.push({
      key: "direct",
      label: "Other investors",
      frac: direct.reduce((s, o) => s + (o.ownerPct ?? 0), 0),
      owners: direct.slice().sort(byName),
    });
  }
  return sections;
}
