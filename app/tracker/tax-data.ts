// ─── SHARED TAX DATA ────────────────────────────────────────────────────────
// Imported by both /tracker/taxes/page.tsx and /tracker/page.tsx so that
// task definitions and localStorage keys stay in sync between the two pages.

export type TaxCategory = "ret" | "quarterly" | "entity" | "k1";

export const TAX_CATEGORIES: Record<TaxCategory, { label: string; pill: string; dot: string; bg: string; text: string; border: string }> = {
  ret:       { label: "Real Estate Tax",    pill: "RET", dot: "#0b4a7d", bg: "rgba(11,74,125,0.08)",  text: "#0b4a7d", border: "rgba(11,74,125,0.25)"  },
  quarterly: { label: "Net Profits / BIRT", pill: "NP",  dot: "#b45309", bg: "rgba(180,83,9,0.08)",   text: "#b45309", border: "rgba(180,83,9,0.25)"   },
  entity:    { label: "Entity Filings",     pill: "EN",  dot: "#6d28d9", bg: "rgba(109,40,217,0.08)", text: "#6d28d9", border: "rgba(109,40,217,0.25)" },
  k1:        { label: "K-1 Distribution",   pill: "K-1", dot: "#0f766e", bg: "rgba(15,118,110,0.08)", text: "#0f766e", border: "rgba(15,118,110,0.25)" },
};

export interface K1Investor {
  id: string;
  name: string;
  detailedName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  stateIfDifferent?: string;
  profitPct?: number;
  lossPct?: number;
  capitalPct?: number;
}

export interface TaxTask {
  id: string;
  entity: string;        // full label (may include " — Q1" suffix for quarterly)
  category: TaxCategory;
  retType?: "county" | "school" | "county+school"; // distinguishes within RET for the filing label
  dueMonth: number;      // 1-12
  dueDay: number;        // 1-31
  notes?: string;
  pillOverride?: string;       // Custom pill label instead of category default
  label?: string;              // Optional override for the auto-generated filing label
  instructionSteps?: string[]; // Numbered instructions shown in a modal when clicked
  investors?: K1Investor[]; // K-1 tasks only — one sub-row per investor
}

export const TAX_TASKS: TaxTask[] = [

  // ─── COUNTY REAL ESTATE TAX ─────────────────────────────────────────────

  { id: "co-1500", entity: "1500 Eastwick JV I",              category: "ret", retType: "county+school", dueMonth: 3,  dueDay: 31 },
  { id: "co-4500", entity: "4500 Grays Ferry SC",             category: "ret", retType: "county+school", dueMonth: 3,  dueDay: 31 },
  { id: "co-4510", entity: "4510 Grays Ferry Partners",       category: "ret", retType: "county+school", dueMonth: 3,  dueDay: 31 },
  { id: "co-5600", entity: "5600 Hyman Korman Co",            category: "ret", retType: "county+school", dueMonth: 3,  dueDay: 31 },
  { id: "co-7010", entity: "7010 Parkwood SC",                category: "ret", retType: "county+school", dueMonth: 3,  dueDay: 31 },
  { id: "co-7200", entity: "7200 Elbridge",                   category: "ret", retType: "county+school", dueMonth: 3,  dueDay: 31 },
  { id: "co-7300", entity: "7300 Revere",                     category: "ret", retType: "county+school", dueMonth: 3,  dueDay: 31 },
  { id: "co-8200", entity: "8200 Trust #4",                   category: "ret", retType: "county+school", dueMonth: 3,  dueDay: 31 },
  { id: "co-9200", entity: "9200 Eastwick JV XI",             category: "ret", retType: "county+school", dueMonth: 3,  dueDay: 31 },
  { id: "co-1100", entity: "1100 Parkwood Professional Bldg", category: "ret", retType: "county+school", dueMonth: 3,  dueDay: 31 },
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
  { id: "sc-2300", entity: "2300 Brookwood SC",               category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },
  { id: "sc-0900", entity: "0900 Interplex 2-Acre Land",      category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-piic", entity: "PIIICO Condo",                    category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-3610", entity: "3610 Building 1",                 category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },
  { id: "sc-2620", entity: "2620 Building 1",                 category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },
  { id: "sc-3640", entity: "3640 Building 4",                 category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },
  { id: "sc-4050", entity: "4050 Building 5",                 category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },
  { id: "sc-4060", entity: "4060 Building 6",                 category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },
  { id: "sc-4070", entity: "4070 Building 7",                 category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },
  { id: "sc-4080", entity: "4080 Building 8",                 category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },
  { id: "sc-40a0", entity: "40A0 Kor Center",                 category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },

  // ─── NET PROFITS TAX / BIRT ──────────────────────────────────────────────

  { id: "np-0800-q1", entity: "0800 Bellmawr — Q1", category: "quarterly", dueMonth: 2,  dueDay: 1, notes: "Net Profits Tax — pay online" },
  { id: "np-0800-q2", entity: "0800 Bellmawr — Q2", category: "quarterly", dueMonth: 5,  dueDay: 1, notes: "Net Profits Tax — pay online" },
  { id: "np-0800-q3", entity: "0800 Bellmawr — Q3", category: "quarterly", dueMonth: 8,  dueDay: 1, notes: "Net Profits Tax — pay online" },
  { id: "np-0800-q4", entity: "0800 Bellmawr — Q4", category: "quarterly", dueMonth: 11, dueDay: 1, notes: "Net Profits Tax — pay online" },

  // ─── K-1 DISTRIBUTIONS ──────────────────────────────────────────────────

  {
    id: "k1-2070",
    entity: "2070 Nockamixon",
    category: "k1",
    dueMonth: 3,
    dueDay: 15,
    investors: [
      { id: "k1-2070-schurr",  name: "Susan Schurr"  },
      { id: "k1-2070-altman",  name: "Cathy Altman"  },
      { id: "k1-2070-korman",  name: "Alison Korman" },
      { id: "k1-2070-segal",   name: "Gerald Segal"  },
      { id: "k1-2070-saul",    name: "Saul XXX"      },
    ],
  },

  {
    id: "k1-7200",
    entity: "7200 Elbridge Partnership",
    category: "k1",
    dueMonth: 3,
    dueDay: 15,
    investors: [
      { id: "k1-7200-langsfeld-1",      name: "Judith Langsfeld",        detailedName: "U/W of Max Korman",                                                         address: "1673 Paper Mill Road",             city: "Meadowbrook",    state: "Pennsylvania", zip: "19046",             profitPct: 0.093820200, lossPct: 0.093820200, capitalPct: 0.093820200 },
      { id: "k1-7200-skorman",           name: "Steven Korman",                                                                                                      address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462",            profitPct: 0.019452200, lossPct: 0.019452200, capitalPct: 0.019452200 },
      { id: "k1-7200-lhonickman",        name: "Lynne Honickman",         detailedName: "C/o The Honickman Co., Eric Pisauro",                                       address: "8275 N. Cresent Blvd.",             city: "Pennsauken",     state: "New Jersey",   zip: "08110",  stateIfDifferent: "Pennsylvania", profitPct: 0.019452200, lossPct: 0.019452200, capitalPct: 0.019452200 },
      { id: "k1-7200-jhonickman-1",      name: "Jeffrey Honickman",       detailedName: "Lynne Honickman FBO Jeffrey Honickman",                                     address: "8275 N. Cresent Blvd.",             city: "Pennsauken",     state: "New Jersey",   zip: "08110",  stateIfDifferent: "Pennsylvania", profitPct: 0.004863000, lossPct: 0.004863000, capitalPct: 0.004863000 },
      { id: "k1-7200-hahn-1",            name: "Shirley Honickman Hahn",  detailedName: "DTD 9/29/89, C/O The Honickman Co.",                                        address: "8275 N. Cresent Blvd.",             city: "Pennsauken",     state: "New Jersey",   zip: "08110",                                    profitPct: 0.004863000, lossPct: 0.004863000, capitalPct: 0.004863000 },
      { id: "k1-7200-jkorman-1",         name: "John Korman",                                                                                                        address: "c/o 410 Lancaster Ave, Suite 5a",   city: "Haverford",      state: "Pennsylvania", zip: "19041",                                    profitPct: 0.004863000, lossPct: 0.004863000, capitalPct: 0.004863000 },
      { id: "k1-7200-feldman-1",         name: "Alison Korman Feldman",                                                                                              address: "6015 Sheaff Ln",                    city: "Fort Washington", state: "Pennsylvania", zip: "19034",                                   profitPct: 0.004863000, lossPct: 0.004863000, capitalPct: 0.004863000 },
      { id: "k1-7200-lkorman",           name: "Larry Korman",            detailedName: "GST Exempt Trust U/I 3 U/W SJK FBO Steven H. Korman/LMK",                  address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", stateIfDifferent: "Various",     profitPct: 0.056292180, lossPct: 0.056292180, capitalPct: 0.056292180 },
      { id: "k1-7200-bkorman",           name: "Brad Korman",             detailedName: "GST Exempt Trust U/I 3 U/W SJK FBO Steven H. Korman/BJK",                  address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", stateIfDifferent: "Various",     profitPct: 0.056292180, lossPct: 0.056292180, capitalPct: 0.056292180 },
      { id: "k1-7200-mkorman",           name: "Mark Korman",             detailedName: "GST Exempt Trust U/I 3 U/W SJK FBO Steven H. Korman/MGK",                  address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", stateIfDifferent: "Various",     profitPct: 0.056292180, lossPct: 0.056292180, capitalPct: 0.056292180 },
      { id: "k1-7200-jhonickman-2",      name: "Jeffrey Honickman",       detailedName: "GST Exempt Trust U/I 3 UWO Samuel Korman FBO LRH/Jeffrey Honickman c/o the honickman co, 8275 N. Cresent Blvd", address: "8275 N. Cresent Blvd.", city: "Pennsauken", state: "New Jersey", zip: "08110", stateIfDifferent: "Various", profitPct: 0.056292180, lossPct: 0.056292180, capitalPct: 0.056292180 },
      { id: "k1-7200-hahn-2",            name: "Shirley Honickman Hahn",  detailedName: "GST Exempt Trust U/I 3 UWO Samuel Korman FBO LRH/Shirley Honickman Hahn", address: "c/o honickman co. 8275 N Cresent Blvd", city: "Pennsauken", state: "New Jersey", zip: "08110",                               profitPct: 0.056292180, lossPct: 0.056292180, capitalPct: 0.056292180 },
      { id: "k1-7200-sohn",              name: "Joan Sohn",               detailedName: "Joan Sohn C/O Baker Tilly US, LLP",                                        address: "1650 Market St., Suite 4500",       city: "Philadelphia",   state: "Pennsylvania", zip: "19103", stateIfDifferent: "Various",     profitPct: 0.320365300, lossPct: 0.320365300, capitalPct: 0.320365300 },
      { id: "k1-7200-langsfeld-2",       name: "Judith Langsfeld",        detailedName: "Judith Langsfeld",                                                          address: "1673 Paper Mill Road",              city: "Meadowbrook",    state: "Pennsylvania", zip: "19046",                                    profitPct: 0.019452200, lossPct: 0.019452200, capitalPct: 0.019452200 },
      { id: "k1-7200-bkorman-tua",       name: "Berton Korman",           detailedName: "Berton E Korman TUA Dtd 02232018 As Amended",                              address: "C/O 410 Lancaster Ave, Suite 5a",   city: "Haverford",      state: "Pennsylvania", zip: "19041", stateIfDifferent: "Various",     profitPct: 0.019452200, lossPct: 0.019452200, capitalPct: 0.019452200 },
      { id: "k1-7200-jkorman-2",         name: "John Korman",             detailedName: "Max WM Korman TUW Item 7th FBO John P Korman Trust",                       address: "C/o 410 Lancaster Ave, Suite 5a",   city: "Haverford",      state: "Pennsylvania", zip: "19041",                                    profitPct: 0.031273433, lossPct: 0.031273433, capitalPct: 0.031273433 },
      { id: "k1-7200-jameskorman",       name: "James Korman",            detailedName: "Max WM Korman TUW Item 7th FBO James S Korman Trust",                      address: "C/O 410 Lancaster Ave, Suite 5a",   city: "Haverford",      state: "Pennsylvania", zip: "19041",                                    profitPct: 0.031273433, lossPct: 0.031273433, capitalPct: 0.031273433 },
      { id: "k1-7200-jacobs",            name: "Carolyn Jacobs",          detailedName: "Max WM Korman TUW Item 7th FBO Carolyn K Jacobs Trust",                    address: "C/O 410 Lancaster Ave, Suite 5a",   city: "Haverford",      state: "Pennsylvania", zip: "19041",                                    profitPct: 0.031273434, lossPct: 0.031273434, capitalPct: 0.031273434 },
      { id: "k1-7200-afeldman-lik",      name: "Alison Feldman",          detailedName: "Leonard I Korman GST Subject TR FBO Alison Feldman",                       address: "6015 Sheaff Lane",                  city: "Fort Washington", state: "Pennsylvania", zip: "19034", stateIfDifferent: "Florida",    profitPct: 0.006484067, lossPct: 0.006484067, capitalPct: 0.006484067 },
      { id: "k1-7200-altman-lik",        name: "Catherine Altman",        detailedName: "Leonard I Korman GST Subject TR FBO Catherine Altman",                     address: "210 Eagle Drive",                   city: "Jupiter",        state: "Florida",      zip: "33477",                                    profitPct: 0.006484067, lossPct: 0.006484067, capitalPct: 0.006484067 },
      { id: "k1-7200-schurr-lik",        name: "Susan Schurr",            detailedName: "Leonard I Korman GST Subject TR FBO Susan Schurr",                         address: "6100 Sheaff Lane",                  city: "Fort Washington", state: "Pennsylvania", zip: "19034", stateIfDifferent: "Florida",    profitPct: 0.006484066, lossPct: 0.006484066, capitalPct: 0.006484066 },
      { id: "k1-7200-feldman-maxwm",     name: "Alison Korman Feldman",   detailedName: "Trust Under Item Seventh of the Will of Max Korman FBO Alison K. Feldman", address: "6015 Sheaff Ln",                    city: "Fort Washington", state: "Pennsylvania", zip: "19034",                                   profitPct: 0.031273433, lossPct: 0.031273433, capitalPct: 0.031273433 },
      { id: "k1-7200-altman-maxwm",      name: "Catherine Altman",        detailedName: "Trust Under Item Seventh of the Will of Max Korman FBO Catherine Altman",  address: "210 Eagle Drive",                   city: "Jupiter",        state: "Pennsylvania", zip: "33477",                                    profitPct: 0.031273433, lossPct: 0.031273433, capitalPct: 0.031273433 },
      { id: "k1-7200-schurr-maxwm",      name: "Susan Schurr",            detailedName: "Trust Under Item Seventh of the Will of Max Korman FBO Susan Schurr",      address: "6100 Sheaff Lane",                  city: "Fort Washington", state: "Pennsylvania", zip: "19034",                                    profitPct: 0.031273434, lossPct: 0.031273434, capitalPct: 0.031273434 },
    ],
  },

  {
    id: "k1-9510",
    entity: "9510 Lafayette Hill SC",
    category: "k1",
    dueMonth: 3,
    dueDay: 15,
    investors: [
      { id: "k1-9510-feldman",      name: "Alison Korman Feldman", detailedName: "Friedman Appointive TR FBO Alison K Feldman UAR JFK RVOC TR",   address: "1650 Market Street, STE 2800", city: "Philadelphia", state: "Pennsylvania", zip: "19103", stateIfDifferent: "Florida",  profitPct: 0.166700000, lossPct: 0.166700000, capitalPct: 0.166700000 },
      { id: "k1-9510-altman",       name: "Catherine Altman",      detailedName: "Friedman Appointive TR FBO Catherine K Altman UAR JFK RVOC TR",  address: "1650 Market Street, STE 2800", city: "Philadelphia", state: "Pennsylvania", zip: "19103", stateIfDifferent: "Florida",  profitPct: 0.166700000, lossPct: 0.166700000, capitalPct: 0.166700000 },
      { id: "k1-9510-schurr",       name: "Susan Schurr",          detailedName: "Friedman Appointive TR FBO Susan K Schurr UAR JFK RVOC TR",      address: "1035 3rd Ave South #317",      city: "Naples",       state: "Florida",      zip: "34102",                                 profitPct: 0.166600000, lossPct: 0.166600000, capitalPct: 0.166600000 },
      { id: "k1-9510-egoldenberg",  name: "Elizabeth Goldenberg",  detailedName: "Elizabeth M. Goldenberg Trust",                                   address: "194 Hoffman Road",             city: "Tully",        state: "New York",     zip: "13159", stateIfDifferent: "Florida",  profitPct: 0.166700000, lossPct: 0.166700000, capitalPct: 0.166700000 },
      { id: "k1-9510-jgoldenberg",  name: "James Goldenberg",      detailedName: "James B. Goldenberg Trust",                                       address: "20 Marshall Street",           city: "Duxbury",      state: "Massachusetts", zip: "02332", stateIfDifferent: "Florida", profitPct: 0.166700000, lossPct: 0.166700000, capitalPct: 0.166700000 },
      { id: "k1-9510-wgoldenberg",  name: "William Goldenberg",    detailedName: "William J. Goldenberg Trust",                                     address: "31 Bens Landing Road",         city: "Boothbay",     state: "Maine",        zip: "04537", stateIfDifferent: "Florida",  profitPct: 0.166600000, lossPct: 0.166600000, capitalPct: 0.166600000 },
    ],
  },

  {
    id: "k1-9800",
    entity: "9800 Bellaire Avenue",
    category: "k1",
    dueMonth: 3,
    dueDay: 15,
    investors: [
      { id: "k1-9800-feldman", name: "Alison Korman Feldman", address: "6015 Sheaff Ln", city: "Fort Washington", state: "Pennsylvania", zip: "19034", profitPct: 0.750000000, lossPct: 0.750000000, capitalPct: 0.750000000 },
      { id: "k1-9800-hfeldman", name: "Harry Feldman",        address: "7524 Fir Rd",    city: "Ambler",          state: "Pennsylvania", zip: "19002", profitPct: 0.250000000, lossPct: 0.250000000, capitalPct: 0.250000000 },
    ],
  },

  {
    id: "k1-9820",
    entity: "9820 Spring Garden St",
    category: "k1",
    dueMonth: 3,
    dueDay: 15,
    investors: [
      { id: "k1-9820-feldman", name: "Alison Korman Feldman", address: "6015 Sheaff Ln", city: "Fort Washington", state: "Pennsylvania", zip: "19034", profitPct: 0.750000000, lossPct: 0.750000000, capitalPct: 0.750000000 },
      { id: "k1-9820-hfeldman", name: "Harry Feldman",        address: "7524 Fir Rd",    city: "Ambler",          state: "Pennsylvania", zip: "19002", profitPct: 0.250000000, lossPct: 0.250000000, capitalPct: 0.250000000 },
    ],
  },

  {
    id: "k1-9840",
    entity: "9840 3044 Joshua Rd",
    category: "k1",
    dueMonth: 3,
    dueDay: 15,
    investors: [
      { id: "k1-9840-feldman", name: "Alison Korman Feldman", address: "6015 Sheaff Ln", city: "Fort Washington", state: "Pennsylvania", zip: "19034", profitPct: 1.000000000, lossPct: 1.000000000, capitalPct: 1.000000000 },
    ],
  },

  {
    id: "k1-9860",
    entity: "9860 KH Fort Washington",
    category: "k1",
    dueMonth: 3,
    dueDay: 15,
    investors: [
      { id: "k1-9860-feldman", name: "Alison Korman Feldman", address: "6015 Sheaff Ln", city: "Fort Washington", state: "Pennsylvania", zip: "19034", profitPct: 0.750000000, lossPct: 0.750000000, capitalPct: 0.750000000 },
      { id: "k1-9860-hfeldman", name: "Harry Feldman",        address: "7524 Fir Rd",    city: "Ambler",          state: "Pennsylvania", zip: "19002", profitPct: 0.250000000, lossPct: 0.250000000, capitalPct: 0.250000000 },
    ],
  },

  // ─── ANNUAL REPORTS ──────────────────────────────────────────────────────

  {
    id: "ar-2070",
    entity: "2070 Nockamixon",
    category: "entity",
    dueMonth: 3,
    dueDay: 15,
    label: "File Annual Report",
    instructionSteps: [
      "Register an account for Business Filing Services (BFS) if you are a new user (__Customer Portal Overview__).",
      "Log in at __file.dos.pa.gov__ and search for your company name under \"Business Search.\"",
      "Click on the icon for Annual Report. No PIN access is required to file an Annual Report.",
      "Complete the Annual Report form online and pay by credit card.",
      "After the Annual Report is processed, the Form and Acknowledgement Letter will be available for immediate download. You also will receive an email with instructions on how to log into the BFS portal to retrieve your filed document under \"My Work Queue.\"",
    ],
  },

  // ─── ENTITY / STATUTORY FILINGS ─────────────────────────────────────────

  { id: "ent-nim-jun",  entity: "Neshaminy Interplex, MM, LP (DE)", category: "entity", dueMonth: 6,  dueDay: 1, notes: "File #5404613" },
  { id: "ent-nil-jun",  entity: "Neshaminy Interplex LLC (DE)",     category: "entity", dueMonth: 6,  dueDay: 1, notes: "File #5404612" },
  { id: "ent-0800-nov", entity: "0800 Bellmawr JV, LLP (NJ)",       category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9400392779" },
  { id: "ent-nim-nov",  entity: "Neshaminy Interplex, MM, LP (DE)", category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9401222288" },
  { id: "ent-nil-nov",  entity: "Neshaminy Interplex LLC (DE)",     category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9401231147" },
  { id: "ent-2010-nov", entity: "2010 LIK Management, Inc. (PA)",   category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9400393039" },

  // ─── KORMAN FELDMAN FAMILY FOUNDATION ───────────────────────────────────

  {
    id: "kfff-990",
    entity: "Korman Feldman Family Foundation",
    category: "entity",
    dueMonth: 11,
    dueDay: 17,
    pillOverride: "KFFF",
    label: "Submit Form 990",
    instructionSteps: [
      "Sign and submit form 990-PF from GMS Surgent to Commonwealth of Pennsylvania Department of State with a $15 check made out to Commonwealth of Pennsylvania",
    ],
  },
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

// ─── PARCEL INFO ─────────────────────────────────────────────────────────────
// Keyed by baseEntityName. A property may have multiple parcels.

export interface TaxParcel {
  method?: string;  // "Direct" | "Liberty Bank" | "Check" | undefined
  number: string;
  label?: string;
  link?: string;
}

export const PARCEL_INFO: Record<string, TaxParcel[]> = {
  "1100 Parkwood Professional Bldg": [{ method: "Direct",       number: "882077811", label: "Shopping Center", link: "https://property.phila.gov/?p=882077811" }],
  "1500 Eastwick JV I":              [{ method: "Direct",       number: "882057700", label: "Property", link: "https://property.phila.gov/?p=882057700" }],
  "4500 Grays Ferry SC":             [{ method: "Liberty Bank", number: "882051606", label: "Shopping Center", link: "https://property.phila.gov/?p=882051606" },
                                      { method: "Liberty Bank", number: "874545940", label: "Rear Parcel",     link: "https://property.phila.gov/?p=874545940" },
                                      { method: "Liberty Bank", number: "885969440", label: "Billboard",       link: "https://property.phila.gov/?p=885969440" }],
  "5600 Hyman Korman Co":            [{ method: "Direct",       number: "882830600", label: "Post Office",     link: "https://property.phila.gov/?p=882830600" }],
  "7010 Parkwood SC":                [{ method: "Liberty Bank", number: "882078060", label: "Shopping Center", link: "https://property.phila.gov/?p=882078060" }],
  "7200 Elbridge":                   [{ method: "Direct",       number: "882832400", label: "Shopping Center", link: "https://property.phila.gov/?p=882832400" }],
  "7300 Revere":                     [{ method: "Direct",       number: "882138000", label: "Shopping Center", link: "https://property.phila.gov/?p=882138000" }],
  "8200 Trust #4":                   [{ method: "Direct",       number: "882047230", label: "Four Seasons",    link: "https://property.phila.gov/?p=882047230" },
                                      { method: "Direct",       number: "882047229", label: "McDonald's",      link: "https://property.phila.gov/?p=882047229" }],
  "9200 Eastwick JV XI":             [{ method: "Direct",       number: "885819980", label: "Land", link: "https://property.phila.gov/?p=885819980" }],
  "9840 3044 Joshua Rd":             [{ method: "Check",        number: "54-00-06484-00-5"  }],
  "9860 KH Fort Washington":         [{ method: "Check",        number: "54-00-06484-00-5", label: "House", link: "https://propertyrecords.montcopa.org/PT/Datalets/Datalet.aspx?mode=&UseSearch=no&pin=540006484005&jur=046&taxyr=2026" }],
  "9800 Bellaire Ave":               [{ method: "Check",        number: "54-00-01999-00-8"  }],
  "3610 Building 1":            [{ number: "02-001-002-004-001", label: "Building 1", link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.123865%2C-74.979211%2C17" }],
  "3620 Building 2":            [{ number: "02-001-002-004-002", label: "Building 2", link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.123865%2C-74.979211%2C17" }],
  "3640 Building 4":            [{ number: "02-001-002-004-004", label: "Building 4", link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.123865%2C-74.979211%2C17" }],
  "4050 Building 5":            [{ number: "02-001-002-002",     label: "Building 5", link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.121694%2C-74.981629%2C17" }],
  "4060 Building 6":            [{ number: "02-001-001",         label: "Building 6", link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.121694%2C-74.981629%2C17" }],
  "4070 Building 7":            [{ number: "02-001-001-001",     label: "Building 7", link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.121694%2C-74.981629%2C17" }],
  "4080 Building 8":            [{ number: "02-001-002",         label: "Building 8", link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.121694%2C-74.981629%2C17" }],
  "40A0 Kor Center":            [{ number: "02-001-002-005",     label: "Kor A",      link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.125571%2C-74.979190%2C17" }],
  "40B0 Kor Center":            [{ number: "02-001-002-005",     label: "Kor B",      link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.125571%2C-74.979190%2C17" }],
  "40C0 Kor Center":            [{ number: "02-001-002-005",     label: "Kor C",      link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.125571%2C-74.979190%2C17" }],
  "0900 Interplex 2-Acre Land": [{ number: "02-001-002-013",     label: "2-Acre Lot", link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.125648%2C-74.979726%2C17" }],
  "2070 Nockamixon":            [{ number: "30-011-077",         label: "Large Parcel", link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.495032%2C-75.174738%2C18" },
                                  { number: "30-011-077-002",    label: "Small Parcel", link: "https://dataportal-bucksgis.opendata.arcgis.com/datasets/3a4d9c4305874312a2a74da7bd55a22d_0/explore?location=40.495032%2C-75.174738%2C18" }],
  "9820 Spring Garden St":      [{ method: "Check", number: "01-00-04904-00-9", label: "120", link: "https://propertyrecords.montcopa.org/PT/Datalets/Datalet.aspx?mode=&UseSearch=no&pin=010004904009&jur=046&taxyr=2026" },
                                  { method: "Check", number: "01-00-04903-00-1", label: "122", link: "https://propertyrecords.montcopa.org/PT/Datalets/Datalet.aspx?mode=&UseSearch=no&pin=010004903001&jur=046&taxyr=2026" }],

  "PIIICO Condo":                    [{                         number: "02001002-016"      }],
  "0800 Bellmawr":                   [{                         number: "Block 173.01 Lot 1"}],
};

// ─── SHARED HELPERS ──────────────────────────────────────────────────────────

export function baseEntityName(entity: string): string {
  return entity.replace(/ — Q[1-4]$/, "");
}

export function quarterSuffix(entity: string): string | null {
  const m = entity.match(/ — (Q[1-4])$/);
  return m ? m[1] : null;
}

export function filingLabel(t: TaxTask): string {
  if (t.label) return t.label;
  if (t.category === "ret") {
    if (t.retType === "school") return "School Real Estate Tax";
    if (t.retType === "county+school") return "County + School Real Estate Tax";
    return "County Real Estate Tax";
  }
  if (t.category === "quarterly") {
    const q = quarterSuffix(t.entity);
    return q ? `Net Profits Tax — ${q}` : "Net Profits Tax";
  }
  if (t.category === "k1") return "Distribute K-1s to investors";
  return "Entity Filing";
}

// Returns true if the task is fully done (for K-1, all investors must be checked)
export function isTaskEffectivelyDone(task: TaxTask, checked: Record<string, boolean>): boolean {
  if (task.investors && task.investors.length > 0) {
    return task.investors.every(inv => checked[inv.id]);
  }
  return !!checked[task.id];
}

// Full label shown on the master tracker: "3610 Building 1 — County RE Tax"
export function masterTrackerLabel(t: TaxTask): string {
  const base = baseEntityName(t.entity);
  return `${base} — ${filingLabel(t)}`;
}
