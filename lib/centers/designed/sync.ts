// Lays the live rent roll over a designed center page's suites (client-safe,
// pure — the render reads the roll and passes its units in).
//
// The page's design owns the GEOMETRY and the curated copy (use, blurb,
// links, logos); the rent roll owns WHO is in each suite and its SF:
//   - vacant on the roll            → "available" at the roll's SF, copy dropped
//   - occupied by a tenant Harry has entered (a saved profile for this suite
//     naming this occupant) → his name, links and logo
//   - occupied by the tenant the design describes → the curated suite
//   - otherwise (a new lease or a turnover nobody has entered yet) → "Coming
//     soon", never the roll's legal name, and the suite is listed by
//     `profilesNeeded` so Harry is asked for the details
// A suite the roll does not carry is left exactly as designed.

export type DesignedSuite = {
  id: string;
  /** Rent-roll suites drawn as this storefront; defaults to [id]. */
  units?: string[];
  /** The roll's name for the tenant the curated copy describes. */
  rollName?: string;
  /** true → the street-number address line; a string replaces it ("Suite 210 · Second floor"). */
  addr?: boolean | string;
  x: number; y: number; w: number; h: number;
  /** An L-shaped suite: several [x, y, w, h] boxes drawn as one. */
  rects?: [number, number, number, number][];
  /** Next door, not part of the centre (Brookwood's Regency / Ashley): never
   *  on the roll, so drawn as designed and left out of the tenant index. */
  shadow?: boolean;
  /** A diagonal suite (Gray's Ferry): SVG polygon points in plan pixels,
   *  replacing the rectangle (x/y/w/h stay as its bounding box); the label
   *  sits at cx, cy rotated `rot`. */
  pts?: string | string[]; cx?: number; cy?: number; rot?: number;
  /** Label font size (Parkwood's small upstairs rooms). */
  fs?: number;
  /** Has an order link but stays out of the order-online row (listed elsewhere). */
  noRow?: boolean;
  /** A tenant who has LEFT but is still on the roll (Parkwood's Rite Aid,
   *  in bankruptcy): while the roll still names them the suite reads as the
   *  design has it — available — never as "Coming soon". */
  departedRollName?: string;
  /** Directory-only entry pointing at another suite's shape. */
  ref?: string;
  /** Explicit logo size / position on the plan. */
  lw?: number; lh?: number; lx?: number; ly?: number;
  tenant: string;
  use: string;
  sf: number;
  status: "leased" | "available";
  url?: string; linkLabel?: string;
  order?: string; orderLabel?: string;
  logo?: string; popLogo?: string; logoBg?: string;
  blurb?: string;
};

export type RollUnitLite = { unitRef: string; occupantName: string; isVacant: boolean; sqft: number };

export type SyncResult = {
  suites: DesignedSuite[];
  /** Sum of the roll's SF over every suite drawn; null when the roll carried none. */
  gla: number | null;
  /** One line per suite the roll changed, for the server log. */
  changes: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const suiteOf = (unitRef: string) => unitRef.split("-").slice(1).join("-").toUpperCase();

/** The roll's occupant is the tenant the copy was written about. */
export function sameOccupant(rollName: string, occupant: string): boolean {
  const a = norm(rollName), b = norm(occupant);
  return !!a && !!b && (a.includes(b) || b.includes(a));
}

/** What Harry keys for a tenant the design does not describe (a turnover or
 *  a new lease). Stored per suite (`profileStore.ts`); it applies only while
 *  `rollName` is still the suite's occupant on the roll, so the next turnover
 *  prompts again rather than showing the old tenant's logo. */
export type TenantProfile = {
  rollName: string;
  tenant: string;
  use?: string;
  url?: string;
  order?: string;
  orderLabel?: string;
  /** Rendered URL (the private-blob proxy), resolved by the caller. */
  logo?: string;
  blurb?: string;
};

/** The suite's occupant on the roll, its SF, and its rent-roll unit. */
type Occupancy = { occupant: string | null; sf: number; unitRef: string };

function occupancyOf(s: DesignedSuite, bySuite: Map<string, RollUnitLite[]>): Occupancy | null {
  const rows = (s.units ?? [s.id]).flatMap((id) => bySuite.get(id.toUpperCase()) ?? []);
  if (!rows.length) return null;
  const occ = rows.find((u) => !u.isVacant && u.occupantName);
  return {
    occupant: occ?.occupantName ?? null,
    sf: Math.round(rows.reduce((t, u) => t + (u.sqft || 0), 0)),
    unitRef: (occ ?? rows[0]).unitRef,
  };
}

function indexUnits(units: RollUnitLite[]): Map<string, RollUnitLite[]> {
  const bySuite = new Map<string, RollUnitLite[]>();
  for (const u of units) {
    const k = suiteOf(u.unitRef);
    if (k) bySuite.set(k, [...(bySuite.get(k) ?? []), u]);
  }
  return bySuite;
}

/** The curated copy still describes this occupant. A suite without a
 *  `rollName` cannot tell, and is trusted unless the design called it vacant. */
const curatedCovers = (s: DesignedSuite, occupant: string) =>
  s.status === "leased" && (!s.rollName || sameOccupant(s.rollName, occupant));

const profileFor = (profiles: Record<string, TenantProfile>, s: DesignedSuite, occupant: string) => {
  const p = profiles[s.id];
  return p && sameOccupant(p.rollName, occupant) ? p : null;
};

/** Shown until someone enters the tenant's details: never the roll's legal name. */
export const UNPROFILED_TENANT = "Coming soon";

export function syncSuites(
  suites: DesignedSuite[],
  units: RollUnitLite[],
  profiles: Record<string, TenantProfile> = {},
): SyncResult {
  const bySuite = indexUnits(units);
  const changes: string[] = [];
  let gla = 0, matched = false;
  const out = suites.map((s): DesignedSuite => {
    const o = occupancyOf(s, bySuite);
    if (!o) return s;
    matched = true;
    gla += o.sf;
    const geometry = { id: s.id, addr: s.addr, x: s.x, y: s.y, w: s.w, h: s.h, rects: s.rects, pts: s.pts, cx: s.cx, cy: s.cy, rot: s.rot, fs: s.fs };
    if (!o.occupant) {
      if (s.status !== "available") changes.push(`${s.id}: ${s.tenant} → available (vacant on the rent roll)`);
      return { ...geometry, tenant: "", use: s.status === "available" ? s.use : "Retail space", sf: o.sf, status: "available" };
    }
    if (s.departedRollName && sameOccupant(s.departedRollName, o.occupant)) {
      return { ...geometry, tenant: "", use: s.use, sf: o.sf, status: "available" };
    }
    const p = profileFor(profiles, s, o.occupant);
    if (p) {
      return {
        ...geometry, status: "leased", sf: o.sf, tenant: p.tenant, use: p.use ?? "",
        url: p.url || undefined, order: p.order || undefined, orderLabel: p.orderLabel || undefined,
        popLogo: p.logo || undefined, blurb: p.blurb || undefined,
      };
    }
    if (curatedCovers(s, o.occupant)) return { ...s, sf: o.sf };
    changes.push(`${s.id}: ${s.status === "available" ? "available" : s.tenant} → ${o.occupant} (rent roll; details not entered)`);
    return { ...geometry, tenant: UNPROFILED_TENANT, use: "", sf: o.sf, status: "leased" };
  });
  return { suites: out, gla: matched ? gla : null, changes };
}

export type ProfileNeeded = { suite: string; unitRef: string; occupant: string; sf: number };

/** Suites whose roll occupant neither the design nor a saved profile
 *  describes — the tenants Harry is asked to enter. */
export function profilesNeeded(
  suites: DesignedSuite[],
  units: RollUnitLite[],
  profiles: Record<string, TenantProfile> = {},
): ProfileNeeded[] {
  const bySuite = indexUnits(units);
  const out: ProfileNeeded[] = [];
  for (const s of suites) {
    const o = occupancyOf(s, bySuite);
    if (!o?.occupant || profileFor(profiles, s, o.occupant) || curatedCovers(s, o.occupant)) continue;
    out.push({ suite: s.id, unitRef: o.unitRef, occupant: o.occupant, sf: o.sf });
  }
  return out;
}
