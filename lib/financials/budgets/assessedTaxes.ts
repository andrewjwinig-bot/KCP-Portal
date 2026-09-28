// REAL ESTATE TAXES FROM THE ASSESSMENT LETTER.
//
// When the owner has the city's notice of next year's taxable assessed value,
// the budget's tax is not "this year + 3%" — it is the assessment × the
// millage, landing in the month the bill is due. Keyed here as a SEED for the
// Budget Inputs store (like Rite Aid's back-out): it stands until someone types
// the taxes on the grid, and a reset (↺) that clears it stays cleared.
//
// Philadelphia's 2026 rate is 1.3998% of taxable assessed value — City 0.6317%
// + School District 0.7681%, unchanged since 2016 — and a 2027 rate is not yet
// set, so 2027 is budgeted at the current one. The bill is due March 31 (the
// Tax Tracker's due date; paying by the end of February earns a 1% discount,
// which this deliberately does NOT assume).
//
// A property can be SEVERAL PARCELS, each its own bill (the Tax Tracker's
// PARCEL_INFO lists them). They all land on the one Real Estate Taxes line, but
// a parcel that is NOT in CAM — Gray's Ferry's Clear Channel billboard — is
// kept OUT of the pool tenants' RET recoveries are figured on (`nonRecoverable`
// on the input, read by draft.ts). A parcel whose notice has not arrived is
// carried at `fallback` (this year's budget for it) + 3% — the same growth an
// un-noticed tax takes everywhere else — and says so in the hover.

import { RET_DEFAULT_GROWTH_PCT, type ExpenseInput } from "./expenseInputs";

/** Philadelphia real estate tax, % of taxable assessed value (City + School). */
export const PHILA_RET_RATE_PCT = 1.3998;

export type Parcel = {
  /** OPA account number. */
  number: string;
  label: string;
  /** Taxable assessed value from the notice; null until it arrives. */
  assessed: number | null;
  /** In the tenants' RET recovery pool (CAM). */
  recoverable: boolean;
  /** This year's tax on the parcel; while `assessed` is null the budget
   *  carries it + `RET_DEFAULT_GROWTH_PCT`. */
  fallback?: number;
};

export type AssessedTax = {
  code: string;
  year: number;
  parcels: Parcel[];
  ratePct: number;
  /** 1–12: the month the bill is due and the budget carries it. */
  dueMonth: number;
  source: string;
};

const PHILA_2027 = "City of Philadelphia Office of Property Assessment, Notice of Valuation for 2027";

export const ASSESSED_TAXES: AssessedTax[] = [
  { code: "7200", year: 2027, ratePct: PHILA_RET_RATE_PCT, dueMonth: 3, source: PHILA_2027,
    parcels: [{ number: "882832400", label: "Shopping Center", assessed: 2_347_900, recoverable: true }] },
  { code: "7010", year: 2027, ratePct: PHILA_RET_RATE_PCT, dueMonth: 3, source: PHILA_2027,
    parcels: [{ number: "882078060", label: "Shopping Center", assessed: 13_174_000, recoverable: true }] },
  { code: "5600", year: 2027, ratePct: PHILA_RET_RATE_PCT, dueMonth: 3, source: PHILA_2027,
    parcels: [{ number: "882830600", label: "Post Office", assessed: 307_000, recoverable: true }] },
  // Gray's Ferry. The 2026 budget of record (INS RET DEBT tab) carries the
  // centre as one row — the shopping centre and rear parcel together, in the
  // tenants' pool — and Clear Channel's billboard parcel as its own ($14,278),
  // which is not in CAM (Clear Channel pays its own parcel's tax). No notice
  // for the billboard, so it grows 3% (owner).
  { code: "4500", year: 2027, ratePct: PHILA_RET_RATE_PCT, dueMonth: 3, source: PHILA_2027,
    parcels: [
      { number: "882051606", label: "Shopping Center", assessed: 13_517_700, recoverable: true },
      { number: "874545940", label: "Rear Parcel", assessed: 1_642_900, recoverable: true },
      { number: "885969440", label: "Clear Channel billboard", assessed: null, recoverable: false, fallback: 14_278 },
    ] },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** One parcel's tax, in whole dollars — with no notice, this year's + 3%. */
export const parcelTax = (p: Parcel, ratePct: number) =>
  p.assessed != null
    ? Math.round((p.assessed * ratePct) / 100)
    : Math.round((p.fallback ?? 0) * (1 + RET_DEFAULT_GROWTH_PCT / 100));

/** The property's tax, all parcels. */
export const assessedTax = (a: AssessedTax) => a.parcels.reduce((s, p) => s + parcelTax(p, a.ratePct), 0);

/** The seeded real-estate-tax input for a property's budget year, if any. */
export function assessedTaxInput(year: number, code: string): ExpenseInput | null {
  const a = ASSESSED_TAXES.find((x) => x.year === year && x.code === String(code).toUpperCase());
  if (!a) return null;
  const total = assessedTax(a);
  const months = new Array(12).fill(0);
  months[a.dueMonth - 1] = total;
  const month = MONTHS[a.dueMonth - 1];
  const many = a.parcels.length > 1;
  const off = a.parcels.filter((p) => !p.recoverable);
  const offBudget = off.reduce((s, p) => s + parcelTax(p, a.ratePct), 0);
  const offBasis = off.reduce((s, p) => s + Math.round(p.fallback ?? 0), 0);

  const rows = many
    ? a.parcels.map((p) => ({
        label: `${p.label} (${p.number})${p.recoverable ? "" : " · not in CAM"}`,
        value: p.assessed != null
          ? `${usd(p.assessed)} → ${usd(parcelTax(p, a.ratePct))}`
          : `${usd(parcelTax(p, a.ratePct))} · ${usd(p.fallback ?? 0)} + ${RET_DEFAULT_GROWTH_PCT}%, no notice`,
      }))
    : [{ label: "Taxable assessed value", value: usd(a.parcels[0].assessed ?? 0) }];
  rows.push({ label: "Rate (City + School)", value: `${a.ratePct}%` }, { label: "Due", value: month });
  if (off.length) rows.push({ label: "In tenants' RET pool", value: usd(total - offBudget) });

  const detail = a.parcels
    .map((p) => p.assessed != null
      ? `${many ? `${p.label} ` : ""}${usd(p.assessed)} × ${a.ratePct}% = ${usd(parcelTax(p, a.ratePct))}`
      : `${p.label} ${usd(parcelTax(p, a.ratePct))} (this year's ${usd(p.fallback ?? 0)} + ${RET_DEFAULT_GROWTH_PCT}%, no notice)`)
    .join("; ");
  return {
    months,
    note: `${detail}${many ? ` — ${usd(total)}` : " taxable assessed value"}, due ${month}${off.length ? `; ${off.map((p) => p.label).join(", ")} not in CAM` : ""} (${a.source})`,
    by: "Assessment notice",
    ...(off.length ? { nonRecoverable: { budget: offBudget, basis: offBasis, label: off.map((p) => p.label).join(", ") } } : {}),
    source: {
      pill: "Per notice",
      title: a.source,
      rows,
      total: { label: `${a.year} real estate tax${many ? `, ${a.parcels.length} parcels` : ""}`, value: usd(total) },
    },
  };
}
