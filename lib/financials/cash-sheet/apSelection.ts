// Skyline "AP AutoPay Selections Report" parser — the weekly bills selected for
// payment, per property, used to auto-populate the Cash Sheet's bill column.
//
// Each report lists vendor invoices grouped by property/company, with a
// "Property/Company <CODE> Total" line carrying that property's payment total
// (Invoice | Payment | Discount | Net). Single-fund reports cover one fund
// (FJVIII / FNIPLX / FIIICO); the "All Linked Accounts" report covers the rest,
// one section per property. We read the per-property totals and map the report's
// codes to Cash-Sheet codes.

/** Report code → Cash-Sheet code. Funds map to their fund row; the clearing
 *  entity (2000) to Management (2010). Anything else maps to itself. */
const AP_TO_CASHSHEET: Record<string, string> = {
  FJVIII: "PJV3",   // Lincoln JV III fund
  FNIPLX: "PNIPLX", // Neshaminy Interplex LLC fund
  FIIICO: "CONDO",  // Neshaminy III Condo Association
  "2000": "2010",   // 2000 Clearing → LIK Management
};

export type ApSelectionResult = {
  /** Report date (ISO YYYY-MM-DD) from the header, or null. */
  reportDate: string | null;
  /** Payment total per Cash-Sheet code (uppercased). */
  byCode: Record<string, number>;
};

function parseMoney(s: string): number | null {
  const t = s.trim();
  if (!/^-?[\d,]+\.\d{2}$/.test(t)) return null;
  return Number(t.replace(/,/g, ""));
}

/** Parse one AP AutoPay Selections Report (rows = sheet_to_json header:1). */
export function parseApSelection(rows: (string | number | null)[][]): ApSelectionResult {
  let reportDate: string | null = null;
  outer: for (let i = 0; i < Math.min(rows.length, 6); i++) {
    for (const c of rows[i] ?? []) {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(c ?? "").trim());
      if (m) { reportDate = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; break outer; }
    }
  }

  const byCode: Record<string, number> = {};
  for (const row of rows) {
    const cells = (row ?? []).map((c) => (c == null ? "" : String(c)));
    const m = /Property\/Company\s+(\S+)\s+Total/i.exec(cells.join(" "));
    if (!m) continue;
    // Money cells on the total row are [Invoice, Payment, Discount, Net].
    const amounts = cells.map(parseMoney).filter((n): n is number => n != null);
    if (!amounts.length) continue;
    const payment = amounts.length >= 4 ? amounts[1] : amounts[amounts.length - 1];
    const code = AP_TO_CASHSHEET[m[1].toUpperCase()] ?? m[1].toUpperCase();
    byCode[code] = (byCode[code] ?? 0) + payment;
  }
  return { reportDate, byCode };
}
