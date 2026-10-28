// The Office Works website's interactive floor plan ("Pick your office"),
// from the 4900 rent roll (client-safe, pure — the render reads the roll and
// passes its units in). The design draws every office; the roll says which are
// open, so an office that leases goes blank and one that frees up lights up.

export const OFFICE_WORKS_CODE = "4900";

export type RollUnitLite = { unitRef: string; occupantName: string; isVacant: boolean; sqft: number; amenity?: unknown };

/** The suite part of a unit ref, written the way the page names an office:
 *  Building Five's "5019" / "5-019" → "5-019"; anything else as the roll has it. */
export function officeLabel(unitRef: string): string {
  const suite = unitRef.split("-").slice(1).join("-").trim();
  const m = /^5-?0*(\d{1,3})$/.exec(suite);
  return m ? `5-${m[1].padStart(3, "0")}` : suite;
}

/** Shared space the suite carries on its roll — reception, conference rooms,
 *  the lounge, kitchen, mailroom — is never an office to rent (owner: "ignore
 *  the reception area, conference rooms etc just show vacant"). */
const SHARED_SPACE = /recep|confer|\bconf\b|meeting|board ?room|lobby|lounge|kitchen|caf[eé]|break|mail|copy|print|storage|file|closet|restroom|toilet|common|corridor|hall|server|phone|admin|staff|secretar|front desk|amenit/i;

/** An office the page can offer: an area, not an amenity or shared space,
 *  and a numbered suite ("5019"), not a named room ("CONF"). */
export function isRentableOffice(u: RollUnitLite): boolean {
  const suite = u.unitRef.split("-").slice(1).join("-");
  return !u.amenity && u.sqft > 0 && /\d/.test(suite)
    && !SHARED_SPACE.test(suite) && !SHARED_SPACE.test(u.occupantName || "");
}


/** One office on the interactive floor plan (assets/plan-ow.webp, 2180×2320
 *  px): its rectangle in plan pixels, its SF (`est` = measured off the
 *  drawing), window or interior, month-to-month, and whether it is open. */
export type PlanOffice = {
  id: string; x: number; y: number; w: number; h: number;
  sf: number; est: boolean; win: boolean; av: boolean; m2m: boolean;
  /** Seats the office takes (the design's count). */
  cap: number;
};

/** The design's plan (fourth handoff, 10/28/26 — with seats) — every office in the suite,
 *  with the designer's own availability. The geometry is the design's; who is
 *  in an office is the rent roll's (`planFromRoll`). */
export const PLAN_OFFICES: PlanOffice[] = [
  { id: "5-003", x: 79, y: 23, w: 364, h: 259, sf: 303, est: true, win: true, av: true, m2m: false, cap: 3 },
  { id: "5-004", x: 454, y: 23, w: 177, h: 259, sf: 144, est: false, win: true, av: false, m2m: false, cap: 1 },
  { id: "5-005", x: 641, y: 23, w: 177, h: 259, sf: 141, est: false, win: true, av: false, m2m: false, cap: 1 },
  { id: "5-006", x: 829, y: 23, w: 177, h: 259, sf: 143, est: false, win: true, av: false, m2m: false, cap: 1 },
  { id: "5-007", x: 1016, y: 23, w: 177, h: 259, sf: 143, est: false, win: true, av: false, m2m: false, cap: 1 },
  { id: "5-008", x: 1204, y: 23, w: 177, h: 259, sf: 142, est: false, win: true, av: false, m2m: false, cap: 1 },
  { id: "5-009", x: 1391, y: 23, w: 177, h: 259, sf: 143, est: false, win: true, av: false, m2m: false, cap: 1 },
  { id: "5-010", x: 1579, y: 23, w: 181, h: 259, sf: 145, est: false, win: true, av: false, m2m: false, cap: 1 },
  { id: "5-011", x: 1770, y: 23, w: 379, h: 259, sf: 325, est: false, win: true, av: false, m2m: false, cap: 3 },
  { id: "5-012", x: 1870, y: 293, w: 279, h: 207, sf: 183, est: false, win: true, av: false, m2m: false, cap: 2 },
  { id: "5-013", x: 1870, y: 509, w: 279, h: 206, sf: 179, est: false, win: true, av: false, m2m: false, cap: 2 },
  { id: "5-014", x: 1870, y: 726, w: 279, h: 242, sf: 220, est: false, win: true, av: false, m2m: false, cap: 2 },
  { id: "5-015", x: 1870, y: 977, w: 279, h: 178, sf: 156, est: false, win: true, av: false, m2m: false, cap: 2 },
  { id: "5-016", x: 1869, y: 1166, w: 280, h: 209, sf: 185, est: false, win: true, av: false, m2m: false, cap: 2 },
  { id: "5-017", x: 1869, y: 1384, w: 280, h: 210, sf: 189, est: false, win: true, av: false, m2m: false, cap: 2 },
  { id: "5-018", x: 1869, y: 1603, w: 280, h: 209, sf: 183, est: false, win: true, av: false, m2m: false, cap: 2 },
  { id: "5-019", x: 1869, y: 1821, w: 280, h: 272, sf: 199, est: false, win: true, av: true, m2m: true, cap: 2 },
  { id: "5-020", x: 1770, y: 2052, w: 379, h: 243, sf: 288, est: false, win: true, av: false, m2m: false, cap: 3 },
  { id: "5-021", x: 1485, y: 1960, w: 276, h: 335, sf: 305, est: false, win: true, av: false, m2m: false, cap: 3 },
  { id: "5-022", x: 1489, y: 1747, w: 272, h: 204, sf: 236, est: false, win: false, av: false, m2m: false, cap: 3 },
  { id: "5-023", x: 1566, y: 938, w: 206, h: 226, sf: 139, est: false, win: false, av: false, m2m: false, cap: 1 },
  { id: "5-024", x: 1355, y: 941, w: 202, h: 222, sf: 140, est: false, win: false, av: false, m2m: false, cap: 1 },
  { id: "5-025", x: 1143, y: 941, w: 203, h: 222, sf: 139, est: false, win: false, av: false, m2m: false, cap: 1 },
  { id: "5-026", x: 945, y: 941, w: 189, h: 222, sf: 130, est: false, win: false, av: true, m2m: true, cap: 1 },
  { id: "5-027", x: 1077, y: 622, w: 207, h: 220, sf: 141, est: false, win: false, av: true, m2m: false, cap: 2 },
  { id: "5-028", x: 1293, y: 622, w: 207, h: 220, sf: 141, est: false, win: false, av: true, m2m: true, cap: 1 },
  { id: "5-029", x: 1509, y: 622, w: 263, h: 223, sf: 183, est: false, win: false, av: false, m2m: false, cap: 2 },
  { id: "5-030", x: 1509, y: 390, w: 263, h: 223, sf: 176, est: false, win: false, av: false, m2m: false, cap: 2 },
  { id: "5-031", x: 1293, y: 393, w: 207, h: 220, sf: 143, est: false, win: false, av: false, m2m: false, cap: 2 },
  { id: "5-032", x: 1077, y: 393, w: 207, h: 220, sf: 141, est: false, win: false, av: true, m2m: false, cap: 2 },
];

/** The plan with the 4900 roll laid over it (owner: "dynamic floorplan open
 *  office selection"): an office is open when the roll has it VACANT (and it is
 *  a rentable office), at the roll's SF; an office the roll does not carry is
 *  shown leased, never guessed open. The plan decides what IS an office, so a
 *  vacant roll unit that is not drawn (reception, an upstairs room) is not
 *  offered. With no roll, the design's own flags stand. */
export function planFromRoll(units: RollUnitLite[] | null): PlanOffice[] {
  if (!units) return PLAN_OFFICES;
  const byLabel = new Map<string, RollUnitLite>();
  for (const u of units) byLabel.set(officeLabel(u.unitRef), u);
  return PLAN_OFFICES.map((o) => {
    const u = byLabel.get(o.id);
    if (!u) return { ...o, av: false };
    const sf = u.sqft > 0 ? Math.round(u.sqft) : o.sf;
    return { ...o, sf, est: u.sqft > 0 ? false : o.est, av: u.isVacant && isRentableOffice(u) };
  });
}

/** "130–325" over every office on the plan. */
export function planSizeRange(plan: PlanOffice[]): string {
  const sf = plan.map((o) => o.sf).filter((n) => n > 0);
  if (!sf.length) return "130–325";
  const lo = Math.min(...sf), hi = Math.max(...sf);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}
