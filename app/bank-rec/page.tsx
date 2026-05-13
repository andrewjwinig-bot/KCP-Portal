"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UNIQUE_BANK_ACCOUNTS, type BankGroup, type UniqueBankAccount } from "../../lib/bank-rec/accounts";
import { BANK_REC_DUE_DAY, bankRecKey, bankRecPeriod, bankRecPeriodLabel, shiftPeriod } from "../../lib/bank-rec/util";

const BANK_ORDER: BankGroup[] = ["M&T", "JPM-Chase", "Liberty Bank"];
const COMMENT_AUTOSAVE_MS = 600;

export default function BankRecTrackerPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>(() => bankRecPeriod());
  const [openBanks, setOpenBanks] = useState<Record<BankGroup, boolean>>({
    "M&T": true, "JPM-Chase": true, "Liberty Bank": true,
  });

  const commentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestComments = useRef<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/bank-rec").then((r) => r.json()).catch(() => ({ checked: {} })),
      fetch("/api/bank-rec/comments").then((r) => r.json()).catch(() => ({ comments: {} })),
    ])
      .then(([c, com]) => {
        setChecked(c.checked ?? {});
        const initialComments = com.comments ?? {};
        setComments(initialComments);
        latestComments.current = initialComments;
      })
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

  // Deadline = 10th of the month AFTER the reconciled period.
  const periodDeadline = useMemo(() => {
    const [py, pm] = period.split("-").map(Number);
    return new Date(py, pm /* zero-indexed: pm = next month */, BANK_REC_DUE_DAY);
  }, [period]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueCount = periodDeadline < today ? remaining : 0;

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

  function updateComment(last4: string, value: string) {
    const key = bankRecKey(last4, period);
    setComments((prev) => {
      const next = { ...prev };
      if (value.trim() === "") delete next[key];
      else next[key] = value;
      latestComments.current = next;
      return next;
    });
    if (commentSaveTimer.current) clearTimeout(commentSaveTimer.current);
    commentSaveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/bank-rec/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comments: latestComments.current }),
        });
        if (!res.ok) throw new Error("Save failed");
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? "Save failed");
      }
    }, COMMENT_AUTOSAVE_MS);
  }

  // Group + sort: unreconciled first, reconciled at the bottom within each bank group.
  const grouped = useMemo(() => {
    const map = new Map<BankGroup, UniqueBankAccount[]>();
    for (const a of UNIQUE_BANK_ACCOUNTS) {
      if (!map.has(a.bank)) map.set(a.bank, []);
      map.get(a.bank)!.push(a);
    }
    return BANK_ORDER.filter((b) => map.has(b)).map((b) => {
      const sorted = [...map.get(b)!].sort((x, y) => {
        const xd = checked[bankRecKey(x.last4, period)] ? 1 : 0;
        const yd = checked[bankRecKey(y.last4, period)] ? 1 : 0;
        return xd - yd;
      });
      return { bank: b, accounts: sorted };
    });
  }, [checked, period]);

  return (
    <main>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 4 }}>
            Bank Rec Tracker
          </h1>
          <p className="muted small">Reconciliations due by the 10th of the following month</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div>COMMERCIAL</div><div>PROPERTIES</div>
          </div>
        </div>
      </div>

      {/* ── Month nav ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          className="btn"
          onClick={() => setPeriod((p) => shiftPeriod(p, -1))}
          style={{ padding: "5px 12px", fontWeight: 900, fontSize: 14 }}
          aria-label="Previous month"
        >
          ←
        </button>
        <span style={{ fontWeight: 800, fontSize: 16, minWidth: 130, textAlign: "center" }}>
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
        <span className="muted small" style={{ marginLeft: 6 }}>
          Due {periodDeadline.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        {error && <span style={{ color: "#b91c1c", fontSize: 12, marginLeft: 6 }}>· {error}</span>}
      </div>

      {/* ── Summary pills ────────────────────────────────────────────── */}
      <div className="pills" style={{ justifyContent: "flex-start", marginBottom: 16 }}>
        <div className="pill">
          <b>{totalAccounts}</b>
          <span className="muted small">Accounts</span>
        </div>
        <div className="pill" style={{ borderColor: "#16a34a", background: "rgba(22,163,74,0.06)" }}>
          <b style={{ color: "#16a34a" }}>{doneCount}</b>
          <span className="muted small">Reconciled</span>
        </div>
        <div className="pill">
          <b>{remaining}</b>
          <span className="muted small">Remaining</span>
        </div>
        {overdueCount > 0 && (
          <div className="pill" style={{ borderColor: "#dc2626", background: "rgba(220,38,38,0.06)" }}>
            <b style={{ color: "#dc2626" }}>{overdueCount}</b>
            <span className="muted small">Overdue</span>
          </div>
        )}
        {totalAccounts > 0 && (
          <div className="pill pill-total">
            <b>{pct}%</b>
            <span className="muted small">Complete</span>
          </div>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────── */}
      {totalAccounts > 0 && (
        <div style={{ height: 6, background: "var(--border)", borderRadius: 999, marginBottom: 22, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${pct}%`,
            background: doneCount === totalAccounts ? "#16a34a" : "var(--brand)",
            borderRadius: 999,
            transition: "width 0.3s ease",
          }} />
        </div>
      )}

      {/* ── Bank groups ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="card muted small">Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {grouped.map(({ bank, accounts }) => {
            const groupDone = accounts.filter((a) => checked[bankRecKey(a.last4, period)]).length;
            const open = openBanks[bank];
            return (
              <div key={bank} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setOpenBanks((prev) => ({ ...prev, [bank]: !prev[bank] }))}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "12px 16px",
                    background: "rgba(11,74,125,0.05)",
                    borderBottom: open ? "1px solid var(--border)" : "none",
                    border: "none", cursor: "pointer", textAlign: "left",
                    fontFamily: "inherit",
                  }}
                  aria-expanded={open}
                >
                  <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "0.02em" }}>{bank}</span>
                    <span className="muted small">{groupDone}/{accounts.length} reconciled</span>
                  </span>
                  <span style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
                </button>

                {open && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em" }}>
                      <th style={{ padding: "8px 14px", fontWeight: 700, width: 60 }}></th>
                      <th style={{ padding: "8px 14px", fontWeight: 700 }}>ACCOUNT NAME</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700, width: "10%" }}>ACCOUNT</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700, width: "22%" }}>BANK ACCOUNT KEY</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700, width: "30%" }}>COMMENTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((r) => {
                      const k = bankRecKey(r.last4, period);
                      const isDone = !!checked[k];
                      const comment = comments[k] ?? "";
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
                            {r.accountName}
                          </td>
                          <td style={{ padding: "10px 14px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: isDone ? "var(--muted)" : "var(--text)" }}>
                            {r.last4}
                          </td>
                          <td style={{ padding: "10px 14px", color: isDone ? "var(--muted)" : "var(--text)" }}>
                            {r.key}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <input
                              type="text"
                              value={comment}
                              onChange={(e) => updateComment(r.last4, e.target.value)}
                              placeholder="Add note…"
                              aria-label={`Comment for ${r.accountName}`}
                              style={{
                                width: "100%", padding: "6px 8px",
                                fontSize: 13, fontFamily: "inherit",
                                border: "1px solid var(--border)", borderRadius: 6,
                                background: "#fff", color: "var(--text)",
                                outline: "none",
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
