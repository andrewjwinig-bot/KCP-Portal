// ─── PROPERTY MASTER DATA ────────────────────────────────────────────────────
// Single source of truth for all property definitions.
// Referenced by: /app/properties/page.tsx

export type PropType = "Office" | "Retail" | "Residential" | "Land" | "Misc";

export interface PropertyDef {
  id: string;         // property code (e.g., "3610")
  name: string;       // display name
  type: PropType;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  sqft?: number;
  yearBuilt?: number;
  notes?: string;
  // "BP" = Business Park (9301), "SC" = Shopping Centers (9302)
  allocGroup?: "BP" | "SC";
  // GL accounts used in CC Expense Coder for this property
  ccAccounts?: string[];
}

export const PROPERTY_DEFS: PropertyDef[] = [

  // ── Business Park (BP) — Office · Neshaminy Interplex, Feasterville-Trevose PA ─
  { id: "3610", name: "Building 1",   type: "Office", allocGroup: "BP", ccAccounts: ["8501"], address: "1 Neshaminy Interplex",  city: "Feasterville-Trevose", state: "PA", zip: "19053", sqft: 41821,  yearBuilt: 1977 },
  { id: "3620", name: "Building 2",   type: "Office", allocGroup: "BP", ccAccounts: ["8501"], address: "2 Neshaminy Interplex",  city: "Feasterville-Trevose", state: "PA", zip: "19053", sqft: 49020,  yearBuilt: 1978 },
  { id: "3640", name: "Building 4",   type: "Office", allocGroup: "BP", ccAccounts: ["8501"], address: "4 Neshaminy Interplex",  city: "Feasterville-Trevose", state: "PA", zip: "19053", sqft: 48794,  yearBuilt: 1981 },
  { id: "4050", name: "Building 5",   type: "Office", allocGroup: "BP", ccAccounts: ["8501"], address: "5 Interplex Dr",         city: "Feasterville-Trevose", state: "PA", zip: "19053", sqft: 54008,  yearBuilt: 1983 },
  { id: "4060", name: "Building 6",   type: "Office", allocGroup: "BP", ccAccounts: ["8501"], address: "6 Interplex Dr",         city: "Feasterville-Trevose", state: "PA", zip: "19053", sqft: 107890, yearBuilt: 1985 },
  { id: "4070", name: "Building 7",   type: "Office", allocGroup: "BP", ccAccounts: ["8501"], address: "7 Interplex Dr",         city: "Feasterville-Trevose", state: "PA", zip: "19053", sqft: 61448,  yearBuilt: 1987 },
  { id: "4080", name: "Building 8",   type: "Office", allocGroup: "BP", ccAccounts: ["8501"], address: "8 Interplex Dr",         city: "Feasterville-Trevose", state: "PA", zip: "19053", sqft: 127848, yearBuilt: 1991 },
  { id: "40A0", name: "Kor Center A", type: "Office", allocGroup: "BP", ccAccounts: ["8501"], address: "2577 Interplex Dr",      city: "Feasterville-Trevose", state: "PA", zip: "19053", sqft: 15083,  yearBuilt: 1976 },
  { id: "40B0", name: "Kor Center B", type: "Office", allocGroup: "BP", ccAccounts: ["8501"], address: "2607 Interplex Dr",      city: "Feasterville-Trevose", state: "PA", zip: "19053", sqft: 12978,  yearBuilt: 1976 },
  { id: "40C0", name: "Kor Center C", type: "Office", allocGroup: "BP", ccAccounts: ["8501"], address: "2585 Interplex Dr",      city: "Feasterville-Trevose", state: "PA", zip: "19053", sqft: 18000,  yearBuilt: 1976 },

  // ── Retail ────────────────────────────────────────────────────────────────
  { id: "1100", name: "Parkwood Professional Building",   type: "Retail", allocGroup: "SC", ccAccounts: ["8501"], address: "12300-12310 Academy Rd", city: "Philadelphia",          state: "PA", zip: "19154", sqft: 8287,  yearBuilt: 1970 },
  { id: "2300", name: "Brookwood Shopping Center",        type: "Retail", allocGroup: "SC", ccAccounts: ["8501"], address: "1847 Street Rd",         city: "Bensalem",              state: "PA", zip: "19020", sqft: 61572, yearBuilt: 1966 },
  { id: "4500", name: "Gray's Ferry Shopping Center",     type: "Retail", allocGroup: "SC", ccAccounts: ["8501"], address: "2897 Grays Ferry Ave",   city: "Philadelphia",          state: "PA", zip: "19146", sqft: 82809, yearBuilt: 1989 },
  { id: "7010", name: "Parkwood Shopping/Office Center",  type: "Retail", allocGroup: "SC", ccAccounts: ["8501"], address: "12301-12377 Academy Rd", city: "Philadelphia",          state: "PA",               sqft: 73209, yearBuilt: 1963 },
  { id: "9510", name: "Shops at Lafayette Hill",          type: "Retail", allocGroup: "SC", ccAccounts: ["8501"], address: "400-428 Germantown Pike", city: "Lafayette Hill",        state: "PA",               sqft: 19983, yearBuilt: 1976 },
  { id: "7200", name: "Elbridge Partnership", type: "Retail", allocGroup: "SC", ccAccounts: ["8501"], address: "7201 Roosevelt Blvd",  city: "Philadelphia", state: "PA", sqft: 22500 },
  { id: "7300", name: "Revere Partnership",   type: "Retail", allocGroup: "SC", ccAccounts: ["8501"], address: "6412-22 Castor Ave",  city: "Philadelphia", state: "PA", sqft: 14821 },
  { id: "1500", name: "Eastwick JV I",                    type: "Retail", allocGroup: "SC", ccAccounts: ["8501"] },
  { id: "9200", name: "Eastwick JV XII",                  type: "Retail",                   ccAccounts: ["8501"] },

  // ── Residential ───────────────────────────────────────────────────────────
  { id: "9800", name: "Bellaire Avenue",  type: "Residential", state: "PA" },
  { id: "9820", name: "Spring Garden St", type: "Residential", city: "Ambler",        state: "PA", zip: "19002" },
  { id: "9840", name: "Joshua Road",      type: "Residential", address: "3044 Joshua Rd", city: "Lafayette Hill", state: "PA", zip: "19444" },
  { id: "9860", name: "KH Fort Washington", type: "Residential", state: "PA" },

  // ── Other Commercial / Holding ────────────────────────────────────────────
  { id: "5600", name: "Castor Ave - USPS", type: "Retail", allocGroup: "SC", ccAccounts: ["8501"], address: "6382 Castor Ave", city: "Philadelphia", state: "PA", sqft: 1326, yearBuilt: 1951 },
  { id: "8200", name: "Trust #4",         type: "Retail", allocGroup: "SC", ccAccounts: ["8501"], address: "2801-2811 Cottman Ave", city: "Philadelphia", state: "PA", sqft: 10000, notes: "McDonald's (2801) + Four Seasons Diner (2811)" },
  { id: "4900", name: "The Office Works",            type: "Misc",                     ccAccounts: ["8501"], notes: "OW payroll group" },
  { id: "2010", name: "LIK Management, Inc.",        type: "Misc",                     ccAccounts: ["8501"], notes: "Management entity — LIK payroll group" },
  { id: "0300", name: "Airport Interplex Two, Inc.", type: "Land",                     ccAccounts: ["8501"] },
  { id: "0800", name: "Interstate Business Park",    type: "Land",                     ccAccounts: ["8501"], notes: "Bellmawr, NJ — quarterly Net Profits Tax" },

  // ── Land ──────────────────────────────────────────────────────────────────
  { id: "2070", name: "Kosano Associates LP (Nockamixon)", type: "Land", notes: "Has K-1 investors" },
  { id: "0900", name: "Interplex 2-Acre Land",             type: "Land" },
];

// ─── ALLOCATED INVOICER PERCENTAGES ──────────────────────────────────────────
// Mirrors ALLOCATION_TABLE in app/allocated-invoicer/page.tsx.
// Keys: property ID → { "9301": bp%, "9302": sc%, "9303": combined% }

export const ALLOC_PCT: Record<string, { "9301": number; "9302": number; "9303": number }> = {
  "3610": { "9301": 0.0779, "9302": 0.0000, "9303": 0.0514 },
  "3620": { "9301": 0.0913, "9302": 0.0000, "9303": 0.0602 },
  "3640": { "9301": 0.0909, "9302": 0.0000, "9303": 0.0600 },
  "4050": { "9301": 0.1006, "9302": 0.0000, "9303": 0.0664 },
  "4060": { "9301": 0.2009, "9302": 0.0000, "9303": 0.1326 },
  "4070": { "9301": 0.1146, "9302": 0.0000, "9303": 0.0756 },
  "4080": { "9301": 0.2380, "9302": 0.0000, "9303": 0.1571 },
  "40A0": { "9301": 0.0281, "9302": 0.0000, "9303": 0.0185 },
  "40B0": { "9301": 0.0242, "9302": 0.0000, "9303": 0.0159 },
  "40C0": { "9301": 0.0335, "9302": 0.0000, "9303": 0.0221 },
  "1100": { "9301": 0.0000, "9302": 0.0299, "9303": 0.0102 },
  "1500": { "9301": 0.0000, "9302": 0.0082, "9303": 0.0028 },
  "2300": { "9301": 0.0000, "9302": 0.2224, "9303": 0.0757 },
  "4500": { "9301": 0.0000, "9302": 0.2993, "9303": 0.1018 },
  "5600": { "9301": 0.0000, "9302": 0.0048, "9303": 0.0016 },
  "7010": { "9301": 0.0000, "9302": 0.2645, "9303": 0.0900 },
  "7200": { "9301": 0.0000, "9302": 0.0535, "9303": 0.0182 },
  "7300": { "9301": 0.0000, "9302": 0.0813, "9303": 0.0276 },
  "8200": { "9301": 0.0000, "9302": 0.0361, "9303": 0.0123 },
  "9510": { "9301": 0.0000, "9302": 0.0000, "9303": 0.0000 },
};

// ─── TYPE VISUAL CONFIG ───────────────────────────────────────────────────────

export const TYPE_STYLE: Record<PropType, { text: string; bg: string; border: string }> = {
  Office:      { text: "#0b4a7d", bg: "rgba(11,74,125,0.09)",  border: "rgba(11,74,125,0.28)"  },
  Retail:      { text: "#0d9488", bg: "rgba(13,148,136,0.09)", border: "rgba(13,148,136,0.28)" },
  Residential: { text: "#6d28d9", bg: "rgba(109,40,217,0.09)", border: "rgba(109,40,217,0.28)" },
  Land:        { text: "#b45309", bg: "rgba(180,83,9,0.09)",   border: "rgba(180,83,9,0.28)"   },
  Misc:        { text: "#475569", bg: "rgba(71,85,105,0.09)",  border: "rgba(71,85,105,0.28)"  },
};
