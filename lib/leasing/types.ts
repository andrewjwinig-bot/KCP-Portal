export type Prospect = {
  id: string;
  tenant: string;
  building: string;       // free-text, e.g. "1,6,8"
  sqft: number;
  typeOf: string;         // e.g. "Title Company"
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
  unitRef: string;        // e.g. "3640-101"; tenant info auto-pulled from rent roll
  expirationDate: string; // MM/DD/YYYY
};

export type OptionToRenew = {
  id: string;
  unitRef: string;
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
