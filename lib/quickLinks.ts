// Quick links on the dashboard — the outside systems the team signs in to
// every day (owner, 11/2026: "especially helpful for Randy to get started").
// ONE list: add a link here and it appears on every dashboard it is meant for.
// Icons are the short marks, 128px squares in public/quick-links/.

export type QuickLink = {
  id: string;
  name: string;
  href: string;
  icon: string;
  /** Who sees it. Omitted = everyone signed in. */
  only?: readonly string[];
};

/** Bank logins: Drew, Randy, Harry and Alison (owner) — and admin. */
export const BANKING_USERS = ["drew", "randy", "harry", "alison", "admin"] as const;

export const QUICK_LINKS: QuickLink[] = [
  { id: "skyline", name: "Skyline", href: "https://sscworkspace.ssnc.cloud/Citrix/StoreWeb/#/home", icon: "/quick-links/ssc.png" },
  { id: "avid", name: "AvidXchange", href: "https://one.avidxchange.net/#/invoices", icon: "/quick-links/avid.png" },
  { id: "chase", name: "Chase", href: "https://secure.chase.com/web/auth/dashboard", icon: "/quick-links/chase.png", only: BANKING_USERS },
  { id: "mt", name: "M&T", href: "https://login-tc.mtb.com/a/BTHOST/login/", icon: "/quick-links/mt.png", only: BANKING_USERS },
  { id: "liberty", name: "Liberty Bank", href: "https://secure.myvirtualbranch.com/LibertyBank/React/Accounts.aspx?p_r=1#AccountSummary", icon: "/quick-links/liberty.png", only: BANKING_USERS },
];

export function quickLinksFor(userId: string): QuickLink[] {
  return QUICK_LINKS.filter((l) => !l.only || l.only.includes(userId));
}
