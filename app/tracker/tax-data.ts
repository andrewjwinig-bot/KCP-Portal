// ─── SHARED TAX DATA ────────────────────────────────────────────────────────
// Imported by both /tracker/taxes/page.tsx and /tracker/page.tsx so that
// task definitions and localStorage keys stay in sync between the two pages.

export type TaxCategory = "ret" | "quarterly" | "entity";

export const TAX_CATEGORIES: Record<TaxCategory, { label: string; pill: string; dot: string; bg: string; text: string; border: string }> = {
  ret:       { label: "Real Estate Tax",    pill: "RET", dot: "#0b4a7d", bg: "rgba(11,74,125,0.08)",  text: "#0b4a7d", border: "rgba(11,74,125,0.25)"  },
  quarterly: { label: "Net Profits / BIRT", pill: "NP",  dot: "#b45309", bg: "rgba(180,83,9,0.08)",   text: "#b45309", border: "rgba(180,83,9,0.25)"   },
  entity:    { label: "Entity Filings",     pill: "EN",  dot: "#6d28d9", bg: "rgba(109,40,217,0.08)", text: "#6d28d9", border: "rgba(109,40,217,0.25)" },
};

export interface TaxTask {
  id: string;
  entity: string;        // full label (may include " — Q1" suffix for quarterly)
  category: TaxCategory;
  retType?: "county" | "school"; // distinguishes within RET for the filing label
  dueMonth: number;      // 1-12
  dueDay: number;        // 1-31
  notes?: string;
}

export const TAX_TASKS: TaxTask[] = [

  // ─── COUNTY REAL ESTATE TAX ─────────────────────────────────────────────

  { id: "co-1500", entity: "1500 Eastwick JV I",              category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-4500", entity: "4500 Grays Ferry SC",             category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-4510", entity: "4510 Grays Ferry Partners",       category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-5600", entity: "5600 Hyman Korman Co",            category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-7010", entity: "7010 Parkwood SC",                category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-7200", entity: "7200 Elbridge",                   category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-7300", entity: "7300 Revere",                     category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-8200", entity: "8200 Trust #4",                   category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-9200", entity: "9200 Eastwick JV XI",             category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-1100", entity: "1100 Parkwood Professional Bldg", category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-9800", entity: "9800 Bellaire Ave",               category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-2070", entity: "2070 Nockamixon",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-2300", entity: "2300 Brookwood SC",               category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-0900", entity: "0900 Interplex 2-Acre Land",      category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-piic", entity: "PIIICO Condo",                    category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-3610", entity: "3610 Building 1",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-2620", entity: "2620 Building 1",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-3640", entity: "3640 Building 4",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-4050", entity: "4050 Building 5",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-4060", entity: "4060 Building 6",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-4070", entity: "4070 Building 7",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-4080", entity: "4080 Building 8",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-40a0", entity: "40A0 Kor Center",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-9840", entity: "9840 3044 Joshua Rd",             category: "ret", retType: "county", dueMonth: 5,  dueDay: 1,  notes: "Berkheimer sends bill" },
  { id: "co-9510", entity: "9510 Lafayette Hill SC",          category: "ret", retType: "county", dueMonth: 5,  dueDay: 1,  notes: "Berkheimer sends bill" },

  // ─── SCHOOL REAL ESTATE TAX ─────────────────────────────────────────────

  { id: "sc-2070", entity: "2070 Nockamixon",                 category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },
  { id: "sc-9800", entity: "9800 Bellaire Ave",               category: "ret", retType: "school", dueMonth: 9,  dueDay: 2  },
  { id: "sc-9840", entity: "9840 3044 Joshua Rd",             category: "ret", retType: "school", dueMonth: 9,  dueDay: 2,  notes: "Berkheimer sends bill" },
  { id: "sc-9510", entity: "9510 Lafayette Hill SC",          category: "ret", retType: "school", dueMonth: 9,  dueDay: 2,  notes: "Berkheimer sends bill" },
  { id: "sc-2300", entity: "2300 Brookwood SC",               category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-0900", entity: "0900 Interplex 2-Acre Land",      category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-piic", entity: "PIIICO Condo",                    category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-3610", entity: "3610 Building 1",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-2620", entity: "2620 Building 1",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-3640", entity: "3640 Building 4",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-4050", entity: "4050 Building 5",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-4060", entity: "4060 Building 6",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-4070", entity: "4070 Building 7",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-4080", entity: "4080 Building 8",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-40a0", entity: "40A0 Kor Center",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-7200", entity: "7200 Elbridge",                   category: "ret", retType: "school", dueMonth: 9,  dueDay: 15 },
  { id: "sc-7300", entity: "7300 Revere",                     category: "ret", retType: "school", dueMonth: 9,  dueDay: 15 },
  { id: "sc-8200", entity: "8200 Trust #4",                   category: "ret", retType: "school", dueMonth: 9,  dueDay: 15 },

  // ─── NET PROFITS TAX / BIRT ──────────────────────────────────────────────

  { id: "np-0800-q1", entity: "0800 Bellmawr — Q1", category: "quarterly", dueMonth: 2,  dueDay: 1, notes: "Net Profits Tax — pay online" },
  { id: "np-0800-q2", entity: "0800 Bellmawr — Q2", category: "quarterly", dueMonth: 5,  dueDay: 1, notes: "Net Profits Tax — pay online" },
  { id: "np-0800-q3", entity: "0800 Bellmawr — Q3", category: "quarterly", dueMonth: 8,  dueDay: 1, notes: "Net Profits Tax — pay online" },
  { id: "np-0800-q4", entity: "0800 Bellmawr — Q4", category: "quarterly", dueMonth: 11, dueDay: 1, notes: "Net Profits Tax — pay online" },

  // ─── ENTITY / STATUTORY FILINGS ─────────────────────────────────────────

  { id: "ent-nim-jun",  entity: "Neshaminy Interplex, MM, LP (DE)", category: "entity", dueMonth: 6,  dueDay: 1, notes: "File #5404613" },
  { id: "ent-nil-jun",  entity: "Neshaminy Interplex LLC (DE)",     category: "entity", dueMonth: 6,  dueDay: 1, notes: "File #5404612" },
  { id: "ent-0800-nov", entity: "0800 Bellmawr JV, LLP (NJ)",       category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9400392779" },
  { id: "ent-nim-nov",  entity: "Neshaminy Interplex, MM, LP (DE)", category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9401222288" },
  { id: "ent-nil-nov",  entity: "Neshaminy Interplex LLC (DE)",     category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9401231147" },
  { id: "ent-2010-nov", entity: "2010 LIK Management, Inc. (PA)",   category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9400393039" },
];

// ─── SHARED STORAGE ─────────────────────────────────────────────────────────
// Both pages read/write the same key so checkboxes stay in sync.

export function taxStorageKey(year: number) { return `tax-tracker-v1-${year}`; }

export function loadTaxChecked(year: number): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(taxStorageKey(year)) ?? "{}"); }
  catch { return {}; }
}

export function saveTaxChecked(year: number, data: Record<string, boolean>) {
  localStorage.setItem(taxStorageKey(year), JSON.stringify(data));
}

// ─── SHARED HELPERS ──────────────────────────────────────────────────────────

export function baseEntityName(entity: string): string {
  return entity.replace(/ — Q[1-4]$/, "");
}

export function quarterSuffix(entity: string): string | null {
  const m = entity.match(/ — (Q[1-4])$/);
  return m ? m[1] : null;
}

export function filingLabel(t: TaxTask): string {
  if (t.category === "ret") {
    return t.retType === "school" ? "School Real Estate Tax" : "County Real Estate Tax";
  }
  if (t.category === "quarterly") {
    const q = quarterSuffix(t.entity);
    return q ? `Net Profits Tax — ${q}` : "Net Profits Tax";
  }
  return "Entity Filing";
}

// Full label shown on the master tracker: "3610 Building 1 — County RE Tax"
export function masterTrackerLabel(t: TaxTask): string {
  const base = baseEntityName(t.entity);
  return `${base} — ${filingLabel(t)}`;
}
