// ─── PROPERTY MASTER DATA ────────────────────────────────────────────────────
// Single source of truth for all property definitions.
// Referenced by: /app/properties/page.tsx

export type PropType = "Office" | "Retail" | "Residential" | "Land";

export interface PropertyDef {
  id: string;       // 4-char property code (e.g., "3610")
  name: string;     // Display name (e.g., "Building 1")
  type: PropType;
  address?: string;
  city?: string;
  state?: string;
  sqft?: number;
  notes?: string;
  // "BP" = Business Park (9301), "SC" = Shopping Centers (9302)
  allocGroup?: "BP" | "SC";
  // GL accounts used in CC Expense Coder for this property
  ccAccounts?: string[];
}

export const PROPERTY_DEFS: PropertyDef[] = [

  // ── Business Park (BP) — Office ───────────────────────────────────────────
  { id: "3610", name: "Building 1",            type: "Office",      allocGroup: "BP", ccAccounts: ["8501"] },
  { id: "3620", name: "Building 2",            type: "Office",      allocGroup: "BP", ccAccounts: ["8501"] },
  { id: "3640", name: "Building 4",            type: "Office",      allocGroup: "BP", ccAccounts: ["8501"] },
  { id: "4050", name: "Building 5",            type: "Office",      allocGroup: "BP", ccAccounts: ["8501"] },
  { id: "4060", name: "Building 6",            type: "Office",      allocGroup: "BP", ccAccounts: ["8501"] },
  { id: "4070", name: "Building 7",            type: "Office",      allocGroup: "BP", ccAccounts: ["8501"] },
  { id: "4080", name: "Building 8",            type: "Office",      allocGroup: "BP", ccAccounts: ["8501"] },
  { id: "40A0", name: "Building A (Kor Center)", type: "Office",    allocGroup: "BP", ccAccounts: ["8501"] },
  { id: "40B0", name: "Building B",            type: "Office",      allocGroup: "BP", ccAccounts: ["8501"] },
  { id: "40C0", name: "Building C",            type: "Office",      allocGroup: "BP", ccAccounts: ["8501"] },

  // ── Shopping Centers (SC) — Retail ───────────────────────────────────────
  { id: "2300", name: "Brookwood Shopping Center",  type: "Retail", allocGroup: "SC", ccAccounts: ["8501"] },
  { id: "4500", name: "Grays Ferry Shopping Ctr",   type: "Retail", allocGroup: "SC", ccAccounts: ["8501"] },
  { id: "7010", name: "Parkwood Joint Venture",      type: "Retail", allocGroup: "SC", ccAccounts: ["8501"] },
  { id: "7200", name: "Elbridge Shopping Center",    type: "Retail", allocGroup: "SC", ccAccounts: ["8501"] },
  { id: "7300", name: "Revere Shopping Center",      type: "Retail", allocGroup: "SC", ccAccounts: ["8501"] },
  { id: "9510", name: "Shops at Lafayette Hill",     type: "Retail", allocGroup: "SC", ccAccounts: ["8501"] },
  { id: "1500", name: "Eastwick JV I",               type: "Retail", allocGroup: "SC", ccAccounts: ["8501"] },

  // ── Mixed Commercial ──────────────────────────────────────────────────────
  { id: "1100", name: "Parkwood Professional Building", type: "Office", allocGroup: "SC", ccAccounts: ["8501"] },
  { id: "5600", name: "Hyman Korman Co",             type: "Office", allocGroup: "SC", ccAccounts: ["8501"] },
  { id: "8200", name: "Trust #4",                    type: "Office", allocGroup: "SC", ccAccounts: ["8501"] },
  { id: "9200", name: "Eastwick JV XII",             type: "Retail", ccAccounts: ["8501"] },
  { id: "4900", name: "The Office Works",            type: "Office", ccAccounts: ["8501"], notes: "OW payroll group" },
  { id: "2010", name: "LIK Management, Inc.",        type: "Office", ccAccounts: ["8501"], notes: "Management entity — LIK payroll group" },
  { id: "0300", name: "Airport Interplex Two, Inc.", type: "Office", ccAccounts: ["8501"] },
  { id: "0800", name: "Interstate Business Park",    type: "Office", ccAccounts: ["8501"], notes: "Bellmawr, NJ — quarterly Net Profits Tax" },

  // ── Residential ───────────────────────────────────────────────────────────
  { id: "9800", name: "KH Bellaire",        type: "Residential", address: "Bellaire Ave" },
  { id: "9820", name: "KH Spring Garden",   type: "Residential" },
  { id: "9840", name: "KH Joshua",          type: "Residential", address: "3044 Joshua Rd" },
  { id: "9860", name: "KH Fort Washington", type: "Residential" },

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

// ─── TYPE VISUAL CONFIG ────────────────────────────────────────────────────────

export const TYPE_STYLE: Record<PropType, { text: string; bg: string; border: string }> = {
  Office:      { text: "#0b4a7d", bg: "rgba(11,74,125,0.09)",  border: "rgba(11,74,125,0.28)"  },
  Retail:      { text: "#0d9488", bg: "rgba(13,148,136,0.09)", border: "rgba(13,148,136,0.28)" },
  Residential: { text: "#6d28d9", bg: "rgba(109,40,217,0.09)", border: "rgba(109,40,217,0.28)" },
  Land:        { text: "#b45309", bg: "rgba(180,83,9,0.09)",   border: "rgba(180,83,9,0.28)"   },
};
