// How many K-1s ONE INVESTOR receives, and how many of them are in.
//
// The per-partnership summary cannot answer this. A person in four
// partnerships holds four separate documents, and each of those four
// partnerships can read as nearly complete while every K-1 still outstanding
// is hers — the counts are taken along a different axis.
//
// Two rules, both of which produce a WRONG NUMBER if dropped:
//
//   1. Only interests in partnerships that DISTRIBUTE K-1s count. An investor
//      also holding a stake in a property that issues none receives fewer K-1s
//      than they hold properties, and a count that says otherwise sends
//      someone hunting for a document that was never going to arrive.
//
//   2. The count is over DIRECT partners only. A sub-owner's K-1 is issued by
//      the entity above, not by the property, so it is not a document this
//      property owes them. The caller's roster already excludes sub-owners —
//      this function must not be handed a flattened tree.

export type K1CountInterest = {
  /** The partnership the interest is held in. */
  propertyCode: string;
  /** Whether that partnership issues K-1s at all. */
  hasK1Distribution: boolean;
  /** The owner record's id — the K-1 upload target. */
  ownerId: string;
};

export type K1Count = {
  /** K-1s this investor receives. */
  expected: number;
  /** How many are uploaded — null until the uploaded set is known. */
  collected: number | null;
  /** Property codes still outstanding, in roster order. */
  missing: string[];
};

/**
 * @param uploaded Owner ids with a K-1 in for the year, or null if not loaded.
 *                 Null yields `collected: null` rather than 0 — claiming none
 *                 are in before the data arrives is the one answer that reads
 *                 as a problem when there isn't one.
 */
export function k1CountFor(interests: K1CountInterest[], uploaded: Set<string> | null): K1Count {
  const due = interests.filter((i) => i.hasK1Distribution);
  const has = (i: K1CountInterest) => !!uploaded?.has(i.ownerId);
  return {
    expected: due.length,
    collected: uploaded ? due.filter(has).length : null,
    missing: due.filter((i) => !has(i)).map((i) => i.propertyCode),
  };
}
