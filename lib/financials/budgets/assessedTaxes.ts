// REAL ESTATE TAXES FROM THE CITY'S CERTIFIED ASSESSMENTS.
//
// A Philadelphia tax bill is arithmetic: taxable assessed value × the rate, due
// March 31. Both inputs are public, so the budget's tax is not "this year + 3%"
// — it is the city's own figure for the budget year, landing in the month the
// bill is due. Keyed here as a SEED for the Budget Inputs store (like Rite
// Aid's back-out): it stands until someone types the taxes on the grid, and a
// reset (↺) that clears it stays cleared.
//
// WHERE THE VALUES COME FROM, so every figure can be retraced:
//   • The Office of Property Assessment's certified values, published as open
//     data (`assessments` on phl.carto.com — `phlQueryUrl` rebuilds the exact
//     query for a property) and shown per parcel on property.phila.gov.
//   • Where the owner received the mailed Notice of Valuation, it agreed with
//     the open data to the dollar on all six (7200, 7010, 4500 ×2, 5600, 1100,
//     8200); `from` records which a parcel's value was read off.
//   • The rate: 1.3998% — City 0.6317% + School District 0.7681%, unchanged
//     since 2016. The 2027 rate is not yet set, so 2027 is budgeted at it. The
//     1% discount for paying by the end of February is NOT assumed.
//
// A property can be SEVERAL PARCELS, each its own bill (the Tax Tracker's
// PARCEL_INFO lists them). They all land on the one Real Estate Taxes line, but
// a parcel that is NOT in CAM is kept OUT of the pool tenants' RET recoveries
// are figured on (`nonRecoverable` on the input, read by draft.ts). A parcel
// whose value is unknown is carried at `fallback` + 3% and says so.

import { RET_DEFAULT_GROWTH_PCT, type ExpenseInput, type SourceParcel } from "./expenseInputs";

/** Philadelphia real estate tax, % of taxable assessed value (City + School). */
export const PHILA_RET_RATE_PCT = 1.3998;

export type Parcel = {
  /** OPA account number. */
  number: string;
  label: string;
  address?: string;
  /** Taxable assessed value (land + building, net of exemptions); null until known. */
  assessed: number | null;
  /** The year before's taxable value, for the change. */
  prior?: number | null;
  /** In the tenants' RET recovery pool (CAM). */
  recoverable: boolean;
  /** This year's tax on the parcel; while `assessed` is null the budget
   *  carries it + `RET_DEFAULT_GROWTH_PCT`. */
  fallback?: number;
  /** The owner's mailed notice agreed with the open data. */
  notice?: boolean;
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

const PHILA_2027 = "City of Philadelphia Office of Property Assessment — certified 2027 assessments";
const phl = (code: string, parcels: Parcel[]): AssessedTax =>
  ({ code, year: 2027, ratePct: PHILA_RET_RATE_PCT, dueMonth: 3, source: PHILA_2027, parcels });

export const ASSESSED_TAXES: AssessedTax[] = [
  phl("7200", [{ number: "882832400", label: "Shopping Center", address: "6412-22 Castor Ave", assessed: 2_347_900, prior: 2_250_000, recoverable: true, notice: true }]),
  phl("7010", [{ number: "882078060", label: "Shopping Center", address: "12301-75 Academy Rd", assessed: 13_174_000, prior: 11_292_000, recoverable: true, notice: true }]),
  phl("1100", [{ number: "882077811", label: "Parkwood Professional Bldg", address: "12300-40 Academy Rd", assessed: 1_240_000, prior: 1_192_500, recoverable: true, notice: true }]),
  phl("5600", [{ number: "882830600", label: "Post Office", address: "6382 Castor Ave", assessed: 307_000, prior: 214_700, recoverable: true, notice: true }]),
  phl("7300", [{ number: "882138000", label: "Shopping Center", address: "7201 E Roosevelt Blvd", assessed: 3_901_300, prior: 3_172_500, recoverable: true }]),
  phl("1500", [{ number: "882057700", label: "Property", address: "2448 Island Ave", assessed: 429_600, prior: 430_000, recoverable: true }]),
  phl("9200", [{ number: "885819980", label: "Land", address: "8675 Tinicum Blvd", assessed: 393_600, prior: 286_300, recoverable: true }]),
  // Trust #4: the Four Seasons parcel at 2811 Cottman Ave. The McDonald's
  // parcel (882047229) is deliberately NOT here: McDonald's pays its own RET
  // bill directly (owner), so the landlord budgets nothing for it.
  phl("8200", [{ number: "882047230", label: "Four Seasons", address: "2811 Cottman Ave", assessed: 1_689_900, prior: 1_656_600, recoverable: true, notice: true }]),
  // Gray's Ferry: three bills. ONLY the shopping centre is in CAM — the 2025
  // recon's RET pool, $159,405, is that parcel's 2025 tax exactly ($11,387,700
  // × 1.3998% = $159,404). The rear parcel is not in the pool, and Clear
  // Channel pays the billboard parcel's tax itself (its flat $3,017 in the
  // recon is that parcel's $215,500 × 1.3998%).
  phl("4500", [
    { number: "882051606", label: "Shopping Center", address: "2815 Grays Ferry Ave", assessed: 13_517_700, prior: 11_387_700, recoverable: true, notice: true },
    { number: "874545940", label: "Rear Parcel", address: "3001R Grays Ferry Ave", assessed: 1_642_900, prior: 1_613_000, recoverable: false, notice: true },
    { number: "885969440", label: "Clear Channel billboard", address: "3043R Grays Ferry Ave", assessed: 158_200, prior: 215_500, recoverable: false },
  ]),
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** One parcel's tax, in whole dollars — unknown value: this year's + 3%. */
export const parcelTax = (p: Parcel, ratePct: number) =>
  p.assessed != null
    ? Math.round((p.assessed * ratePct) / 100)
    : Math.round((p.fallback ?? 0) * (1 + RET_DEFAULT_GROWTH_PCT / 100));

/** The property's tax, all parcels. */
export const assessedTax = (a: AssessedTax) => a.parcels.reduce((s, p) => s + parcelTax(p, a.ratePct), 0);

/** The city's parcel page. */
export const phlParcelUrl = (n: string) => `https://property.phila.gov/?p=${n}`;

/** The exact open-data query behind a property's values — opening it
 *  returns the certified assessments, prior year and budget year. */
export function phlQueryUrl(parcels: string[], years: number[]): string {
  const q = `SELECT parcel_number, year, taxable_land + taxable_building AS taxable, market_value FROM assessments WHERE parcel_number IN (${parcels.map((p) => `'${p}'`).join(",")}) AND year IN (${years.map((y) => `'${y}'`).join(",")}) ORDER BY parcel_number, year`;
  return `https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(q)}`;
}

export const PHL_RATE_URL = "https://www.phila.gov/services/payments-assistance-taxes/taxes/property-and-real-estate-taxes/real-estate-tax/";

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
  const offBasis = off.reduce((s, p) => s + (p.prior != null ? Math.round((p.prior * a.ratePct) / 100) : Math.round(p.fallback ?? 0)), 0);

  const rows = many
    ? a.parcels.map((p) => ({
        label: `${p.label}${p.recoverable ? "" : " · not in CAM"}`,
        value: p.assessed != null
          ? `${usd(p.assessed)} → ${usd(parcelTax(p, a.ratePct))}`
          : `${usd(parcelTax(p, a.ratePct))} · ${usd(p.fallback ?? 0)} + ${RET_DEFAULT_GROWTH_PCT}%`,
      }))
    : [{ label: "Taxable assessed value", value: usd(a.parcels[0].assessed ?? 0) }];
  rows.push({ label: "Rate (City + School)", value: `${a.ratePct}%` }, { label: "Due", value: month });
  if (off.length) rows.push({ label: "In tenants' RET pool", value: usd(total - offBudget) });
  rows.push({ label: "Click the pill", value: "for sources" });

  const parcels: SourceParcel[] = a.parcels.map((p) => ({
    number: p.number, label: p.label, address: p.address,
    assessed: p.assessed, prior: p.prior ?? null,
    tax: parcelTax(p, a.ratePct), recoverable: p.recoverable,
    from: p.assessed == null
      ? `No value — this year's ${usd(p.fallback ?? 0)} + ${RET_DEFAULT_GROWTH_PCT}%`
      : p.notice ? "Notice of Valuation (mailed) · matches open data" : "City open data (certified)",
    href: phlParcelUrl(p.number),
  }));

  const detail = a.parcels
    .map((p) => p.assessed != null
      ? `${many ? `${p.label} ` : ""}${usd(p.assessed)} × ${a.ratePct}% = ${usd(parcelTax(p, a.ratePct))}`
      : `${p.label} ${usd(parcelTax(p, a.ratePct))} (this year's + ${RET_DEFAULT_GROWTH_PCT}%, no value)`)
    .join("; ");
  return {
    months,
    note: `${detail}${many ? ` — ${usd(total)}` : " taxable assessed value"}, due ${month}${off.length ? `; ${off.map((p) => p.label).join(", ")} not in CAM` : ""} (${a.source})`,
    by: "City assessment",
    ...(off.length ? { nonRecoverable: { budget: offBudget, basis: offBasis, label: off.map((p) => p.label).join(", ") } } : {}),
    source: {
      pill: "Per city",
      title: a.source,
      rows,
      total: { label: `${a.year} real estate tax${many ? `, ${a.parcels.length} parcels` : ""}`, value: usd(total) },
      method: `Taxable assessed value (land + building) × ${a.ratePct}% (City 0.6317% + School District 0.7681%), the whole bill in ${month} — due ${month} 31. The 1% early-payment discount is not assumed.`,
      parcels,
      links: [
        ...a.parcels.map((p) => ({ label: `${p.label} ${p.number} on property.phila.gov`, href: phlParcelUrl(p.number) })),
        { label: `Certified assessments ${a.year - 1}–${a.year} (city open data query)`, href: phlQueryUrl(a.parcels.map((p) => p.number), [a.year - 1, a.year]) },
        { label: "Real estate tax rate (phila.gov)", href: PHL_RATE_URL },
      ],
    },
  };
}
