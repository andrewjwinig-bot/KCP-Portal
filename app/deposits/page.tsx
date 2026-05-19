"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import {
  DEPOSIT_ACCOUNTS,
  type DepositAccount,
  type SecurityDeposit,
} from "@/lib/deposits/deposits";
import { StatPill } from "@/app/components/Pill";
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

export default function SecurityDepositsPage() {
  const [deposits, setDeposits] = useState<SecurityDeposit[] | null>(null);
  const [rentroll, setRentroll] = useState<RentRollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SecurityDeposit | null>(null);
  const [adding, setAdding] = useState(false);

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

  const unitOptions = useMemo<UnitOption[]>(() => {
    if (!rentroll) return [];
    const out: UnitOption[] = [];
    for (const p of rentroll.properties) {
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
  }, [rentroll]);

  const byAccount = useMemo(() => {
    const map: Record<DepositAccount, SecurityDeposit[]> = { "ni-llc": [], "all-but-ni": [] };
    for (const d of deposits ?? []) map[d.account]?.push(d);
    for (const k of Object.keys(map) as DepositAccount[]) {
      map[k].sort((a, b) => a.tenantCompany.localeCompare(b.tenantCompany));
    }
    return map;
  }, [deposits]);

  function onSaved(d: SecurityDeposit) {
    setDeposits((prev) => {
      const list = prev ?? [];
      const idx = list.findIndex((x) => x.id === d.id);
      if (idx >= 0) { const next = [...list]; next[idx] = d; return next; }
      return [...list, d];
    });
    setEditing(null);
    setAdding(false);
  }

  function onDeleted(id: string) {
    setDeposits((prev) => prev?.filter((x) => x.id !== id) ?? prev);
    setEditing(null);
  }

  const total = (deposits ?? []).reduce((s, d) => s + d.amount, 0);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Security Deposits</h1>
        <button className="btn primary" onClick={() => { setAdding(true); setEditing(null); }}
          style={{ fontSize: 13, padding: "8px 16px", fontWeight: 700 }}>
          + Add Deposit
        </button>
      </header>

      <div className="pills" style={{ marginTop: 0 }}>
        <StatPill label="Total Held" value={money(total)} />
        <StatPill label={DEPOSIT_ACCOUNTS["ni-llc"].bank}
          value={money(byAccount["ni-llc"].reduce((s, d) => s + d.amount, 0))}
          sub={`NI LLC · ${byAccount["ni-llc"].length} checks`} />
        <StatPill label={DEPOSIT_ACCOUNTS["all-but-ni"].bank}
          value={money(byAccount["all-but-ni"].reduce((s, d) => s + d.amount, 0))}
          sub={`All but NI LLC · ${byAccount["all-but-ni"].length} checks`} />
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
                  {byAccount[acct].map((d) => (
                    <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => { setEditing(d); setAdding(false); }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}>
                      <td style={{ fontWeight: 600 }}>{d.tenantCompany || "—"}</td>
                      <td><code style={{ fontSize: 12 }}>{d.unitRef}</code></td>
                      <td style={{ fontSize: 13 }}>{d.checkNumber || "—"}</td>
                      <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>{d.amount ? money(d.amount) : "—"}</td>
                      <td style={{ fontSize: 13 }}>{prettyDate(d.checkDate)}</td>
                      <td>{d.checkImage
                        ? <a href={d.checkImage.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d" }}>View</a>
                        : <span className="muted small">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {(adding || editing) && (
        <div
          onClick={() => { setAdding(false); setEditing(null); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "48px 16px 32px", zIndex: 100, overflow: "auto",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card"
            style={{ maxWidth: 560, width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,0.32)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>
              {editing ? "Edit Security Deposit" : "New Security Deposit"}
            </div>
            <DepositForm
              deposit={editing}
              unitOptions={unitOptions}
              onSaved={onSaved}
              onCancel={() => { setAdding(false); setEditing(null); }}
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
