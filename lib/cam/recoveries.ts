// RECOVERIES BY LINE — the shared shape for office AND retail (owner, 11/2026:
// "show as a $ and % of each line item what the recoveries were … by building
// … and even by tenant"). Each reconciled line carries its booked expense,
// what tenants were billed on it through the reconciliation, the % that is,
// WHERE the rest went (`parts`, which add back to the expense exactly — a
// negative part ADDS to the recovery, e.g. an admin fee or a gross-up), and
// the tenants who paid it. Pure and client-safe: the office engine
// (office/lineRecovery.ts) and the retail engine (retail/lineRecovery.ts)
// fill it; `combineGroups` sums buildings into a fund / a book.

export type RecoveryCategory = "opex" | "ins" | "ret";

export type TenantShare = { unitRef: string; name: string; building: string; amount: number };

export type RecoveryRow = {
  key: string;
  glAccount: string;
  label: string;
  category: RecoveryCategory;
  expense: number;
  recovered: number;
  /** recovered ÷ expense (0 with no expense). */
  pct: number;
  /** expense − recovered, explained; each part's sign as it reduces recovery. */
  parts: { label: string; amount: number }[];
  tenants: TenantShare[];
  tenantsPaying: number;
  tenantsReconciled: number;
};

export type TenantRecovery = {
  unitRef: string;
  name: string;
  building: string;
  opex: number;
  ins: number;
  ret: number;
  total: number;
};

export type RecoveryGroup = {
  code: string;
  name: string;
  year: number;
  kind: "office" | "retail";
  /** The operating-expense (CAM) lines, in the recon's order. */
  lines: RecoveryRow[];
  /** Insurance (retail) and real estate taxes, apart from CAM. */
  others: RecoveryRow[];
  /** Every CAM / Op Ex line together. */
  opexTotal: RecoveryRow;
  /** Everything: CAM + INS + RET. */
  grandTotal: RecoveryRow;
  tenants: TenantRecovery[];
  /** Buildings inside a combined group, each on its own. */
  buildings?: RecoveryGroup[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A row under construction: parts keyed by label. */
export type RowAcc = Omit<RecoveryRow, "parts" | "pct" | "tenants"> & {
  parts: Map<string, number>;
  tenants: Map<string, TenantShare>;
};

export function newRow(key: string, glAccount: string, label: string, category: RecoveryCategory, expense: number): RowAcc {
  return { key, glAccount, label, category, expense, recovered: 0, parts: new Map(), tenants: new Map(), tenantsPaying: 0, tenantsReconciled: 0 };
}

export function addPart(a: RowAcc, label: string, amount: number) {
  if (Math.abs(amount) < 1e-9) return;
  a.parts.set(label, (a.parts.get(label) ?? 0) + amount);
}

export function addTenant(a: RowAcc, t: { unitRef: string; name: string; building: string }, amount: number, reconciled = true) {
  a.recovered += amount;
  if (reconciled) a.tenantsReconciled += 1;
  if (amount > 0.005) a.tenantsPaying += 1;
  if (Math.abs(amount) < 0.005) return;
  const k = `${t.building}|${t.unitRef}`;
  const prev = a.tenants.get(k);
  a.tenants.set(k, { ...t, amount: (prev?.amount ?? 0) + amount });
}

/** Close a row: the part named `remainder` takes whatever is left, so the
 *  parts always add back to expense − recovered. */
export function finishRow(a: RowAcc, remainder: string): RecoveryRow {
  const explained = [...a.parts.values()].reduce((s, v) => s + v, 0);
  const rest = a.expense - a.recovered - explained;
  if (Math.abs(rest) >= 0.005) a.parts.set(remainder, (a.parts.get(remainder) ?? 0) + rest);
  return {
    key: a.key, glAccount: a.glAccount, label: a.label, category: a.category,
    expense: r2(a.expense), recovered: r2(a.recovered),
    pct: a.expense > 0 ? a.recovered / a.expense : 0,
    parts: [...a.parts].filter(([, v]) => Math.abs(v) >= 0.5).map(([label, amount]) => ({ label, amount: r2(amount) })),
    tenants: [...a.tenants.values()].map((t) => ({ ...t, amount: r2(t.amount) })).sort((x, y) => y.amount - x.amount),
    tenantsPaying: a.tenantsPaying, tenantsReconciled: a.tenantsReconciled,
  };
}

/** Sum rows (same line across buildings, or every line into a total). */
export function sumRows(rows: RecoveryRow[], key: string, glAccount: string, label: string, category: RecoveryCategory, countTenantsOnce = false): RecoveryRow {
  const a = newRow(key, glAccount, label, category, 0);
  for (const r of rows) {
    a.expense += r.expense;
    a.recovered += r.recovered;
    for (const p of r.parts) addPart(a, p.label, p.amount);
    for (const t of r.tenants) {
      const k = `${t.building}|${t.unitRef}`;
      const prev = a.tenants.get(k);
      a.tenants.set(k, { ...t, amount: (prev?.amount ?? 0) + t.amount });
    }
    if (!countTenantsOnce) {
      a.tenantsPaying += r.tenantsPaying;
      a.tenantsReconciled += r.tenantsReconciled;
    }
  }
  const out = finishRow(a, "Other");
  if (countTenantsOnce) {
    out.tenantsPaying = out.tenants.filter((t) => t.amount > 0.005).length;
    out.tenantsReconciled = Math.max(...rows.map((r) => r.tenantsReconciled), 0);
  }
  return out;
}

/** The roll-ups and the per-tenant table for one building's rows. */
export function assembleGroup(
  base: { code: string; name: string; year: number; kind: "office" | "retail" },
  lines: RecoveryRow[],
  others: RecoveryRow[],
  reconciledTenants: number,
): RecoveryGroup {
  const opexTotal = sumRows(lines, "opex-total", "", base.kind === "office" ? "Total Operating Expenses" : "Total CAM", "opex", true);
  opexTotal.tenantsReconciled = reconciledTenants;
  const grandTotal = sumRows([opexTotal, ...others], "grand-total", "", "Total Recoverable Expenses", "opex", true);
  grandTotal.tenantsReconciled = reconciledTenants;
  const byTenant = new Map<string, TenantRecovery>();
  for (const r of [...lines, ...others]) {
    for (const t of r.tenants) {
      const k = `${t.building}|${t.unitRef}`;
      const cur = byTenant.get(k) ?? { unitRef: t.unitRef, name: t.name, building: t.building, opex: 0, ins: 0, ret: 0, total: 0 };
      cur[r.category] += t.amount;
      cur.total += t.amount;
      byTenant.set(k, cur);
    }
  }
  const tenants = [...byTenant.values()].map((t) => ({ ...t, opex: r2(t.opex), ins: r2(t.ins), ret: r2(t.ret), total: r2(t.total) }))
    .sort((a, b) => b.total - a.total);
  return { ...base, lines, others, opexTotal, grandTotal, tenants };
}

/** Several buildings as one (a fund, a book, 7010's two pots), line by line —
 *  matched by GL account, else label. The buildings ride along for the
 *  by-building view. */
export function combineGroups(groups: RecoveryGroup[], code: string, name: string): RecoveryGroup | null {
  if (!groups.length) return null;
  if (groups.length === 1 && groups[0].code === code) return groups[0];
  const lineKey = (r: RecoveryRow) => (r.glAccount && r.glAccount !== "—" ? r.glAccount : r.label.toLowerCase());
  const collect = (pick: (g: RecoveryGroup) => RecoveryRow[]) => {
    const order: string[] = [];
    const by = new Map<string, RecoveryRow[]>();
    for (const g of groups) for (const r of pick(g)) {
      const k = `${r.category}|${lineKey(r)}`;
      if (!by.has(k)) { by.set(k, []); order.push(k); }
      by.get(k)!.push(r);
    }
    return order.map((k) => {
      const rows = by.get(k)!;
      return sumRows(rows, k, rows[0].glAccount, rows[0].label, rows[0].category);
    });
  };
  const lines = collect((g) => g.lines);
  const others = collect((g) => g.others);
  const reconciled = groups.reduce((s, g) => s + g.opexTotal.tenantsReconciled, 0);
  const kind = groups.every((g) => g.kind === "office") ? "office" : "retail";
  const out = assembleGroup({ code, name, year: groups[0].year, kind }, lines, others, reconciled);
  // Each member as it is (7010 stays one centre, its two pots inside it).
  out.buildings = groups;
  return out;
}
