"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { periodPill } from "@/lib/tracker/periodLabel";

type Period = {
  id: string;
  name: string;
  savedAt: string;
  total: number;
  employeeCount: number;
  savedBy?: string | null;
};
type Statement = {
  id: string;
  savedAt: string;
  periodText?: string;
  statementMonth?: string;
  txCount: number;
  total: number;
  savedBy?: string | null;
};

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    // No year — these are all from the current cycle.
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
/**
 * "Processed Sep 7 by HARRY" — the same sentence for all three.
 *
 * The name is omitted when it was not recorded rather than filled in from who
 * usually does it: a dashboard that states a fact it does not hold is worse
 * than one that says less.
 */
function processed(at?: string, by?: string | null): string {
  return `Processed ${fmtDate(at)}${by ? ` by ${String(by).toUpperCase()}` : ""}`;
}
type AllocRun = { periodText: string; periodEndDate: string; statementMonth: string; ranAt: string; ranBy?: string };

/** Drew's at-a-glance status: the most recent Payroll, CC Expenses, and
 *  Allocated Expenses run. */
export default function DrewSavedStatus() {
  const [periods, setPeriods] = useState<Period[] | null>(null);
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [runs, setRuns] = useState<AllocRun[] | null>(null);

  useEffect(() => {
    // no-store so the browser/edge never serves a stale "most recent" snapshot.
    const opts = { cache: "no-store" as const };
    fetch("/api/periods", opts)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setPeriods(j?.periods ?? []))
      .catch(() => setPeriods([]));
    fetch("/api/statements", opts)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setStatements(Array.isArray(j) ? j : []))
      .catch(() => setStatements([]));
    fetch("/api/allocation/last-run", opts)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRuns(j?.runs ?? []))
      .catch(() => setRuns([]));
  }, []);

  const payroll = periods?.[0] ?? null;
  const cc = statements?.[0] ?? null;
  const alloc = runs?.[0] ?? null;

  return (
    <div className="card" style={{ order: -1 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 12 }}>
        Payroll, CC &amp; Allocated Expenses
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Row
          title="Payroll"
          href="/payroll"
          loading={periods == null}
          saved={!!payroll}
          period={periodPill(payroll?.name)}
          line={payroll ? processed(payroll.savedAt, payroll.savedBy) : "Nothing saved yet"}
        />
        <Row
          title="Credit Card Expenses"
          href="/expenses"
          loading={statements == null}
          saved={!!cc}
          period={periodPill(cc?.periodText || cc?.statementMonth)}
          line={cc ? processed(cc.savedAt, cc.savedBy) : "Nothing saved yet"}
        />
        <Row
          title="Allocated Expenses"
          href="/allocated-invoicer"
          loading={runs == null}
          saved={!!alloc}
          period={periodPill(alloc?.statementMonth || alloc?.periodText)}
          line={alloc ? processed(alloc.ranAt, alloc.ranBy) : "Nothing run yet"}
        />
      </div>
    </div>
  );
}

function Row({
  title,
  href,
  loading,
  saved,
  period,
  line,
}: {
  title: string;
  href: string;
  loading: boolean;
  saved: boolean;
  /** The period this covers — the pill. Null when it could not be read. */
  period: string | null;
  /** ONE line: who processed it and when.
   *
   *  The employee/transaction counts and the dollar total used to sit above
   *  it. They read as the card's subject and they are not — nobody is checking
   *  the dashboard to learn that payroll had fifteen employees, and the raw
   *  "2026-01_to_2026-06" under Allocated Expenses was the period repeated in
   *  its worst form, next to a pill already carrying it. The question this card
   *  answers is whether the run HAPPENED; the figures live on the page one
   *  click away. */
  line: string;
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
          {/* Click the title, not an "Open →" beside it. */}
          <Link href={href} style={{ color: "inherit", textDecoration: "none" }} className="row-link">{title}</Link>
          {!loading && (
            <span style={{
              marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
              letterSpacing: "0.04em",
              background: saved ? "rgba(22,163,74,0.15)" : "rgba(100,116,139,0.15)",
              color: saved ? "#15803d" : "#475569",
            }}>
              {/* The PERIOD, not "SAVED". The dot and the green border already
                  say it is saved; which month is done is the thing you cannot
                  tell by looking. Falls back when the period is unreadable. */}
              {!saved ? "NONE YET" : (period ?? "SAVED")}
            </span>
          )}
        </div>
        <div className="muted small" style={{ marginTop: 2 }}>
          {loading ? "Loading…" : line}
        </div>
      </div>
    </div>
  );
}
