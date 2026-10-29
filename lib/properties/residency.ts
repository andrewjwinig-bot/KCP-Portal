// Residency classification for owners, derived from their contact mailing
// address — used to flag potential PA (and other-state) nonresident tax
// withholding. This is an INDICATOR to help staff, not tax advice: PA generally
// requires 3.07% withholding on PA-source taxable income allocable to
// nonresident partners/beneficiaries. Whether/how much to withhold is a K-1-time
// determination for the CPA.

export type ResidencyCategory = "PA" | "state" | "foreign" | "unknown";

export interface Residency {
  category: ResidencyCategory;
  /** 2-letter US state when detected (e.g. "MD", "NY", "PA"). */
  state?: string;
  /** Country when clearly non-US (e.g. "Canada"). */
  country?: string;
  /** Short display label. */
  label: string;
  /** True when the owner is likely a nonresident for PA withholding purposes. */
  nonresident: boolean;
}

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

// Non-US markers that appear in the seed/imported addresses.
const FOREIGN_MARKERS: [re: RegExp, country: string][] = [
  [/\bcanada\b/i, "Canada"],
  [/\b(ontario|quebec|british columbia|alberta|manitoba|nova scotia)\b/i, "Canada"],
  [/\bunited kingdom\b|\bengland\b/i, "United Kingdom"],
];

/** Classify an owner's residency from a free-form mailing address. */
export function residencyOf(address?: string | null): Residency {
  const addr = (address ?? "").trim();
  if (!addr) return { category: "unknown", label: "No address", nonresident: false };

  for (const [re, country] of FOREIGN_MARKERS) {
    if (re.test(addr)) return { category: "foreign", country, label: country, nonresident: true };
  }

  // Prefer a state that sits right before a 5-digit ZIP; else any ", XX" token.
  const beforeZip = /,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/.exec(addr);
  let state: string | undefined = beforeZip?.[1];
  if (!state) {
    const tokens = [...addr.matchAll(/,\s*([A-Z]{2})\b/g)].map((m) => m[1]).filter((s) => US_STATES.has(s));
    state = tokens.length ? tokens[tokens.length - 1] : undefined;
  }
  if (state && US_STATES.has(state)) {
    if (state === "PA") return { category: "PA", state, label: "PA resident", nonresident: false };
    return { category: "state", state, label: `Nonresident · ${state}`, nonresident: true };
  }
  return { category: "unknown", label: "Residency unknown", nonresident: false };
}
