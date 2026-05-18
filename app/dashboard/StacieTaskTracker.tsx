"use client";

// Stacie's recurring task tracker, embedded at the foot of her dashboard.
// Checkboxes are period-bucketed and synced to /api/stacie-tasks — the
// same store the full /tracker page uses.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  STACIE_TASKS,
  FREQUENCY_LABELS,
  FREQUENCY_ORDER,
  checkedKey,
  currentPeriod,
  type Frequency,
  type StacieTask,
} from "../../lib/stacie-tasks";
import { UNIQUE_BANK_ACCOUNTS } from "../../lib/bank-rec/accounts";
import { bankRecKey, bankRecPeriod } from "../../lib/bank-rec/util";

export default function StacieTaskTracker({ order = 0 }: { order?: number }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [bankStmtMap, setBankStmtMap] = useState<Record<string, boolean>>({});
  const [bankRecMap, setBankRecMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/stacie-tasks")
      .then((r) => r.json())
      .then((j) => setChecked(j.checked ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/bank-rec/statements").then((r) => r.json()).then((j) => setBankStmtMap(j.statements ?? {})).catch(() => {});
    fetch("/api/bank-rec").then((r) => r.json()).then((j) => setBankRecMap(j.checked ?? {})).catch(() => {});
  }, []);

  const byFreq = useMemo(() => {
    const groups: Record<Frequency, StacieTask[]> = {
      weekly: [], monthly: [], quarterly: [], semiannual: [], annual: [], ongoing: [], eoy: [],
    };
    for (const t of STACIE_TASKS) {
      if ((t.owner ?? "stacie") === "stacie") groups[t.frequency].push(t);
    }
    return groups;
  }, []);

  const tasks = useMemo(
    () => STACIE_TASKS.filter((t) => (t.owner ?? "stacie") === "stacie"),
    [],
  );
  const doneCount = tasks.filter((t) => !!checked[checkedKey(t.id, currentPeriod(t.frequency))]).length;

  async function toggle(t: StacieTask) {
    const key = checkedKey(t.id, currentPeriod(t.frequency));
    const next = { ...checked };
    if (next[key]) delete next[key];
    else next[key] = true;
    setChecked(next);
    try {
      await fetch("/api/stacie-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: next }),
      });
    } catch { /* optimistic — ignore */ }
  }

  function bankProgress(kind: "statements" | "reconciled"): { done: number; total: number } {
    const period = bankRecPeriod();
    const map = kind === "statements" ? bankStmtMap : bankRecMap;
    const done = UNIQUE_BANK_ACCOUNTS.filter((a) => map[bankRecKey(a.last4, period)]).length;
    return { done, total: UNIQUE_BANK_ACCOUNTS.length };
  }

  return (
    <div className="card" style={{ gridColumn: "1 / -1", order }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
          Task Tracker
          {!loading && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
              {doneCount}/{tasks.length} done
            </span>
          )}
        </div>
        <Link href="/tracker" style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", textDecoration: "none" }}>
          Open Tracker →
        </Link>
      </div>

      {loading ? (
        <div className="muted small">Loading…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, alignItems: "start" }}>
          {FREQUENCY_ORDER.filter((f) => byFreq[f].length > 0).map((freq) => (
            <div key={freq}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
                {FREQUENCY_LABELS[freq]}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {byFreq[freq].map((t) => {
                  const done = !!checked[checkedKey(t.id, currentPeriod(t.frequency))];
                  const prog = t.bankRecProgress ? bankProgress(t.bankRecProgress) : null;
                  return (
                    <label
                      key={t.id}
                      title={t.instructions || undefined}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        padding: "7px 9px", borderRadius: 7,
                        border: "1px solid var(--border)",
                        background: done ? "rgba(22,163,74,0.06)" : "#fafafa",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => toggle(t)}
                        style={{ marginTop: 2, flexShrink: 0, cursor: "pointer" }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 600, lineHeight: 1.35,
                          color: done ? "var(--muted)" : "var(--text)",
                          textDecoration: done ? "line-through" : "none",
                        }}>
                          {t.title}
                        </div>
                        {prog && (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ height: 4, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden" }}>
                              <div style={{
                                height: "100%", borderRadius: 999,
                                width: `${prog.total > 0 ? (prog.done / prog.total) * 100 : 0}%`,
                                background: prog.done >= prog.total ? "#16a34a" : "#0b4a7d",
                              }} />
                            </div>
                            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                              {prog.done}/{prog.total} {t.bankRecProgress === "statements" ? "downloaded" : "reconciled"}
                            </div>
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
