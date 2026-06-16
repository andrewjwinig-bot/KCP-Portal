"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import {
  DEPOSIT_ACCOUNTS,
  type DepositAccount,
  type SecurityDeposit,
} from "@/lib/deposits/deposits";
import { StatPill } from "@/app/components/Pill";
import { useUser } from "@/app/components/UserProvider";
import DepositForm, { type UnitOption } from "./DepositForm";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso || "—";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// A tenant's deposit can be made up of several checks paid over time (e.g. as
// they expanded into more space). Group the per-check records by unit so the
// checks that make up one deposit show together with a combined held total.
type TenantGroup = { unitRef: string; tenant: string; propertyCode: string; checks: SecurityDeposit[] };

function groupByTenant(deposits: SecurityDeposit[]): TenantGroup[] {
  const map = new Map<string, TenantGroup>();
  for (const d of deposits) {
    const g = map.get(d.unitRef) ?? { unitRef: d.unitRef, tenant: d.tenantCompany, propertyCode: d.propertyCode, checks: [] };
    if (!g.tenant && d.tenantCompany) g.tenant = d.tenantCompany;
    g.checks.push(d);
    map.set(d.unitRef, g);
  }
  for (const g of map.values()) {
    // Oldest check first, so a deposit reads in the order it was paid up.
    g.checks.sort((a, b) => (a.checkDate || "9999").localeCompare(b.checkDate || "9999"));
  }
  return [...map.values()].sort((a, b) => a.tenant.localeCompare(b.tenant));
}

function heldTotal(checks: SecurityDeposit[]): number {
  return checks.filter((c) => !c.refunded).reduce((s, c) => s + c.amount, 0);
}

const RefundedBadge = ({ date }: { date: string }) => (
  <span style={{
    fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
    padding: "2px 8px", borderRadius: 999,
    background: "rgba(22,163,74,0.10)", color: "#15803d", border: "1px solid rgba(22,163,74,0.30)",
  }}>
    Refunded{date ? ` · ${prettyDate(date)}` : ""}
  </span>
);

export default function SecurityDepositsPage() {
  const { user } = useUser();
  const scopeCodes = user.depositsScope?.codes ?? null;

  const [deposits, setDeposits] = useState<SecurityDeposit[] | null>(null);
  const [rentroll, setRentroll] = useState<RentRollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SecurityDeposit | null>(null);
  const [adding, setAdding] = useState(false);
  // When set, the form opens pre-pinned to this tenant's unit (adding another
  // check to an existing deposit). Null → the global add with a tenant picker.
  const [addUnit, setAddUnit] = useState<UnitOption | null>(null);

  function startGlobalAdd() { setAddUnit(null); setAdding(true); setEditing(null); }
  function startAddCheck(g: TenantGroup) {
    setAddUnit({ unitRef: g.unitRef, label: `${g.tenant || g.unitRef} — ${g.unitRef}`, propertyCode: g.propertyCode, tenantCompany: g.tenant });
    setAdding(true);
    setEditing(null);
  }
  function closeForm() { setAdding(false); setEditing(null); setAddUnit(null); }

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/deposits").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/rentroll").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([dJ, rJ]) => {
      if (!alive) return;
      setDeposits(Array.isArray(dJ?.deposits) ? dJ.deposits : []);
      setRentroll(rJ?.rentroll ?? null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Deposits this persona is allowed to see (scoped by property code).
  const visibleDeposits = useMemo(() => {
    if (!deposits) return null;
    if (!scopeCodes) return deposits;
    return deposits.filter((d) => scopeCodes.has(d.propertyCode));
  }, [deposits, scopeCodes]);

  const unitOptions = useMemo<UnitOption[]>(() => {
    if (!rentroll) return [];
    const out: UnitOption[] = [];
    for (const p of rentroll.properties) {
      if (scopeCodes && !scopeCodes.has(p.propertyCode)) continue;
      for (const u of p.units) {
        if (u.isVacant || !u.occupantName) continue;
        out.push({
          unitRef: u.unitRef,
          label: `${u.occupantName} — ${u.unitRef}`,
          propertyCode: p.propertyCode,
          tenantCompany: u.occupantName,
        });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [rentroll, scopeCodes]);

  const byAccount = useMemo(() => {
    const map: Record<DepositAccount, SecurityDeposit[]> = { "ni-llc": [], "all-but-ni": [] };
    for (const d of visibleDeposits ?? []) map[d.account]?.push(d);
    for (const k of Object.keys(map) as DepositAccount[]) {
      map[k].sort((a, b) => a.tenantCompany.localeCompare(b.tenantCompany));
    }
    return map;
  }, [visibleDeposits]);

  function onSaved(d: SecurityDeposit) {
    setDeposits((prev) => {
      const list = prev ?? [];
      const idx = list.findIndex((x) => x.id === d.id);
      if (idx >= 0) { const next = [...list]; next[idx] = d; return next; }
      return [...list, d];
    });
    closeForm();
  }

  function onDeleted(id: string) {
    setDeposits((prev) => prev?.filter((x) => x.id !== id) ?? prev);
    setEditing(null);
  }

  // "Held" totals exclude deposits that have been refunded to the tenant.
  const heldDeposits = (visibleDeposits ?? []).filter((d) => !d.refunded);
  const total = heldDeposits.reduce((s, d) => s + d.amount, 0);
  const heldByAccount = {
    "ni-llc": heldDeposits.filter((d) => d.account === "ni-llc"),
    "all-but-ni": heldDeposits.filter((d) => d.account === "all-but-ni"),
  };

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Security Deposits</h1>
        <button className="btn primary" onClick={startGlobalAdd}
          style={{ fontSize: 13, padding: "8px 16px", fontWeight: 700 }}>
          + Add Deposit
        </button>
      </header>

      <div className="pills" style={{ marginTop: 0 }}>
        <StatPill label="Total Held" value={money(total)} />
        <StatPill label={DEPOSIT_ACCOUNTS["ni-llc"].bank}
          value={money(heldByAccount["ni-llc"].reduce((s, d) => s + d.amount, 0))}
          sub={`NI LLC · ${heldByAccount["ni-llc"].length} checks`} />
        <StatPill label={DEPOSIT_ACCOUNTS["all-but-ni"].bank}
          value={money(heldByAccount["all-but-ni"].reduce((s, d) => s + d.amount, 0))}
          sub={`All but NI LLC · ${heldByAccount["all-but-ni"].length} checks`} />
      </div>

      {loading ? (
        <div className="muted small">Loading…</div>
      ) : (
        (["ni-llc", "all-but-ni"] as DepositAccount[]).map((acct) => (
          <div key={acct} className="card" style={{ padding: 0 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{DEPOSIT_ACCOUNTS[acct].label}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {DEPOSIT_ACCOUNTS[acct].bank} · booked on {DEPOSIT_ACCOUNTS[acct].propertyCode}
              </div>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Unit</th>
                    <th>Check #</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Check Date</th>
                    <th>Image</th>
                  </tr>
                </thead>
                <tbody>
                  {byAccount[acct].length === 0 && (
                    <tr><td colSpan={6} className="muted small" style={{ padding: 16 }}>
                      No deposits recorded for this account.
                    </td></tr>
                  )}
                  {groupByTenant(byAccount[acct]).map((g) => {
                    const checkCell = (d: SecurityDeposit) => (
                      <>
                        <td style={{ fontSize: 13 }}>{d.checkNumber ? `#${d.checkNumber}` : "—"}</td>
                        <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>{d.amount ? money(d.amount) : "—"}</td>
                        <td style={{ fontSize: 13 }}>{prettyDate(d.checkDate)}</td>
                        <td>{d.checkImage
                          ? <a href={d.checkImage.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                              style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d" }}>View</a>
                          : <span className="muted small">—</span>}</td>
                      </>
                    );
                    const addBtn = (
                      <button type="button" className="btn"
                        onClick={(e) => { e.stopPropagation(); startAddCheck(g); }}
                        style={{ fontSize: 11, padding: "3px 9px", fontWeight: 600 }}>
                        + check
                      </button>
                    );

                    // Single check → one ordinary row (with a quick "+ check").
                    if (g.checks.length === 1) {
                      const d = g.checks[0];
                      return (
                        <tr key={d.id}
                          style={{ cursor: "pointer", opacity: d.refunded ? 0.7 : 1 }}
                          onClick={() => { setEditing(d); setAdding(false); }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}>
                          <td style={{ fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span>{g.tenant || "—"}</span>
                              {d.refunded && <RefundedBadge date={d.refundDate} />}
                              {addBtn}
                            </div>
                          </td>
                          <td><code style={{ fontSize: 12 }}>{g.unitRef}</code></td>
                          {checkCell(d)}
                        </tr>
                      );
                    }

                    // Multiple checks → a tenant subtotal header + one row per check.
                    const held = heldTotal(g.checks);
                    const allRefunded = g.checks.every((c) => c.refunded);
                    return (
                      <Fragment key={g.unitRef}>
                        <tr style={{ background: "rgba(15,23,42,0.035)" }}>
                          <td style={{ fontWeight: 700 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span>{g.tenant || "—"}</span>
                              {allRefunded && <RefundedBadge date="" />}
                              {addBtn}
                            </div>
                          </td>
                          <td><code style={{ fontSize: 12 }}>{g.unitRef}</code></td>
                          <td className="muted small">{g.checks.length} checks</td>
                          <td style={{ textAlign: "right", fontSize: 13, fontWeight: 800 }}>{money(held)}</td>
                          <td colSpan={2} className="muted small">total held</td>
                        </tr>
                        {g.checks.map((d) => (
                          <tr key={d.id}
                            style={{ cursor: "pointer", opacity: d.refunded ? 0.55 : 1 }}
                            onClick={() => { setEditing(d); setAdding(false); }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}>
                            <td style={{ paddingLeft: 26 }} className="muted small">
                              {d.refunded ? <RefundedBadge date={d.refundDate} /> : "↳"}
                            </td>
                            <td />
                            {checkCell(d)}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {(adding || editing) && (
        <div
          onClick={closeForm}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "48px 16px 32px", zIndex: 100, overflow: "auto",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card"
            style={{ maxWidth: 860, width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,0.32)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>
              {editing ? "Edit Security Deposit" : addUnit ? `Add check — ${addUnit.tenantCompany || addUnit.unitRef}` : "New Security Deposit"}
            </div>
            <DepositForm
              deposit={editing}
              unitOptions={addUnit ? [addUnit] : unitOptions}
              fixedUnitRef={addUnit?.unitRef}
              onSaved={onSaved}
              onCancel={closeForm}
              onDeleted={editing ? onDeleted : undefined}
            />
          </div>
        </div>
      )}

      <div className="muted small">
        Deposits route to one of two Liberty accounts automatically by property —
        NI LLC buildings to x7448, everything else to x7216.{" "}
        <Link href="/rentroll" style={{ color: "var(--brand)" }}>Rent roll →</Link>
      </div>
    </main>
  );
}
