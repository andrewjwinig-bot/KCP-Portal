// The credit-card statement's coding — what a charge can be coded to, when a
// charge is coded, and whose card it is on. ONE definition for Harry's Credit
// Card page, the "Charges to Code" card on Greg's and Drew's dashboards, and
// the server that routes each charge to its cardholder (owner: "greg should
// see his charges and drew should see the charges from Andrew to assign").
// Client-safe (no server imports).

export const CATEGORIES = [
  "MARKETING NR",
  "BUILDING MAINT.",
  "TI",
  "OFFICE SUPPLIES",
  "AUTO",
  "TELEPHONE",
  "COMP & IT",
  "MEALS & ENT.",
  "TRAINING & EDU",
  "G&A",
  "LANDSCAPING",
  "EQUIPMENT (CAP)",
  "BUILDINGS (CAP)",
] as const;

export const PROPERTIES = [
  { id: "BP & SC", name: "All BP & SC" },
  { id: "BP", name: "All BP" },
  { id: "SC", name: "All SC" },
  { id: "PJV3", name: "JV III — All Buildings (by SF)" },
  { id: "PNIPLX", name: "NI LLC — All Buildings (by SF)" },
  { id: "PIIICO", name: "JV III Condo" },
  { id: "1100", name: "Parkwood Professional Building" },
  { id: "1500", name: "Eastwick JV I" },
  { id: "2000", name: "Clearing Account" },
  { id: "2010", name: "LIK Management, Inc." },
  { id: "2040", name: "KF Nockamixon LLC" },
  { id: "2070", name: "Kosano Associates LP" },
  { id: "2080", name: "LKF Nock LP" },
  { id: "2300", name: "Brookwood Shopping Center" },
  { id: "3610", name: "Building 1" },
  { id: "3620", name: "Building 2" },
  { id: "3640", name: "Building 4" },
  { id: "4050", name: "Building 5" },
  { id: "4060", name: "Building 6" },
  { id: "4070", name: "Building 7" },
  { id: "4080", name: "Building 8" },
  { id: "40A0", name: "Building A" },
  { id: "40B0", name: "Building B" },
  { id: "40C0", name: "Building C" },
  { id: "4500", name: "Grays Ferry Shopping Ctr" },
  { id: "4900", name: "The Office Works" },
  { id: "5600", name: "Hyman Korman Co" },
  { id: "7010", name: "Parkwood Joint Venture" },
  { id: "7200", name: "Elbridge Shopping Center" },
  { id: "7300", name: "Revere Shopping Center" },
  { id: "8200", name: "Trust # 4" },
  { id: "9000", name: "Butler & Main" },
  { id: "9200", name: "Eastwick JV XII" },
  { id: "9510", name: "Shops of Lafayette Hill" },
  { id: "9800", name: "KH Bellaire" },
  { id: "9820", name: "KH Spring Garden" },
  { id: "9840", name: "KH Joshua" },
  { id: "9860", name: "KH Fort Washington" },
  { id: "0200", name: "TKD - Neshaminy, LLC" },
  { id: "0300", name: "Airport Interplex Two, Inc." },
  { id: "0800", name: "Interstate Business Park" },
] as const;

export type Tx = {
  id: string;
  date: string;
  cardMember: string;
  description: string;
  amount: number;
  category: string;
  propertyId: string;
  suite: string;
  codedDescription: string;
};

export function isRowCoded(t: Tx) {
  if (!t.category || !t.propertyId) return false;
  if (t.category === "TI" && !String(t.suite || "").trim()) return false;
  return true;
}

/** The fields a cardholder codes — the only ones a patch may change. */
export const CODING_FIELDS = ["category", "propertyId", "suite", "codedDescription"] as const;
export type CodingPatch = Partial<Pick<Tx, (typeof CODING_FIELDS)[number]>>;

/** Who codes a charge, by the statement's Card Member. Three cards (owner):
 *  Harry's own (and anything unrecognised), Greg's and Andrew's (Drew). */
export type Cardholder = "harry" | "greg" | "drew";
export function cardholderOf(cardMember: string): Cardholder {
  const m = String(cardMember || "").toLowerCase();
  if (/\bgreg/.test(m)) return "greg";
  if (/\bandrew\b|\bdrew\b/.test(m)) return "drew";
  return "harry";
}

export const CARDHOLDER_NAME: Record<Cardholder, string> = { harry: "Harry", greg: "Greg", drew: "Drew" };

/** Coded / total per cardholder, for Harry's page. */
export function codingProgress(tx: Tx[]): Record<Cardholder, { coded: number; total: number }> {
  const out: Record<Cardholder, { coded: number; total: number }> = { harry: { coded: 0, total: 0 }, greg: { coded: 0, total: 0 }, drew: { coded: 0, total: 0 } };
  for (const t of tx) {
    if (!(Number(t.amount) > 0)) continue;
    const h = cardholderOf(t.cardMember);
    out[h].total++;
    if (isRowCoded(t)) out[h].coded++;
  }
  return out;
}

/** A patch kept to the coding fields, every value a trimmed string. */
export function cleanPatch(patch: Record<string, unknown>): CodingPatch {
  const out: CodingPatch = {};
  for (const f of CODING_FIELDS) if (f in patch) out[f] = String(patch[f] ?? "").slice(0, 300);
  return out;
}
