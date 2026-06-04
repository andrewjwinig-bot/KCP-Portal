export const ALL_USERS = ["admin", "drew", "stacie", "nancy", "harry", "maint", "alison"] as const;
export type UserId = typeof ALL_USERS[number];

export type RentRollCategory = "All" | "Office" | "Retail" | "Residential" | "The Office Works";
export type PropertyType = "all" | "Office" | "Retail" | "Residential" | "Land" | "Misc";

export type UserDef = {
  id: UserId;
  label: string;
  /** Sidebar nav keys this user can see. "all" wins. */
  navKeys: Set<string>;
  /** Path prefixes this user can directly navigate to. "*" allows everything. */
  allowedPathPrefixes: string[];
  /** Default category filter on /rentroll. Other categories are still selectable. */
  defaultRentRollCategory: RentRollCategory;
  /** Default type filter on /properties. */
  defaultPropertyType: PropertyType;
  /**
   * How the dashboard portfolio occupancy renders the breakdown:
   *  - "groups"      → the 5 group bars (JV III, NI LLC, Shopping Centers, Korman Homes, The Office Works)
   *  - codes set     → one bar per individual property whose code is in the set; total reflects that subset
   */
  dashboardScope: "groups" | { codes: Set<string> };
  /**
   * When set, the Maintenance page is limited to a read-only view of
   * requests for the given property codes. Absent → full maintenance access.
   */
  maintenanceView?: { readOnly: boolean; codes: Set<string> };
  /**
   * When set, the Security Deposits page (and unit-page deposit card) is
   * limited to these property codes. Absent → all deposits.
   */
  depositsScope?: { codes: Set<string> };
};

const SC_INDIVIDUAL = new Set(["1100", "2300", "4500", "7010", "9510", "7200", "7300", "1500", "9200", "5600", "8200"]);
const OFFICE_AND_OW_INDIVIDUAL = new Set([
  "3610", "3620", "3640",
  "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0",
  "4900",
]);
const RESIDENTIAL_INDIVIDUAL = new Set(["9800", "9820", "9840", "9860"]);
// Harry's deposit scope — shopping centers + residential (Korman Homes).
const SC_AND_RESIDENTIAL = new Set([...SC_INDIVIDUAL, ...RESIDENTIAL_INDIVIDUAL]);

const universalNav = new Set(["dashboard", "properties", "rentroll"]);

export const USERS: Record<UserId, UserDef> = {
  admin: {
    id: "admin",
    label: "ADMIN",
    navKeys: new Set(["all"]),
    allowedPathPrefixes: ["*"],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
    dashboardScope: "groups",
  },
  // Drew — the admin in person, as a named user so his tasks (master Task
  // Tracker + Filing Tracker) aren't lost in a shared persona. His profile
  // is curated: no maintenance, reservations, payroll, CC expense coding or
  // bank rec. He can switch to the generic admin role for those.
  drew: {
    id: "drew",
    label: "DREW",
    navKeys: new Set([
      ...universalNav,
      "investors",
      "base-years",
      "leasing-activity",
      "tracker",
      "allocated",
      "deposits",
      "bank-transfers",
      "financials-budgets",
    ]),
    allowedPathPrefixes: [
      "/dashboard",
      "/tracker",
      "/properties",
      "/investors",
      "/rentroll",
      "/allocated-invoicer",
      "/deposits",
      "/bank-transfers",
      "/financials",
      "/cam-recon",
    ],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
    dashboardScope: "groups",
  },
  stacie: {
    id: "stacie",
    label: "MARIE",
    // Marie sees the operational/reporting pages but not the financial
    // coding tools (Payroll Invoicer, CC Expense Coder, Allocated Invoicer)
    // or per-employee payroll detail.
    navKeys: new Set([
      ...universalNav,
      "tracker",
      "bank-rec-tracker",
      "bank-transfers",
    ]),
    allowedPathPrefixes: [
      "/dashboard",
      "/properties",
      "/rentroll",
      "/tracker",
      "/bank-rec",
      "/bank-transfers",
    ],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
    dashboardScope: "groups",
  },
  nancy: {
    id: "nancy",
    label: "NANCY",
    navKeys: new Set([...universalNav, "leasing-activity", "base-years", "commissions", "reservations", "maintenance", "deposits"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll", "/commissions", "/reservations", "/maintenance", "/deposits", "/cam-recon"],
    defaultRentRollCategory: "Office",
    defaultPropertyType: "Office",
    dashboardScope: { codes: OFFICE_AND_OW_INDIVIDUAL },
    // Read-only window into office-tenant maintenance requests.
    maintenanceView: { readOnly: true, codes: OFFICE_AND_OW_INDIVIDUAL },
    // Security deposits scoped to office tenants.
    depositsScope: { codes: OFFICE_AND_OW_INDIVIDUAL },
  },
  harry: {
    id: "harry",
    label: "HARRY",
    // Drew's Task Tracker is surfaced on Harry's dashboard; allow him to open
    // the full tracker (its "View all" link) without adding it to his sidebar.
    navKeys: new Set([...universalNav, "expenses", "expenses-history", "payroll-invoicer", "investors", "commissions-retail", "deposits", "bank-transfers"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll", "/expenses", "/investors", "/commissions/retail", "/deposits", "/bank-transfers", "/tracker", "/"],
    defaultRentRollCategory: "Retail",
    defaultPropertyType: "Retail",
    dashboardScope: { codes: SC_INDIVIDUAL },
    // Security deposits scoped to shopping centers + residential.
    depositsScope: { codes: SC_AND_RESIDENTIAL },
  },
  maint: {
    id: "maint",
    label: "SERVICE",
    navKeys: new Set([...universalNav, "maintenance", "expenses", "reservations"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll", "/expenses", "/maintenance", "/reservations"],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
    dashboardScope: "groups",
  },
  alison: {
    id: "alison",
    label: "ALISON",
    // President — a high-level view: dashboard, properties, investors,
    // rent roll, debt. No operational tools or action items.
    navKeys: new Set([...universalNav, "investors", "debt", "base-years", "bank-transfers", "financials-budgets"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll", "/investors", "/debt", "/bank-transfers", "/financials", "/cam-recon"],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
    dashboardScope: "groups",
  },
};

/** admin, drew and alison may switch between user profiles after signing in. */
export function canSwitchUsers(userId: UserId): boolean {
  return userId === "admin" || userId === "drew" || userId === "alison";
}

export function isPathAllowed(userId: UserId, pathname: string): boolean {
  const u = USERS[userId];
  if (u.allowedPathPrefixes.includes("*")) return true;
  // Always allow the login page so users can re-auth
  if (pathname === "/history/login") return true;
  return u.allowedPathPrefixes.some((p) => {
    if (p === "/") return pathname === "/";
    return pathname === p || pathname.startsWith(p + "/");
  });
}
