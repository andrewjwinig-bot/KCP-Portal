// Office buildings (JV III + NI LLC)
const OFFICE_CODES = ["3610", "3620", "3640", "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"];
// Shopping Centers
const SC_CODES = ["1100", "2300", "4500", "7010", "9510", "7200", "7300", "1500", "9200", "5600", "8200"];

export const ALL_USERS = ["admin", "nancy", "harry", "maint"] as const;
export type UserId = typeof ALL_USERS[number];

export type UserDef = {
  id: UserId;
  label: string;
  /** Sidebar nav keys this user can see. "all" wins. */
  navKeys: Set<string>;
  /** Property codes (uppercased) this user is scoped to. null = no scope (sees everything). */
  propertyScope: Set<string> | null;
  /** Path prefixes this user can directly navigate to. "*" allows everything. */
  allowedPathPrefixes: string[];
};

const universalNav = new Set(["dashboard", "properties", "rentroll"]);

export const USERS: Record<UserId, UserDef> = {
  admin: {
    id: "admin",
    label: "ADMIN",
    navKeys: new Set(["all"]),
    propertyScope: null,
    allowedPathPrefixes: ["*"],
  },
  nancy: {
    id: "nancy",
    label: "NANCY",
    navKeys: new Set(universalNav),
    propertyScope: new Set([...OFFICE_CODES.map((c) => c.toUpperCase()), "4900"]),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll"],
  },
  harry: {
    id: "harry",
    label: "HARRY",
    navKeys: new Set([...universalNav, "expenses", "expenses-history", "payroll-invoicer"]),
    propertyScope: new Set(SC_CODES.map((c) => c.toUpperCase())),
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll", "/expenses", "/"],
  },
  maint: {
    id: "maint",
    label: "MAINT",
    navKeys: new Set([...universalNav, "maintenance"]),
    propertyScope: null,
    allowedPathPrefixes: ["/dashboard", "/properties", "/rentroll"],
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
