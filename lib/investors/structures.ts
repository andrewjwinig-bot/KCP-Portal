// Investor-level supplementary structure (org charts, trustee lists,
// authorization rosters, etc.). Keyed by normalized investor name so the
// investor profile card can find the matching block.
//
// Source: paper authorization roster maintained by Counsel; updated
// annually around the Loan Modification cycle.

export type TrusteeEntry = {
  trustee: string;
  capacity?: string;          // "Trustee", "Individually & Trustee (…)", etc.
};

export type StructureEntry = {
  entity: string;
  type: string;               // e.g. "PA General Partnership", "Testamentary Trust"
  role: string;               // e.g. "Partner", "General Partner of Lincoln"
  trustees: TrusteeEntry[];   // empty array allowed for top-level JV rows
};

export type InvestorStructure = {
  title: string;
  subtitle?: string;
  entries: StructureEntry[];
  directory?: TrusteeDirectory;
};

export type TrusteeDirectoryRow = {
  name: string;
  address: string;       // first address line(s) — may include "c/o …"
  city: string;
  state: string;
  zip?: string;
  servingIndividually: string;   // "Yes", "No", "No (Attorney-in-Fact)" etc.
  trusts: string;        // semicolon-separated trust labels — preserve newlines as " ; "
  sourceInstrument: string;
  notes?: string;
  email?: string;        // contact email (from the Ownership trustee workbook)
};

export type TrusteeDirectory = {
  title: string;
  rows: TrusteeDirectoryRow[];
};

/** Lower-case, trim, collapse whitespace, drop trailing "co." or "co". */
export function normInvestorKey(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

export const INVESTOR_STRUCTURES: Record<string, InvestorStructure> = {
  [normInvestorKey("Hyman Korman Co.")]: {
    title: "Partnership & Trustee Structure",
    subtitle: "Authorization of Partners · 2026 · Attorney-in-Fact: Alison Korman Feldman",
    entries: [
      {
        entity: "Lincoln Subsidiary Joint Venture III",
        type: "PA General Partnership",
        role: "Joint Venture",
        trustees: [],
      },
      {
        entity: "Hyman Korman Co.",
        type: "PA General Partnership",
        role: "General Partner of Lincoln",
        trustees: [
          { trustee: "Alison Korman Feldman", capacity: "Attorney-in-Fact (Loan Modification)" },
        ],
      },
      {
        entity: "Trust u/Item 7th Will of Max Korman FBO Alison K. Feldman & Issue",
        type: "Testamentary Trust",
        role: "Partner",
        trustees: [
          { trustee: "Alison Korman Feldman", capacity: "Trustee" },
          { trustee: "Avery Feldman",         capacity: "Trustee" },
          { trustee: "Lily Feldman",          capacity: "Trustee" },
          { trustee: "Harry Feldman",         capacity: "Trustee" },
        ],
      },
      {
        entity: "Trust u/Item 7th Will of Max Korman FBO Susan K. Schurr & Issue",
        type: "Testamentary Trust",
        role: "Partner",
        trustees: [
          { trustee: "Susan Schurr",      capacity: "Trustee" },
          { trustee: "Melissa Grossman",  capacity: "Trustee" },
          { trustee: "Michael Schurr",    capacity: "Trustee" },
        ],
      },
      {
        entity: "Trust u/Item 7th Will of Max Korman FBO Catherine K. Altman & Issue",
        type: "Testamentary Trust",
        role: "Partner",
        trustees: [
          { trustee: "Catherine K. Altman", capacity: "Trustee" },
          { trustee: "Lauren Altman",       capacity: "Trustee" },
          { trustee: "Daniel Altman",       capacity: "Trustee" },
        ],
      },
      {
        entity: "Trusts u/Item 7th Will of Max Korman FBO John P. Korman, James S. Korman, Carolyn K. Jacobs",
        type: "Testamentary Trust",
        role: "Partner",
        trustees: [
          { trustee: "John Korman",            capacity: "Trustee" },
          { trustee: "James Korman",           capacity: "Trustee" },
          { trustee: "Carolyn Korman Jacobs",  capacity: "Trustee" },
        ],
      },
      {
        entity: "Residual Trust u/Will of I. Barney Moss & Sarah R. Moss FBO Joan R. Sohn",
        type: "Testamentary Trust",
        role: "Partner",
        trustees: [
          { trustee: "John Korman",  capacity: "Trustee" },
          { trustee: "James Korman", capacity: "Trustee" },
        ],
      },
      {
        entity: "Joan R. Sohn",
        type: "Individual",
        role: "Partner / Trustee",
        trustees: [
          { trustee: "Joan R. Sohn", capacity: "Individually & as Trustee (Moss Residual Trust)" },
        ],
      },
      {
        entity: "GST Exempt Trusts u/Item 3 Will of Samuel J. Korman FBO Steven H. Korman/LMK, /BJK, /MGK; FBO Lynne Honickman/JAH, /SAH",
        type: "GST Exempt Trust",
        role: "Partner",
        trustees: [
          { trustee: "Harold Honickman",   capacity: "Trustee (all 5 sub-trusts)" },
          { trustee: "Lynne Honickman",    capacity: "Individually & Trustee (Korman sub-trusts)" },
          { trustee: "Jeffrey Honickman",  capacity: "Trustee (Lynne/JAH & Lynne/SAH; Deed of Trust 1942)" },
          { trustee: "Steven H. Korman",   capacity: "Individually & Trustee (Korman sub-trusts)" },
          { trustee: "Lester E. Lipschutz", capacity: "Trustee (Lynne/JAH & Lynne/SAH)" },
          { trustee: "Shirley Honickman",  capacity: "Trustee (Lynne/SAH)" },
        ],
      },
      {
        entity: "Trust u/Will of Max Wm. Korman FBO Judith K. Langsfeld; Deed of Trust dated Jan 1, 1942 FBO Joan R. Sohn; Deed of Trust dated Jan 1, 1942 FBO Judith Langsfeld",
        type: "Testamentary Trust / Deed of Trust",
        role: "Partner",
        trustees: [
          { trustee: "Judith K. Langsfeld",    capacity: "Individually & Trustee (all three)" },
          { trustee: "Mark Langsfeld",         capacity: "Trustee (Max Wm. Korman Trust & 1942 Deed)" },
          { trustee: "Elizabeth Langsfeld",    capacity: "Trustee (Max Wm. Korman Trust & 1942 Deed)" },
          { trustee: "Benjamin K. Langsfeld",  capacity: "Trustee (Max Wm. Korman Trust & 1942 Deed)" },
        ],
      },
      {
        entity: "Leonard I. Korman GST Subject Trust FBO Alison Feldman",
        type: "GST Subject Trust",
        role: "Partner",
        trustees: [
          { trustee: "Alison Feldman",   capacity: "Trustee" },
          { trustee: "Melissa Grossman", capacity: "Trustee" },
        ],
      },
      {
        entity: "Leonard I. Korman GST Subject Trust FBO Catherine Altman",
        type: "GST Subject Trust",
        role: "Partner",
        trustees: [
          { trustee: "Catherine Altman", capacity: "Trustee" },
          { trustee: "Melissa Grossman", capacity: "Trustee" },
        ],
      },
      {
        entity: "Leonard I. Korman GST Subject Trust FBO Susan Schurr",
        type: "GST Subject Trust",
        role: "Partner",
        trustees: [
          { trustee: "Susan Schurr",     capacity: "Trustee" },
          { trustee: "Melissa Grossman", capacity: "Trustee" },
        ],
      },
      {
        entity: "Berton E. Korman Trust Under Agreement Dated 02/23/2018, As Amended",
        type: "Revocable Trust (as amended)",
        role: "Partner",
        trustees: [
          { trustee: "Carolyn Korman Jacobs", capacity: "Trustee" },
          { trustee: "John P. Korman",        capacity: "Trustee" },
          { trustee: "James S. Korman",       capacity: "Trustee" },
          { trustee: "Heike Sullivan",        capacity: "Trustee" },
          { trustee: "Sallie Korman",         capacity: "Trustee" },
        ],
      },
    ],
    directory: {
      title: "Trustee Directory — Hyman Korman Co. Partners (2026)",
      rows: [
        { name: "Alison Korman Feldman", address: "6015 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034",
          servingIndividually: "No (Attorney-in-Fact)",
          trusts: "Max Korman Trust FBO Alison K. Feldman; Leonard I. Korman GST Subject Trust FBO Alison Feldman",
          sourceInstrument: "Will of Max Korman; Leonard I. Korman Trust",
          notes: "Also serves as Attorney-in-Fact for loan modification",
          email: "akorman@kormancommercial.com" },
        { name: "Avery Feldman", address: "6017 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034",
          servingIndividually: "No",
          trusts: "Max Korman Trust FBO Alison K. Feldman & Issue",
          sourceInstrument: "Will of Max Korman",
          email: "averykfeldman@gmail.com" },
        { name: "Lily Feldman", address: "7247 Beech Road", city: "Ambler", state: "PA", zip: "19002",
          servingIndividually: "No",
          trusts: "Max Korman Trust FBO Alison K. Feldman & Issue",
          sourceInstrument: "Will of Max Korman",
          email: "lilymfeldman@gmail.com" },
        { name: "Harry Feldman", address: "7254 Fir Road", city: "Ambler", state: "PA", zip: "19002",
          servingIndividually: "No",
          trusts: "Max Korman Trust FBO Alison K. Feldman & Issue",
          sourceInstrument: "Will of Max Korman",
          notes: "VP, Korman Commercial Properties",
          email: "hfeldman@kormancommercial.com" },
        { name: "Susan Schurr", address: "6100 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034",
          servingIndividually: "No",
          trusts: "Max Korman Trust FBO Susan K. Schurr & Issue; Leonard I. Korman GST Subject Trust FBO Susan Schurr",
          sourceInstrument: "Will of Max Korman; Leonard I. Korman Trust",
          email: "susan.schurr@gmail.com" },
        { name: "Melissa Grossman", address: "c/o Cozen O'Connor ; One Liberty Place, 1650 Market Street, Suite 2800", city: "Philadelphia", state: "PA", zip: "19103",
          servingIndividually: "No",
          trusts: "Max Korman Trust FBO Susan K. Schurr & Issue; Leonard I. Korman GST Subject Trust (all three FBOs)",
          sourceInstrument: "Will of Max Korman; Leonard I. Korman Trust",
          notes: "Trustee across multiple trust branches",
          email: "MGrossman@cozen.com" },
        { name: "Michael Schurr", address: "6100 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034",
          servingIndividually: "No",
          trusts: "Max Korman Trust FBO Susan K. Schurr & Issue",
          sourceInstrument: "Will of Max Korman" },
        { name: "Catherine K. Altman", address: "241 S. 6th Street, Apt. 1807", city: "Philadelphia", state: "PA", zip: "19106",
          servingIndividually: "No",
          trusts: "Max Korman Trust FBO Catherine K. Altman & Issue; Leonard I. Korman GST Subject Trust FBO Catherine Altman",
          sourceInstrument: "Will of Max Korman; Leonard I. Korman Trust",
          email: "ckaltman@comcast.net" },
        { name: "Lauren Altman", address: "c/o Catherine K. Altman ; 241 S. 6th Street, Apt. 1807", city: "Philadelphia", state: "PA", zip: "19106",
          servingIndividually: "No",
          trusts: "Max Korman Trust FBO Catherine K. Altman & Issue",
          sourceInstrument: "Will of Max Korman",
          email: "laltman215@gmail.com" },
        { name: "Daniel Altman", address: "c/o Catherine K. Altman ; 241 S. 6th Street, Apt. 1807", city: "Philadelphia", state: "PA", zip: "19106",
          servingIndividually: "No",
          trusts: "Max Korman Trust FBO Catherine K. Altman & Issue",
          sourceInstrument: "Will of Max Korman",
          email: "daniel.h.altman19@gmail.com" },
        { name: "John Korman", address: "c/o Korman Residential ; 410 Lancaster Avenue, Suite 5A", city: "Haverford", state: "PA", zip: "19041",
          servingIndividually: "No",
          trusts: "Max Korman Trusts FBO John P. Korman, James S. Korman & Carolyn K. Jacobs; Moss Residual Trust FBO Joan R. Sohn; Berton E. Korman Trust",
          sourceInstrument: "Will of Max Korman (Item 7 FBO John P. Korman)",
          notes: "Trustees: John Korman, Tyler Korman, Dylan Korman",
          email: "john@livekorman.com" },
        { name: "James Korman", address: "c/o Korman Residential ; 410 Lancaster Avenue, Suite 5A", city: "Haverford", state: "PA", zip: "19041",
          servingIndividually: "No",
          trusts: "Max Korman Trusts FBO John P. Korman, James S. Korman & Carolyn K. Jacobs; Moss Residual Trust FBO Joan R. Sohn; Berton E. Korman Trust",
          sourceInstrument: "Will of Max Korman (Item 7 FBO James S. Korman)",
          notes: "Trustees: James Korman, Henry Korman, Josephine Korman, William Korman",
          email: "james@kormanventures.com" },
        { name: "Carolyn Korman Jacobs", address: "6114 Butler Pike", city: "Blue Bell", state: "PA", zip: "19422",
          servingIndividually: "No",
          trusts: "Max Korman Trusts FBO John P. Korman, James S. Korman & Carolyn K. Jacobs; Berton E. Korman Trust",
          sourceInstrument: "Will of Max Korman; Berton E. Korman TUA",
          notes: "Trustees: Carolyn Korman Jacobs, Isabelle Jacobs, Sidney Jacobs Glass, Sophie Klepner",
          email: "TheSuiteQueen@aol.com" },
        { name: "Tyler Korman", address: "c/o Korman Residential ; 410 Lancaster Avenue, Suite 5A", city: "Haverford", state: "PA", zip: "19041",
          servingIndividually: "No",
          trusts: "Trust U/Item 7 Will of Max Korman FBO John P. Korman",
          sourceInstrument: "Will of Max Korman",
          notes: "Trustee",
          email: "Tyler@livekorman.com" },
        { name: "Dylan Korman", address: "c/o Korman Residential ; 410 Lancaster Avenue, Suite 5A", city: "Haverford", state: "PA", zip: "19041",
          servingIndividually: "No",
          trusts: "Trust U/Item 7 Will of Max Korman FBO John P. Korman",
          sourceInstrument: "Will of Max Korman",
          notes: "Trustee",
          email: "Dylan@livekorman.com" },
        { name: "Henry Korman", address: "c/o Korman Ventures ; 410 Lancaster Avenue, Suite 5A", city: "Haverford", state: "PA", zip: "19041",
          servingIndividually: "No",
          trusts: "Trust U/Item 7 Will of Max Korman FBO James S. Korman",
          sourceInstrument: "Will of Max Korman",
          notes: "Trustee",
          email: "fk3r@outlook.com" },
        { name: "Josephine Korman", address: "", city: "", state: "",
          servingIndividually: "No",
          trusts: "Trust U/Item 7 Will of Max Korman FBO James S. Korman",
          sourceInstrument: "Will of Max Korman",
          notes: "Trustee",
          email: "jhkorman@me.com" },
        { name: "William Korman", address: "", city: "", state: "",
          servingIndividually: "No",
          trusts: "Trust U/Item 7 Will of Max Korman FBO James S. Korman",
          sourceInstrument: "Will of Max Korman",
          notes: "Trustee",
          email: "whkorman@me.com" },
        { name: "Sophie Klepner", address: "", city: "", state: "",
          servingIndividually: "No",
          trusts: "Trust U/Item 7 Will of Max Korman FBO Carolyn K. Jacobs",
          sourceInstrument: "Will of Max Korman",
          notes: "Trustee",
          email: "sophie.klepner@morganstanley.com" },
        { name: "Isabelle Jacobs", address: "6114 Butler Pike", city: "Blue Bell", state: "PA", zip: "19422",
          servingIndividually: "No",
          trusts: "Trust U/Item 7 Will of Max Korman FBO Carolyn K. Jacobs",
          sourceInstrument: "Will of Max Korman",
          notes: "Trustee",
          email: "isabellejacobs29@gmail.com" },
        { name: "Sidney Jacobs Glass", address: "6114 Butler Pike", city: "Blue Bell", state: "PA", zip: "19422",
          servingIndividually: "No",
          trusts: "Trust U/Item 7 Will of Max Korman FBO Carolyn K. Jacobs",
          sourceInstrument: "Will of Max Korman",
          notes: "Trustee",
          email: "sidneyjacobs30@gmail.com" },
        { name: "Joan R. Sohn", address: "110 Bloor St. West, Apt. 1903", city: "Toronto, Ontario M5S 2W7", state: "Canada",
          servingIndividually: "Yes",
          trusts: "Moss Residual Trust FBO Joan R. Sohn",
          sourceInstrument: "Will of I. Barney Moss & Sarah R. Moss",
          notes: "Serves individually AND as trustee",
          email: "joanrsohn@gmail.com" },
        { name: "Steven H. Korman", address: "c/o Korman Communities ; 580 W. Germantown Pike, #200", city: "Plymouth Meeting", state: "PA", zip: "19462",
          servingIndividually: "Yes",
          trusts: "GST Exempt Trusts u/Samuel J. Korman Will (Korman sub-trusts)",
          sourceInstrument: "Will of Samuel J. Korman",
          notes: "Serves individually AND as trustee",
          email: "skorman@kormancommunities.com" },
        { name: "Judith K. Langsfeld", address: "c/o Mark Langsfeld ; 1085 Herkness Drive", city: "Meadowbrook", state: "PA", zip: "19046",
          servingIndividually: "Yes",
          trusts: "Trust u/Will of Max Wm. Korman FBO Judith K. Langsfeld; Deed of Trust Jan 1, 1942 FBO Joan R. Sohn; Deed of Trust Jan 1, 1942 FBO Judith Langsfeld",
          sourceInstrument: "Will of Max Wm. Korman; 1942 Deed of Trust",
          notes: "Serves in three capacities individually + as trustee",
          email: "langsfeld@gmail.com" },
        { name: "Mark Langsfeld", address: "1085 Herkness Drive", city: "Meadowbrook", state: "PA", zip: "19046",
          servingIndividually: "No",
          trusts: "Trust u/Will of Max Wm. Korman FBO Judith Langsfeld; Deed of Trust Jan 1, 1942 FBO Judith Langsfeld",
          sourceInstrument: "Will of Max Wm. Korman; 1942 Deed",
          email: "langsfeld@gmail.com" },
        { name: "Elizabeth Langsfeld", address: "4797 Crescent Street", city: "Bethesda", state: "MD",
          servingIndividually: "No",
          trusts: "Trust u/Will of Max Wm. Korman FBO Judith Langsfeld; Deed of Trust Jan 1, 1942 FBO Judith Langsfeld",
          sourceInstrument: "Will of Max Wm. Korman; 1942 Deed",
          email: "elangsfeld@yahoo.com" },
        { name: "Benjamin K. Langsfeld", address: "442 Prospect Place", city: "Brooklyn", state: "NY", zip: "11238",
          servingIndividually: "No",
          trusts: "Trust u/Will of Max Wm. Korman FBO Judith Langsfeld; Deed of Trust Jan 1, 1942 FBO Judith Langsfeld",
          sourceInstrument: "Will of Max Wm. Korman; 1942 Deed",
          email: "blangsfeld@gmail.com" },
        { name: "Heike Sullivan", address: "c/o Ballard Spahr ; 1735 Market Street, 51st Floor", city: "Philadelphia", state: "PA", zip: "19103",
          servingIndividually: "No",
          trusts: "Berton E. Korman Trust (TUA 02/23/2018)",
          sourceInstrument: "Berton E. Korman TUA",
          email: "sullivanh@ballardspahr.com" },
        { name: "Berton E. Korman Irrev Tr DTD 03/03/1999", address: "", city: "", state: "",
          servingIndividually: "No",
          trusts: "Berton E. Korman Irrev Tr DTD 03/03/1999 (The Korman Co.)",
          sourceInstrument: "Irrevocable Trust DTD 03/03/1999",
          notes: "Trustees: John P. Korman, Carolyn Korman Jacobs, James S. Korman" },
        { name: "Sallie Korman", address: "c/o Korman Residential ; 410 Lancaster Avenue, Suite 5A", city: "Haverford", state: "PA", zip: "19041",
          servingIndividually: "No",
          trusts: "Berton E. Korman Trust (TUA 02/23/2018)",
          sourceInstrument: "Berton E. Korman TUA",
          email: "john@livekorman.com" },
      ],
    },
  },
};

export function structureFor(name: string): InvestorStructure | null {
  return INVESTOR_STRUCTURES[normInvestorKey(name)] ?? null;
}

/** A stored trustee override (see lib/investors/trusteeStore.ts). Redeclared
 *  here (client-safe) so the merge helper doesn't pull in the server-only
 *  store. */
export type TrusteeRowOverride = Partial<TrusteeDirectoryRow> & { name: string; deleted?: boolean };

/** Merge seed trustee rows with stored overrides/additions/removals, keyed by
 *  normalized name. Overrides overlay a seeded row; unmatched overrides are
 *  appended (added trustees); `deleted` rows drop out. Preserves seed order,
 *  additions alphabetized at the end. */
export function mergeTrusteeRows(
  seed: TrusteeDirectoryRow[],
  overrides: Record<string, TrusteeRowOverride>,
): TrusteeDirectoryRow[] {
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const ov = new Map<string, TrusteeRowOverride>();
  for (const o of Object.values(overrides)) ov.set(key(o.name), o);

  const out: TrusteeDirectoryRow[] = [];
  const usedSeed = new Set<string>();
  for (const row of seed) {
    const k = key(row.name);
    usedSeed.add(k);
    const o = ov.get(k);
    if (o?.deleted) continue;
    out.push(o ? { ...row, ...stripUndef(o) } : row);
  }
  const additions = [...ov.values()]
    .filter((o) => !usedSeed.has(key(o.name)) && !o.deleted)
    .map((o) => ({
      name: o.name, address: o.address ?? "", city: o.city ?? "", state: o.state ?? "",
      zip: o.zip, servingIndividually: o.servingIndividually ?? "", trusts: o.trusts ?? "",
      sourceInstrument: o.sourceInstrument ?? "", notes: o.notes, email: o.email,
    } as TrusteeDirectoryRow))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...out, ...additions];
}

function stripUndef<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "name" || k === "deleted") continue;
    if (v !== undefined && v !== null && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
