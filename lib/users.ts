export const ALL_USERS = ["admin", "nancy", "harry", "maint"] as const;
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
};

const universalNav = new Set(["dashboard", "properties", "rentroll"]);

export const USERS: Record<UserId, UserDef> = {
  admin: {
    id: "admin",
    label: "ADMIN",
    navKeys: new Set(["all"]),
    allowedPathPrefixes: ["*"],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
  },
  nancy: {
    id: "nancy",
    label: "NANCY",
    navKeys: new Set(universalNav),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll"],
    defaultRentRollCategory: "Office",
    defaultPropertyType: "Office",
  },
  harry: {
    id: "harry",
    label: "HARRY",
    navKeys: new Set([...universalNav, "expenses", "expenses-history", "payroll-invoicer"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll", "/expenses", "/"],
    defaultRentRollCategory: "Retail",
    defaultPropertyType: "Retail",
  },
  maint: {
    id: "maint",
    label: "MAINT",
    navKeys: new Set([...universalNav, "maintenance"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll"],
    defaultRentRollCategory: "All",
    defaultPropertyType: "all",
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
