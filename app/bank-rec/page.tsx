"use client";

import { useEffect, useMemo, useState } from "react";
import { UNIQUE_BANK_ACCOUNTS, type BankGroup, type UniqueBankAccount } from "../../lib/bank-rec/accounts";
import { BANK_REC_DUE_DAY, bankRecKey, bankRecPeriod, bankRecPeriodLabel, shiftPeriod } from "../../lib/bank-rec/util";

const BANK_ORDER: BankGroup[] = ["M&T", "JPM-Chase", "Liberty Bank"];

type ViewFilter = "outstanding" | "reconciled" | "all";

export default function BankRecTrackerPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>(() => bankRecPeriod());
  const [view, setView] = useState<ViewFilter>("outstanding");

  useEffect(() => {
    fetch("/api/bank-rec")
      .then((r) => r.json())
      .then((j) => setChecked(j.checked ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalAccounts = UNIQUE_BANK_ACCOUNTS.length;
  const doneCount = useMemo(
    () => UNIQUE_BANK_ACCOUNTS.filter((a) => checked[bankRecKey(a.last4, period)]).length,
    [checked, period],
  );
  const remaining = totalAccounts - doneCount;
  const pct = totalAccounts > 0 ? Math.round((doneCount / totalAccounts) * 100) : 0;

  const isCurrentPeriod = period === bankRecPeriod();
  const today = new Date();
  const periodDeadline = (() => {
    const [py, pm] = period.split("-").map(Number);
    // Deadline is the 10th of the FOLLOWING month for reconciling this period
    return new Date(py, (pm - 1) + 1, BANK_REC_DUE_DAY);
  })();
  const daysUntilDeadline = Math.round((periodDeadline.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  const overdue = isCurrentPeriod ? false : daysUntilDeadline < 0 && remaining > 0;

  async function toggleAccount(last4: string) {
    const key = bankRecKey(last4, period);
    const next = { ...checked };
    if (next[key]) delete next[key];
    else next[key] = true;
    setChecked(next);
    try {
      const res = await fetch("/api/bank-rec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: next }),
      });
      if (!res.ok) throw new Error("Save failed");
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    }
  }

  // Pre-group accounts by bank for rendering
  const grouped = useMemo(() => {
    const map = new Map<BankGroup, UniqueBankAccount[]>();
    for (const a of UNIQUE_BANK_ACCOUNTS) {
      if (!map.has(a.bank)) map.set(a.bank, []);
      map.get(a.bank)!.push(a);
    }
    return BANK_ORDER.filter((b) => map.has(b)).map((b) => ({ bank: b, accounts: map.get(b)! }));
  }, []);

  // Filter accounts within a bank group by view filter
  function visible(accounts: UniqueBankAccount[]): UniqueBankAccount[] {
    if (view === "all") return accounts;
    return accounts.filter((a) => {
      const done = !!checked[bankRecKey(a.last4, period)];
      return view === "outstanding" ? !done : done;
    });
  }

  const visibleByGroup = grouped.map((g) => ({ ...g, accounts: visible(g.accounts) }));
  const anyVisible = visibleByGroup.some((g) => g.accounts.length > 0);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h1 style={{ margin: 0 }}>Bank Rec Tracker</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div>COMMERCIAL</div><div>PROPERTIES</div>
          </div>
        </div>
      </header>

      {/* ── Progress / month nav card ──────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="btn"
              onClick={() => setPeriod((p) => shiftPeriod(p, -1))}
              style={{ padding: "5px 12px", fontWeight: 900, fontSize: 14 }}
              aria-label="Previous month"
            >
              ←
            </button>
            <span style={{ fontWeight: 800, fontSize: 18, minWidth: 130, textAlign: "center" }}>
              {bankRecPeriodLabel(period)}
            </span>
            <button
              className="btn"
              onClick={() => setPeriod((p) => shiftPeriod(p, 1))}
              style={{ padding: "5px 12px", fontWeight: 900, fontSize: 14 }}
              aria-label="Next month"
            >
              →
            </button>
            {!isCurrentPeriod && (
              <button
                className="btn"
                onClick={() => setPeriod(bankRecPeriod())}
                style={{ fontSize: 11, padding: "5px 9px" }}
              >
                Today
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <div>
              <span style={{ fontSize: 22, fontWeight: 900, color: doneCount === totalAccounts ? "#16a34a" : "var(--text)" }}>
                {doneCount}
              </span>
              <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>
                {" "}/ {totalAccounts} reconciled
              </span>
            </div>
            <span className="muted small">
              {remaining > 0
                ? `${remaining} outstanding · due ${periodDeadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : "All reconciled ✓"}
              {overdue && (
                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(220,38,38,0.12)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.30)", letterSpacing: "0.04em" }}>
                  PAST DUE
                </span>
              )}
              {error && <span style={{ color: "#b91c1c", marginLeft: 8 }}>· {error}</span>}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: "var(--border)", borderRadius: 999, marginTop: 14, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${pct}%`,
            background: doneCount === totalAccounts ? "#16a34a" : "var(--brand)",
            borderRadius: 999,
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* View filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em" }}>SHOW</span>
          <div role="tablist" aria-label="View filter" style={{
            display: "inline-flex", border: "1px solid var(--border)", borderRadius: 999, overflow: "hidden", background: "#fff",
          }}>
            {([
              { id: "outstanding", label: `Outstanding (${remaining})` },
              { id: "reconciled",  label: `Reconciled (${doneCount})` },
              { id: "all",         label: `All (${totalAccounts})` },
            ] as { id: ViewFilter; label: string }[]).map((f) => {
              const active = view === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setView(f.id)}
                  role="tab"
                  aria-selected={active}
                  style={{
                    padding: "6px 14px", fontSize: 12, fontWeight: 700,
                    background: active ? "var(--brand)" : "transparent",
                    color: active ? "#fff" : "var(--text)",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bank groups ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="card muted small">Loading…</div>
      ) : !anyVisible ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {view === "outstanding"
              ? "All accounts reconciled for this period"
              : view === "reconciled"
              ? "Nothing reconciled yet for this period"
              : "No accounts to display"}
          </div>
          <div className="muted small">
            {view === "outstanding" && "Switch to All to see the full list."}
          </div>
        </div>
      ) : (
        visibleByGroup.map(({ bank, accounts }) => {
          if (accounts.length === 0) return null;
          return (
            <div key={bank} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px",
                background: "rgba(11,74,125,0.05)",
                borderBottom: "1px solid var(--border)",
              }}>
                <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "0.02em" }}>{bank}</span>
                <span className="muted small">{accounts.length} shown</span>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em" }}>
                    <th style={{ padding: "8px 14px", fontWeight: 700, width: 60 }}></th>
                    <th style={{ padding: "8px 14px", fontWeight: 700, width: "28%" }}>BANK ACCOUNT KEY</th>
                    <th style={{ padding: "8px 14px", fontWeight: 700, width: "12%" }}>ACCOUNT</th>
                    <th style={{ padding: "8px 14px", fontWeight: 700 }}>ACCOUNT NAME</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((r) => {
                    const isDone = !!checked[bankRecKey(r.last4, period)];
                    return (
                      <tr
                        key={r.last4 + r.key}
                        style={{
                          borderTop: "1px solid var(--border)",
                          background: isDone ? "rgba(22,163,74,0.04)" : "transparent",
                        }}
                      >
                        <td style={{ padding: "10px 14px" }}>
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => toggleAccount(r.last4)}
                            aria-label={`Mark ${r.key} reconciled for ${bankRecPeriodLabel(period)}`}
                            style={{ width: 18, height: 18, cursor: "pointer" }}
                          />
                        </td>
                        <td style={{
                          padding: "10px 14px",
                          fontWeight: 600,
                          color: isDone ? "var(--muted)" : "var(--text)",
                          textDecoration: isDone ? "line-through" : "none",
                        }}>
                          {r.key}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: isDone ? "var(--muted)" : "var(--text)" }}>
                          {r.last4}
                        </td>
                        <td style={{ padding: "10px 14px", color: isDone ? "var(--muted)" : "var(--text)" }}>
                          {r.accountName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </main>
  );
}
