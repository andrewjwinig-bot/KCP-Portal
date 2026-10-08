// Grouping a property dropdown by what kind of property it is.
//
// The portfolio is three kinds of thing — office buildings, shopping centres
// and houses — and a flat alphabetical list interleaves them, so a tenant
// hunting for their building reads past every unrelated one. The order below
// is the order the business thinks in (Office, Shopping Centers, Residential),
// NOT alphabetical, and it is defined once here so the public request form and
// the admin filter cannot drift apart.
//
// "Shopping Centers" is the label; `Retail` is what PROPERTY_DEFS calls the
// type. The two are deliberately different — the internal type name is not the
// words a tenant should read.

export const PROPERTY_TYPE_GROUPS: { type: string; label: string }[] = [
  { type: "Office", label: "Office" },
  { type: "Retail", label: "Shopping Centers" },
  { type: "Residential", label: "Residential" },
];

/** The label a property type reads as, or null when it isn't one of the three. */
export function propertyTypeLabel(type: string | null | undefined): string | null {
  return PROPERTY_TYPE_GROUPS.find((g) => g.type === type)?.label ?? null;
}

/**
 * Group items into the three sections, in business order.
 *
 * An item whose type is none of the three lands in a trailing "Other" group
 * rather than being dropped — a property missing from a picker because its type
 * was unexpected is a bug nobody sees, and an empty group is never rendered, so
 * the cost of keeping them is nothing.
 */
export function groupByPropertyType<T>(
  items: T[],
  typeOf: (item: T) => string | null | undefined,
): { label: string; items: T[] }[] {
  const out = PROPERTY_TYPE_GROUPS.map((g) => ({
    label: g.label,
    items: items.filter((i) => typeOf(i) === g.type),
  }));
  const known = new Set(PROPERTY_TYPE_GROUPS.map((g) => g.type));
  const other = items.filter((i) => !known.has(typeOf(i) ?? ""));
  if (other.length) out.push({ label: "Other", items: other });
  return out.filter((g) => g.items.length > 0);
}
