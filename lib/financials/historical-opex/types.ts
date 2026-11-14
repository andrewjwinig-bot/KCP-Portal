// One time-series entry. Captures historical actuals for a single
// operating-expense line on a single property — e.g. property 4080's
// Real Estate Taxes from 2005–2024.
//
// The "yearly" map is sparse: years with no data simply aren't keyed.
// A literal $0 in the year (e.g. 2016 for 4080 RET) IS keyed — it
// represents a real "assessment skipped / waived" observation, not
// missing data. The page surfaces both cases differently.

export type HistoricalOpExEntry = {
  /** Property code the actuals roll up to (e.g. "4080"). */
  propertyCode: string;
  /** Human-readable line label (e.g. "Real Estate Taxes"). */
  lineLabel: string;
  /** GL account when known. Optional because some legacy uploads only
   *  carry the label. */
  glAccount?: string;
  /** year (4-digit) -> annual dollar amount. Sparse. */
  yearly: Record<string, number>;
  /** Optional free-text description of where the data came from
   *  (manual import, prior-year workbook, etc.). */
  source?: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
};

export type HistoricalOpExStore = {
  entries: HistoricalOpExEntry[];
  /** Mirror of the budgets manifest: once true we never re-seed even
   *  if every entry is later deleted. */
  seeded: boolean;
  updatedAt: string;
};
