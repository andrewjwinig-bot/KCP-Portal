"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LOAN_GROUPS,
  buildSchedule,
  emptyLoan,
  summarizeLoan,
  todayISO,
  type Loan,
  type LoanGroup,
} from "@/lib/debt/amortization";
import { Calendar } from "@/app/components/Calendar";
import {
  Pill,
  StatPill,
  debtStatusTone,
  TONE_AMBER,
  TONE_NEUTRAL,
} from "@/app/components/Pill";

// ── formatting ───────────────────────────────────────────────────────────────

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function money2(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(n: number): string {
  return n.toFixed(2) + "%";
}
function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso || "—";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function monthYearShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso || "—";
  return `${m[2]}/${m[1].slice(2)}`;
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted)",
};

export default function DebtPage() {
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [editLoan, setEditLoan] = useState<Loan | null>(null);

  const today = todayISO();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/debt");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      setLoans(body.loans as Loan[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const persist = useCallback(async (next: Loan[]) => {
    setSaving(true);
    setLoans(next); // optimistic
    try {
      const res = await fetch("/api/debt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loans: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setLoans(body.loans as Loan[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      reload();
    } finally {
      setSaving(false);
    }
  }, [reload]);

  const toggleIO = useCallback((id: string) => {
    if (!loans) return;
    persist(loans.map((l) => (l.id === id ? { ...l, interestOnly: !l.interestOnly } : l)));
  }, [loans, persist]);

  const saveLoan = useCallback((loan: Loan) => {
    const base = loans ?? [];
    const exists = base.some((l) => l.id === loan.id);
    persist(exists ? base.map((l) => (l.id === loan.id ? loan : l)) : [...base, loan]);
    setEditLoan(null);
  }, [loans, persist]);

  const deleteLoan = useCallback((id: string) => {
    if (!loans) return;
    persist(loans.filter((l) => l.id !== id));
    setEditLoan(null);
    setScheduleId(null);
  }, [loans, persist]);

  // Loans grouped for the section-header layout. Empty groups are dropped.
  const grouped = useMemo(() => {
    const all = loans ?? [];
    return LOAN_GROUPS
      .map((group) => ({ group, rows: all.filter((l) => l.group === group) }))
      .filter((g) => g.rows.length > 0);
  }, [loans]);
  const totalVisible = grouped.reduce((s, g) => s + g.rows.length, 0);

  const portfolio = useMemo(() => {
    const all = loans ?? [];
    let outstanding = 0;
    let debtService = 0;
    let annualInterest = 0;
    let weightedRate = 0;
    for (const l of all) {
      const s = summarizeLoan(l, today);
      outstanding += s.projectedBalance;
      debtService += s.monthlyDebtService;
      annualInterest += s.annualInterest;
      weightedRate += s.projectedBalance * l.annualRatePct;
    }
    return {
      count: all.length,
      outstanding,
      debtService,
      annualInterest,
      avgRate: outstanding > 0 ? weightedRate / outstanding : 0,
    };
  }, [loans, today]);

  const scheduleLoan = useMemo(
    () => (loans ?? []).find((l) => l.id === scheduleId) ?? null,
    [loans, scheduleId],
  );

  return (
    <main>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Debt Tracker</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
            Schedule of Debt Outstanding. Balances project live.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() => setEditLoan(emptyLoan())}
          style={{ flexShrink: 0 }}
        >
          + Add Loan
        </button>
      </div>

      {error && (
        <div className="card" style={{ marginTop: 16, borderColor: "rgba(220,38,38,0.4)", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {/* Portfolio KPIs */}
      <div className="card" style={{ marginTop: 18 }}>
        <div style={SECTION_LABEL}>Portfolio — as of {prettyDate(today)}</div>
        <div className="pills">
          <StatPill label="Total Outstanding" value={money(portfolio.outstanding)} />
          <StatPill label="Loans" value={portfolio.count} />
          <StatPill label="Monthly Debt Service" value={money(portfolio.debtService)} />
          <StatPill label="Interest (next 12 mo)" value={money(portfolio.annualInterest)} accent="#b45309" />
          <StatPill label="Wtd. Avg Rate" value={pct(portfolio.avgRate)} />
        </div>
      </div>

      {/* Loan table */}
      <div className="card" style={{ marginTop: 14 }}>
        {loading ? (
          <p className="muted">Loading loans…</p>
        ) : totalVisible === 0 ? (
          <p className="muted">No loans yet.</p>
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Property / Partnership</th>
                  <th>Lender</th>
                  <th style={{ textAlign: "right" }}>Rate</th>
                  <th style={{ textAlign: "right" }}>Original</th>
                  <th style={{ textAlign: "right" }}>Current Balance</th>
                  <th style={{ textAlign: "right" }}>Monthly Pmt</th>
                  <th>Maturity</th>
                  <th>Status</th>
                  <th style={{ textAlign: "center" }}>Interest-Only</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {grouped.map(({ group, rows }, gi) => (
                  <Fragment key={group}>
                    <tr>
                      <td colSpan={10} style={{
                        paddingTop: gi === 0 ? 4 : 18, paddingBottom: 6,
                        background: "transparent", borderBottom: "none",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            fontSize: 13, fontWeight: 800, letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: groupTone(group).fg,
                            background: groupTone(group).bg,
                            border: `1px solid ${groupTone(group).border}`,
                            padding: "4px 12px", borderRadius: 999,
                          }}>{group}</span>
                          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{rows.length}</span>
                          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                        </div>
                      </td>
                    </tr>
                    {rows.map((l) => {
                      const s = summarizeLoan(l, today);
                      return (
                        <tr key={l.id}>
                          <td>
                            <button
                              className="linkBtn"
                              onClick={() => setScheduleId(l.id)}
                              style={{ textAlign: "left" }}
                            >
                              <div style={{ fontWeight: 800 }}>{l.partnership}</div>
                              <div className="small muted">
                                {l.property ? `#${l.property} · ` : ""}{l.collateral}
                              </div>
                            </button>
                          </td>
                          <td className="small">{l.lender}</td>
                          <td style={{ textAlign: "right" }}>{pct(l.annualRatePct)}</td>
                          <td style={{ textAlign: "right" }}>{money(l.originalBalance)}</td>
                          <td style={{ textAlign: "right", fontWeight: 800 }}>{money(s.projectedBalance)}</td>
                          <td style={{ textAlign: "right" }}>{money(s.monthlyDebtService)}</td>
                          <td className="small">{monthYearShort(l.maturityDate)}</td>
                          <td><Pill tone={debtStatusTone(s.status)}>{s.status}</Pill></td>
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={l.interestOnly}
                              onChange={() => toggleIO(l.id)}
                              disabled={saving}
                              aria-label="Interest only"
                              style={{ cursor: saving ? "default" : "pointer", width: 16, height: 16 }}
                            />
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              className="btn"
                              onClick={() => setEditLoan(l)}
                              style={{ padding: "5px 12px", fontSize: 13 }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ marginTop: 12 }}>
          Click a partnership to open its live amortization schedule. Check
          Interest-Only for loans currently paying interest only (e.g. JV III,
          NI&nbsp;LLC) — the schedule and debt service recompute instantly.
        </p>
      </div>

      {scheduleLoan && (
        <ScheduleModal loan={scheduleLoan} today={today} onClose={() => setScheduleId(null)} />
      )}
      {editLoan && (
        <LoanForm
          loan={editLoan}
          saving={saving}
          onSave={saveLoan}
          onDelete={(loans ?? []).some((l) => l.id === editLoan.id) ? deleteLoan : undefined}
          onClose={() => setEditLoan(null)}
        />
      )}
    </main>
  );
}

// Loan-group section header tones (mirrors the property page's category pills).
function groupTone(group: LoanGroup): { bg: string; fg: string; border: string } {
  return group === "Business Parks"
    ? { bg: "rgba(11,74,125,0.10)",  fg: "#0b4a7d", border: "rgba(11,74,125,0.35)" }
    : { bg: "rgba(13,148,136,0.10)", fg: "#0d9488", border: "rgba(13,148,136,0.35)" };
}

// ── amortization schedule modal ──────────────────────────────────────────────

function ScheduleModal({ loan, today, onClose }: { loan: Loan; today: string; onClose: () => void }) {
  const schedule = useMemo(() => buildSchedule(loan, today), [loan, today]);
  const summary = useMemo(() => summarizeLoan(loan, today), [loan, today]);
  const currentRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <div className="modalTitle">{loan.partnership}</div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {loan.lender} · {pct(loan.annualRatePct)} · {loan.amortYears}-yr amortization ·
              matures {monthYearShort(loan.maturityDate)}
            </div>
          </div>
          <button className="btn" onClick={onClose} style={{ padding: "6px 14px" }}>Close</button>
        </div>

        <div className="pills" style={{ marginTop: 4 }}>
          <StatPill label="Current Balance" value={money(summary.projectedBalance)} />
          <StatPill label="Monthly Principal" value={money2(summary.nextPayment?.principal ?? 0)} />
          <StatPill label="Monthly Interest" value={money2(summary.nextPayment?.interest ?? 0)} accent="#b45309" />
          <StatPill label="Total Monthly Payment" value={money2(summary.monthlyDebtService)} />
        </div>

        <div style={{ ...SECTION_LABEL, marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <span>Amortization Schedule</span>
          {loan.interestOnly && <Pill tone={TONE_AMBER}>Interest-Only</Pill>}
        </div>

        <div className="tableWrap" style={{ maxHeight: 420, overflow: "auto" }}>
          <table className="modalTable">
            <thead>
              <tr>
                <th>Payment Date</th>
                <th style={{ textAlign: "right" }}>Opening</th>
                <th style={{ textAlign: "right" }}>Payment</th>
                <th style={{ textAlign: "right" }}>Interest</th>
                <th style={{ textAlign: "right" }}>Principal</th>
                <th style={{ textAlign: "right" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((r) => (
                <tr
                  key={r.index}
                  ref={r.isCurrent ? currentRowRef : undefined}
                  style={{
                    background: r.isCurrent
                      ? "rgba(11,74,125,0.12)"
                      : r.isPast
                        ? "rgba(15,23,42,0.03)"
                        : undefined,
                    color: r.isPast && !r.isCurrent ? "var(--muted)" : undefined,
                  }}
                >
                  <td style={{ fontWeight: r.isCurrent ? 800 : 600 }}>
                    {prettyDate(r.date)}
                    {r.isCurrent && (
                      <span style={{ marginLeft: 8 }}>
                        <Pill tone={TONE_NEUTRAL}>NEXT DUE</Pill>
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>{money2(r.openingBalance)}</td>
                  <td style={{ textAlign: "right" }}>{money2(r.payment)}</td>
                  <td style={{ textAlign: "right" }}>{money2(r.interest)}</td>
                  <td style={{ textAlign: "right" }}>{money2(r.principal)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{money2(r.closingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loan.notes && (
          <div style={{ marginTop: 14 }}>
            <div style={SECTION_LABEL}>Notes</div>
            <p className="small" style={{ marginTop: 6 }}>{loan.notes}</p>
          </div>
        )}
        <p className="small muted" style={{ marginTop: 12 }}>
          Projected from a known balance of {money(loan.anchorBalance)} as of{" "}
          {prettyDate(loan.anchorDate)}. Past rows are shaded; the highlighted
          row is the next payment due.
        </p>
      </div>
    </div>
  );
}

// ── add / edit loan form ─────────────────────────────────────────────────────

function LoanForm({
  loan,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  loan: Loan;
  saving: boolean;
  onSave: (l: Loan) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Loan>(loan);
  const isNew = !onDelete;

  function set<K extends keyof Loan>(key: K, value: Loan[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const fieldStyle: React.CSSProperties = {
    padding: "9px 11px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    fontSize: 14,
    width: "100%",
  };
  const labelStyle: React.CSSProperties = { ...SECTION_LABEL, display: "block", marginBottom: 5 };

  function numField(key: keyof Loan, label: string, step = "0.01") {
    return (
      <label style={{ display: "block" }}>
        <span style={labelStyle}>{label}</span>
        <input
          type="number"
          step={step}
          value={(draft[key] as number) || ""}
          onChange={(e) => set(key, Number(e.target.value) as never)}
          style={fieldStyle}
        />
      </label>
    );
  }
  function textField(key: keyof Loan, label: string) {
    return (
      <label style={{ display: "block" }}>
        <span style={labelStyle}>{label}</span>
        <input
          type="text"
          value={draft[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
          style={fieldStyle}
        />
      </label>
    );
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{isNew ? "Add Loan" : "Edit Loan"}</div>
          <button className="btn" onClick={onClose} style={{ padding: "6px 14px" }}>Cancel</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {textField("partnership", "Partnership / Borrower")}
          {textField("property", "Property Code")}
          {textField("collateral", "Collateral")}
          {textField("lender", "Lender")}

          <label style={{ display: "block" }}>
            <span style={labelStyle}>Group</span>
            <select
              value={draft.group}
              onChange={(e) => set("group", e.target.value as LoanGroup)}
              style={fieldStyle}
            >
              {LOAN_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          {numField("annualRatePct", "Interest Rate (%)")}

          {numField("originalBalance", "Original Loan Balance", "1")}
          {numField("amortYears", "Amortization (years)", "1")}

          {numField("scheduledPayment", "Monthly P&I Payment")}
          {numField("anchorBalance", "Known Balance", "1")}

          <label style={{ display: "block" }}>
            <span style={labelStyle}>Known Balance As Of</span>
            <Calendar
              variant="card"
              value={draft.anchorDate}
              onChange={(iso) => set("anchorDate", iso)}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Maturity Date</span>
            <Calendar
              variant="card"
              value={draft.maturityDate}
              onChange={(iso) => set("maturityDate", iso)}
            />
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={draft.interestOnly}
            onChange={(e) => set("interestOnly", e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            Interest-only — pay monthly interest, no principal reduction
          </span>
        </label>

        <label style={{ display: "block", marginTop: 14 }}>
          <span style={labelStyle}>Notes</span>
          <textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
          {onDelete ? (
            <button
              className="btn"
              onClick={() => onDelete(draft.id)}
              disabled={saving}
              style={{ color: "#b91c1c", borderColor: "rgba(220,38,38,0.35)" }}
            >
              Delete
            </button>
          ) : <span />}
          <button
            className="btn primary"
            onClick={() => onSave(draft)}
            disabled={saving || !draft.partnership.trim()}
          >
            {saving ? "Saving…" : isNew ? "Add Loan" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
