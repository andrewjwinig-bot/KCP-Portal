// Credit-card charges posted to the RECOVERABLE Building Maintenance account
// (6220-8502) that belong on the non-recoverable one (6220-8501).
//
// Until 11/2026 the Credit Card invoicer coded every "Building Maint." card
// charge to 6220-8502, the Reimbursable Expenses line, so card charges sat in
// the CAM pool billed to tenants (owner: "i dont think credit card charges
// should be going to CAM as recoverable"). The code now posts 6220-8501; this
// lists what already posted, so it can be reclassed in Skyline.
//
// A GL line is a card charge when it carries the credit-card vendor (LIKM1 —
// LIK Management, credit card) or one of our credit-card invoice numbers
// ("CC" + property + MMYY). Pure — the route feeds it the GL transactions.

import type { GlTransaction } from "@/lib/financials/operating-statements/glParser";

export const FROM_ACCOUNT = "6220-8502";
export const TO_ACCOUNT = "6220-8501";

export type ReclassLine = {
  key: string;
  month: number;
  date: string | null;
  vendor: string;
  description: string;
  ref: string;
  amount: number;
  /** Why it reads as a card charge. */
  why: string;
};

const CC_INVOICE = /\bCC[0-9A-Z]{4,}\b/;
const CC_VENDOR = /LIKM1/i;

/** Why a GL line is a credit-card charge, or null. */
export function cardChargeReason(t: Pick<GlTransaction, "vendor" | "description" | "ref">): string | null {
  const vendor = String(t.vendor ?? "");
  const desc = String(t.description ?? "");
  const ref = String(t.ref ?? "");
  if (CC_VENDOR.test(vendor) || CC_VENDOR.test(desc)) return "Vendor LIKM1 (credit card)";
  const inv = `${ref} ${desc}`.toUpperCase().match(CC_INVOICE);
  if (inv && !/^CCREIMB/.test(inv[0])) return `Invoice ${inv[0]}`;
  if (/\b(AMEX|AMERICAN EXPRESS|CREDIT CARD)\b/i.test(`${vendor} ${desc}`)) return "Described as a card charge";
  return null;
}

/** Every card charge on 6220-8502 in one property's GL. */
export function reclassLines(key: string, transactions: Record<string, GlTransaction[]>): ReclassLine[] {
  const out: ReclassLine[] = [];
  for (const t of transactions[FROM_ACCOUNT] ?? []) {
    const why = cardChargeReason(t);
    if (!why || !t.amount) continue;
    out.push({ key, month: t.month, date: t.date, vendor: t.vendor ?? "", description: t.description ?? "", ref: t.ref ?? "", amount: t.amount, why });
  }
  return out.sort((a, b) => a.month - b.month || String(a.date).localeCompare(String(b.date)));
}

/** The reclass entry by property: credit 6220-8502, debit 6220-8501. */
export function reclassByProperty(lines: ReclassLine[]): { key: string; amount: number; count: number }[] {
  const m = new Map<string, { key: string; amount: number; count: number }>();
  for (const l of lines) {
    const e = m.get(l.key) ?? { key: l.key, amount: 0, count: 0 };
    e.amount = Math.round((e.amount + l.amount) * 100) / 100;
    e.count++;
    m.set(l.key, e);
  }
  return [...m.values()].filter((e) => Math.abs(e.amount) >= 0.005);
}
