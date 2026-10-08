// REAL ESTATE TAXES, COMPUTED FROM PUBLIC RECORD.
//
// A property tax bill is arithmetic: taxable assessed value × the rate of each
// taxing body that levies on it, paid on that body's bill in that body's month.
// Every input is public, so the budget's tax is not "this year + 3%" — it is
// the assessment each county holds for the parcel, times the rates each body
// has adopted, landing in the months the bills are due. Keyed here as a SEED
// for the Budget Inputs store (like Rite Aid's back-out): it stands until
// someone types the taxes on the grid, and a reset (↺) that clears it stays
// cleared.
//
// WHERE EVERY FIGURE COMES FROM, so it can be retraced (`links` on the input;
// clicking the line's pill shows them):
//
//   PHILADELPHIA — the OPA's certified assessments for the budget year, from
//   the city's open data (`assessments` on phl.carto.com; `phlQueryUrl`
//   rebuilds the exact query). The six Notices of Valuation the owner mailed in
//   agreed with it to the dollar (`notice`). Rate 1.3998% (City 6.317 + School
//   7.681 mills), unchanged since 2016, ONE bill due March 31.
//
//   BUCKS — assessed values from the county's parcel layer (Bucks_County_Parcels
//   on ArcGIS; `bucksParcelUrl`), rates from the county's 2026 millage sheet
//   (7/1/2026). Two bills: county + township (spring), school (late summer).
//
//   MONTGOMERY — assessed values from the county's property records
//   (`montcoParcelUrl`, which also prints the county's own per-body estimate
//   the figures here reproduce), rates from the county's 2026 millage table.
//   Two bills, as Bucks.
//
// Outside Philadelphia NOTHING IS REASSESSED — Bucks and Montgomery values have
// not moved in decades — so only the RATES change. A rate not yet adopted for
// the budget year (the county and township set theirs in December, the school
// district in June) is the latest adopted rate + `RET_DEFAULT_GROWTH_PCT`, and
// the source says which. Swap in the adopted rate when it is set and the bill
// recomputes. EVERY BILL TAKES ITS EARLY-PAYMENT DISCOUNT (`discountPct`) — the
// owner pays within the discount period (owner's call; the business parks'
// reassessment schedule applies Bucks' 2%): Philadelphia 1% (paid by the last
// day of February, so the bill lands in FEBRUARY), Bucks and Montgomery 2%.
//
// A property can be SEVERAL PARCELS, all on the one tax line. A parcel NOT in
// CAM is kept OUT of the pool tenants' RET recoveries are figured on
// (`nonRecoverable` on the input, read by draft.ts). A parcel SHARED by several
// properties (Kor Center A/B/C are one parcel) carries each one's `share`.

import { RET_DEFAULT_GROWTH_PCT, type ExpenseInput, type SourceParcel } from "./expenseInputs";

/** One taxing body's levy: mills (per $1,000 of assessed value). */
export type Levy = {
  body: string;
  mills: number;
  /** The rate year it was adopted for ("2026", "2026–27"). */
  rateYear: string;
  /** Adopted for the budget year; false = latest adopted + 3%. */
  adopted: boolean;
};

export type Bill = { label: string; dueMonth: number; levies: Levy[] };

export type Jurisdiction = {
  id: string;
  county: "Philadelphia" | "Bucks" | "Montgomery";
  /** Who assesses — the source title. */
  source: string;
  bills: Bill[];
  rateLink: { label: string; href: string };
  pill: string;
  /** Early-payment discount the owner takes, % of the bill. */
  discountPct?: number;
};

// ─── Rates ────────────────────────────────────────────────────────────────
// Philadelphia: unchanged since 2016, so the budget year's is known.
const PHL: Jurisdiction = {
  id: "PHL", county: "Philadelphia", pill: "Per city",
  source: "City of Philadelphia Office of Property Assessment — certified 2027 assessments",
  // Due March 31; paid by the last day of February for the 1% discount.
  bills: [{ label: "City + School District", dueMonth: 2, levies: [
    { body: "City of Philadelphia", mills: 6.317, rateYear: "2016–", adopted: true },
    { body: "School District of Philadelphia", mills: 7.681, rateYear: "2016–", adopted: true },
  ] }],
  rateLink: { label: "Tax rate (phila.gov)", href: "https://www.phila.gov/services/payments-assistance-taxes/taxes/property-and-real-estate-taxes/real-estate-tax/" },
  discountPct: 1,
};

// Bucks County, 2026 millage (county 29.65 = general 24.0035 + college 1.1777
// + debt 3.4764 + parks 0.9924).
const BUCKS_RATES = { label: "Bucks 2026 millage sheet", href: "https://www.buckscounty.gov/DocumentCenter/View/27738/2026-MILLAGE-RATES-7_1_2026" };
const BUCKS_COUNTY: Levy = { body: "Bucks County", mills: 29.65, rateYear: "2026", adopted: false };
const bucks = (id: string, twp: Levy, school: Levy, schoolMonth = 8): Jurisdiction => ({
  id, county: "Bucks", pill: "Per county",
  source: "Bucks County Board of Assessment — parcel assessments, 2026 millage",
  bills: [
    { label: `County + ${twp.body}`, dueMonth: 4, levies: [BUCKS_COUNTY, twp] },
    { label: school.body, dueMonth: schoolMonth, levies: [school] },
  ],
  rateLink: BUCKS_RATES,
  discountPct: 2,
});
const BENSALEM_TWP: Levy = { body: "Bensalem Township", mills: 23.0, rateYear: "2026", adopted: false };
const BENSALEM_SD: Levy = { body: "Bensalem Township SD", mills: 188.9474, rateYear: "2026–27", adopted: false };
const BENSALEM = bucks("BENSALEM", BENSALEM_TWP, BENSALEM_SD);
// The Tax Tracker has the 2-acre lot's and the JV III condo's school bill due 9/10.
const BENSALEM_SEP = bucks("BENSALEM-SEP", BENSALEM_TWP, BENSALEM_SD, 9);
const NOCKAMIXON = bucks("NOCKAMIXON",
  { body: "Nockamixon Township", mills: 7.0, rateYear: "2026", adopted: false },
  { body: "Palisades SD", mills: 123.414, rateYear: "2026–27", adopted: false });

// Montgomery County, 2026 (county 5.462 + community college 0.49).
const MONTCO_RATES = { label: "Montgomery millage table", href: "https://www.montgomerycountypa.gov/622/County-Municipality-Millage-Rates" };
const montco = (id: string, muni: Levy, school: Levy, countyMonth: number): Jurisdiction => ({
  id, county: "Montgomery", pill: "Per county",
  source: "Montgomery County Board of Assessment Appeals — property records, 2026 millage",
  bills: [
    { label: `County + ${muni.body}`, dueMonth: countyMonth, levies: [
      { body: "Montgomery County", mills: 5.462, rateYear: "2026", adopted: false },
      { body: "Montgomery County Community College", mills: 0.49, rateYear: "2026", adopted: false },
      muni,
    ] },
    { label: school.body, dueMonth: 9, levies: [school] },
  ],
  rateLink: MONTCO_RATES,
  discountPct: 2,
});
// County-bill months from the Tax Tracker (Whitemarsh 5/1, Upper Dublin 3/31).
const WHITEMARSH = montco("WHITEMARSH",
  { body: "Whitemarsh Township", mills: 2.3633, rateYear: "2026", adopted: false },
  { body: "Colonial SD", mills: 27.422, rateYear: "2026–27", adopted: false }, 5);
const UPPER_DUBLIN = montco("UPPER-DUBLIN",
  { body: "Upper Dublin Township", mills: 7.382, rateYear: "2026", adopted: false },
  { body: "Upper Dublin SD", mills: 41.1418, rateYear: "2026–27", adopted: false }, 3);
const AMBLER = montco("AMBLER",
  { body: "Ambler Borough", mills: 9.815, rateYear: "2026", adopted: false },
  { body: "Wissahickon SD", mills: 26.6, rateYear: "2026–27", adopted: false }, 4);

// ─── Parcels ──────────────────────────────────────────────────────────────

export type Parcel = {
  /** The county's parcel number (OPA account / Bucks parcel / Montco PARID). */
  number: string;
  label: string;
  address?: string;
  /** Taxable assessed value for the budget year; null until known. */
  assessed: number | null;
  /** The year before's, for the change (Philadelphia reassesses; the
   *  suburban counties do not, so it is the same). */
  prior?: number | null;
  /** In the tenants' RET recovery pool (CAM). */
  recoverable: boolean;
  /** The part of a SHARED parcel this property pays (Kor Center A/B/C). */
  share?: number;
  /** This year's tax, carried + 3% while `assessed` is null. */
  fallback?: number;
  /** The owner's mailed notice agreed with the open data. */
  notice?: boolean;
  /** Matches the owner's 2026 business-park reassessment schedule (the
   *  appeal that took the parks' values down, effective 1/1/2026). */
  schedule?: boolean;
  /** Reassessed after the city's certified value — on appeal. Overrides the
   *  open data, which still carries the old value; says what it came from. */
  reassessed?: string;
};

export type AssessedTax = { code: string; year: number; jurisdiction: Jurisdiction; parcels: Parcel[] };

const T = (code: string, jurisdiction: Jurisdiction, parcels: Parcel[]): AssessedTax => ({ code, year: 2027, jurisdiction, parcels });
const same = (n: number) => ({ assessed: n, prior: n });

export const ASSESSED_TAXES: AssessedTax[] = [
  // ── Philadelphia ──
  T("7200", PHL, [{ number: "882832400", label: "Shopping Center", address: "6412-22 Castor Ave", assessed: 2_347_900, prior: 2_250_000, recoverable: true, notice: true }]),
  T("7010", PHL, [{ number: "882078060", label: "Shopping Center", address: "12301-75 Academy Rd", assessed: 13_174_000, prior: 11_292_000, recoverable: true, notice: true }]),
  T("1100", PHL, [{ number: "882077811", label: "Parkwood Professional Bldg", address: "12300-40 Academy Rd", assessed: 1_240_000, prior: 1_192_500, recoverable: true, notice: true }]),
  T("5600", PHL, [{ number: "882830600", label: "Post Office", address: "6382 Castor Ave", assessed: 307_000, prior: 214_700, recoverable: true, notice: true }]),
  T("7300", PHL, [{ number: "882138000", label: "Shopping Center", address: "7201 E Roosevelt Blvd", assessed: 3_901_300, prior: 3_172_500, recoverable: true }]),
  T("1500", PHL, [{ number: "882057700", label: "Property", address: "2448 Island Ave", assessed: 429_600, prior: 430_000, recoverable: true }]),
  T("9200", PHL, [{ number: "885819980", label: "Land", address: "8675 Tinicum Blvd", assessed: 393_600, prior: 286_300, recoverable: true }]),
  // Trust #4: the Four Seasons parcel. The McDonald's parcel (882047229) is
  // deliberately NOT here: McDonald's pays its own RET bill directly (owner).
  T("8200", PHL, [{ number: "882047230", label: "Four Seasons", address: "2811 Cottman Ave", assessed: 1_689_900, prior: 1_656_600, recoverable: true, notice: true }]),
  // Gray's Ferry: three bills. ONLY the shopping centre is in CAM — the 2025
  // recon's RET pool, $159,405, is that parcel's 2025 tax exactly ($11,387,700
  // × 1.3998% = $159,404). The rear parcel is not in the pool, and Clear
  // Channel pays the billboard parcel's tax itself (its flat $3,017 in the
  // recon is that parcel's $215,500 × 1.3998%).
  T("4500", PHL, [
    { number: "882051606", label: "Shopping Center", address: "2815 Grays Ferry Ave", assessed: 13_517_700, prior: 11_387_700, recoverable: true, notice: true },
    // Reassessed for 2027 (owner, 9/29/26): $14,277.96 of tax before the
    // discount, which is $1,020,000 × 1.3998% to the cent. The owner quoted
    // the value as $1,010,000, which would be $14,137.98 — the TAX figure is
    // the one the value reproduces, so it is keyed; confirm against the
    // reassessment notice. The city's open data still reads $1,642,900.
    { number: "874545940", label: "Rear Parcel", address: "3001R Grays Ferry Ave", assessed: 1_020_000, prior: 1_613_000, recoverable: false, reassessed: "Reassessed for 2027 — $14,277.96 before the 1% discount" },
    { number: "885969440", label: "Clear Channel billboard", address: "3043R Grays Ferry Ave", assessed: 158_200, prior: 215_500, recoverable: false },
  ]),

  // ── Bucks: Neshaminy Interplex, Bensalem ──
  T("3610", BENSALEM, [{ number: "02-001-002-004-001", label: "Building 1", address: "1 Interplex Dr", ...same(178_730), recoverable: true, schedule: true }]),
  T("3620", BENSALEM, [{ number: "02-001-002-004-002", label: "Building 2", address: "2 Interplex Dr", ...same(187_520), recoverable: true, schedule: true }]),
  T("3640", BENSALEM, [{ number: "02-001-002-004-004", label: "Building 4", address: "4 Interplex Dr", ...same(237_330), recoverable: true, schedule: true }]),
  T("PIIICO", BENSALEM_SEP, [{ number: "02-001-002-016", label: "JV III Condo (common)", address: "Interplex Dr", ...same(21_330), recoverable: true }]),
  T("4050", BENSALEM, [{ number: "02-001-002-002", label: "Building 5", address: "5 Neshaminy Interplex Cir", ...same(199_240), recoverable: true, schedule: true }]),
  T("4060", BENSALEM, [{ number: "02-001-001", label: "Building 6", address: "6 Neshaminy Interplex Cir", ...same(483_450), recoverable: true, schedule: true }]),
  T("4070", BENSALEM, [{ number: "02-001-001-001", label: "Building 7", address: "7 Interplex Cir", ...same(332_560), recoverable: true, schedule: true }]),
  // Building 8 is two parcels — the 2026 budget carried both.
  T("4080", BENSALEM, [
    { number: "02-001-002", label: "Building 8", address: "8 Neshaminy Interplex Cir", ...same(649_000), recoverable: true, schedule: true },
    { number: "02-001-002-015", label: "Building 8 lot", address: "Interplex Dr", ...same(45_080), recoverable: true, schedule: true },
  ]),
  // Kor Center A, B and C are ONE parcel; the 2026 budget split it 33/28/39.
  T("40A0", BENSALEM, [{ number: "02-001-002-005", label: "Kor Center (33%)", address: "2 Interplex Dr", ...same(269_560), share: 0.33, recoverable: true, schedule: true }]),
  T("40B0", BENSALEM, [{ number: "02-001-002-005", label: "Kor Center (28%)", address: "2 Interplex Dr", ...same(269_560), share: 0.28, recoverable: true, schedule: true }]),
  T("40C0", BENSALEM, [{ number: "02-001-002-005", label: "Kor Center (39%)", address: "2 Interplex Dr", ...same(269_560), share: 0.39, recoverable: true, schedule: true }]),
  T("0900", BENSALEM_SEP, [{ number: "02-001-002-013", label: "2-Acre Lot", address: "Interplex Dr", ...same(45_520), recoverable: true }]),
  // Brookwood: the centre and its Street Rd parcel.
  T("2300", BENSALEM, [
    { number: "02-043-301", label: "Shopping Center", address: "1861 Street Rd", ...same(528_320), recoverable: true },
    { number: "02-043-305-002", label: "Street Rd parcel", address: "1847 Street Rd", ...same(149_600), recoverable: true },
  ]),
  // ── Bucks: Nockamixon ──
  T("2070", NOCKAMIXON, [
    { number: "30-011-077", label: "Large Parcel", address: "Easton Rd", ...same(27_000), recoverable: true },
    { number: "30-011-077-002", label: "Small Parcel", address: "Easton Rd", ...same(4_920), recoverable: true },
  ]),

  // ── Montgomery ──
  T("9510", WHITEMARSH, [{ number: "65-00-04654-00-6", label: "Shopping Center", address: "428 Germantown Pike", ...same(971_730), recoverable: true }]),
  T("9840", WHITEMARSH, [{ number: "65-00-06280-00-9", label: "House", address: "3044 Joshua Rd", ...same(154_030), recoverable: true }]),
  T("9800", UPPER_DUBLIN, [{ number: "54-00-01999-00-8", label: "House", address: "509 Bellaire Ave", ...same(122_730), recoverable: true }]),
  T("9860", UPPER_DUBLIN, [{ number: "54-00-06484-00-5", label: "House", address: "233 Fort Washington Ave", ...same(149_440), recoverable: true }]),
  T("9820", AMBLER, [
    { number: "01-00-04904-00-9", label: "120 N Spring Garden", address: "120 N Spring Garden St", ...same(86_330), recoverable: true },
    { number: "01-00-04903-00-1", label: "122 N Spring Garden", address: "122 N Spring Garden St", ...same(86_210), recoverable: true },
  ]),
];

// ─── The arithmetic ───────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const grow = 1 + RET_DEFAULT_GROWTH_PCT / 100;

/** A levy's mills for the budget year: adopted, or the latest + 3%. */
export const levyMills = (l: Levy) => (l.adopted ? l.mills : l.mills * grow);
export const billMills = (b: Bill) => b.levies.reduce((s, l) => s + levyMills(l), 0);
/** Mills as ADOPTED (no growth) — this year's basis. */
const billMillsNow = (b: Bill) => b.levies.reduce((s, l) => s + l.mills, 0);

/** One parcel's tax on one bill, whole dollars. */
export function parcelBillTax(p: Parcel, b: Bill, discountPct = 0): number {
  if (p.assessed == null) return 0;
  return Math.round((p.assessed * (p.share ?? 1) * billMills(b) * (1 - discountPct / 100)) / 1000);
}
/** One parcel's tax for the year — unknown value: this year's + 3%. */
export function parcelTax(p: Parcel, j: Jurisdiction): number {
  if (p.assessed == null) return Math.round((p.fallback ?? 0) * grow);
  return j.bills.reduce((s, b) => s + parcelBillTax(p, b, j.discountPct), 0);
}
/** This year's tax on a parcel — prior value × today's adopted rates. */
const parcelTaxNow = (p: Parcel, j: Jurisdiction) =>
  p.prior != null ? Math.round(j.bills.reduce((s, b) => s + (p.prior! * (p.share ?? 1) * billMillsNow(b) * (1 - (j.discountPct ?? 0) / 100)) / 1000, 0)) : Math.round(p.fallback ?? 0);

/** The property's tax, all parcels. */
export const assessedTax = (a: AssessedTax) => a.parcels.reduce((s, p) => s + parcelTax(p, a.jurisdiction), 0);

// ─── Links back to the record ─────────────────────────────────────────────

export const phlParcelUrl = (n: string) => `https://property.phila.gov/?p=${n}`;
/** The exact open-data query behind a Philadelphia property's values. */
export function phlQueryUrl(parcels: string[], years: number[]): string {
  const q = `SELECT parcel_number, year, taxable_land + taxable_building AS taxable, market_value FROM assessments WHERE parcel_number IN (${parcels.map((p) => `'${p}'`).join(",")}) AND year IN (${years.map((y) => `'${y}'`).join(",")}) ORDER BY parcel_number, year`;
  return `https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(q)}`;
}
const BUCKS_LAYER = "https://services3.arcgis.com/SP47Tddf7RK32lBU/arcgis/rest/services/Bucks_County_Parcels/FeatureServer/0/query";
/** The county's own record of a Bucks parcel (owner, municipality, values). */
export const bucksParcelUrl = (n: string) =>
  `${BUCKS_LAYER}?where=${encodeURIComponent(`PARCEL_NUM='${n}'`)}&outFields=PARCEL_NUM,ADDRESS,MUNICIPALITY,OWNER1,LAND_VALUE,BUILDING_VALUE,TOTAL_VALUE&returnGeometry=false&f=html`;
/** Montgomery's property record — assessment and the county's per-body tax estimate. */
export const montcoParcelUrl = (n: string, taxYear = 2026) =>
  `https://propertyrecords.montcopa.org/PT/Datalets/Datalet.aspx?mode=&UseSearch=no&pin=${n.replace(/-/g, "")}&jur=046&taxyr=${taxYear}`;

function parcelUrl(p: Parcel, j: Jurisdiction): string {
  return j.county === "Philadelphia" ? phlParcelUrl(p.number) : j.county === "Bucks" ? bucksParcelUrl(p.number) : montcoParcelUrl(p.number);
}
const recordName = (j: Jurisdiction) =>
  j.county === "Philadelphia" ? "property.phila.gov" : j.county === "Bucks" ? "Bucks County parcel record" : "Montgomery County property record";

// ─── The seed ─────────────────────────────────────────────────────────────

/** The seeded real-estate-tax input for a property's budget year, if any. */
export function assessedTaxInput(year: number, code: string): ExpenseInput | null {
  const a = ASSESSED_TAXES.find((x) => x.year === year && x.code === String(code).toUpperCase());
  if (!a) return null;
  const j = a.jurisdiction;
  const months = new Array(12).fill(0);
  const known = a.parcels.filter((p) => p.assessed != null);
  for (const b of j.bills) months[b.dueMonth - 1] += known.reduce((s, p) => s + parcelBillTax(p, b, j.discountPct), 0);
  const unknown = a.parcels.filter((p) => p.assessed == null);
  if (unknown.length) months[j.bills[0].dueMonth - 1] += unknown.reduce((s, p) => s + parcelTax(p, j), 0);
  const total = months.reduce((s, v) => s + v, 0);
  const many = a.parcels.length > 1;
  const off = a.parcels.filter((p) => !p.recoverable);
  const offBudget = off.reduce((s, p) => s + parcelTax(p, j), 0);
  const offBasis = off.reduce((s, p) => s + parcelTaxNow(p, j), 0);
  const assumed = j.bills.some((b) => b.levies.some((l) => !l.adopted));

  // The hover: the parcels (when several), then each bill with its month.
  const rows: { label: string; value: string }[] = [];
  if (many) {
    for (const p of a.parcels) rows.push({
      label: `${p.label}${p.recoverable ? "" : " · not in CAM"}`,
      value: p.assessed != null ? `${usd(p.assessed * (p.share ?? 1))} → ${usd(parcelTax(p, j))}` : `${usd(parcelTax(p, j))} · no value`,
    });
  } else {
    const p = a.parcels[0];
    rows.push({ label: p.share ? `Assessed value × ${Math.round(p.share * 100)}%` : "Taxable assessed value", value: usd((p.assessed ?? 0) * (p.share ?? 1)) });
  }
  for (const b of j.bills) rows.push({
    label: `${b.label} · ${MONTHS[b.dueMonth - 1]}`,
    value: `${billMills(b).toFixed(3)} mills → ${usd(months[b.dueMonth - 1])}`,
  });
  if (off.length) rows.push({ label: "In tenants' RET pool", value: usd(total - offBudget) });
  rows.push({ label: "Click the pill", value: "for sources" });

  const parcels: SourceParcel[] = a.parcels.map((p) => ({
    number: p.number, label: p.label, address: p.address,
    assessed: p.assessed == null ? null : Math.round(p.assessed * (p.share ?? 1)),
    prior: p.prior == null ? null : Math.round(p.prior * (p.share ?? 1)),
    tax: parcelTax(p, j), recoverable: p.recoverable,
    from: p.assessed == null
      ? `No value — this year's ${usd(p.fallback ?? 0)} + ${RET_DEFAULT_GROWTH_PCT}%`
      : p.reassessed ? p.reassessed
      : `${p.notice ? "Notice of Valuation (mailed) · matches " : p.schedule ? "2026 reassessment schedule · matches " : ""}${recordName(j)}${p.share ? ` · ${Math.round(p.share * 100)}% of the shared parcel` : ""}`,
    href: parcelUrl(p, j),
  }));

  const levyText = j.bills.map((b) =>
    `${b.label} (${MONTHS[b.dueMonth - 1]}): ${b.levies.map((l) => `${l.body} ${l.mills} mills${l.adopted ? "" : ` (${l.rateYear} + ${RET_DEFAULT_GROWTH_PCT}%)`}`).join(" + ")}`).join("; ");
  const method = j.county === "Philadelphia"
    ? "Taxable assessed value (land + building) × 1.3998% (City 0.6317% + School District 0.7681%), less the 1% early-payment discount — assumed taken, so the bill is paid in February (due March 31; the discount runs to the last day of February)."
    : `Assessed value × each taxing body's millage (mills per $1,000), on the bill that body sends: ${levyText}. Values move only on appeal (the business parks were reassessed effective 1/1/2026), so otherwise only the rates move; a rate not yet adopted for ${a.year} is the latest adopted + ${RET_DEFAULT_GROWTH_PCT}% — replace it when the body sets it. ${j.discountPct ? `Less the ${j.discountPct}% early-payment discount, assumed taken.` : "Budgeted at face: no early-payment discount."}`;

  // The calculation, for the source dialog: assessed value × effective mills
  // = the tax, then one row per bill.
  const assessedSum = known.reduce((s, p) => s + (p.assessed ?? 0) * (p.share ?? 1), 0);
  const bills = j.bills.map((b) => ({
    label: b.label, month: MONTHS[b.dueMonth - 1], mills: billMills(b),
    tax: known.reduce((s, p) => s + parcelBillTax(p, b, j.discountPct), 0),
    levies: b.levies.map((l) => ({ body: l.body, mills: l.mills, rateYear: l.rateYear, adopted: l.adopted })),
  }));
  // This year's tax, off last year's values at the rates adopted today — what
  // the ledger should show as paid. The dialog sets it against the line.
  const thisYear = a.parcels.every((p) => p.prior != null) ? a.parcels.reduce((s, p) => s + parcelTaxNow(p, j), 0) : undefined;
  const formula = { assessed: Math.round(assessedSum), mills: j.bills.reduce((s, b) => s + billMills(b), 0), tax: total, thisYear, thisYearLabel: `${a.year - 1} at ${a.year - 1} rates`, ...(j.discountPct ? { discountPct: j.discountPct } : {}) };
  const footnote = j.county === "Philadelphia"
    ? "Philadelphia reassesses each year; the rate has been 1.3998% since 2016. Assumes the 1% early-payment discount — paid by the last day of February."
    : `Values move only on appeal, so otherwise only the rates move. Rates not yet adopted for ${a.year} carry the latest adopted + ${RET_DEFAULT_GROWTH_PCT}%. ${j.discountPct ? `Assumes the ${j.discountPct}% early-payment discount — each bill paid within its discount period.` : "Budgeted at face — no early-payment discount."}`;

  const dataLink = j.county === "Philadelphia"
    ? [{ label: `City open data ${a.year - 1}–${a.year}`, href: phlQueryUrl(a.parcels.map((p) => p.number), [a.year - 1, a.year]) }]
    : [];
  return {
    months,
    note: `${a.parcels.map((p) => `${many ? `${p.label} ` : ""}${p.assessed != null ? usd(p.assessed * (p.share ?? 1)) : "no value"}`).join("; ")} — ${j.bills.map((b) => `${b.label} ${usd(months[b.dueMonth - 1])} (${MONTHS[b.dueMonth - 1]})`).join(", ")}${off.length ? `; ${off.map((p) => p.label).join(", ")} not in CAM` : ""}${assumed ? `; rates not yet adopted for ${a.year} carried +${RET_DEFAULT_GROWTH_PCT}%` : ""} (${j.source})`,
    by: j.county === "Philadelphia" ? "City assessment" : "County assessment",
    ...(off.length ? { nonRecoverable: { budget: offBudget, basis: offBasis, label: off.map((p) => p.label).join(", ") } } : {}),
    source: {
      pill: j.pill,
      title: j.source,
      rows,
      total: { label: `${a.year} real estate tax${many ? `, ${a.parcels.length} parcels` : ""}`, value: usd(total) },
      method,
      formula,
      bills,
      footnote,
      parcels,
      links: [
        ...a.parcels.map((p) => ({ label: `${p.label} · ${recordName(j)}`, href: parcelUrl(p, j) })),
        ...dataLink,
        j.rateLink,
      ],
    },
  };
}

// ─── A figure typed over the computation ──────────────────────────────────

/** When the computed tax shipped. A tax stored before it was keyed against
 *  "this year + 3%" and is superseded; one stored after is a deliberate
 *  override of the computed figure. */
export const COMPUTED_TAX_SINCE = "2026-09-28T19:00:00Z";

const sumOf = (m: number[]) => m.reduce((a, b) => a + (b || 0), 0);

/** A stored tax that should stand over the computed one: typed after the
 *  computation shipped, and not $0 (no taxed property owes nothing). */
export function isDeliberateOverride(stored: ExpenseInput): boolean {
  const total = stored.months?.length === 12 ? sumOf(stored.months) : stored.annual ?? 0;
  return !!stored.at && stored.at >= COMPUTED_TAX_SINCE && Math.abs(total) >= 1;
}

/** A deliberate override, labelled. If it IS the computed figure (typed to
 *  the dollar, or accepted as shown) it carries the computed source and pill;
 *  if it differs it reads "Entered" and says by how much, so a typed figure
 *  cannot pass for the assessment. */
export function withSeedComparison(stored: ExpenseInput, seed: ExpenseInput): ExpenseInput {
  const seedMonths = seed.months ?? [];
  const seedTotal = sumOf(seedMonths);
  const typedTotal = stored.months?.length === 12 ? sumOf(stored.months) : stored.annual ?? null;
  if (typedTotal == null || !seed.source) return stored;
  const sameMonths = stored.months?.length === 12 && stored.months.every((v, i) => Math.round(v || 0) === Math.round(seedMonths[i] || 0));
  if (sameMonths || (stored.months == null && Math.abs(typedTotal - seedTotal) < 1)) return { ...stored, source: seed.source };
  return {
    ...stored,
    source: {
      ...seed.source,
      pill: "Entered",
      title: `Typed over the ${seed.source.pill === "Per city" ? "city's" : "county's"} figure`,
      rows: [
        { label: "Typed", value: usd(typedTotal) },
        { label: `Computed (${seed.source.pill})`, value: usd(seedTotal) },
        { label: "Click ↺", value: "to use the computed figure" },
      ],
      total: { label: "Typed minus computed", value: `${typedTotal - seedTotal < 0 ? "-" : ""}${usd(Math.abs(typedTotal - seedTotal))}` },
    },
  };
}
