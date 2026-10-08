// Funds are cash-sweep shells (no P&L of their own); a fund's cash picture is the
// rollup of its member buildings + the shell (the swept cash + inter-entity).
// ONE source for the shell→buildings map, shared by the cash-analysis route, its
// drill-down, and the operating-statements rollup — don't re-key it per route.

export const FUND_BUILDINGS: Record<string, string[]> = {
  PJV3: ["3610", "3620", "3640"],
  PNIPLX: ["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"],
};

/** Fund GL aliases → the internal shell key the buildings hang off of. The page
 *  shows the fund account code (FJVIII / FNIPLX), but the GL is keyed by the
 *  shell (PJV3 / PNIPLX); accept either when resolving a fund's member GLs. */
const FUND_ALIAS: Record<string, string> = { FJVIII: "PJV3", FNIPLX: "PNIPLX" };

/** Every GL key whose monthly nets make up a row's displayed cash flow: the key
 *  itself plus, for a fund, all its member buildings. Non-fund keys map to just
 *  themselves. Accepts the fund account-code aliases (FJVIII / FNIPLX). */
export function glKeysFor(key: string): string[] {
  const shell = FUND_ALIAS[key.toUpperCase()] ?? key;
  const buildings = FUND_BUILDINGS[shell.toUpperCase()] ?? FUND_BUILDINGS[shell];
  return buildings ? [shell, ...buildings] : [key];
}
