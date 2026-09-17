// 1099 register — what each vendor was PAID in a calendar year, grouped by the
// entity that would file the form.
//
// This is a worksheet for the accountants, not a filing. It answers the one
// question that is tedious to answer out of Skyline — "which vendors did each
// EIN pay $600 or more, and what were the payments" — and stops there. It does
// not hold TINs, decide who is exempt, or produce a form.
//
// Two decisions shape everything below:
//
//   1. It reads the CASH accounts, not the expense accounts. A 1099 reports what
//      was paid during the calendar year, so an accrued-but-unpaid invoice must
//      not appear and a prior-year invoice paid this year must. Money out of the
//      cash account is that figure by construction, and reading one side also
//      means a check split across five expense lines counts once.
//
//   2. Vendors group on an EXACT name match after case/punctuation folding —
//      never a fuzzy one. "ABC Landscaping" and "ABC Landscaping LLC" stay two
//      rows. They may well be one vendor, but merging them is a guess, and a
//      guess here silently moves money between two people's forms. Two rows the
//      accountant can combine beats one row nobody can take apart.

import { FUND_LABEL, PROPERTY_DEFS } from "@/lib/properties/data";
import { FUND_BUILDINGS } from "@/lib/financials/cash-analysis/funds";
import { isCashAccount } from "@/lib/financials/cashAccounts";
import type { GlTransaction } from "@/lib/financials/operating-statements/glParser";

/** The IRS reporting threshold for 1099-NEC / 1099-MISC rents. */
export const DEFAULT_THRESHOLD = 600;

export type Ten99Payment = {
  /** GL key the payment was posted under. */
  glKey: string;
  propertyName: string;
  account: string;
  accountName: string;
  /** ISO date, or null when the GL row carried none. */
  date: string | null;
  /** Accounting month 1–12. */
  month: number;
  /** Check number / journal ref. */
  ref: string;
  /** Always positive — money that left the account. */
  amount: number;
};

export type Ten99Vendor = {
  /** Grouping key: the folded name. Stable across years. */
  id: string;
  /** Display name — the spelling that appears most often. */
  name: string;
  total: number;
  count: number;
  payments: Ten99Payment[];
};

export type FilingEntity = {
  /** Stable id — the EIN when there is one, else the entity name or GL key. */
  id: string;
  name: string;
  ein: string | null;
};

export type Ten99Entity = FilingEntity & {
  /** The GL keys that roll into this filing entity. */
  glKeys: string[];
  /** At or above the threshold, largest first — the reportable candidates. */
  vendors: Ten99Vendor[];
  /** Below the threshold, largest first. Kept because a late payment can push
   *  one over, and because "why isn't X on the list" is the first question. */
  below: Ten99Vendor[];
  /** Payments whose GL row carried no vendor name, so they cannot be attributed.
   *  Surfaced rather than dropped — a missing name is a data problem to see. */
  unnamed: { count: number; total: number };
  /** Every dollar that left this entity's cash accounts in the year, before any
   *  threshold or exclusion. The sanity check: if this reads $0 or a wildly
   *  wrong number, the GL is missing or the sign convention flipped. */
  scannedTotal: number;
};

/** Fold a vendor name for grouping: case, punctuation and spacing only. */
export function foldVendor(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const defFor = (code: string) =>
  PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase()) ?? null;

/**
 * The entity that would file a 1099 for payments posted under a GL key.
 *
 * A 1099 is filed per EIN, not per building — the eight Neshaminy Interplex
 * buildings are one filer, so a vendor paid $200 by each of them crosses the
 * threshold and would be missed building by building. Fund shells resolve
 * through their member buildings, which is where the EIN lives.
 */
export function filingEntityFor(glKey: string): FilingEntity {
  const upper = glKey.toUpperCase();
  // A fund shell (PJV3 / PNIPLX) carries no EIN of its own; its members do.
  const members = FUND_BUILDINGS[upper] ?? FUND_BUILDINGS[glKey] ?? null;
  const def = defFor(glKey) ?? (members ? defFor(members[0]) : null);

  if (!def) return { id: `key:${upper}`, name: glKey, ein: null };

  // "N/A" is recorded for an entity that has no EIN, not an unknown one.
  const ein = def.ein && def.ein !== "N/A" ? def.ein : null;
  const name = def.fundGroup
    ? FUND_LABEL[def.fundGroup]
    : def.ownerEntity ?? def.name;

  if (ein) return { id: `ein:${ein}`, name, ein };
  if (def.ownerEntity) return { id: `entity:${foldVendor(def.ownerEntity)}`, name: def.ownerEntity, ein: null };
  return { id: `key:${upper}`, name, ein: null };
}

export type GlInput = {
  key: string;
  /** account → transactions, as `assembledTransactions` returns them. */
  transactions: Record<string, GlTransaction[]>;
  /** account → account name, for cash-account detection and display. */
  names: Record<string, string>;
};

export type RegisterOptions = {
  threshold?: number;
  /** Folded vendor names staff have marked as not reportable. */
  excluded?: Set<string>;
};

/**
 * Build the register from the year's uploaded GLs.
 *
 * Payments are cash-account rows with a NEGATIVE amount — money leaving the
 * account. Deposits and transfers in are ignored; a refund posted as a positive
 * row nets against nothing, because netting a credit into a vendor's total is
 * the accountant's call, not ours.
 */
export function buildRegister(gls: GlInput[], opts: RegisterOptions = {}): Ten99Entity[] {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const excluded = opts.excluded ?? new Set<string>();

  type Acc = {
    entity: FilingEntity;
    glKeys: Set<string>;
    scannedTotal: number;
    unnamedCount: number;
    unnamedTotal: number;
    // folded name → { spellings, payments }
    vendors: Map<string, { spellings: Map<string, number>; payments: Ten99Payment[] }>;
  };
  const byEntity = new Map<string, Acc>();

  for (const gl of gls) {
    const entity = filingEntityFor(gl.key);
    let acc = byEntity.get(entity.id);
    if (!acc) {
      acc = { entity, glKeys: new Set(), scannedTotal: 0, unnamedCount: 0, unnamedTotal: 0, vendors: new Map() };
      byEntity.set(entity.id, acc);
    }
    acc.glKeys.add(gl.key);
    const propertyName = defFor(gl.key)?.name ?? gl.key;

    for (const [account, txns] of Object.entries(gl.transactions)) {
      const accountName = gl.names[account] ?? "";
      if (!isCashAccount(account, accountName)) continue;

      for (const t of txns) {
        if (!(t.amount < 0)) continue; // money out only
        const amount = Math.round(-t.amount * 100) / 100;
        acc.scannedTotal = Math.round((acc.scannedTotal + amount) * 100) / 100;

        const raw = (t.vendor ?? "").trim();
        const folded = foldVendor(raw);
        if (!folded) {
          acc.unnamedCount += 1;
          acc.unnamedTotal = Math.round((acc.unnamedTotal + amount) * 100) / 100;
          continue;
        }
        let v = acc.vendors.get(folded);
        if (!v) { v = { spellings: new Map(), payments: [] }; acc.vendors.set(folded, v); }
        v.spellings.set(raw, (v.spellings.get(raw) ?? 0) + 1);
        v.payments.push({
          glKey: gl.key, propertyName, account, accountName,
          date: t.date, month: t.month, ref: t.ref, amount,
        });
      }
    }
  }

  const out: Ten99Entity[] = [];
  for (const acc of byEntity.values()) {
    const all: Ten99Vendor[] = [];
    for (const [id, v] of acc.vendors) {
      if (excluded.has(id)) continue;
      // Display the spelling the ledger uses most; ties break alphabetically so
      // the label doesn't change between runs on the same data.
      const name = [...v.spellings.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      const total = Math.round(v.payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
      const payments = [...v.payments].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.month - b.month);
      all.push({ id, name, total, count: payments.length, payments });
    }
    const bySize = (a: Ten99Vendor, b: Ten99Vendor) => b.total - a.total || a.name.localeCompare(b.name);
    out.push({
      ...acc.entity,
      glKeys: [...acc.glKeys].sort(),
      vendors: all.filter((v) => v.total >= threshold).sort(bySize),
      below: all.filter((v) => v.total < threshold).sort(bySize),
      unnamed: { count: acc.unnamedCount, total: acc.unnamedTotal },
      scannedTotal: acc.scannedTotal,
    });
  }

  // Most reportable vendors first — that is the work to be done.
  return out.sort((a, b) => b.vendors.length - a.vendors.length || a.name.localeCompare(b.name));
}

/** Headline counts for the page's KPI row. */
export function registerTotals(entities: Ten99Entity[]) {
  const reportable = entities.reduce((s, e) => s + e.vendors.length, 0);
  const amount = entities.reduce((s, e) => s + e.vendors.reduce((t, v) => t + v.total, 0), 0);
  const unnamed = entities.reduce((s, e) => s + e.unnamed.count, 0);
  return {
    entities: entities.filter((e) => e.vendors.length > 0).length,
    reportable,
    amount: Math.round(amount * 100) / 100,
    unnamed,
    scanned: Math.round(entities.reduce((s, e) => s + e.scannedTotal, 0) * 100) / 100,
  };
}
