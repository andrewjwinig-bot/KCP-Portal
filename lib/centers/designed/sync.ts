// Lays the live rent roll over a designed center page's suites (client-safe,
// pure — the render reads the roll and passes its units in).
//
// The page's design owns the GEOMETRY and the curated copy (use, blurb,
// links, logos); the rent roll owns WHO is in each suite and its SF:
//   - vacant on the roll            → "available" at the roll's SF, copy dropped
//   - occupied, page says available → leased to the roll's tenant (no copy yet)
//   - occupied by someone other than `rollName` → turned over: the roll's
//     tenant, without the old tenant's copy, links or logo
//   - otherwise                     → the curated suite as designed
// A suite the roll does not carry is left exactly as designed.

export type DesignedSuite = {
  id: string;
  /** Rent-roll suites drawn as this storefront; defaults to [id]. */
  units?: string[];
  /** The roll's name for the tenant the curated copy describes. */
  rollName?: string;
  addr?: boolean;
  x: number; y: number; w: number; h: number;
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

export function syncSuites(
  suites: DesignedSuite[],
  units: RollUnitLite[],
  display: (rollName: string) => string = (n) => n,
): SyncResult {
  const bySuite = new Map<string, RollUnitLite[]>();
  for (const u of units) {
    const k = suiteOf(u.unitRef);
    if (!k) continue;
    bySuite.set(k, [...(bySuite.get(k) ?? []), u]);
  }
  const changes: string[] = [];
  let gla = 0, matched = false;
  const out = suites.map((s): DesignedSuite => {
    const rows = (s.units ?? [s.id]).flatMap((id) => bySuite.get(id.toUpperCase()) ?? []);
    if (!rows.length) return s;
    matched = true;
    const sf = Math.round(rows.reduce((t, u) => t + (u.sqft || 0), 0));
    gla += sf;
    const geometry = { id: s.id, addr: s.addr, x: s.x, y: s.y, w: s.w, h: s.h };
    const occupant = rows.find((u) => !u.isVacant && u.occupantName)?.occupantName;
    if (!occupant) {
      if (s.status !== "available") changes.push(`${s.id}: ${s.tenant} → available (vacant on the rent roll)`);
      return { ...geometry, tenant: "", use: s.status === "available" ? s.use : "Retail space", sf, status: "available" };
    }
    const turnedOver = s.status === "available" || (!!s.rollName && !sameOccupant(s.rollName, occupant));
    if (turnedOver) {
      const name = display(occupant);
      changes.push(`${s.id}: ${s.status === "available" ? "available" : s.tenant} → ${name} (rent roll)`);
      return { ...geometry, tenant: name, use: "", sf, status: "leased" };
    }
    return { ...s, sf };
  });
  return { suites: out, gla: matched ? gla : null, changes };
}
