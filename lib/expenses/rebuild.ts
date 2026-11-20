// A credit-card month sent BEFORE invoices were archived has only file names
// on record (owner: "i see the invoices but i cant download or view specific
// property invoices"). Its saved statement still holds every coded charge, so
// a property's invoice can be REBUILT: the charges split as the coder splits
// them (`split.ts`), grouped by category. It is a marked copy — a balance held
// from earlier months and folded into the original is not in the saved
// statement, so the rebuilt total can be lower than what was billed.

import type { CategoryGroup } from "./invoice";
import { expandForAllocation } from "./split";

export type SavedCharge = {
  date: string; description: string; codedDescription: string; category: string;
  propertyId: string; suite: string; amount: number; cardMember?: string;
};

export function rebuildPropertyCharges(tx: SavedCharge[], code: string): { categoryGroups: CategoryGroup[]; total: number; count: number } {
  const mine = tx.filter((t) => t.category && t.propertyId).flatMap((t) => expandForAllocation(t)).filter((t) => t.propertyId === code);
  const byCat = new Map<string, typeof mine>();
  for (const t of mine) byCat.set(t.category, [...(byCat.get(t.category) ?? []), t]);
  const categoryGroups: CategoryGroup[] = [...byCat.entries()].map(([category, items]) => ({
    category,
    items: items.map((t) => ({ date: t.date, description: t.description, amount: t.amount, category: t.category, suite: t.suite, codedDescription: t.codedDescription, originalAmount: t.originalAmount })) as any,
  }));
  const total = Math.round(mine.reduce((a, t) => a + t.amount, 0) * 100) / 100;
  return { categoryGroups, total, count: mine.length };
}
