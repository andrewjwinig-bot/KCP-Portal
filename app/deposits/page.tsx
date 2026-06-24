"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import {
  DEPOSIT_ACCOUNTS,
  duplicateDepositIds,
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

const DupBadge = ({ title }: { title?: string }) => (
  <span title={title ?? "Looks like a duplicate of another check for this tenant — open each to compare, then delete the extra."}
    style={{
      fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
      padding: "2px 8px", borderRadius: 999, cursor: "help",
      background: "rgba(217,119,6,0.12)", color: "#b45309", border: "1px solid rgba(217,119,6,0.35)",
    }}>
    ⚠ Possible duplicate
  </span>
);

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
  // Which multi-check tenant groups are expanded to show their individual checks.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  // Column sort (shared across the per-account tables).
  type SortKey = "tenant" | "unit" | "check" | "amount" | "date";
  const [sortKey, setSortKey] = useState<SortKey>("tenant");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const clickSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "amount" || k === "date" ? "desc" : "asc"); }
  };
  const sortMark = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const sortThStyle = (k: SortKey, align: "left" | "right" = "left"): React.CSSProperties =>
    ({ cursor: "pointer", userSelect: "none", textAlign: align, color: sortKey === k ? "var(--text)" : undefined });
  const sortGroups = (groups: TenantGroup[]): TenantGroup[] => {
    const dir = sortDir === "asc" ? 1 : -1;
    const num = (s: string) => { const n = Number(String(s).replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };
    const val = (g: TenantGroup): string | number => {
      switch (sortKey) {
        case "unit": return g.unitRef.toLowerCase();
        case "amount": return heldTotal(g.checks);
        case "date": return g.checks.reduce((m, c) => (c.checkDate > m ? c.checkDate : m), ""); // latest check
        case "check": return num(g.checks[0]?.checkNumber ?? "");
        default: return g.tenant.toLowerCase();
      }
    };
    return [...groups].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.tenant.localeCompare(b.tenant);
    });
  };

  function startGlobalAdd() { setAdding(true); setEditing(null); }
  // Pull the authoritative list from the server (so optimistic updates can never
  // drop a check — every saved check shows, no limit).
  function reloadDeposits() {
    fetch("/api/deposits").then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (Array.isArray(j?.deposits)) setDeposits(j.deposits); })
      .catch(() => {});
  }
  function closeForm() { setAdding(false); setEditing(null); reloadDeposits(); }

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

  // Records that look like accidental duplicates (same unit + same check #, or
  // same amount + date) — flagged so staff can open and remove the extras.
  const dupIds = useMemo(() => duplicateDepositIds(visibleDeposits ?? []), [visibleDeposits]);

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

  // A check saved via "+ Add another check" — update the list, keep modal open.
  function onCheckAdded(d: SecurityDeposit) {
    setDeposits((prev) => {
      const list = prev ?? [];
      const idx = list.findIndex((x) => x.id === d.id);
      if (idx >= 0) { const next = [...list]; next[idx] = d; return next; }
      return [...list, d];
    });
    reloadDeposits(); // reconcile with the server so every check persists/show
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

      {!loading && dupIds.size > 0 && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.35)", color: "#b45309",
        }}>
          ⚠ {dupIds.size} deposit{dupIds.size === 1 ? "" : "s"} look like possible duplicates (same tenant &amp; check # or amount/date).
          They&apos;re flagged below — expand the tenant, open each check to compare, then delete the extra.
        </div>
      )}

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
              <table style={{ width: "100%", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "32%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "18%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={sortThStyle("tenant")} onClick={() => clickSort("tenant")} title="Sort by tenant">Tenant{sortMark("tenant")}</th>
                    <th style={sortThStyle("unit")} onClick={() => clickSort("unit")} title="Sort by unit">Unit{sortMark("unit")}</th>
                    <th style={sortThStyle("amount", "right")} onClick={() => clickSort("amount")} title="Sort by amount">Amount{sortMark("amount")}</th>
                    <th style={sortThStyle("date")} onClick={() => clickSort("date")} title="Sort by check date">Check Date{sortMark("date")}</th>
                    <th style={sortThStyle("check")} onClick={() => clickSort("check")} title="Sort by check #">Check #{sortMark("check")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byAccount[acct].length === 0 && (
                    <tr><td colSpan={5} className="muted small" style={{ padding: 16 }}>
                      No deposits recorded for this account.
                    </td></tr>
                  )}
                  {sortGroups(groupByTenant(byAccount[acct])).map((g) => {
                    const checkCell = (d: SecurityDeposit) => (
                      <>
                        <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>{d.amount ? money(d.amount) : "—"}</td>
                        <td style={{ fontSize: 13 }}>{prettyDate(d.checkDate)}</td>
                        <td style={{ fontSize: 13 }}>{d.checkNumber ? `#${d.checkNumber}` : "—"}</td>
                      </>
                    );
                    // Single check → one ordinary row.
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
                              {dupIds.has(d.id) && <DupBadge />}
                            </div>
                          </td>
                          <td><code style={{ fontSize: 12 }}>{g.unitRef}</code></td>
                          {checkCell(d)}
                        </tr>
                      );
                    }

                    // Multiple checks → an expandable summary row. Click it to
                    // reveal each check as its own row that opens the editor (to
                    // re-enter the check #, edit, or delete it).
                    const held = heldTotal(g.checks);
                    const allRefunded = g.checks.every((c) => c.refunded);
                    const isOpen = expanded.has(g.unitRef);
                    const hasDup = g.checks.some((c) => dupIds.has(c.id));
                    return (
                      <Fragment key={g.unitRef}>
                        <tr
                          style={{ opacity: allRefunded ? 0.7 : 1, cursor: "pointer" }}
                          onClick={() => toggleExpanded(g.unitRef)}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}>
                          <td style={{ fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 11, color: "var(--muted)", width: 10, display: "inline-block" }}>{isOpen ? "▾" : "▸"}</span>
                              <span>{g.tenant || "—"}</span>
                              {allRefunded && <RefundedBadge date="" />}
                              {hasDup && <DupBadge title="This tenant has checks that look like duplicates — expand to review and delete the extra." />}
                            </div>
                          </td>
                          <td><code style={{ fontSize: 12 }}>{g.unitRef}</code></td>
                          <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>{money(held)}</td>
                          <td style={{ fontSize: 13, fontWeight: 600 }}>{g.checks.length} Checks</td>
                          <td className="muted small" style={{ fontSize: 12 }}>{isOpen ? "Hide" : "Show checks"}</td>
                        </tr>
                        {isOpen && g.checks.map((d) => (
                          <tr key={d.id}
                            style={{ cursor: "pointer", opacity: d.refunded ? 0.7 : 1, background: "rgba(15,23,42,0.02)" }}
                            onClick={() => { setEditing(d); setAdding(false); }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}>
                            <td style={{ paddingLeft: 28 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ color: "var(--muted)", fontSize: 12 }}>↳</span>
                                <span style={{ fontSize: 13 }}>{g.tenant || "—"}</span>
                                {d.refunded && <RefundedBadge date={d.refundDate} />}
                                {dupIds.has(d.id) && <DupBadge />}
                              </div>
                            </td>
                            <td><code style={{ fontSize: 12 }}>{g.unitRef}</code></td>
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
              {editing ? "Edit Security Deposit" : "New Security Deposit"}
            </div>
            <DepositForm
              deposit={editing}
              unitOptions={unitOptions}
              allDeposits={deposits ?? []}
              onSaved={onSaved}
              onCheckAdded={onCheckAdded}
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
