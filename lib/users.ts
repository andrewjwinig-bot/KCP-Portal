export const ALL_USERS = ["admin", "drew", "marie", "nancy", "harry", "maint", "alison"] as const;
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
  /**
   * When set, the Operating Budgets page is limited to workbooks that contain
   * at least one of these property codes (view-only — uploading stays gated by
   * CAN_UPLOAD). Absent → all budgets.
   */
  budgetScope?: { codes: Set<string> };
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
      "task-tracker",
      "tracker",
      "allocated",
      "deposits",
      "bank-transfers",
      "financials-budgets",
      "financials-statements",
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
      "/audit",
      "/security",
    ],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
    dashboardScope: "groups",
  },
  marie: {
    id: "marie",
    label: "MARIE",
    // Marie sees the operational/reporting pages but not the financial
    // coding tools (Payroll Invoicer, CC Expense Coder, Allocated Invoicer)
    // or per-employee payroll detail.
    navKeys: new Set([
      ...universalNav,
      "task-tracker",
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
    navKeys: new Set([...universalNav, "leasing-activity", "base-years", "commissions", "reservations", "maintenance", "deposits", "financials-budgets"]),
    // Financials is limited to Budgets only — no Operating Statements,
    // Reprojections, or Cash Sheet.
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll", "/commissions", "/reservations", "/maintenance", "/deposits", "/financials/budgets", "/cam-recon"],
    defaultRentRollCategory: "Office",
    defaultPropertyType: "Office",
    dashboardScope: { codes: OFFICE_AND_OW_INDIVIDUAL },
    // Read-only window into office-tenant maintenance requests.
    maintenanceView: { readOnly: true, codes: OFFICE_AND_OW_INDIVIDUAL },
    // Security deposits scoped to office tenants.
    depositsScope: { codes: OFFICE_AND_OW_INDIVIDUAL },
    // View-only budgets for the business-park (office) workbooks + The Office
    // Works (4900). Uploading stays gated by CAN_UPLOAD (she's not in it).
    budgetScope: { codes: OFFICE_AND_OW_INDIVIDUAL },
  },
  harry: {
    id: "harry",
    label: "HARRY",
    // Harry gets Drew's Task Tracker (dashboard card + sidebar item) but not
    // the Filing Tracker (which is the separate "tracker" key).
    navKeys: new Set([...universalNav, "expenses", "expenses-history", "payroll-invoicer", "investors", "commissions-retail", "deposits", "bank-transfers", "task-tracker"]),
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
    navKeys: new Set([...universalNav, "investors", "debt", "base-years", "bank-transfers", "financials-budgets", "financials-statements"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll", "/investors", "/debt", "/bank-transfers", "/financials", "/cam-recon"],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
    dashboardScope: "groups",
  },
};

/** Only admin and Drew may switch between user profiles after signing in.
 *  Keyed off the authenticated (cookie) user, so no one else can toggle. */
export function canSwitchUsers(userId: UserId): boolean {
  return userId === "admin" || userId === "drew";
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

// Sensitive API groups → the page prefix that governs them. An API request is
// authorized iff the user may visit the governing page. Listed most-specific
// first (first match wins). APIs NOT listed here are cross-cutting (rent roll,
// properties, dashboard, search, maintenance, reservations, tracker, …) and
// stay available to any signed-in user — gating them would break shared flows.
const SENSITIVE_API_PREFIXES: [apiPrefix: string, pagePrefix: string][] = [
  ["/api/commissions/retail", "/commissions/retail"],
  ["/api/commissions", "/commissions"],
  // Budgets API maps to the Budgets page specifically (Nancy is limited to it);
  // listed before the broad /api/financials → /financials mapping.
  ["/api/financials/budgets", "/financials/budgets"],
  ["/api/financials", "/financials"],
  ["/api/cam-recon", "/cam-recon"],
  ["/api/cam-config", "/cam-recon"],
  ["/api/deposits", "/deposits"],
  ["/api/bank-rec", "/bank-rec"],
  ["/api/bank-transfers", "/bank-transfers"],
  ["/api/debt", "/debt"],
];
// Cross-cutting endpoints under a sensitive prefix that must stay open (used by
// global search / dashboard for everyone). Aggregate, low-detail.
const API_AUTHZ_EXEMPT = ["/api/financials/budgets/kpis"];

const underPrefix = (pathname: string, p: string) => pathname === p || pathname.startsWith(p + "/");

/** Server-side authorization for a request path. Pages use isPathAllowed;
 *  sensitive API groups map to their governing page; everything else stays
 *  open to any signed-in user. */
export function authorizeRequest(userId: UserId, pathname: string): boolean {
  // Self-service 2FA — every signed-in user manages their own (the
  // admin-only required-list endpoint is gated separately in middleware).
  if (pathname === "/security" || pathname.startsWith("/security/") || pathname.startsWith("/api/2fa")) return true;
  if (pathname.startsWith("/api/")) {
    if (API_AUTHZ_EXEMPT.some((p) => underPrefix(pathname, p))) return true;
    const match = SENSITIVE_API_PREFIXES.find(([api]) => underPrefix(pathname, api));
    return match ? isPathAllowed(userId, match[1]) : true;
  }
  return isPathAllowed(userId, pathname);
}
