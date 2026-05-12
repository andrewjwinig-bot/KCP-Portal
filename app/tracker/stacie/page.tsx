"use client";

import { useEffect, useMemo, useState } from "react";
import { FREQUENCY_LABELS, FREQUENCY_ORDER, STACIE_TASKS, checkedKey, currentPeriod, type Frequency } from "../../../lib/stacie-tasks";

export default function StacieTrackerPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openFreqs, setOpenFreqs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FREQUENCY_ORDER.map((f) => [f, true])),
  );

  // Load on mount
  useEffect(() => {
    fetch("/api/stacie-tasks").then((r) => r.json()).then((j) => setChecked(j.checked ?? {})).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Group tasks by frequency once
  const byFreq = useMemo(() => {
    const groups: Record<Frequency, typeof STACIE_TASKS> = {
      weekly: [], monthly: [], quarterly: [], semiannual: [], annual: [], ongoing: [], eoy: [],
    };
    for (const t of STACIE_TASKS) groups[t.frequency].push(t);
    return groups;
  }, []);

  // Toggle a single task's completion for its current period
  async function toggleTask(taskId: string, freq: Frequency) {
    const period = currentPeriod(freq);
    const key = checkedKey(taskId, period);
    const next = { ...checked };
    if (next[key]) delete next[key];
    else next[key] = true;
    setChecked(next);
    try {
      const res = await fetch("/api/stacie-tasks", {
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

  function toggleFreq(f: Frequency) {
    setOpenFreqs((prev) => ({ ...prev, [f]: !prev[f] }));
  }

  function isChecked(taskId: string, freq: Frequency): boolean {
    return !!checked[checkedKey(taskId, currentPeriod(freq))];
  }

  function freqCount(freq: Frequency): { total: number; done: number } {
    const tasks = byFreq[freq];
    let done = 0;
    for (const t of tasks) if (isChecked(t.id, freq)) done++;
    return { total: tasks.length, done };
  }

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h1 style={{ margin: 0 }}>Stacie&rsquo;s Tracker</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </header>

      <div className="card">
        <b style={{ fontSize: 17 }}>Recurring Tasks</b>
        <p className="muted small" style={{ marginTop: 4 }}>
          Checkboxes auto-reset each new period (week, month, quarter, etc.). State syncs across devices.
          {error && <span style={{ color: "#b91c1c", marginLeft: 8 }}>· {error}</span>}
        </p>

        {loading ? (
          <div className="muted small" style={{ marginTop: 12 }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
            {FREQUENCY_ORDER.map((freq) => {
              const tasks = byFreq[freq];
              if (!tasks.length) return null;
              const { total, done } = freqCount(freq);
              const open = openFreqs[freq];
              return (
                <div key={freq} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <button
                    type="button"
                    onClick={() => toggleFreq(freq)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                      width: "100%", padding: "14px 16px",
                      background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{FREQUENCY_LABELS[freq]}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>
                        ({done}/{total})
                      </span>
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
                  </button>

                  {open && (
                    <div style={{ borderTop: "1px solid var(--border)" }}>
                      {tasks.map((t, i) => {
                        const checked = isChecked(t.id, freq);
                        return (
                          <label
                            key={t.id}
                            htmlFor={`task-${t.id}`}
                            style={{
                              display: "grid", gridTemplateColumns: "32px 1fr", gap: 12,
                              padding: "12px 16px",
                              borderTop: i === 0 ? undefined : "1px solid var(--border)",
                              cursor: "pointer",
                              alignItems: "start",
                            }}
                          >
                            <input
                              id={`task-${t.id}`}
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTask(t.id, freq)}
                              style={{ width: 20, height: 20, marginTop: 2, cursor: "pointer" }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div style={{
                                fontSize: 14, fontWeight: 600,
                                color: checked ? "var(--muted)" : "var(--text)",
                                textDecoration: checked ? "line-through" : "none",
                              }}>
                                {t.title}
                              </div>
                              {t.instructions && (
                                <div className="muted small" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                                  {t.instructions}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
