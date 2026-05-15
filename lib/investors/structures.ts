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
  },
};

export function structureFor(name: string): InvestorStructure | null {
  return INVESTOR_STRUCTURES[normInvestorKey(name)] ?? null;
}
