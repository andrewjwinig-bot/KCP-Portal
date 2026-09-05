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
  /** Management fee % on the CAM subtotal (0 for Wawa). Display + total. */
  mgmtFeePct: number;
  /** Eligible CAM cost line labels (the editable rows), workbook order. */
  camLines: string[];
  /** CAM line label → GL account, so each quarter's eligible cost is pulled
   *  live from the parent property's GL (the "Working Trial Balance"). */
  camAccounts: Record<string, string>;
  /** GL account carrying real estate taxes. */
  retAccount: string;
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
    mgmtFeePct: 0,
    // Wawa's eligible CAM lines (no Parking Lot Cap Ex — Wawa excludes it),
    // labels + GL accounts per the CAM/RET billing workbook.
    camLines: [
      "Building Maintenance",
      "Maintenance Salaries",
      "Parking Lot Sweeping/Cleaning",
      "Parking Lot Maintenance/Repairs",
      "Trash Removal",
      "Snow Removal",
      "Landscaping",
      "Security",
      "Utilities",
      "Liability Insurance",
    ],
    camAccounts: {
      "Building Maintenance": "6220-8502",
      "Maintenance Salaries": "6030-8502",
      "Parking Lot Sweeping/Cleaning": "6330-8502",
      "Parking Lot Maintenance/Repairs": "6360-8502",
      "Trash Removal": "6270-8502",
      "Snow Removal": "6370-8502",
      "Landscaping": "6380-8502",
      "Security": "6350-8502",
      "Utilities": "6120-8502",
      "Liability Insurance": "6510-8502",
    },
    retAccount: "6410-8502",
    years: [2025, 2026],
  },
};

// Finalized per-cell figures that override the raw GL auto-pull — for items
// backed out of a quarter (excluded charges) that the GL still carries. Keyed
// "<key>-<year>"; layered between the GL auto value and any staff manual edit.
// (Source: the quarter's CAM/RET billing workbook.)
export const QUARTERLY_OVERRIDE_SEED: Record<string, QuarterlyData> = {
  "9510-WAWA-Q-2026": {
    camCosts: {
      "Building Maintenance": { Q1: 7255 },
      "Maintenance Salaries": { Q1: 2227 },
      "Parking Lot Sweeping/Cleaning": { Q1: 3900 },
      "Parking Lot Maintenance/Repairs": { Q1: 100 },
      "Trash Removal": { Q1: 7499 },
      "Snow Removal": { Q1: 46431 },
      "Landscaping": { Q1: 0 },
      "Security": { Q1: 720 },
      "Utilities": { Q1: 1539 },
      "Liability Insurance": { Q1: 9219 },
    },
    retCosts: { Q1: 7976 },
    billed: {},
  },
};

/** The 1-based months that make up a quarter. */
export function quarterMonths(q: Quarter): number[] {
  const i = QUARTERS.indexOf(q);
  return [i * 3 + 1, i * 3 + 2, i * 3 + 3];
}

/** Build the auto (GL-sourced) quarterly figures from the parent property's GL
 *  monthly nets: each CAM line's account summed per quarter (posted months
 *  only), plus RET. Quarters with no posted months read $0. */
export function autoQuarterlyFromGl(
  def: QuarterlyBillingDef,
  monthly: Record<string, number[]>,
  maxPostedMonth: number,
): QuarterlyData {
  const sumQ = (account: string, q: Quarter): number => {
    const nets = monthly[account] ?? [];
    let s = 0;
    for (const mo of quarterMonths(q)) if (mo <= maxPostedMonth) s += nets[mo - 1] || 0;
    return Math.round(s);
  };
  const camCosts: QuarterlyData["camCosts"] = {};
  for (const label of def.camLines) {
    const acct = def.camAccounts[label];
    if (!acct) continue;
    const row: Partial<Record<Quarter, number>> = {};
    for (const q of QUARTERS) { const v = sumQ(acct, q); if (v) row[q] = v; }
    if (Object.keys(row).length) camCosts[label] = row;
  }
  const retCosts: Partial<Record<Quarter, number>> = {};
  for (const q of QUARTERS) { const v = sumQ(def.retAccount, q); if (v) retCosts[q] = v; }
  return { camCosts, retCosts, billed: {} };
}

/** Effective figures = manual override per cell, else the GL auto value. Billed
 *  is manual only (it comes from Skyline billing, not the GL). */
export function mergeQuarterly(auto: QuarterlyData, manual: QuarterlyData): QuarterlyData {
  const camCosts: QuarterlyData["camCosts"] = {};
  const labels = new Set([...Object.keys(auto.camCosts), ...Object.keys(manual.camCosts)]);
  for (const label of labels) {
    const row: Partial<Record<Quarter, number>> = { ...(auto.camCosts[label] ?? {}) };
    for (const q of QUARTERS) { const m = manual.camCosts[label]?.[q]; if (m != null) row[q] = m; }
    camCosts[label] = row;
  }
  const retCosts: Partial<Record<Quarter, number>> = { ...auto.retCosts };
  for (const q of QUARTERS) { const m = manual.retCosts[q]; if (m != null) retCosts[q] = m; }
  return { camCosts, retCosts, billed: { ...manual.billed } };
}

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
