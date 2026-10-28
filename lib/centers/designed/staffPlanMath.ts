// The INTERNAL site plan on a property's page (client-safe, pure): the
// designed centre's drawing coloured by what staff act on, not by what the
// public is sold. The data comes from `staffPlan.ts`; this file decides the
// colour of each suite and the words in its legend.

export type PlanMeta = {
  /** The site-plan image (public/centers/<dir>/assets). */
  src: string;
  /** Plan pixels the suite shapes are drawn in — the designed page's own SVG viewBox. */
  viewBox: string;
  width: number;
  height: number;
};

export type StaffSuiteMoney = {
  /** Monthly base rent. */
  baseRent: number;
  /** Annual base rent ÷ SF. */
  rentPsf: number;
  cam: number;
  ret: number;
  other: number;
  /** Monthly gross (rent + CAM + RET + other). */
  gross: number;
};

export type StaffSuiteAr = {
  totalDue: number;
  pastDue: number;
  /** The statement month read ("2026-10") and the import it came from. */
  period: string;
  asOf: string | null;
};

export type StaffSuite = {
  id: string;
  /** The label drawn on the plan (Parkwood's street numbers read their last three digits). */
  label: string;
  pts?: string[];
  rects?: [number, number, number, number][];
  cx: number; cy: number; rot: number; fs?: number;
  /** Bounding box size in plan pixels — sizes the label to fit the storefront. */
  w: number; h: number;
  /** Who the public sees — the DBA / Harry's profile — else the roll's name. */
  tenant: string;
  /** The rent roll's own name for the occupant (often the legal name). */
  occupant: string | null;
  unitRefs: string[];
  sf: number;
  status: "leased" | "available";
  /** Next door, not ours (Brookwood's Regency / Ashley): drawn, never coloured. */
  shadow?: boolean;
  /** Second floor (Parkwood's 201–218) — the `addr` line the design carries. */
  addr?: string;
  leaseFrom: string | null;
  leaseTo: string | null;
  /** Omitted for viewers who do not see rents (the service logins). */
  money?: StaffSuiteMoney;
  /** Omitted for viewers without Monthly Statements, or no statement on file. */
  ar?: StaffSuiteAr | null;
};

export type StaffPlan = {
  code: string;
  slug: string;
  name: string;
  plan: PlanMeta;
  suites: StaffSuite[];
  /** The rent roll the colours come from — said on the card. */
  rollImportedAt: string | null;
  canSeeMoney: boolean;
  canSeeAr: boolean;
};

// ── Lease expiry ────────────────────────────────────────────────────────────

export type ExpiryBucket = "vacant" | "expired" | "lt12" | "lt24" | "later" | "unknown";

export const EXPIRY_ORDER: ExpiryBucket[] = ["expired", "lt12", "lt24", "later", "vacant", "unknown"];

export const EXPIRY_LABEL: Record<ExpiryBucket, string> = {
  expired: "Past term / holdover",
  lt12: "Expires within 12 months",
  lt24: "12–24 months",
  later: "24+ months",
  vacant: "Vacant",
  unknown: "No lease date",
};

/** Fill colours on the plan — drawn over a light site-plan image, so fixed
 *  rather than themed (the same reason a chart's series colours are). */
export const EXPIRY_COLOR: Record<ExpiryBucket, string> = {
  expired: "#dc2626",
  lt12: "#f59e0b",
  lt24: "#facc15",
  later: "#16a34a",
  vacant: "#335580",
  unknown: "#94a3b8",
};

/** "11/30/2026" (the rent roll's form) or ISO → "2026-11-30"; null when unreadable. */
export function isoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** Whole months from today to the lease's end (negative once it has passed). */
export function monthsLeft(leaseTo: string | null, today: Date): number | null {
  const iso = isoDate(leaseTo);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const months = (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth());
  return d < today.getDate() ? months - 1 : months;
}

export function expiryBucket(s: Pick<StaffSuite, "status" | "leaseTo">, today: Date): ExpiryBucket {
  if (s.status === "available") return "vacant";
  const left = monthsLeft(s.leaseTo, today);
  if (left == null) return "unknown";
  if (left < 0) return "expired";
  if (left < 12) return "lt12";
  if (left < 24) return "lt24";
  return "later";
}

// ── Rent and A/R scales ─────────────────────────────────────────────────────

/** Where a value sits between the low and high of its set, 0–1. */
export function scaleOf(v: number, values: number[]): number {
  const xs = values.filter((x) => x > 0);
  if (!xs.length || v <= 0) return 0;
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return hi === lo ? 1 : (v - lo) / (hi - lo);
}

/** Light → deep brand for a sequential figure (rent $/SF). */
export function brandRamp(t: number): string {
  const a = [219, 234, 254], b = [11, 74, 125];
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * Math.min(1, Math.max(0, t))));
  return `rgb(${c.join(",")})`;
}

export type ArBucket = "none" | "current" | "pastDue" | "unknown";

/** Past due is the exception worth colouring; a balance that is only this
 *  month's charges is ordinary for a statement run after the 1st. */
export function arBucket(ar: StaffSuiteAr | null | undefined, floor = 1): ArBucket {
  if (!ar) return "unknown";
  if (ar.pastDue >= floor) return "pastDue";
  if (ar.totalDue >= floor) return "current";
  return "none";
}

export const AR_COLOR: Record<ArBucket, string> = {
  pastDue: "#dc2626",
  current: "#f59e0b",
  none: "#16a34a",
  unknown: "#94a3b8",
};

export const AR_LABEL: Record<ArBucket, string> = {
  pastDue: "Past due",
  current: "This month's charges open",
  none: "Paid up",
  unknown: "No statement on file",
};

/** A suite label that fits its storefront: the plan's base size, shrunk to
 *  the suite's width (or its length, for a rotated one) — Parkwood's 37-px
 *  in-line bays otherwise run three labels into one another. */
export function labelSize(s: Pick<StaffSuite, "label" | "w" | "h" | "rot" | "fs">, base: number): number {
  if (s.fs) return s.fs;
  const span = s.rot ? Math.max(s.w, s.h) : s.w;
  const fit = (span - 6) / (0.62 * Math.max(1, s.label.length));
  return Math.max(12, Math.min(base, fit));
}
