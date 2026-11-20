// The Neshaminy Interplex campus map's figures — one building at a time, off
// the rent roll's suites. Pure and client-safe: the server builds them
// (campus.ts) and the card (CampusPlanCard) draws them.

export type CampusBuildingFigures = {
  id: string;
  code: string;
  name: string;
  fund: "JV III" | "NI LLC" | null;
  pts: string[];
  cx: number; cy: number;
  /** On the rent roll at all — Kor Center A/B/C etc. always are; false = no roll imported. */
  onRoll: boolean;
  sf: number;
  leasedSf: number;
  tenants: number;
  vacantSuites: number;
  /** Annual base rent and its $/SF over leased SF — omitted for the service logins. */
  baseRentAnnual?: number;
  avgRentPsf?: number;
  /** SF-weighted years left on the leases in place. */
  walt: number | null;
  /** Open past-due A/R — only for those who can open Monthly Statements. */
  pastDue?: number;
};

export type CampusView = {
  src: string; width: number; height: number;
  /** The fund whose page this is — its buildings lead, the other fund's read lighter. */
  fund: "JV III" | "NI LLC";
  buildings: CampusBuildingFigures[];
  rollImportedAt: string | null;
  canSeeMoney: boolean;
  canSeeAr: boolean;
};

type Unit = { unitRef: string; isVacant?: boolean; occupantName?: string | null; sqft?: number; annualRent?: number; leaseTo?: string | null; amenity?: unknown };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A building's occupancy, rent and term off its rent-roll suites. */
export function buildingFigures(units: Unit[], today: Date): Omit<CampusBuildingFigures, "id" | "code" | "name" | "fund" | "pts" | "cx" | "cy" | "onRoll" | "pastDue"> {
  let sf = 0, leasedSf = 0, rent = 0, waltNum = 0, waltSf = 0, vacant = 0;
  const tenants = new Set<string>();
  for (const u of units) {
    if (u.amenity) continue;
    const s = u.sqft || 0;
    sf += s;
    const leased = !u.isVacant && !!u.occupantName;
    if (!leased) { vacant++; continue; }
    leasedSf += s;
    tenants.add(String(u.occupantName).trim().toLowerCase());
    rent += u.annualRent || 0;
    const end = u.leaseTo ? Date.parse(u.leaseTo) : NaN;
    if (Number.isFinite(end) && s > 0) {
      waltNum += Math.max(0, (end - today.getTime()) / (365.25 * 86_400_000)) * s;
      waltSf += s;
    }
  }
  return {
    sf: Math.round(sf), leasedSf: Math.round(leasedSf), tenants: tenants.size, vacantSuites: vacant,
    baseRentAnnual: Math.round(rent), avgRentPsf: leasedSf > 0 ? round2(rent / leasedSf) : 0,
    walt: waltSf > 0 ? Math.round((waltNum / waltSf) * 10) / 10 : null,
  };
}

/** Leased share of a building's SF, 0–1 (0 with nothing on the roll). */
export const occupancyOf = (b: Pick<CampusBuildingFigures, "sf" | "leasedSf">) => (b.sf > 0 ? b.leasedSf / b.sf : 0);

/** Occupancy bands the campus map is coloured by (the site plans' greens → amber → red). */
export const OCC_BANDS: { key: string; label: string; min: number; color: string }[] = [
  { key: "full", label: "95%+ leased", min: 0.95, color: "#15803d" },
  { key: "high", label: "85–95%", min: 0.85, color: "#65a30d" },
  { key: "mid", label: "70–85%", min: 0.7, color: "#d97706" },
  { key: "low", label: "Under 70%", min: 0, color: "#dc2626" },
];
export const occBand = (b: Pick<CampusBuildingFigures, "sf" | "leasedSf">) => OCC_BANDS.find((x) => occupancyOf(b) >= x.min)!;
