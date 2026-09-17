// The budget BOOKS — seven of them, each covering its own set of buildings.
//
// A budget is not one document with a property filter on it. There is a
// Shopping Centers book, a JV III book, an NI LLC book and so on, and a
// property's budget is a SHEET INSIDE its book — which is why the 2026
// workbook opens on "All Shopping Centers" and then carries eleven property
// tabs. The roll-up is the point of the book; the properties are its parts.
//
// Membership is DERIVED from `PROPERTY_DEFS` rather than listed here, so a
// property added to a fund joins its book without a second edit. The one book
// that owns no buildings is the payroll budget, which is a source: the
// salaries it sets are what the Shopping Centers book allocates across the
// centres ("From 2026 Payroll Budget", in the workbook's own margin).

import { PROPERTY_DEFS, type PropertyDef } from "@/lib/properties/data";

export type BudgetBookId =
  | "shopping-centers" | "jv3" | "condo" | "ni-llc" | "lik" | "korman-homes" | "lik-payroll";

export type BudgetBook = {
  id: BudgetBookId;
  /** What it is called out loud. */
  name: string;
  /** One line under the masthead — what this book covers. */
  subtitle: string;
  /** Property codes, in the order the book lists them. Empty for payroll. */
  properties: string[];
  /** A book of buildings rolls up; the payroll book does not. */
  rollsUp: boolean;
  /** Payroll feeds the others rather than standing on its own. */
  feeds?: BudgetBookId[];
};

const codes = (f: (p: PropertyDef) => boolean): string[] =>
  PROPERTY_DEFS.filter(f).map((p) => p.id).sort();

export function budgetBooks(): BudgetBook[] {
  return [
    {
      id: "shopping-centers",
      name: "Shopping Centers",
      subtitle: "Every centre, with the shared costs allocated across them",
      properties: codes((p) => p.allocGroup === "SC"),
      rollsUp: true,
    },
    {
      id: "jv3",
      name: "JV III",
      subtitle: "Lincoln Joint Venture III",
      properties: codes((p) => p.fundGroup === "JV III" && p.entityKind !== "Condo"),
      rollsUp: true,
    },
    {
      id: "ni-llc",
      name: "NI LLC",
      subtitle: "Neshaminy Interplex LLC",
      // The LLC shell itself (4000) is the entity, not a building in the book.
      properties: codes((p) => p.fundGroup === "NI LLC" && !p.entityKind),
      rollsUp: true,
    },
    {
      id: "condo",
      name: "Condo",
      subtitle: "The condominium association",
      properties: codes((p) => p.entityKind === "Condo"),
      rollsUp: false,
    },
    {
      id: "korman-homes",
      name: "Korman Homes",
      subtitle: "The residential properties",
      properties: codes((p) => p.type === "Residential"),
      rollsUp: true,
    },
    {
      id: "lik",
      name: "2010 LIK",
      subtitle: "LIK Management, Inc. — the management entity",
      properties: codes((p) => p.id === "2010"),
      rollsUp: false,
    },
    {
      id: "lik-payroll",
      name: "2010 LIK Payroll",
      subtitle: "Sets the salaries the other books allocate",
      properties: [],
      rollsUp: false,
      // The salaries set here are what Shopping Centers spreads across the
      // centres by SF share — so this book is upstream of that one.
      feeds: ["shopping-centers", "jv3", "ni-llc"],
    },
  ];
}

export function bookById(id: string): BudgetBook | null {
  return budgetBooks().find((b) => b.id === id) ?? null;
}

/** Which book a property's budget lives in. Null for one in no book yet. */
export function bookForProperty(code: string): BudgetBook | null {
  const up = code.toUpperCase();
  return budgetBooks().find((b) => b.properties.some((p) => p.toUpperCase() === up)) ?? null;
}

/**
 * The properties a book covers, with their names — the tab strip.
 *
 * "All" is not in here: it is the roll-up, and the page leads with it rather
 * than listing it as one property among equals.
 */
export function bookProperties(book: BudgetBook): { code: string; name: string }[] {
  const byId = new Map(PROPERTY_DEFS.map((p) => [p.id, p.name]));
  return book.properties.map((code) => ({ code, name: byId.get(code) ?? code }));
}
