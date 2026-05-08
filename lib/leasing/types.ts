export type Prospect = {
  id: string;
  tenant: string;
  building: string;       // free-text, e.g. "1,6,8"
  sqft: number;
  typeOf: string;
  rating: number | null;  // 1-5
};

export type PendingLease = {
  id: string;
  tenant: string;
  building: string;
  sqft: number;
  startDate: string;      // MM/DD/YYYY
};

export type TenantVacating = {
  id: string;
  unitRef?: string;       // optional link to a rent roll unit (auto-fill helper)
  tenant: string;
  building: string;
  sqft: number;
  expirationDate: string; // MM/DD/YYYY
};

export type OptionToRenew = {
  id: string;
  unitRef?: string;
  tenant: string;
  building: string;
  sqft: number;
  term: string;          // e.g. "5 years / 6 mos."
  noticeDate: string;    // MM/DD/YYYY
  optionTermExp: string; // MM/DD/YYYY
};

export type LeasingActivity = {
  prospects: Prospect[];
  pendingLeases: PendingLease[];
  tenantsVacating: TenantVacating[];
  optionsToRenew: OptionToRenew[];
};

export const EMPTY_LEASING_ACTIVITY: LeasingActivity = {
  prospects: [],
  pendingLeases: [],
  tenantsVacating: [],
  optionsToRenew: [],
};

/**
 * Seed data drawn from the existing Excel Leasing Activity Summary Report.
 * Only used when no leasing activity has been saved yet — once the editor
 * writes anything, the saved payload replaces this.
 */
export const SEED_LEASING_ACTIVITY: LeasingActivity = {
  prospects: [
    { id: "p-cpn",     tenant: "Broker- CPN RE",     building: "8",     sqft: 5000, typeOf: "Financial Trading", rating: 2 },
    { id: "p-naimertz", tenant: "Broker- NAI Mertz", building: "1",     sqft: 1800, typeOf: "Custom Apparel",    rating: 1 },
    { id: "p-oere",    tenant: "Broker- OE RE",      building: "4",     sqft: 1157, typeOf: "Title Company",     rating: 2 },
    { id: "p-cbre",    tenant: "Broker- CBRE",       building: "1,6,8", sqft: 2500, typeOf: "Unknown",           rating: 1 },
    { id: "p-stanton", tenant: "Tom Stanton",        building: "1,6,8", sqft: 2500, typeOf: "Construction",      rating: 1 },
  ],
  pendingLeases: [
    { id: "pl-apollo",  tenant: "Apollo Acquistions",          building: "5", sqft: 1707, startDate: "6/1/2026" },
    { id: "pl-univsrv", tenant: "University Srvs (renewal)",   building: "4", sqft: 795,  startDate: "7/1/2026" },
    { id: "pl-corppay", tenant: "Corporate Payroll (renewal)", building: "2", sqft: 2420, startDate: "8/1/2026" },
    { id: "pl-horizon", tenant: "Horizon House (renewal)",     building: "1", sqft: 1145, startDate: "6/1/2026" },
  ],
  tenantsVacating: [
    { id: "tv-gilson", tenant: "Ed Gilson", building: "4", sqft: 1157, expirationDate: "6/30/2026" },
    { id: "tv-seom",   tenant: "SEOM",      building: "4", sqft: 9561, expirationDate: "9/30/2026" },
  ],
  optionsToRenew: [
    { id: "or-davita-1",  tenant: "Davita",                       building: "2", sqft: 9552, term: "(1st)- 5 years / 9 mos.", noticeDate: "12/1/2027",  optionTermExp: "8/31/2033"  },
    { id: "or-davita-2",  tenant: "Davita",                       building: "2", sqft: 9552, term: "(2nd)- 5 years / 9 mos.", noticeDate: "12/1/2032",  optionTermExp: "8/31/2037"  },
    { id: "or-sob",       tenant: "Sisters of Blessed Sacrament", building: "4", sqft: 2790, term: "5 years / 6 mos.",        noticeDate: "1/31/2027",  optionTermExp: "7/31/2032"  },
    { id: "or-amerbread", tenant: "American Bread Co.",           building: "5", sqft: 1601, term: "2 years / 6 mos.",        noticeDate: "8/1/2027",   optionTermExp: "1/31/2029"  },
    { id: "or-hearusa",   tenant: "HearUSA",                      building: "6", sqft: 1166, term: "2 years / 6 mos.",        noticeDate: "10/1/2026",  optionTermExp: "3/31/2029"  },
    { id: "or-cbiz",      tenant: "CBIZ Technology",              building: "6", sqft: 2552, term: "2 years / 9 mos.",        noticeDate: "7/1/2029",   optionTermExp: "3/31/2029"  },
    { id: "or-lawler-1",  tenant: "Lawler Terrace Corp.",         building: "8", sqft: 1420, term: "3 years / 6 mos.",        noticeDate: "10/1/2025",  optionTermExp: "3/31/2029"  },
    { id: "or-justkids",  tenant: "Just Children",                building: "8", sqft: 9521, term: "3 years / 6 mos.",        noticeDate: "12/1/2026",  optionTermExp: "5/31/2030"  },
    { id: "or-broder",    tenant: "Broder Bros.",                 building: "6", sqft: 2475, term: "1 years / 5/1/2026",      noticeDate: "5/1/2026",   optionTermExp: "11/30/2027" },
    { id: "or-korman",    tenant: "Korman Commercial",            building: "8", sqft: 4443, term: "5 years / 6 mos.",        noticeDate: "2/28/2026",  optionTermExp: "8/31/2031"  },
    { id: "or-velti-1",   tenant: "Velti, Inc.",                  building: "7", sqft: 6374, term: "5 years / 6 mos.",        noticeDate: "5/1/2027",   optionTermExp: "10/31/2032" },
    { id: "or-velti-2",   tenant: "Velti, Inc.",                  building: "7", sqft: 6795, term: "5 years / 6 mos.",        noticeDate: "5/1/2027",   optionTermExp: "10/31/2032" },
    { id: "or-lawler-2",  tenant: "Lawler Terrace Corp.",         building: "8", sqft: 1865, term: "5 years / 6 mos.",        noticeDate: "10/1/2027",  optionTermExp: "3/31/2033"  },
    { id: "or-mackee",    tenant: "MacKee, Inc.",                 building: "8", sqft: 6361, term: "5 years / 6 mos.",        noticeDate: "9/1/2029",   optionTermExp: "2/28/2035"  },
    { id: "or-roberthalf",tenant: "Robert Half",                  building: "7", sqft: 3680, term: "5 years / 9 mos.",        noticeDate: "9/30/2029",  optionTermExp: "6/30/2035"  },
    { id: "or-prosegur",  tenant: "Prosegur Services",            building: "8", sqft: 1915, term: "3 years / 6 mos.",        noticeDate: "7/1/2029",   optionTermExp: "12/31/2032" },
  ],
};
