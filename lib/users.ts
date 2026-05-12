export const ALL_USERS = ["admin", "stacie", "nancy", "harry", "maint"] as const;
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
};

const SC_INDIVIDUAL = new Set(["1100", "2300", "4500", "7010", "9510", "7200", "7300", "1500", "9200", "5600", "8200"]);
const OFFICE_AND_OW_INDIVIDUAL = new Set([
  "3610", "3620", "3640",
  "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0",
  "4900",
]);

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
  stacie: {
    id: "stacie",
    label: "STACIE",
    // Stacie sees everything admin sees except sensitive employee payroll
    // detail (Payroll History page + the per-employee Employees card on the
    // Payroll Invoicer remain admin-only via separate checks).
    navKeys: new Set([
      ...universalNav,
      "tracker",
      "payroll-invoicer",
      "expenses",
      "expenses-history",
      "allocated",
      "maintenance",
      "leasing-activity",
    ]),
    allowedPathPrefixes: [
      "/dashboard",
      "/properties",
      "/rentroll",
      "/tracker",
      "/",
      "/expenses",
      "/allocated-invoicer",
    ],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
    dashboardScope: "groups",
  },
  nancy: {
    id: "nancy",
    label: "NANCY",
    navKeys: new Set([...universalNav, "leasing-activity"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll"],
    defaultRentRollCategory: "Office",
    defaultPropertyType: "Office",
    dashboardScope: { codes: OFFICE_AND_OW_INDIVIDUAL },
  },
  harry: {
    id: "harry",
    label: "HARRY",
    navKeys: new Set([...universalNav, "expenses", "expenses-history", "payroll-invoicer"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll", "/expenses", "/"],
    defaultRentRollCategory: "Retail",
    defaultPropertyType: "Retail",
    dashboardScope: { codes: SC_INDIVIDUAL },
  },
  maint: {
    id: "maint",
    label: "MAINT",
    navKeys: new Set([...universalNav, "maintenance"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll"],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
    dashboardScope: "groups",
  },
};

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
