// Every property's draft in a book, built four at a time and kept in the
// book's order — what the book's "All …" tab sums and what Publish to Budgets
// writes. One helper so the two cannot build a book differently.

import "server-only";
import { buildBudgetDraft, type BudgetDraft } from "./draft";
import type { BudgetBook } from "./books";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";

export async function buildBookDrafts(book: BudgetBook, year: number, growthPct: number): Promise<BudgetDraft[]> {
  const list = await availableStatements();
  const keys = book.properties
    .map((c) => list.find((m) => m.propertyCode.toUpperCase() === c.toUpperCase())?.key)
    .filter((k): k is string => !!k);
  const drafts: BudgetDraft[] = [];
  const queue = [...keys];
  const worker = async () => {
    for (let k = queue.shift(); k; k = queue.shift()) {
      const d = await buildBudgetDraft(k, year, growthPct).catch(() => null);
      if (d) drafts.push(d);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  // Keep the book's own order, whatever order the drafts finished in.
  drafts.sort((a, b) => book.properties.indexOf(a.propertyCode) - book.properties.indexOf(b.propertyCode));
  return drafts;
}
