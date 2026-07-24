// ─── ENTITY STATEMENT-OF-VALUES — SOURCE OF TRUTH (Year-End 2025 snapshot) ────
// Per-entity financials behind the beneficiary "Statement of Values": NOI, cap
// rate, indicated value, debt, cash, future capital, and equity value. Seeded
// from the Korman Services Year-End 2025 master workbook and reconciled to it.
//
// This is a FROZEN SNAPSHOT as of STATEMENT_AS_OF below. The shape is built so
// live figures (NOI from operating statements, debt from the Debt page, cash
// from bank rec) can later override these fields per entity without touching the
// consumers — a beneficiary's value is always effPct × equityValue, so editing an
// entity's equity flows straight through to every investor statement.
//
// A beneficiary's $ value in an entity = their summed effective % (see
// lib/properties/beneficiaries.ts) × that entity's equityValue.

export interface EntityValue {
  /** Normalized entity code ("3600", "5610", "WHIT", "CWD", "LAND"). */
  entity: string;
  /** Entity / property name as it appears on the master schedule. */
  name: string;
  /** Cross-link to PROPERTY_DEFS id when this entity maps to a directory
   *  property (for deep-linking). Absent for pure holding entities. */
  propertyCode?: string;
  /** Net operating income (annualized). */
  noi: number | null;
  /** Capitalization rate used to derive indicated value. */
  capRate: number | null;
  /** Indicated (appraised / cap-rate) value of the real estate. */
  indicatedValue: number | null;
  /** Outstanding mortgage / debt balance. */
  debtBalance: number | null;
  /** Cash on hand. */
  cash: number | null;
  /** Reserve for anticipated major capital items. */
  futureCapital: number | null;
  /** Equity value = indicated value − debt + cash − future capital. The basis
   *  for every beneficiary's $ value in this entity. */
  equityValue: number | null;
}

/** The date this snapshot represents. */
export const STATEMENT_AS_OF = "2025-12-31";

export const ENTITY_VALUES: EntityValue[] = [
  { entity: "3600", name: "LINCOLN SUBSIDIARY JOINT VENTURE III", noi: -134000, capRate: 0.06, indicatedValue: 0, debtBalance: 6124134, cash: 202901, futureCapital: 0, equityValue: 0 },
  { entity: "4000", name: "NESHAMINY INTERPLEX MM LP", propertyCode: "4000", noi: null, capRate: null, indicatedValue: 0, debtBalance: 22728222, cash: 595892, futureCapital: 0, equityValue: 0 },
  { entity: "4900", name: "OFFICE WORKS PARTNERSHIP", propertyCode: "4900", noi: 70000, capRate: 0.1, indicatedValue: 700000, debtBalance: 0, cash: 220000, futureCapital: 100000, equityValue: 820000 },
  { entity: "1100", name: "THE KORMAN CO. (PARKWOOD PROFESSIONAL BUILDING)", propertyCode: "1100", noi: -101000, capRate: 0.07, indicatedValue: 0, debtBalance: 0, cash: 181523, futureCapital: 0, equityValue: 181523 },
  { entity: "2300", name: "BROOKWOOD SHOPPING CENTER JV", propertyCode: "2300", noi: 910000, capRate: 0.0675, indicatedValue: 13500000, debtBalance: 4278583, cash: 2492000, futureCapital: 0, equityValue: 11713417 },
  { entity: "4500", name: "GRAYS FERRY PARTNERS, L.P.", propertyCode: "4500", noi: 1116000, capRate: 0.0675, indicatedValue: 16500000, debtBalance: 7995372, cash: 1177000, futureCapital: 0, equityValue: 9681628 },
  { entity: "5610", name: "HYMAN KORMAN CO. ( POST OFFICE )", propertyCode: "5600", noi: 11000, capRate: 0.06, indicatedValue: 180000, debtBalance: 0, cash: 223565, futureCapital: 0, equityValue: 403565 },
  { entity: "WHIT", name: "WHITPAIN ASSOCIATES", noi: null, capRate: null, indicatedValue: 49000000, debtBalance: 47608087, cash: 206828, futureCapital: 0, equityValue: 1598741 },
  { entity: "7010", name: "PARKWOOD JOINT VENTURE", propertyCode: "7010", noi: 713000, capRate: 0.0675, indicatedValue: 10560000, debtBalance: 4064654, cash: 828000, futureCapital: 0, equityValue: 7323346 },
  { entity: "7200", name: "ELBRIDGE PARTNERSHIP", propertyCode: "7200", noi: 142000, capRate: 0.075, indicatedValue: 1890000, debtBalance: 0, cash: 246000, futureCapital: 0, equityValue: 2136000 },
  { entity: "7300", name: "REVERE PARTNERSHIP", propertyCode: "7300", noi: 318000, capRate: 0.07, indicatedValue: 4540000, debtBalance: 0, cash: 1045000, futureCapital: 0, equityValue: 5585000 },
  { entity: "8200", name: "TRUST # 4", propertyCode: "8200", noi: 341000, capRate: 0.0675, indicatedValue: 5050000, debtBalance: 0, cash: 613000, futureCapital: 0, equityValue: 5663000 },
  { entity: "9510", name: "SHOPS OF LAFAYETTE HILL", propertyCode: "9510", noi: 300000, capRate: 0.0675, indicatedValue: 4440000, debtBalance: 0, cash: 791284, futureCapital: 350000, equityValue: 4881284 },
  { entity: "2010", name: "LIK Manangement Inc", propertyCode: "2010", noi: 150000, capRate: 0.08, indicatedValue: 1900000, debtBalance: 0, cash: 103789, futureCapital: 0, equityValue: 2003789 },
  { entity: "9800", name: "KH-509 LLC", propertyCode: "9800", noi: null, capRate: null, indicatedValue: 1000000, debtBalance: 0, cash: 9488, futureCapital: 0, equityValue: 1009488 },
  { entity: "9820", name: "KH-Spring Garden St LLC", propertyCode: "9820", noi: null, capRate: null, indicatedValue: 400000, debtBalance: 0, cash: 8332, futureCapital: 0, equityValue: 408332 },
  { entity: "9840", name: "KH-Joshua 3044 LLC", propertyCode: "9840", noi: null, capRate: null, indicatedValue: 500000, debtBalance: 0, cash: 10973, futureCapital: 0, equityValue: 510973 },
  { entity: "9860", name: "Korman Homes LLC", propertyCode: "9860", noi: null, capRate: null, indicatedValue: 325000, debtBalance: 0, cash: null, futureCapital: 0, equityValue: 325000 },
  { entity: "1500", name: "EASTWICK JOINT VENTURE I", propertyCode: "1500", noi: 0, capRate: null, indicatedValue: 500000, debtBalance: 0, cash: 35392, futureCapital: 0, equityValue: 535392 },
  { entity: "0300", name: "AIRPORT INTERPLEX TWO, INC.", propertyCode: "0300", noi: null, capRate: null, indicatedValue: 0, debtBalance: 0, cash: 5983, futureCapital: 0, equityValue: 5983 },
  { entity: "9200", name: "EASTWICK DEVELOPMENT JV XII", propertyCode: "9200", noi: null, capRate: null, indicatedValue: null, debtBalance: null, cash: null, futureCapital: null, equityValue: 402210 },
  { entity: "0800", name: "BELLMAWR JOINT VENTURE, LLP", propertyCode: "0800", noi: null, capRate: null, indicatedValue: 1801, debtBalance: 0, cash: 341886, futureCapital: 0, equityValue: 343687 },
  { entity: "0900", name: "LINCOLN BLS", propertyCode: "0900", noi: null, capRate: null, indicatedValue: 325000, debtBalance: 0, cash: -25623, futureCapital: 0, equityValue: 299377 },
  { entity: "CWD", name: "CHERRYWOOD JOINT VENTURE", noi: null, capRate: null, indicatedValue: 56300000, debtBalance: 17251478, cash: 3525000, futureCapital: 0, equityValue: 42573522 },
  { entity: "2070", name: "Kosano Associates", propertyCode: "2070", noi: null, capRate: null, indicatedValue: 416498, debtBalance: 0, cash: 15972, futureCapital: 0, equityValue: 432470 },
  { entity: "2080", name: "LKF Nock LP", noi: 0, capRate: 0, indicatedValue: 0, debtBalance: 0, cash: 0, futureCapital: 0, equityValue: 0 },
  { entity: "2040", name: "KF Nockamixon LLC", noi: null, capRate: null, indicatedValue: 6321, debtBalance: 0, cash: 286, futureCapital: 0, equityValue: 6607 },
  { entity: "LAND", name: "The Korman Co. — Land (±162 acres)", noi: null, capRate: null, indicatedValue: null, debtBalance: 0, cash: null, futureCapital: null, equityValue: 13297220 },
];

const BY_ENTITY = new Map(ENTITY_VALUES.map((e) => [e.entity, e]));

export function entityValue(code: string): EntityValue | undefined {
  return BY_ENTITY.get(code);
}

/** Total equity value across all entities (the portfolio statement-of-values
 *  bottom line). */
export function totalEquityValue(): number {
  return ENTITY_VALUES.reduce((s, e) => s + (e.equityValue ?? 0), 0);
}
