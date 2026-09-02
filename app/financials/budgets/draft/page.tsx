"use client";

import { useEffect, useMemo, useState } from "react";
import { StatPill, Pill, TONE_BLUE, TONE_NEUTRAL, TONE_GREEN, TONE_TEAL, TONE_AMBER, TONE_RED, type PillTone } from "../../../components/Pill";
import type { BudgetDraft, DraftSource } from "../../../../lib/financials/budgets/draft";
import type { LeaseAssumption } from "../../../../lib/financials/budgets/leasingAssumptions";

const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type SavePayload = { unitRef: string; kind: string | null; monthlyRent?: number; startMonth?: number };

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

  const [refreshTick, setRefreshTick] = useState(0);

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
  }, [key, year, growth, refreshTick]);

  // Save one unit's leasing assumption, then re-project the draft.
  async function saveAssumption(payload: { unitRef: string; kind: string | null; monthlyRent?: number; startMonth?: number }) {
    if (!draft?.leasing) return;
    await fetch("/api/financials/budgets/leasing-assumptions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: draft.budgetYear, propertyCode: draft.leasing.propertyCode, ...payload }),
    }).catch(() => {});
    setRefreshTick((n) => n + 1);
  }

  const label = useMemo(() => props.find((p) => p.key === key), [props, key]);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Budget Draft</h1>
        <span className="muted small">FY{year} · auto-seeded from the {year - 1} reprojection</span>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        A starting draft built from data we already have — expenses grown from this year’s reprojection and rental income projected from the rent roll’s in-place leases, so Nancy/Harry adjust instead of keying from scratch. Reimbursements (CAM/RET) are refined in the next step.
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
            <StatPill label="Total Revenue" value={money0(draft.rollups.totalRevenues.total)} sub={draft.leasing ? `${draft.leasing.inPlaceUnits} in-place leases` : "reproj placeholder"} />
            <StatPill label="Total Operating Expenses" value={money0(draft.rollups.totalOperatingExpenses.total)} sub={`grown ${growth >= 0 ? "+" : ""}${growth}%`} />
            <StatPill label="NOI" value={money0(draft.rollups.netOperatingIncome.total)} accent={draft.rollups.netOperatingIncome.total >= 0 ? "#15803d" : "#b91c1c"} />
          </div>

          {draft.leasing && (draft.leasing.expiring.length > 0 || draft.leasing.vacant.length > 0) && (
            <div className="card" style={{ borderColor: "rgba(217,119,6,0.45)", background: "rgba(217,119,6,0.05)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ ...secLabel, color: "#b45309" }}>Leasing assumptions — {draft.budgetYear}</div>
                <span className="muted small">{draft.leasing.assumptionsApplied} applied · rental income updates as you set them</span>
              </div>
              <p className="muted small" style={{ marginTop: 0 }}>
                Rental income holds current rents flat until you decide. For each expiring / holdover lease choose <b>renew</b> (hold or step to a new rent) or <b>vacate</b>; for vacant space set a <b>lease-up</b>. Revenue and NOI above re-project on save.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                {draft.leasing.expiring.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Expiring / holdover ({draft.leasing.expiring.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {draft.leasing.expiring.map((e) => (
                        <LeasingRow key={e.unitRef} mode="inplace"
                          unitRef={e.unitRef} title={`${e.tenant}`} sub={`${money0(e.monthlyRent)}/mo · ends ${e.leaseTo ?? "—"}`}
                          holdover={e.holdover} currentRent={e.monthlyRent} leaseTo={e.leaseTo}
                          assumption={e.assumption} onSave={saveAssumption} />
                      ))}
                    </div>
                  </div>
                )}
                {draft.leasing.vacant.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Vacant spaces ({draft.leasing.vacant.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {draft.leasing.vacant.map((v) => (
                        <LeasingRow key={v.unitRef} mode="vacant"
                          unitRef={v.unitRef} title={v.unitRef} sub={`${v.sqft.toLocaleString()} sf vacant`}
                          currentRent={0} leaseTo={null}
                          assumption={v.assumption} onSave={saveAssumption} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

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
            <b>Reproj +N%</b> = this year’s reprojected full-year expense grown by the assumption, month by month (seasonality preserved). <b>Leases</b> = rental income projected from the rent roll’s in-place leases (current rents held flat; expiring leases flagged above). <b>Reproj (flat)</b> = carried unchanged (reimbursements, other income, debt service). The middle column is the {draft.basisYear} reprojection it grew from. CAM/RET reimbursement estimates replace their placeholder in the next step.
          </p>
        </>
      )}
    </main>
  );
}

function LeasingRow({ mode, unitRef, title, sub, holdover, currentRent, leaseTo, assumption, onSave }: {
  mode: "inplace" | "vacant";
  unitRef: string; title: string; sub: string; holdover?: boolean;
  currentRent: number; leaseTo: string | null;
  assumption?: LeaseAssumption;
  onSave: (p: SavePayload) => void;
}) {
  const expMonth = (() => { const m = (leaseTo ?? "").match(/^(\d{1,2})\//); return m ? Number(m[1]) : 1; })();
  const [kind, setKind] = useState<string>(assumption?.kind ?? (mode === "vacant" ? "none" : "hold"));
  const [rent, setRent] = useState<string>(assumption?.monthlyRent != null ? String(assumption.monthlyRent) : "");
  const [month, setMonth] = useState<number>(assumption?.startMonth ?? (assumption?.kind === "vacate" ? expMonth : 1));

  function push(k = kind, r = rent, mo = month) {
    const apiKind = k === "hold" || k === "none" ? null : k;
    onSave({ unitRef, kind: apiKind, monthlyRent: r !== "" ? Number(r) : undefined, startMonth: mo });
  }

  const showRent = kind === "renew" || kind === "leaseup";
  const showMonth = kind === "renew" || kind === "vacate" || kind === "leaseup";
  const tone = kind === "vacate" ? TONE_RED : kind === "leaseup" ? TONE_GREEN : kind === "renew" ? TONE_BLUE : TONE_NEUTRAL;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 10px", borderRadius: 8, background: "var(--card)", border: "1px solid var(--border)" }}>
      <div style={{ minWidth: 190, flex: "1 1 190px" }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}><code style={{ fontSize: 12 }}>{unitRef}</code> {title} {holdover && <Pill tone={TONE_AMBER}>holdover</Pill>}</div>
        <div className="muted small">{sub}</div>
      </div>
      <select value={kind} onChange={(e) => { setKind(e.target.value); push(e.target.value); }} style={rowSel}>
        {mode === "inplace" ? (
          <>
            <option value="hold">Hold current</option>
            <option value="renew">Renew</option>
            <option value="vacate">Vacate</option>
          </>
        ) : (
          <>
            <option value="none">Leave vacant</option>
            <option value="leaseup">Lease up</option>
          </>
        )}
      </select>
      {showRent && (
        <input type="number" value={rent} placeholder={currentRent ? String(currentRent) : "rent/mo"} step={50}
          onChange={(e) => { setRent(e.target.value); }} onBlur={() => push()}
          style={{ ...rowSel, width: 110 }} title="New monthly rent" />
      )}
      {showMonth && (
        <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); push(kind, rent, Number(e.target.value)); }} style={rowSel}
          title={kind === "vacate" ? "Paid through this month, then $0" : "Effective month"}>
          {MONTHS_ABBR.map((mo, i) => <option key={mo} value={i + 1}>{kind === "vacate" ? `thru ${mo}` : `from ${mo}`}</option>)}
        </select>
      )}
      <Pill tone={tone}>{kind === "hold" ? "flat" : kind === "none" ? "vacant" : kind}</Pill>
    </div>
  );
}

const rowSel: React.CSSProperties = { borderRadius: 6, padding: "5px 8px", fontSize: 12.5, fontWeight: 600, border: "1px solid rgba(11,74,125,0.3)", background: "var(--card)", color: "#0b4a7d", cursor: "pointer" };
const selStyle: React.CSSProperties = { borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, border: "1px solid rgba(11,74,125,0.3)", background: "var(--card)", color: "#0b4a7d", cursor: "pointer" };
const tdL: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
