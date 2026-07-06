"use client";

// Interim ("as-of month") CAM/RET reconciliation — for a mid-year move-out.
// Pick a building (office or retail) + tenant + as-of month; the statement
// recovers the tenant's share of the YTD increase over a prorated base, less
// billed. Former (vacated) tenants who've dropped off the rent roll can be
// entered here too, with optional YTD-expense + escrow overrides.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { drawTenantStatement } from "@/lib/cam/office/statementPdf";
import { drawRetailStatement } from "@/lib/cam/retail/statementPdf";
import type { TenantReconResult } from "@/lib/cam/office/types";
import type { RetailTenantResult } from "@/lib/cam/retail/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Percent to at most 2 decimals, trailing zeros dropped (2.2626… → "2.26", 5 → "5"). */
function pct2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return String(Number(n.toFixed(2)));
}
function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}

type ScheduleLine = { glAccount: string; label: string; baseCost: number; actual: number; netIncrease: number };
type Result = TenantReconResult & { occupiedMonths: number; asOfMonth: number; unpostedMonths: number };
type RetailResult = RetailTenantResult & { occupiedMonths: number; asOfMonth: number; unpostedMonths: number };
type Meta = { property: string; propertyName: string; unitRef: string; name: string; year: number; asOfMonth: number; effectiveThrough: number; occupiedMonths: number; unpostedMonths: number; maxPosted: number; startMonth: number; leaseFrom: string | null; leaseTo: string | null; sqft: number; opexMonth: number; reTaxMonth: number; baseYear?: number; proRataPct: number; grossUp?: boolean; glAsOf: string | null; manual?: boolean };
type Tenant = { unitRef: string; name: string; leaseTo: string | null; expiresInYear: number | null };

type Draft = {
  unitRef: string; name: string; sqft: string; leaseFrom: string; vacatedISO: string; opexMonth: string; reTaxMonth: string;
  baseYear: string; noBaseStop: boolean; grossUp: boolean; proRataPct: string;
  camPrs: string; insPrs: string; retPrs: string; adminFeePct: string; retDiscountPct: string;
  opexActualOverride: string; retActualOverride: string; insActualOverride: string;
  camEscrowOverride: string; insEscrowOverride: string; retEscrowOverride: string;
};
const emptyDraft: Draft = {
  unitRef: "", name: "", sqft: "", leaseFrom: "", vacatedISO: "", opexMonth: "", reTaxMonth: "",
  baseYear: "", noBaseStop: false, grossUp: true, proRataPct: "",
  camPrs: "", insPrs: "", retPrs: "", adminFeePct: "", retDiscountPct: "",
  opexActualOverride: "", retActualOverride: "", insActualOverride: "",
  camEscrowOverride: "", insEscrowOverride: "", retEscrowOverride: "",
};

const selectStyle: React.CSSProperties = { borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, border: "1px solid rgba(11,74,125,0.3)", background: "var(--card)", color: "#0b4a7d", cursor: "pointer" };
const inputStyle: React.CSSProperties = { borderRadius: 6, padding: "8px 10px", fontSize: 13, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", width: "100%", boxSizing: "border-box" };

/** "YYYY-MM-DD" → "M/D/YYYY" (the format the recon engine + rent roll use). */
function isoToUS(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : iso;
}
const numTd: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, width: wide ? 220 : 130 }}>
      <span>{label}{hint ? <span className="muted" style={{ fontWeight: 400 }}> {hint}</span> : null}</span>
      {children}
    </label>
  );
}

function BalanceRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontWeight: strong ? 800 : 500, fontSize: strong ? 14 : 13 }}>
      <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
function FinalBalanceRow({ label, value }: { label: string; value: number }) {
  const owed = value > 0.5; const credit = value < -0.5;
  const bg = owed ? "rgba(217,119,6,0.12)" : credit ? "rgba(21,128,61,0.12)" : "rgba(15,23,42,0.04)";
  const fg = owed ? "#b45309" : credit ? "#15803d" : "var(--text)";
  const border = owed ? "#d97706" : credit ? "#15803d" : "var(--border)";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, padding: "8px 12px", borderRadius: 8, background: bg, border: `1.5px solid ${border}`, fontWeight: 800 }}>
      <span>{label}</span><span style={{ color: fg, fontVariantNumeric: "tabular-nums" }}>{money(value)}{credit ? " (credit)" : owed ? " (due)" : ""}</span>
    </div>
  );
}

function Column({ title, lines, base, actual, net, due, escrow, balance, proRataPct, occupiedMonths, asOfLabel, reconYear, monthly }: {
  title: string; lines: ScheduleLine[]; base: number; actual: number; net: number; due: number; escrow: number; balance: number;
  proRataPct: number; occupiedMonths: number; asOfLabel: string; reconYear: number; monthly: number;
}) {
  return (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div style={{ ...secLabel, color: "#0b4a7d", marginBottom: 6 }}>{title}</div>
      <table style={{ width: "100%", fontSize: 12, marginBottom: 8 }}>
        <thead>
          <tr style={{ color: "var(--muted)", textAlign: "left" }}>
            <th style={{ textAlign: "left", paddingRight: 6 }}>Acct</th>
            <th style={{ textAlign: "left", width: "100%" }}>Expense</th>
            <th style={numTd}>Base ×{occupiedMonths}/12</th>
            <th style={numTd}>{asOfLabel} Actual</th>
            <th style={numTd}>Net Incr.</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.glAccount}>
              <td style={{ whiteSpace: "nowrap" }}><code style={{ fontSize: 11 }}>{l.glAccount.replace(/-95$/, "")}</code></td>
              <td>{l.label}</td>
              <td style={numTd}>{money(l.baseCost)}</td>
              <td style={numTd}>{money(l.actual)}</td>
              <td style={{ ...numTd, color: l.netIncrease > 0 ? "#15803d" : "var(--muted)" }}>{money(l.netIncrease)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 800, borderTop: "1px solid var(--border)" }}>
            <td /><td>Total</td>
            <td style={numTd}>{money(base)}</td>
            <td style={numTd}>{money(actual)}</td>
            <td style={numTd}>{money(net)}</td>
          </tr>
        </tbody>
      </table>
      <BalanceRow label="Net increase over prorated base" value={money(net)} />
      <BalanceRow label={`× Pro-rata share (${pct2(proRataPct)}%)`} value={money(due)} />
      <BalanceRow label={`Less: Billed (${money(monthly)}/mo × ${occupiedMonths})`} value={money(-escrow)} />
      <FinalBalanceRow label={`${title} Balance`} value={balance} />
    </div>
  );
}

// Amber treatment for an essential manual cell that's still empty — guides the
// user to the values that aren't populated from elsewhere.
const NEEDS = { border: "#d97706", bg: "rgba(217,119,6,0.07)" };
function needsStyle(empty: boolean): React.CSSProperties {
  return empty ? { borderColor: NEEDS.border, background: NEEDS.bg } : {};
}

const bareInput: React.CSSProperties = {
  border: "none", background: "transparent", outline: "none", textAlign: "right",
  width: "100%", fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text)", padding: 0, fontFamily: "inherit",
};
function adornBox(width: number, highlight?: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 3, width, boxSizing: "border-box",
    border: `1px solid ${highlight ? NEEDS.border : "var(--border)"}`, borderRadius: 6,
    background: highlight ? NEEDS.bg : "var(--card)", padding: "3px 7px",
  };
}

/** Group digits with thousands separators for display in a text input, keeping
 *  any trailing decimal the user is mid-typing. "" stays "". */
function fmtThousands(s: string): string {
  const cleaned = String(s).replace(/[^0-9.]/g, "");
  if (cleaned === "") return "";
  const [intPart, ...rest] = cleaned.split(".");
  const n = Number(intPart);
  const intFmt = Number.isFinite(n) ? n.toLocaleString("en-US") : intPart;
  return rest.length ? `${intFmt}.${rest.join("")}` : intFmt;
}

/** A unified "$ 1,234" field — looks like one input. `highlight` tints it amber
 *  when it still needs a value. Stores the raw digit string via onChange. */
function MoneyInput({ value, onChange, width = 100, highlight }: { value: string; onChange: (raw: string) => void; width?: number; highlight?: boolean }) {
  return (
    <span style={adornBox(width, highlight)}>
      <span style={{ color: "var(--muted)", fontSize: 12 }}>$</span>
      <input value={fmtThousands(value)} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" style={bareInput} />
    </span>
  );
}

/** A unified "1.20 %" field. */
function PctInput({ value, onChange, width = 72, highlight }: { value: string; onChange: (raw: string) => void; width?: number; highlight?: boolean }) {
  return (
    <span style={adornBox(width, highlight)}>
      <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0.00" style={bareInput} />
      <span style={{ color: "var(--muted)", fontSize: 12 }}>%</span>
    </span>
  );
}

// A manual office tenant's statement rendered as a live worksheet: pick the
// base year (re-pulls the building's real base-year expenses), type the
// pro-rata, override any "Actual" line, and enter escrow — everything
// recomputes in real time. Bridges manual entry with the auto recon by leaning
// on the same expense history + GL the roster tenants use.
function EditableOfficeStatement({ r, meta, baseYears, onBaseYear }: {
  r: Result; meta: Meta; baseYears: number[]; onBaseYear: (y: string) => void;
}) {
  const [pr, setPr] = useState(r.proRataPct ? String(r.proRataPct) : "");
  const [actualOv, setActualOv] = useState<Record<string, string>>({});
  const [retActualOv, setRetActualOv] = useState<string | null>(null);
  const [opexEsc, setOpexEsc] = useState(r.opexEscrow ? String(r.opexEscrow) : "");
  const [retEsc, setRetEsc] = useState(r.retEscrow ? String(r.retEscrow) : "");

  const num = (s: string) => { const n = Number(String(s).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
  const prF = num(pr) / 100;
  const asOfLabel = MONTHS[r.asOfMonth - 1].slice(0, 3);

  const lines = r.opexLines.map((l) => {
    const actualStr = actualOv[l.glAccount] ?? String(Math.round(l.actual));
    const a = num(actualStr);
    return { ...l, actualStr, a, net: Math.max(0, a - l.baseCost) };
  });
  const opexBase = r.opexBaseTotal;
  const opexActual = lines.reduce((s, l) => s + l.a, 0);
  const opexNet = lines.reduce((s, l) => s + l.net, 0);
  const opexDue = opexNet * prF;
  const opexEscN = num(opexEsc);
  const opexBal = opexDue - opexEscN;

  const retActualStr = retActualOv ?? String(Math.round(r.retLine.actual));
  const retA = num(retActualStr);
  const retNet = Math.max(0, retA - r.retLine.baseCost);
  const retDue = retNet * prF;
  const retEscN = num(retEsc);
  const retBal = retDue - retEscN;
  const totalBal = opexBal + retBal;

  const editedResult: Result = {
    ...r,
    proRataPct: num(pr),
    opexLines: lines.map((l) => ({ glAccount: l.glAccount, label: l.label, baseCost: l.baseCost, actual: l.a, netIncrease: l.net })),
    opexBaseTotal: opexBase, opexActualTotal: opexActual, opexNetIncrease: opexNet,
    opexAmountDue: opexDue, opexEscrow: opexEscN, opexBalance: opexBal,
    retLine: { ...r.retLine, actual: retA, netIncrease: retNet },
    retAmountDue: retDue, retEscrow: retEscN, retBalance: retBal,
  };

  const downloadPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const asOf = `${MONTHS[r.asOfMonth - 1]} ${meta.year}`;
    drawTenantStatement(doc, editedResult, meta.year, `${meta.property} — ${meta.propertyName}`, undefined, {
      subtitle: `Interim Statement (manual) · as of ${asOf}`,
      baseColLabel: `B/Y ${r.noBaseStop ? "—" : r.baseYear} ×${r.occupiedMonths}/12`,
      actualColLabel: `${asOfLabel} YTD`,
      footerRight: `Interim CAM / RET · Suite ${r.suite}`,
      footnotes: [`Manual interim reconciliation for ${r.occupiedMonths} occupied month${r.occupiedMonths > 1 ? "s" : ""} of ${meta.year}; the base year is prorated to the same period.`],
    });
    doc.save(`${meta.property}_${meta.year}_${r.name.replace(/[^\w]+/g, "_")}_Interim_CAM_RET.pdf`);
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{r.name} <code style={{ fontSize: 13 }}>{r.unitRef}</code></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0b4a7d" }}>Interim CAM/RET · as of {MONTHS[r.asOfMonth - 1]} {meta.year}</div>
          <button className="btn primary" onClick={downloadPdf} style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>Download PDF</button>
        </div>
      </div>
      <div className="muted small" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>Base year</span>
        <select value={r.noBaseStop ? "" : String(r.baseYear)} disabled={r.noBaseStop}
          onChange={(e) => onBaseYear(e.target.value)}
          style={{ width: 86, padding: "3px 7px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", color: "var(--text)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}>
          {r.noBaseStop && <option value="">NNN</option>}
          {baseYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span>· pro-rata</span>
        <PctInput value={pr} onChange={setPr} highlight={pr.trim() === ""} />
        <span>· occupied <b>{r.occupiedMonths}</b> of 12 months · {meta.sqft.toLocaleString()} sf</span>
        <span style={{ marginLeft: "auto", color: "#b45309", fontWeight: 600 }}>Amber cells need your input · recomputes live</span>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* CAM / Operating Expenses */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ ...secLabel, color: "#0b4a7d", marginBottom: 6 }}>CAM / Operating Expenses</div>
          <table style={{ width: "100%", fontSize: 12, marginBottom: 8 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th style={{ textAlign: "left", paddingRight: 6 }}>Acct</th>
                <th style={{ textAlign: "left", width: "100%" }}>Expense</th>
                <th style={numTd}>Base ×{r.occupiedMonths}/12</th>
                <th style={numTd}>{asOfLabel} Actual</th>
                <th style={numTd}>Net Incr.</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.glAccount}>
                  <td style={{ whiteSpace: "nowrap" }}><code style={{ fontSize: 11 }}>{l.glAccount.replace(/-95$/, "")}</code></td>
                  <td>{l.label}</td>
                  <td style={numTd}>{money(l.baseCost)}</td>
                  <td style={numTd}>
                    <MoneyInput value={l.actualStr} onChange={(raw) => setActualOv((o) => ({ ...o, [l.glAccount]: raw }))} />
                  </td>
                  <td style={{ ...numTd, color: l.net > 0 ? "#15803d" : "var(--muted)" }}>{money(l.net)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800, borderTop: "1px solid var(--border)" }}>
                <td /><td>Total</td>
                <td style={numTd}>{money(opexBase)}</td>
                <td style={numTd}>{money(opexActual)}</td>
                <td style={numTd}>{money(opexNet)}</td>
              </tr>
            </tbody>
          </table>
          <BalanceRow label="Net increase over prorated base" value={money(opexNet)} />
          <BalanceRow label={`× Pro-rata share (${num(pr)}%)`} value={money(opexDue)} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 13 }}>
            <span>Less: Billed (escrow)</span>
            <MoneyInput value={opexEsc} onChange={setOpexEsc} highlight={opexEsc.trim() === ""} />
          </div>
          <FinalBalanceRow label="CAM / Operating Expenses Balance" value={opexBal} />
        </div>

        {/* Real Estate Taxes */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ ...secLabel, color: "#0b4a7d", marginBottom: 6 }}>Real Estate Taxes</div>
          <table style={{ width: "100%", fontSize: 12, marginBottom: 8 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th style={{ textAlign: "left", paddingRight: 6 }}>Acct</th>
                <th style={{ textAlign: "left", width: "100%" }}>Expense</th>
                <th style={numTd}>Base ×{r.occupiedMonths}/12</th>
                <th style={numTd}>{asOfLabel} Actual</th>
                <th style={numTd}>Net Incr.</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ whiteSpace: "nowrap" }}><code style={{ fontSize: 11 }}>{r.retLine.glAccount.replace(/-95$/, "")}</code></td>
                <td>{r.retLine.label}</td>
                <td style={numTd}>{money(r.retLine.baseCost)}</td>
                <td style={numTd}>
                  <MoneyInput value={retActualStr} onChange={setRetActualOv} />
                </td>
                <td style={{ ...numTd, color: retNet > 0 ? "#15803d" : "var(--muted)" }}>{money(retNet)}</td>
              </tr>
              <tr style={{ fontWeight: 800, borderTop: "1px solid var(--border)" }}>
                <td /><td>Total</td>
                <td style={numTd}>{money(r.retLine.baseCost)}</td>
                <td style={numTd}>{money(retA)}</td>
                <td style={numTd}>{money(retNet)}</td>
              </tr>
            </tbody>
          </table>
          <BalanceRow label="Net increase over prorated base" value={money(retNet)} />
          <BalanceRow label={`× Pro-rata share (${num(pr)}%)`} value={money(retDue)} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 13 }}>
            <span>Less: Billed (escrow)</span>
            <MoneyInput value={retEsc} onChange={setRetEsc} highlight={retEsc.trim() === ""} />
          </div>
          <FinalBalanceRow label="Real Estate Taxes Balance" value={retBal} />
        </div>
      </div>

      <FinalBalanceRow label="Total Interim Balance" value={totalBal} />
      <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
        Manual worksheet — base year &amp; actuals are seeded from the building&apos;s expense history + GL; edit any of them live. A positive balance is owed by the tenant; a credit is refunded.
      </p>
    </div>
  );
}

export default function InterimReconPage() {
  const now = new Date();
  const [properties, setProperties] = useState<{ code: string; name: string; kind?: "office" | "retail" }[]>([]);
  const [property, setProperty] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [baseYears, setBaseYears] = useState<number[]>([]);
  const [unitRef, setUnitRef] = useState("");
  const [asOf, setAsOf] = useState<number | "">("");
  const [data, setData] = useState<{ result: Result | RetailResult; meta: Meta; kind?: "office" | "retail" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Ad-hoc ("manual") tenant entered from the Tenant dropdown — not persisted.
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [generating, setGenerating] = useState(false);
  const [manualMsg, setManualMsg] = useState<string | null>(null);

  const selectedKind = properties.find((p) => p.code === property)?.kind ?? "office";
  const isManual = unitRef === "__MANUAL__";

  useEffect(() => { fetch("/api/cam-recon/interim").then((r) => r.json()).then((j) => setProperties(j.properties ?? [])); }, []);
  // Load the tenant list whenever the building/year change (no clearing — that's
  // done in the dropdown handler so a deep-link can pre-select a tenant).
  useEffect(() => {
    if (!property) { setTenants([]); setBaseYears([]); return; }
    fetch(`/api/cam-recon/interim?property=${property}&year=${year}`).then((r) => r.json()).then((j) => { setTenants(j.tenants ?? []); setBaseYears(j.baseYears ?? []); });
  }, [property, year]);

  // Generate a one-off statement from the building's live expenses + the typed
  // tenant terms/escrow. Nothing is saved; the result renders in the card below.
  // Office leans on the building's real base-year expenses (baseYearArg); the
  // statement is then edited live. opts.baseYear lets the in-statement base-year
  // dropdown re-pull a different year without touching the rest.
  const generateManual = useCallback(async (opts?: { baseYear?: string }) => {
    if (!property) return;
    if (!draft.name.trim()) { setManualMsg("Enter a tenant name."); return; }
    const kind = properties.find((p) => p.code === property)?.kind ?? "office";
    let baseYear = opts?.baseYear ?? draft.baseYear ?? "";
    // Office leans on the building's real base years — default to the most recent.
    if (kind === "office" && !baseYear) baseYear = baseYears[0] != null ? String(baseYears[0]) : "";
    setGenerating(true); setManualMsg(null); setError(null);
    if (baseYear !== draft.baseYear) setDraft((d) => ({ ...d, baseYear }));
    const opt = (s: string) => (s.trim() === "" ? null : Number(s));
    const tenant = {
      unitRef: draft.unitRef.trim() || null, name: draft.name.trim(), sqft: Number(draft.sqft) || 0,
      // No lease-from: the occupied window runs Jan → the As-of month.
      leaseFrom: null, vacatedISO: draft.vacatedISO ? isoToUS(draft.vacatedISO) : null,
      opexMonth: Number(draft.opexMonth) || 0, reTaxMonth: Number(draft.reTaxMonth) || 0,
      baseYear: baseYear.trim() === "" ? null : Number(baseYear), noBaseStop: draft.noBaseStop, grossUp: draft.grossUp, proRataPct: opt(draft.proRataPct),
      camPrs: opt(draft.camPrs), insPrs: opt(draft.insPrs), retPrs: opt(draft.retPrs), adminFeePct: opt(draft.adminFeePct), retDiscountPct: opt(draft.retDiscountPct),
      opexActualOverride: opt(draft.opexActualOverride), retActualOverride: opt(draft.retActualOverride), insActualOverride: opt(draft.insActualOverride),
      camEscrowOverride: opt(draft.camEscrowOverride), insEscrowOverride: opt(draft.insEscrowOverride), retEscrowOverride: opt(draft.retEscrowOverride),
    };
    try {
      const res = await fetch("/api/cam-recon/interim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property, year, asOf: asOf || 0, tenant }) });
      const j = await res.json();
      if (j.error) { setManualMsg(j.error); setData(null); } else { setData(j); setManualMsg(null); }
    } catch (e) { setManualMsg(String(e)); } finally { setGenerating(false); }
  }, [property, year, asOf, draft, properties, baseYears]);

  const runWith = useCallback((p: string, y: number, ref: string, a: number | "") => {
    if (!p || !ref) return;
    setLoading(true); setError(null);
    const q = `property=${p}&year=${y}&unitRef=${encodeURIComponent(ref)}${a ? `&asOf=${a}` : ""}`;
    fetch(`/api/cam-recon/interim?${q}`).then((r) => r.json()).then((j) => {
      if (j.error) { setError(j.error); setData(null); } else { setData(j); setError(null); }
    }).catch((e) => setError(String(e))).finally(() => setLoading(false));
  }, []);
  const run = useCallback(() => runWith(property, year, unitRef, asOf), [runWith, property, year, unitRef, asOf]);

  // Deep link from the dashboard's vacating-tenants list: pre-fill + auto-run.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get("property"); const ref = sp.get("unitRef");
    if (!p || !ref) return;
    const y = Number(sp.get("year")) || now.getFullYear();
    const a = sp.get("asOf") ? Number(sp.get("asOf")) : "";
    setProperty(p); setYear(y); setUnitRef(ref); setAsOf(a);
    runWith(p, y, ref, a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tenant = tenants.find((t) => t.unitRef === unitRef);
  const r = data?.kind !== "retail" ? (data?.result as Result | undefined) : undefined;
  const retail = data?.kind === "retail" ? (data?.result as RetailResult | undefined) : undefined;
  const meta = data?.meta;
  const asOfLabel = r ? MONTHS[r.asOfMonth - 1].slice(0, 3) : "";

  const downloadPdf = useCallback(async () => {
    if (!r || !meta) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const asOf = `${MONTHS[r.asOfMonth - 1]} ${meta.year}`;
    drawTenantStatement(doc, r, meta.year, `${meta.property} — ${meta.propertyName}`, undefined, {
      subtitle: `Interim Statement · as of ${asOf}`,
      baseColLabel: `B/Y ${r.noBaseStop ? "—" : r.baseYear} ×${r.occupiedMonths}/12`,
      actualColLabel: `${MONTHS[r.asOfMonth - 1].slice(0, 3)} YTD`,
      footerRight: `Interim CAM / RET · Suite ${r.suite}`,
      footnotes: [
        `Interim reconciliation for the ${r.occupiedMonths} occupied month${r.occupiedMonths > 1 ? "s" : ""} of ${meta.year}; the base year is prorated to the same period.`,
        ...(r.unpostedMonths > 0 ? [`${r.unpostedMonths} occupied month(s) are not yet posted to the GL — figures are through the latest posted month.`] : []),
      ],
    });
    doc.save(`${meta.property}_${meta.year}_Suite${r.suite}_${r.name.replace(/[^\w]+/g, "_")}_Interim_CAM_RET.pdf`);
  }, [r, meta]);

  const downloadRetailPdf = useCallback(async () => {
    if (!retail || !meta) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const asOf = `${MONTHS[retail.asOfMonth - 1]} ${meta.year}`;
    drawRetailStatement(doc, retail, meta.year, `${meta.property} — ${meta.propertyName}`, undefined, {
      subtitle: `Interim Statement · as of ${asOf}`,
      footerRight: `Interim CAM / INS / RET · Suite ${retail.suite}`,
      footnotes: [
        `Interim reconciliation for the ${retail.occupiedMonths} occupied month${retail.occupiedMonths > 1 ? "s" : ""} of ${meta.year}: CAM is live YTD GL actuals; INS & RET prorate the property pool to the occupied months.`,
        ...(retail.unpostedMonths > 0 ? [`${retail.unpostedMonths} occupied month(s) are not yet posted to the GL — figures are through the latest posted month.`] : []),
      ],
    });
    doc.save(`${meta.property}_${meta.year}_Suite${retail.suite}_${retail.name.replace(/[^\w]+/g, "_")}_Interim_CAM_INS_RET.pdf`);
  }, [retail, meta]);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Interim CAM/RET — Move-out</h1>
        <Link href="/cam-recon" style={{ color: "#0b4a7d", fontWeight: 600, fontSize: 13 }}>← Year-end Reconciliation</Link>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>Building
            <select value={property} onChange={(e) => { setProperty(e.target.value); setUnitRef(""); setData(null); setAsOf(""); }} style={selectStyle}>
              <option value="">Select…</option>
              {properties.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>Year
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
              {[now.getFullYear(), now.getFullYear() - 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>Tenant
            <select value={unitRef} onChange={(e) => { setUnitRef(e.target.value); const t = tenants.find((x) => x.unitRef === e.target.value); setAsOf(t?.expiresInYear ?? ""); setData(null); setError(null); }} style={{ ...selectStyle, minWidth: 240 }} disabled={!property}>
              <option value="">Select…</option>
              <option value="__MANUAL__">＋ Enter a tenant manually…</option>
              {tenants.map((t) => <option key={t.unitRef} value={t.unitRef}>{t.unitRef} · {t.name}{t.expiresInYear ? ` (expires ${MONTHS[t.expiresInYear - 1].slice(0, 3)})` : ""}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>As of
            <select value={asOf} onChange={(e) => setAsOf(e.target.value ? Number(e.target.value) : "")} style={selectStyle} disabled={!unitRef}>
              <option value="">{isManual ? "Vacate / year end" : tenant?.expiresInYear ? `Expiration (${MONTHS[tenant.expiresInYear - 1].slice(0, 3)})` : "Year end (Dec)"}</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={isManual ? () => generateManual() : run} disabled={!unitRef || loading || generating} style={{ fontSize: 13, padding: "8px 18px", fontWeight: 700 }}>
            {loading || generating ? "Computing…" : "Generate"}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
          Recovers the tenant&apos;s pro-rata share of the YTD increase over a <b>prorated base year</b>, less the CAM/RET billed (rent-roll monthly estimate × occupied months). Expenses come live from the building&apos;s GL.
        </p>
        {error && <div style={{ color: "#b42318", fontSize: 13, marginTop: 8 }}>{error}</div>}

        {isManual && (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            {selectedKind === "office" ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                  Manual tenant — office {property} · <span style={{ color: "#b45309" }}>amber fields need your input</span>; base year, pro-rata &amp; escrow are set on the statement and edit live.
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Field label="Tenant name" wide><input style={{ ...inputStyle, ...needsStyle(draft.name.trim() === "") }} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Reliant Care Solutions, LP" /></Field>
                  <Field label="Unit / suite" hint="(optional)"><input style={inputStyle} value={draft.unitRef} onChange={(e) => setDraft((d) => ({ ...d, unitRef: e.target.value }))} placeholder={`${property}-102`} /></Field>
                  <Field label="SF" hint="(sets pro-rata)"><input style={{ ...inputStyle, ...needsStyle(draft.sqft.trim() === "") }} value={fmtThousands(draft.sqft)} onChange={(e) => setDraft((d) => ({ ...d, sqft: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" /></Field>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, paddingBottom: 8 }}>
                    <input type="checkbox" checked={draft.grossUp} onChange={(e) => setDraft((d) => ({ ...d, grossUp: e.target.checked }))} /> Gross up (95%)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, paddingBottom: 8 }}>
                    <input type="checkbox" checked={draft.noBaseStop} onChange={(e) => setDraft((d) => ({ ...d, noBaseStop: e.target.checked }))} /> Full NNN (no base stop)
                  </label>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                  Manual tenant — retail {property} · <span style={{ color: "#b45309" }}>amber fields need your input</span>; expenses pull live from the building&apos;s GL.
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Field label="Tenant name" wide><input style={{ ...inputStyle, ...needsStyle(draft.name.trim() === "") }} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Acme Retail" /></Field>
                  <Field label="Unit / suite" hint="(optional)"><input style={inputStyle} value={draft.unitRef} onChange={(e) => setDraft((d) => ({ ...d, unitRef: e.target.value }))} placeholder={`${property}-1817`} /></Field>
                  <Field label="SF"><input style={{ ...inputStyle, ...needsStyle(draft.sqft.trim() === "") }} value={fmtThousands(draft.sqft)} onChange={(e) => setDraft((d) => ({ ...d, sqft: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" /></Field>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Field label="CAM share %"><input style={{ ...inputStyle, ...needsStyle(draft.camPrs.trim() === "") }} value={draft.camPrs} onChange={(e) => setDraft((d) => ({ ...d, camPrs: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="INS share %"><input style={{ ...inputStyle, ...needsStyle(draft.insPrs.trim() === "") }} value={draft.insPrs} onChange={(e) => setDraft((d) => ({ ...d, insPrs: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="RET share %"><input style={{ ...inputStyle, ...needsStyle(draft.retPrs.trim() === "") }} value={draft.retPrs} onChange={(e) => setDraft((d) => ({ ...d, retPrs: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="Admin fee %"><input style={inputStyle} value={draft.adminFeePct} onChange={(e) => setDraft((d) => ({ ...d, adminFeePct: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="RET discount %"><input style={inputStyle} value={draft.retDiscountPct} onChange={(e) => setDraft((d) => ({ ...d, retDiscountPct: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="CAM escrow $/mo"><input style={inputStyle} value={draft.opexMonth} onChange={(e) => setDraft((d) => ({ ...d, opexMonth: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="RET escrow $/mo"><input style={inputStyle} value={draft.reTaxMonth} onChange={(e) => setDraft((d) => ({ ...d, reTaxMonth: e.target.value }))} inputMode="decimal" /></Field>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                  YTD overrides <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>— blank = live GL / monthly × months</span>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Field label="CAM pool YTD $"><input style={inputStyle} value={draft.opexActualOverride} onChange={(e) => setDraft((d) => ({ ...d, opexActualOverride: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="INS pool YTD $"><input style={inputStyle} value={draft.insActualOverride} onChange={(e) => setDraft((d) => ({ ...d, insActualOverride: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="RET pool YTD $"><input style={inputStyle} value={draft.retActualOverride} onChange={(e) => setDraft((d) => ({ ...d, retActualOverride: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="CAM escrow billed $"><input style={inputStyle} value={draft.camEscrowOverride} onChange={(e) => setDraft((d) => ({ ...d, camEscrowOverride: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="INS escrow billed $"><input style={inputStyle} value={draft.insEscrowOverride} onChange={(e) => setDraft((d) => ({ ...d, insEscrowOverride: e.target.value }))} inputMode="decimal" /></Field>
                  <Field label="RET escrow billed $"><input style={inputStyle} value={draft.retEscrowOverride} onChange={(e) => setDraft((d) => ({ ...d, retEscrowOverride: e.target.value }))} inputMode="decimal" /></Field>
                </div>
              </>
            )}
            {manualMsg && <span style={{ fontSize: 13, color: "#b42318" }}>{manualMsg}</span>}
          </div>
        )}
      </div>

      {r && meta && meta.manual && (
        <EditableOfficeStatement key={`${meta.unitRef}|${meta.name}|${meta.proRataPct}`} r={r} meta={meta} baseYears={baseYears} onBaseYear={(y) => generateManual({ baseYear: y })} />
      )}

      {r && meta && !meta.manual && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{r.name} <code style={{ fontSize: 13 }}>{r.unitRef}</code></div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0b4a7d" }}>Interim CAM/RET · as of {MONTHS[r.asOfMonth - 1]} {meta.year}</div>
              <button className="btn primary" onClick={downloadPdf} style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>Download PDF</button>
            </div>
          </div>
          <div className="muted small" style={{ marginBottom: 10 }}>
            Base year <b>{r.noBaseStop ? "NNN (full pool)" : r.baseYear}</b> · pro-rata <b>{pct2(r.proRataPct)}%</b> · occupied <b>{r.occupiedMonths}</b> of 12 months{meta.leaseTo ? <> · lease to <b>{meta.leaseTo}</b></> : null} · {meta.sqft.toLocaleString()} sf
          </div>

          {r.unpostedMonths > 0 && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(217,119,6,0.10)", border: "1px solid #d9770655", color: "#b45309", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
              ⚠ {r.unpostedMonths} occupied month{r.unpostedMonths > 1 ? "s" : ""} not yet posted to the GL (posted through {MONTHS[meta.maxPosted - 1] ?? "—"}). Expenses are computed through the latest posted month; re-run once the remaining month{r.unpostedMonths > 1 ? "s" : ""} post for the final figure.
            </div>
          )}
          {r.futureBaseYear && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(21,128,61,0.08)", border: "1px solid #15803d55", color: "#15803d", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
              Base year is after {meta.year} — no recovery is due (the base stop hasn&apos;t been set yet).
            </div>
          )}
          {(r.dataWarnings ?? []).map((w, i) => (
            <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(220,38,38,0.08)", border: "1px solid #dc262655", color: "#b91c1c", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>⚠ {w}</div>
          ))}

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Column title="CAM / Operating Expenses" lines={r.opexLines} base={r.opexBaseTotal} actual={r.opexActualTotal} net={r.opexNetIncrease}
              due={r.opexAmountDue} escrow={r.opexEscrow} balance={r.opexBalance} proRataPct={r.proRataPct}
              occupiedMonths={r.occupiedMonths} asOfLabel={asOfLabel} reconYear={meta.year} monthly={meta.opexMonth} />
            <Column title="Real Estate Taxes" lines={[r.retLine]} base={r.retLine.baseCost} actual={r.retLine.actual} net={r.retLine.netIncrease}
              due={r.retAmountDue} escrow={r.retEscrow} balance={r.retBalance} proRataPct={r.proRataPct}
              occupiedMonths={r.occupiedMonths} asOfLabel={asOfLabel} reconYear={meta.year} monthly={meta.reTaxMonth} />
          </div>

          <FinalBalanceRow label="Total Interim Balance" value={r.opexBalance + r.retBalance} />
          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
            A positive balance is owed by the tenant; a credit is refunded. This is an interim figure as of {MONTHS[r.asOfMonth - 1]} {meta.year} — the move-out close-out (with the security-deposit return) follows.
          </p>
        </div>
      )}

      {retail && meta && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{retail.name} <code style={{ fontSize: 13 }}>{retail.unitRef}</code></div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0b4a7d" }}>Interim CAM/INS/RET · as of {MONTHS[retail.asOfMonth - 1]} {meta.year}</div>
              <button className="btn primary" onClick={downloadRetailPdf} style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>Download PDF</button>
            </div>
          </div>
          <div className="muted small" style={{ marginBottom: 10 }}>
            Pro-rata <b>{pct2(retail.camPrs)}%</b> CAM (+{pct2(retail.adminFeePct)}% admin) · <b>{pct2(retail.insPrs)}%</b> INS · <b>{pct2(retail.retPrs)}%</b> RET · occupied <b>{retail.occupiedMonths}</b> of 12 months{meta.leaseTo ? <> · lease to <b>{meta.leaseTo}</b></> : null} · {meta.sqft.toLocaleString()} sf
          </div>
          {retail.unpostedMonths > 0 && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(217,119,6,0.10)", border: "1px solid #d9770655", color: "#b45309", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
              ⚠ {retail.unpostedMonths} occupied month{retail.unpostedMonths > 1 ? "s" : ""} not yet posted to the GL (posted through {MONTHS[meta.maxPosted - 1] ?? "—"}). CAM is computed through the latest posted month; re-run once the rest post.
            </div>
          )}
          {retail.grossLease && <div className="muted small" style={{ marginBottom: 10 }}>Gross lease — no reconciliation is due.</div>}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 320 }}>
              <div style={{ ...secLabel, color: "#0b4a7d", marginBottom: 6 }}>CAM / Operating Expenses</div>
              <table style={{ width: "100%", fontSize: 12, marginBottom: 8 }}>
                <thead><tr style={{ color: "var(--muted)", textAlign: "left" }}><th style={{ textAlign: "left", paddingRight: 6 }}>Acct</th><th style={{ textAlign: "left", width: "100%" }}>Expense</th><th style={numTd}>{MONTHS[retail.asOfMonth - 1].slice(0, 3)} YTD</th></tr></thead>
                <tbody>
                  {retail.camSchedule.map((l) => (
                    <tr key={l.glAccount + l.label} style={{ textDecoration: l.billed ? "none" : "line-through", opacity: l.billed ? 1 : 0.5 }}>
                      <td style={{ whiteSpace: "nowrap" }}><code style={{ fontSize: 11 }}>{l.glAccount}</code></td>
                      <td>{l.label}</td>
                      <td style={numTd}>{money(l.amount)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 800, borderTop: "1px solid var(--border)" }}><td /><td>Total billed pool</td><td style={numTd}>{money(retail.camPoolEffective)}</td></tr>
                </tbody>
              </table>
              <BalanceRow label={`× Share (${pct2(retail.camPrs)}%)`} value={money(retail.camShare)} />
              <BalanceRow label={`+ Admin fee (${pct2(retail.adminFeePct)}%)`} value={money(retail.camAdmin)} />
              <BalanceRow label="CAM Due" value={money(retail.camDue)} strong />
              <BalanceRow label={`Less: Billed (${money(meta.opexMonth)}/mo × ${retail.occupiedMonths})`} value={money(-retail.camEscrow)} />
              <FinalBalanceRow label="CAM Balance" value={retail.camBalance} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ ...secLabel, color: "#0b4a7d", marginBottom: 6 }}>Insurance</div>
              <BalanceRow label={`Property INS pool ×${retail.occupiedMonths}/12`} value={money(retail.insPool)} />
              <BalanceRow label={`× Share (${pct2(retail.insPrs)}%)`} value={money(retail.insDue)} strong />
              <BalanceRow label="Less: Billed" value={money(-retail.insEscrow)} />
              <FinalBalanceRow label="INS Balance" value={retail.insBalance} />
              <div style={{ height: 14 }} />
              <div style={{ ...secLabel, color: "#0b4a7d", marginBottom: 6 }}>Real Estate Taxes</div>
              <BalanceRow label={`RET pool ×${retail.occupiedMonths}/12`} value={money(retail.retPool)} />
              <BalanceRow label={`× Share (${pct2(retail.retPrs)}%)${retail.retDiscountPct ? ` − ${pct2(retail.retDiscountPct)}% disc` : ""}`} value={money(retail.retDue)} strong />
              <BalanceRow label={`Less: Billed (${money(meta.reTaxMonth)}/mo × ${retail.occupiedMonths})`} value={money(-retail.retEscrow)} />
              <FinalBalanceRow label="RET Balance" value={retail.retBalance} />
            </div>
          </div>
          <FinalBalanceRow label="Total Interim Balance" value={retail.camBalance + retail.insBalance + retail.retBalance} />
          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
            A positive balance is owed by the tenant; a credit is refunded. CAM pulls live YTD actuals from the GL; INS &amp; RET prorate the property pool to the occupied months. Interim figure as of {MONTHS[retail.asOfMonth - 1]} {meta.year} — the move-out close-out (with the security-deposit return) follows.
          </p>
        </div>
      )}
    </main>
  );
}
