"use client";

import { useEffect, useMemo, useState } from "react";
import { StatPill, Pill, TONE_BLUE, TONE_NEUTRAL, TONE_GREEN, TONE_TEAL, type PillTone } from "../../../components/Pill";
import type { BudgetDraft, DraftSource } from "../../../../lib/financials/budgets/draft";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

function sourceBadge(source: DraftSource, growthPct: number): { tone: PillTone; text: string } {
  switch (source) {
    case "reproj-growth": return { tone: TONE_BLUE, text: `Reproj ${growthPct >= 0 ? "+" : ""}${growthPct}%` };
    case "reproj-flat": return { tone: TONE_NEUTRAL, text: "Reproj (flat)" };
    case "leases": return { tone: TONE_GREEN, text: "Leases" };
    case "cam-estimate": return { tone: TONE_TEAL, text: "CAM est." };
  }
}

type PropRow = { key: string; propertyCode: string; entityName: string };

export default function BudgetDraftPage() {
  const nextYear = new Date().getFullYear() + 1;
  const [props, setProps] = useState<PropRow[]>([]);
  const [key, setKey] = useState<string>("");
  const [year, setYear] = useState(nextYear);
  const [growth, setGrowth] = useState(3);
  const [draft, setDraft] = useState<BudgetDraft | null>(null);
  const [missingBasis, setMissingBasis] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/financials/budgets/draft", { cache: "no-store" })
      .then((r) => r.json()).then((j) => { setProps(j.properties ?? []); if (j.properties?.[0]) setKey(j.properties[0].key); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!key) return;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/financials/budgets/draft?key=${encodeURIComponent(key)}&year=${year}&growth=${growth}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (j.missingBasis) { setDraft(null); setMissingBasis(true); } else { setDraft(j); setMissingBasis(false); } })
        .catch(() => { setDraft(null); setMissingBasis(false); })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [key, year, growth]);

  const label = useMemo(() => props.find((p) => p.key === key), [props, key]);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Budget Draft</h1>
        <span className="muted small">FY{year} · auto-seeded from the {year - 1} reprojection</span>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        A starting draft built from data we already have — expenses grown from this year’s reprojection, so Nancy/Harry adjust instead of keying from scratch. Revenue is a placeholder until the lease-based projection lands.
      </p>

      {/* Controls */}
      <div className="card" style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={secLabel}>Building / Fund</span>
          <select value={key} onChange={(e) => setKey(e.target.value)} style={selStyle}>
            {props.map((p) => <option key={p.key} value={p.key}>{p.propertyCode} — {p.entityName}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={secLabel}>Budget Year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selStyle}>
            {[nextYear, nextYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={secLabel}>Expense Growth %</span>
          <input type="number" value={growth} step={0.5} onChange={(e) => setGrowth(Number(e.target.value))}
            style={{ ...selStyle, width: 100 }} />
        </label>
        <span className="muted small" style={{ paddingBottom: 8 }}>Applied to every expense line; you’ll fine-tune per line next.</span>
      </div>

      {loading && <div className="card muted">Building draft…</div>}

      {missingBasis && !loading && (
        <div className="card" style={{ borderColor: "rgba(217,119,6,0.5)", background: "rgba(217,119,6,0.07)", color: "#b45309" }}>
          No {year - 1} reprojection is available for {label?.propertyCode ?? key} yet — import its {year - 1} GL so the draft has an expense baseline to grow from.
        </div>
      )}

      {draft && !loading && (
        <>
          <div className="pills">
            <StatPill label="Total Revenue" value={money0(draft.rollups.totalRevenues.total)} sub="placeholder" />
            <StatPill label="Total Operating Expenses" value={money0(draft.rollups.totalOperatingExpenses.total)} sub={`grown ${growth >= 0 ? "+" : ""}${growth}%`} />
            <StatPill label="NOI" value={money0(draft.rollups.netOperatingIncome.total)} accent={draft.rollups.netOperatingIncome.total >= 0 ? "#15803d" : "#b91c1c"} />
          </div>

          {draft.sections.map((sec) => (
            <div key={sec.name} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ ...secLabel, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>{sec.name}</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <tbody>
                  {sec.lines.map((l) => {
                    const b = sourceBadge(l.source, growth);
                    return (
                      <tr key={l.label + l.mask}>
                        <td style={tdL}>{l.label}</td>
                        <td style={{ ...tdL, width: 130 }}><Pill tone={b.tone}>{b.text}</Pill></td>
                        <td style={{ ...tdR, color: "var(--muted)" }}>{l.basisTotal ? money0(l.basisTotal) : ""}</td>
                        <td style={tdR}>{money0(l.total)}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <td style={{ ...tdL, fontWeight: 800 }} colSpan={3}>{sec.name} — Total</td>
                    <td style={{ ...tdR, fontWeight: 800 }}>{money0(sec.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          <p className="muted small">
            <b>Reproj +N%</b> = this year’s reprojected full-year expense grown by the assumption, month by month (seasonality preserved). <b>Reproj (flat)</b> = carried unchanged (revenue placeholders, debt service). The middle column is the {draft.basisYear} reprojection it grew from. Lease-based revenue and CAM/RET estimates replace the placeholders in the next steps.
          </p>
        </>
      )}
    </main>
  );
}

const selStyle: React.CSSProperties = { borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, border: "1px solid rgba(11,74,125,0.3)", background: "var(--card)", color: "#0b4a7d", cursor: "pointer" };
const tdL: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
