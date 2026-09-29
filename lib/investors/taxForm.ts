// Which tax form an interest's document is. Most partnerships issue a Schedule
// K-1; a property held directly (0900 Lincoln BLS) gives each owner a Schedule
// E page. Same upload, link, PIN and send — only the NAME differs, and a
// Schedule E labelled "Schedule K-1" in an investor's portal and email is the
// kind of wrong that makes someone ring their accountant.

import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { isSameProperty } from "./propertyCodeAlias";

export type TaxFormLabel = "Schedule K-1" | "Schedule E";

export function taxFormFor(propertyCode: string): TaxFormLabel {
  const p = PROPERTY_OWNERSHIP.find((x) => isSameProperty(x.propertyCode, propertyCode));
  return p?.taxForm === "schedule-e" ? "Schedule E" : "Schedule K-1";
}

/** What a set of documents is called: the form when they are all one kind,
 *  "tax document" when an investor's link holds both. Pluralised by count. */
export function taxFormNoun(propertyCodes: readonly string[], count: number): string {
  const forms = new Set(propertyCodes.map(taxFormFor));
  const base = forms.size === 1 ? [...forms][0] : forms.size === 0 ? "Schedule K-1" : "tax document";
  return count === 1 ? base : `${base}s`;
}
