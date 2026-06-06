// Quarterly CAM/RET billing for tenants billed by quarter rather than at
// year-end (currently Wawa @ Shops of Lafayette Hill, 9510). It renders on the
// CAM/RET Reconciliation page as its own dropdown entry below the parent
// property — almost a pseudo-property.
//
// Staff manually enter each quarter's eligible CAM expenses and the RET, plus
// what's been billed/paid; the tenant's lease share is applied per quarter and
// the YTD balance auto-backs-out the billed/paid YTD (due YTD − billed YTD).
// Pure + client-safe; storage lives in quarterlyStore.ts.

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export type Quarter = typeof QUARTERS[number];

export type QuarterlyBillingDef = {
  /** Dropdown key (synthetic propertyCode), e.g. "9510-WAWA-Q". */
  key: string;
  /** The real recon property this sits under, e.g. "9510". */
  parentProperty: string;
  /** The tenant's unit ref, e.g. "9510-406". */
  unitRef: string;
  name: string;
  /** Dropdown label shown under the parent property. */
  label: string;
  /** Lease share % (e.g. 21 for Wawa). */
  sharePct: number;
  /** Occupancy fraction (0–1). */
  occPct: number;
  /** Eligible CAM cost line labels (the editable rows). */
  camLines: string[];
  years: number[];
};

export const QUARTERLY_BILLINGS: Record<string, QuarterlyBillingDef> = {
  "9510-WAWA-Q": {
    key: "9510-WAWA-Q",
    parentProperty: "9510",
    unitRef: "9510-406",
    name: "Wawa",
    label: "9510 — Shops of Lafayette Hill — Wawa",
    sharePct: 21,
    occPct: 1,
    // Wawa's eligible CAM lines (no Parking Lot Cap Ex — Wawa excludes it).
    camLines: [
      "Building Maintenance",
      "Maintenance Salaries",
      "Parking Lot Cleaning",
      "Parking Lot Maintenance",
      "Trash Removal",
      "Snow Removal",
      "Landscaping",
      "Security",
      "Electric (Common)",
      "Liability Insurance",
    ],
    years: [2025],
  },
};

export function availableQuarterly(): Array<{ key: string; parentProperty: string; label: string; years: number[] }> {
  return Object.values(QUARTERLY_BILLINGS).map((d) => ({
    key: d.key, parentProperty: d.parentProperty, label: d.label, years: d.years,
  }));
}

/** Manually-entered quarterly figures. Sparse — only filled cells stored. */
export type QuarterlyData = {
  /** CAM cost line label → quarter → $. */
  camCosts: Record<string, Partial<Record<Quarter, number>>>;
  /** RET cost → quarter → $. */
  retCosts: Partial<Record<Quarter, number>>;
  /** Amount billed / paid → quarter → $ (backed out of the due). */
  billed: Partial<Record<Quarter, number>>;
};

export function emptyQuarterlyData(): QuarterlyData {
  return { camCosts: {}, retCosts: {}, billed: {} };
}

export type QuarterlyComputed = {
  camCostByQ: Record<Quarter, number>;
  retCostByQ: Record<Quarter, number>;
  camDueByQ: Record<Quarter, number>;
  retDueByQ: Record<Quarter, number>;
  dueByQ: Record<Quarter, number>;
  billedByQ: Record<Quarter, number>;
  camCostYtd: number;
  retCostYtd: number;
  camDueYtd: number;
  retDueYtd: number;
  dueYtd: number;
  billedYtd: number;
  /** due YTD − billed/paid YTD (positive = still owed). */
  balanceYtd: number;
};

const zero = (): Record<Quarter, number> => ({ Q1: 0, Q2: 0, Q3: 0, Q4: 0 });

export function computeQuarterly(def: QuarterlyBillingDef, data: QuarterlyData): QuarterlyComputed {
  const share = def.sharePct / 100;
  const occ = def.occPct;
  const camCostByQ = zero(), retCostByQ = zero(), camDueByQ = zero(),
    retDueByQ = zero(), dueByQ = zero(), billedByQ = zero();
  for (const q of QUARTERS) {
    let camCost = 0;
    for (const label of def.camLines) camCost += data.camCosts[label]?.[q] ?? 0;
    camCostByQ[q] = camCost;
    retCostByQ[q] = data.retCosts[q] ?? 0;
    camDueByQ[q] = share * camCost * occ;
    retDueByQ[q] = share * retCostByQ[q] * occ;
    dueByQ[q] = camDueByQ[q] + retDueByQ[q];
    billedByQ[q] = data.billed[q] ?? 0;
  }
  const sum = (m: Record<Quarter, number>) => QUARTERS.reduce((a, q) => a + m[q], 0);
  const dueYtd = sum(dueByQ);
  const billedYtd = sum(billedByQ);
  return {
    camCostByQ, retCostByQ, camDueByQ, retDueByQ, dueByQ, billedByQ,
    camCostYtd: sum(camCostByQ), retCostYtd: sum(retCostByQ),
    camDueYtd: sum(camDueByQ), retDueYtd: sum(retDueByQ),
    dueYtd, billedYtd, balanceYtd: dueYtd - billedYtd,
  };
}
