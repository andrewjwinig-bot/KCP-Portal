"use client";

import { useEffect, useState } from "react";

type Period = {
  id: string;
  name: string;
  savedAt: string;
  total: number;
  employeeCount: number;
};
type Statement = {
  id: string;
  savedAt: string;
  periodText?: string;
  statementMonth?: string;
  txCount: number;
  total: number;
};

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function money(n: number): string {
  return "$" + Math.round(n ?? 0).toLocaleString("en-US");
}

/** Drew's at-a-glance status: when payroll and CC expenses were last saved. */
export default function DrewSavedStatus() {
  const [periods, setPeriods] = useState<Period[] | null>(null);
  const [statements, setStatements] = useState<Statement[] | null>(null);

  useEffect(() => {
    fetch("/api/periods")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setPeriods(j?.periods ?? []))
      .catch(() => setPeriods([]));
    fetch("/api/statements")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setStatements(Array.isArray(j) ? j : []))
      .catch(() => setStatements([]));
  }, []);

  const payroll = periods?.[0] ?? null;
  const cc = statements?.[0] ?? null;

  return (
    <div className="card" style={{ order: -1 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 12 }}>
        Payroll &amp; CC Expenses
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Row
          title="Payroll"
          loading={periods == null}
          saved={!!payroll}
          line1={payroll ? payroll.name : "Nothing saved yet"}
          line2={
            payroll
              ? `Saved ${fmtDate(payroll.savedAt)} · ${payroll.employeeCount} employee${payroll.employeeCount === 1 ? "" : "s"} · ${money(payroll.total)}`
              : undefined
          }
        />
        <Row
          title="Credit Card Expenses"
          loading={statements == null}
          saved={!!cc}
          line1={cc ? (cc.periodText || cc.statementMonth || "Saved batch") : "Nothing saved yet"}
          line2={
            cc
              ? `Saved ${fmtDate(cc.savedAt)} · ${cc.txCount} transaction${cc.txCount === 1 ? "" : "s"} · ${money(cc.total)}`
              : undefined
          }
        />
      </div>
    </div>
  );
}

function Row({
  title,
  loading,
  saved,
  line1,
  line2,
}: {
  title: string;
  loading: boolean;
  saved: boolean;
  line1: string;
  line2?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 12px", borderRadius: 8,
      border: "1px solid",
      borderColor: saved ? "rgba(22,163,74,0.30)" : "rgba(15,23,42,0.12)",
      background: saved ? "rgba(22,163,74,0.05)" : "rgba(15,23,42,0.025)",
    }}>
      <span style={{
        width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0,
        background: saved ? "#16a34a" : "#64748b",
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {title}
          {!loading && (
            <span style={{
              marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
              letterSpacing: "0.04em",
              background: saved ? "rgba(22,163,74,0.15)" : "rgba(100,116,139,0.15)",
              color: saved ? "#15803d" : "#475569",
            }}>
              {saved ? "SAVED" : "NONE YET"}
            </span>
          )}
        </div>
        <div className="muted small" style={{ marginTop: 2 }}>
          {loading ? "Loading…" : line1}
        </div>
        {!loading && line2 && (
          <div className="muted small" style={{ marginTop: 1 }}>{line2}</div>
        )}
      </div>
    </div>
  );
}
