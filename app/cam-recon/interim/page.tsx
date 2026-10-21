"use client";

// Interim ("as-of month") CAM/RET reconciliation — for a mid-year move-out.
// Pick a building (office or retail) + tenant + as-of month; the statement
// recovers the tenant's share of the YTD increase over a prorated base, less
// billed. Former (vacated) tenants who've dropped off the rent roll can be
// entered here too, with optional YTD-expense + escrow overrides.

import { useCallback, useEffect, useRef, useState } from "react";
import { drawTenantStatement } from "@/lib/cam/office/statementPdf";
import { drawRetailStatement } from "@/lib/cam/retail/statementPdf";
import type { TenantReconResult } from "@/lib/cam/office/types";
import type { RetailTenantResult } from "@/lib/cam/retail/types";
import { SELECT_BRAND } from "@/app/components/YearSelect";
import AllowedLink from "@/app/components/AllowedLink";
import { SegToggle } from "@/app/financials/reprojections/ReprojTable";
import { Calendar } from "@/app/components/Calendar";
import { useUser } from "@/app/components/UserProvider";
import { HoverCard } from "@/app/components/HoverCard";
import { escrowNote, escrowClause, totalDue as totalDueOf, type MoveoutOpenAr } from "@/lib/cam/moveout/openAr";
import { drawSettlement, drawUnpaidDetail, drawDepositDetail, type DepositDetail } from "@/lib/cam/moveout/settlementPdf";
import { blobSrc } from "@/lib/blobProxy";

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
type Meta = { property: string; propertyName: string; unitRef: string; name: string; year: number; asOfMonth: number; effectiveThrough: number; occupiedMonths: number; unpostedMonths: number; maxPosted: number; startMonth: number; leaseFrom: string | null; leaseTo: string | null; sqft: number; opexMonth: number; reTaxMonth: number; baseYear?: number; proRataPct: number; grossUp?: boolean; glAsOf: string | null; manual?: boolean; escrowSource?: "monthly-rolls" | "estimate"; escrowMonthsFound?: number };
type Tenant = { unitRef: string; name: string; leaseTo: string | null; expiresInYear: number | null };
// Move-out candidates — recently vacated / expiring-soon tenants (portfolio-wide),
// synced with the dashboard's Vacating Tenants / Leases Expiring lists.
type Candidate = { propertyCode: string; propertyName: string; unitRef: string; name: string; leaseTo: string | null; kind: "vacated" | "expiring"; days: number | null; year: number | null; month: number | null };
type DepositStatus = "held" | "refunded" | "forfeited" | "partial";
type RawDeposit = { amount: number; checkNumber: string; refunded: boolean; tenantDefaulted: boolean; partialRefund: boolean; partialRefundAmount?: number };
type DepositInfo = { amount: number; checkNumber: string; status: DepositStatus; partialRefundAmount: number; raw?: Record<string, unknown> & { id?: string } };
const toDepositInfo = (pick: RawDeposit): DepositInfo => ({
  amount: pick.amount,
  checkNumber: pick.checkNumber,
  status: pick.refunded ? "refunded" : pick.tenantDefaulted ? "forfeited" : pick.partialRefund ? "partial" : "held",
  partialRefundAmount: pick.partialRefundAmount ?? 0,
  raw: pick as unknown as DepositInfo["raw"],
});
/** "25,496" / "$25,496.00" → dollars (Number alone reads a comma as NaN). */
const dollars = (v: string) => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : 0; };

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

// The look comes from globals.css (the program-wide control pill); only the
// layout is set here. `needsStyle` still tints an essential empty field amber.
const inputStyle: React.CSSProperties = { width: "100%" };

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

function Column({ title, lines, base, actual, net, due, escrow, balance, proRataPct, occupiedMonths, asOfLabel, reconYear, monthly, showAcct }: {
  title: string; lines: ScheduleLine[]; base: number; actual: number; net: number; due: number; escrow: number; balance: number;
  proRataPct: number; occupiedMonths: number; asOfLabel: string; reconYear: number; monthly: number; showAcct?: boolean;
}) {
  return (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div style={{ ...secLabel, color: "#0b4a7d", marginBottom: 6 }}>{title}</div>
      <table style={{ width: "100%", fontSize: 12, marginBottom: 8 }}>
        <thead>
          <tr style={{ color: "var(--muted)", textAlign: "left" }}>
            {showAcct && <th style={{ textAlign: "left", paddingRight: 6 }}>Acct</th>}
            <th style={{ textAlign: "left", width: "100%" }}>Expense</th>
            <th style={numTd}>Base ×{occupiedMonths}/12</th>
            <th style={numTd}>{asOfLabel} Actual</th>
            <th style={numTd}>Net Incr.</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.glAccount}>
              {showAcct && <td style={{ whiteSpace: "nowrap" }}><code style={{ fontSize: 11 }}>{l.glAccount.replace(/-95$/, "")}</code></td>}
              <td>{l.label}</td>
              <td style={numTd}>{money(l.baseCost)}</td>
              <td style={numTd}>{money(l.actual)}</td>
              <td style={{ ...numTd, color: l.netIncrease > 0 ? "#15803d" : "var(--muted)" }}>{money(l.netIncrease)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 800, borderTop: "1px solid var(--border)" }}>
            {showAcct && <td />}<td>Total</td>
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
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>CAM / RET Reconciliation <span style={{ fontSize: 14, fontWeight: 700, color: "#0b4a7d" }}>· as of {MONTHS[r.asOfMonth - 1]} {meta.year}</span></div>
          <div className="muted" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{r.name} <code style={{ fontSize: 12 }}>{r.unitRef}</code></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn primary" onClick={downloadPdf} style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>Download PDF</button>
        </div>
      </div>
      <div className="muted small" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>Base year</span>
        <select value={r.noBaseStop ? "" : String(r.baseYear)} disabled={r.noBaseStop}
          onChange={(e) => onBaseYear(e.target.value)}
          className="select-sm" style={{ width: 86 }}>
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
          <FinalBalanceRow label="Balance, Op Ex Costs Due" value={opexBal} />
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
          <FinalBalanceRow label="Balance, Real Estate Taxes Due" value={retBal} />
        </div>
      </div>

      <FinalBalanceRow label="Reconciliation Balance" value={totalBal} />
      <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
        Manual worksheet — base year &amp; actuals are seeded from the building&apos;s expense history + GL; edit any of them live. A positive balance is owed by the tenant; a credit is refunded.
      </p>
    </div>
  );
}

export default function InterimReconPage() {
  const now = new Date();
  const [properties, setProperties] = useState<{ code: string; name: string; kind?: "office" | "retail" }[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
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

  useEffect(() => { fetch("/api/cam-recon/interim").then((r) => r.json()).then((j) => { setProperties(j.properties ?? []); setCandidates(j.candidates ?? []); }); }, []);
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

  // Pick a move-out candidate → pre-fill Building / Year / Tenant / As-of and run.
  const pickCandidate = useCallback((c: Candidate) => {
    const y = c.year ?? year;
    const a: number | "" = c.month ?? "";
    setProperty(c.propertyCode); setYear(y); setUnitRef(c.unitRef); setAsOf(a); setDraft(emptyDraft); setData(null); setError(null);
    runWith(c.propertyCode, y, c.unitRef, a);
  }, [runWith, year]);

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

  // Total interim reconciliation balance (positive = owed by tenant).
  const totalBalance = retail
    ? retail.camBalance + retail.insBalance + retail.retBalance
    : (r ? r.opexBalance + r.retBalance : 0);

  // The departing tenant's security deposit — the third leg of the move-out
  // package (CAM statement + deposit + letter). Pulled by unit ref, falling
  // back to the tenant name if the deposit was filed under the company.
  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const metaName = meta?.name;
  useEffect(() => {
    const ref = meta?.unitRef;
    if (!ref) { setDeposit(null); return; }
    let cancelled = false;
    const nameQ = metaName ? `&tenant=${encodeURIComponent(metaName)}` : "";
    fetch(`/api/deposits?unitRef=${encodeURIComponent(ref)}${nameQ}`)
      .then((res) => res.json())
      .then((j) => {
        if (cancelled) return;
        const list = (j.deposits ?? []) as RawDeposit[];
        // Prefer a deposit still on file; otherwise the most recent record.
        const pick = list.find((d) => !d.refunded && !d.tenantDefaulted) ?? list[list.length - 1] ?? null;
        setDeposit(pick ? toDepositInfo(pick) : null);
      })
      .catch(() => { if (!cancelled) setDeposit(null); });
    return () => { cancelled = true; };
  }, [meta?.unitRef, metaName]);

  // The deposit is keyed RIGHT HERE when it is missing or wrong (owner: "allow
  // user to enter security deposits right in there … rather than forcing me to
  // go into deposits page"). Saves through the Deposits API: an existing
  // record keeps every other field (the PUT replaces the whole record).
  const [showCharges, setShowCharges] = useState(false);
  const [depEdit, setDepEdit] = useState(false);
  const [depAmtIn, setDepAmtIn] = useState("");
  const [depCkIn, setDepCkIn] = useState("");
  const [depDateIn, setDepDateIn] = useState("");
  const [depSaving, setDepSaving] = useState(false);
  const [depErr, setDepErr] = useState<string | null>(null);
  useEffect(() => { setDepEdit(false); setDepErr(null); }, [meta?.unitRef]);
  const startDepEdit = () => {
    setDepAmtIn(deposit && deposit.amount > 0 ? deposit.amount.toLocaleString("en-US") : "");
    setDepCkIn(deposit?.checkNumber ?? "");
    setDepDateIn(String(deposit?.raw?.checkDate ?? ""));
    setDepErr(null); setDepEdit(true);
  };
  const saveDepositHere = useCallback(async () => {
    if (!meta) return;
    const amount = dollars(depAmtIn);
    if (!(amount > 0)) { setDepErr("Enter the deposit amount."); return; }
    setDepSaving(true); setDepErr(null);
    try {
      const id = deposit?.raw?.id;
      const res = id
        ? await fetch(`/api/deposits/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...deposit!.raw, amount, checkNumber: depCkIn.trim(), checkDate: depDateIn }) })
        : await fetch("/api/deposits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitRef: meta.unitRef, propertyCode: meta.property, tenantCompany: meta.name, amount, checkNumber: depCkIn.trim(), checkDate: depDateIn }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.deposit) { setDepErr(j.error ?? `Couldn't save (${res.status}).`); return; }
      setDeposit(toDepositInfo(j.deposit as RawDeposit));
      setDepEdit(false);
    } catch (e) { setDepErr(String(e)); } finally { setDepSaving(false); }
  }, [meta, deposit, depAmtIn, depCkIn, depDateIn]);

  // The open balance still on the account — the close-out is the tenant's
  // final bill, so it is netted with the true-up (owner). Off their newest
  // monthly statement; null when none carries them.
  const [openAr, setOpenAr] = useState<MoveoutOpenAr | null>(null);
  const metaYear = meta?.year;
  useEffect(() => {
    const ref = meta?.unitRef;
    if (!ref || meta?.manual) { setOpenAr(null); return; }
    let cancelled = false;
    const q = new URLSearchParams({ unitRef: ref, year: String(metaYear ?? "") });
    if (metaName) q.set("tenant", metaName);
    fetch(`/api/cam-recon/moveout/open-ar?${q}`)
      .then((res) => res.json())
      .then((j) => { if (!cancelled) setOpenAr((j.openAr ?? null) as MoveoutOpenAr | null); })
      .catch(() => { if (!cancelled) setOpenAr(null); });
    return () => { cancelled = true; };
  }, [meta?.unitRef, meta?.manual, metaName, metaYear]);
  // STEP: import the tenant's FINAL Skyline statement, right here (owner:
  // "a regular task for a close out … itll show the final charges"). Only this
  // tenant's statement is taken from the file (`/api/cam-recon/moveout/statement`).
  const { user } = useUser();
  const stmtFileRef = useRef<HTMLInputElement>(null);
  const [stmtBusy, setStmtBusy] = useState(false);
  const [stmtMsg, setStmtMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setStmtMsg(null); }, [meta?.unitRef]);
  const importFinalStatement = useCallback(async (file: File) => {
    if (!meta) return;
    setStmtBusy(true); setStmtMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("unitRef", meta.unitRef);
      if (metaName) fd.append("tenant", metaName);
      fd.append("year", String(meta.year));
      if (user?.label) fd.append("uploadedBy", user.label);
      const res = await fetch("/api/cam-recon/moveout/statement", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setStmtMsg({ ok: false, text: j.error ?? `Import failed (${res.status}).` }); return; }
      setOpenAr((j.openAr ?? null) as MoveoutOpenAr | null);
      setStmtMsg({ ok: true, text: j.tiesOut === false ? "Imported — but it doesn't tie to Skyline's balance; check the file." : "Imported — the Final Bill now reads it." });
    } catch (e) { setStmtMsg({ ok: false, text: String(e) }); }
    finally { setStmtBusy(false); if (stmtFileRef.current) stmtFileRef.current.value = ""; }
  }, [meta, metaName, user?.label]);
  // Account codes are off by default (owner: "hide or at least default to
  // toggle off the account codes … to clean this up"); remembered per browser.
  const [showAcct, setShowAcct] = useState(false);
  useEffect(() => { try { setShowAcct(localStorage.getItem("kcp.interim.showAcct") === "1"); } catch { /* private mode */ } }, []);
  const toggleAcct = (v: boolean) => { setShowAcct(v); try { localStorage.setItem("kcp.interim.showAcct", v ? "1" : "0"); } catch { /* private mode */ } };
  // The SAME control Reprojections uses for its GL codes — not a checkbox.
  const acctToggle = (
    <SegToggle label="GL" leftLabel="Hide" rightLabel="Show" leftActive={!showAcct} onLeft={() => toggleAcct(false)} onRight={() => toggleAcct(true)} />
  );
  // ONE way to pick a tenant: the move-out candidate list. Building / Year /
  // Tenant / As of (and manual entry) open only on request — or when there
  // is no candidate list, a manual worksheet is open, or something failed.
  const [showPicker, setShowPicker] = useState(false);
  const pickerOpen = showPicker || candidates.length === 0 || isManual || !!error;
  const grandTotal = totalDueOf(totalBalance, openAr);
  const depositAppliesNow = deposit != null && (deposit.status === "held" || deposit.status === "partial") && deposit.amount > 0;
  // The settlement page the downloads append — the SAME page the final PDF carries.
  const settlementFor = useCallback(() => ({
    reconBalance: totalBalance,
    openAr,
    totalDue: grandTotal,
    deposit: deposit ? { amount: deposit.amount, status: deposit.status, net: depositAppliesNow ? deposit.amount - grandTotal : null } : null,
  }), [totalBalance, openAr, grandTotal, deposit, depositAppliesNow]);

  // ONE PDF for the whole close-out (owner: "shouldnt it be one download PDF
  // for all of it comprehensively?"): the Final Settlement first — the answer —
  // then the reconciliation behind its first line. The emailed final
  // statement (artifacts.ts) is laid out the same way.
  const settleHead = (kind: "office" | "retail", name: string, suite: string, asOfMonth: number) =>
    ({ kind, name, suite, property: meta!.property, propertyName: meta!.propertyName, asOfMonth, year: meta!.year });
  const settlementFirst = (doc: unknown, kind: "office" | "retail", name: string, suite: string, asOfMonth: number) => {
    if (!meta || meta.manual) return;
    drawSettlement(doc, settleHead(kind, name, suite, asOfMonth), settlementFor());
    (doc as { addPage: () => void }).addPage();
  };
  // After the reconciliation, the rest of the settlement's detail in its own
  // order: 2 the unpaid charges, 3 the deposit — with the check image when one
  // is on file (read through the authenticated blob proxy).
  const detailAfter = async (doc: unknown, kind: "office" | "retail", name: string, suite: string, asOfMonth: number) => {
    if (!meta || meta.manual) return;
    const s = settlementFor();
    const head = settleHead(kind, name, suite, asOfMonth);
    const d = doc as { addPage: () => void };
    if (s.openAr) { d.addPage(); drawUnpaidDetail(doc, head, s); }
    if (s.deposit) {
      const raw = deposit?.raw as { checkNumber?: string; checkDate?: string; notes?: string; checkImage?: { url: string; name: string; contentType: string } | null } | undefined;
      const img = raw?.checkImage ?? null;
      const detail: DepositDetail = { checkNumber: raw?.checkNumber, checkDate: raw?.checkDate, notes: raw?.notes, imageName: img?.name ?? null, imageType: img?.contentType ?? null, image: null };
      const format = /png/i.test(img?.contentType ?? "") ? "PNG" : /jpe?g/i.test(img?.contentType ?? "") ? "JPEG" : null;
      if (img && format) {
        try {
          const blob = await fetch(blobSrc(img.url)).then((r) => (r.ok ? r.blob() : null));
          if (blob) {
            const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob); });
            detail.image = { dataUrl, format };
          }
        } catch { /* named, not drawn */ }
      }
      d.addPage(); drawDepositDetail(doc, head, s, detail);
    }
  };
  const downloadPdf = useCallback(async () => {
    if (!r || !meta) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    settlementFirst(doc, "office", r.name, r.suite, r.asOfMonth);
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
    await detailAfter(doc, "office", r.name, r.suite, r.asOfMonth);
    doc.save(`${meta.property}_${meta.year}_Suite${r.suite}_${r.name.replace(/[^\w]+/g, "_")}_${meta.manual ? "Interim_CAM_RET" : "Final_Bill"}.pdf`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, meta, settlementFor]);

  const downloadRetailPdf = useCallback(async () => {
    if (!retail || !meta) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    settlementFirst(doc, "retail", retail.name, retail.suite, retail.asOfMonth);
    const asOf = `${MONTHS[retail.asOfMonth - 1]} ${meta.year}`;
    drawRetailStatement(doc, retail, meta.year, `${meta.property} — ${meta.propertyName}`, undefined, {
      subtitle: `Interim Statement · as of ${asOf}`,
      footerRight: `Interim CAM / INS / RET · Suite ${retail.suite}`,
      footnotes: [
        `Interim reconciliation for the ${retail.occupiedMonths} occupied month${retail.occupiedMonths > 1 ? "s" : ""} of ${meta.year}: CAM is live YTD GL actuals; INS & RET prorate the property pool to the occupied months.`,
        ...(retail.unpostedMonths > 0 ? [`${retail.unpostedMonths} occupied month(s) are not yet posted to the GL — figures are through the latest posted month.`] : []),
      ],
    });
    await detailAfter(doc, "retail", retail.name, retail.suite, retail.asOfMonth);
    doc.save(`${meta.property}_${meta.year}_Suite${retail.suite}_${retail.name.replace(/[^\w]+/g, "_")}_${meta.manual ? "Interim_CAM_INS_RET" : "Final_Bill"}.pdf`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retail, meta, settlementFor]);

  const [sanity, setSanity] = useState<{ ok: boolean; findings: { severity?: string; note?: string }[] } | null>(null);
  const [sanityLoading, setSanityLoading] = useState(false);
  useEffect(() => { setSanity(null); }, [r, retail, meta]);
  const runSanityCheck = useCallback(async () => {
    const kind = retail ? "retail" : "office";
    const result = retail ?? r;
    if (!result || !meta) return;
    setSanityLoading(true);
    setSanity(null);
    try {
      const j = await fetch("/api/cam-recon/sanity-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, meta, result }),
      }).then((res) => res.json());
      if (j.error) alert(j.error);
      else setSanity({ ok: !!j.ok, findings: j.findings ?? [] });
    } catch { alert("Sanity check failed."); }
    finally { setSanityLoading(false); }
  }, [retail, r, meta]);

  const sanityButton = (
    <button className="btn ai" onClick={runSanityCheck} disabled={sanityLoading}
      title="AI review — flag anything that looks off before sending"
      style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>
      {sanityLoading ? "Checking…" : "✨ Sanity check"}
    </button>
  );

  const [letterText, setLetterText] = useState<string | null>(null);
  const openLetter = useCallback(async () => {
    if (!meta) return;
    const kind = retail ? "retail" : "office";
    const { moveOutCloseOutLetter } = await import("@/lib/cam/letters");
    setLetterText(moveOutCloseOutLetter({
      propertyName: meta.propertyName, tenant: meta.name, suite: meta.unitRef.split("-").slice(1).join("-"),
      year: meta.year, asOfMonth: meta.asOfMonth, occupiedMonths: meta.occupiedMonths, totalBalance, kind,
      securityDeposit: deposit ? deposit.amount : null,
      depositStatus: deposit ? deposit.status : null,
      openBalance: openAr ? openAr.balance : null,
      openBalanceNote: escrowClause(openAr),
    }));
  }, [retail, r, meta, totalBalance, deposit, openAr]);
  const letterButton = (
    <button className="btn" onClick={openLetter} title="Draft a move-out close-out letter with these figures"
      style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>Draft letter</button>
  );
  const letterModal = letterText != null && (
    <div onClick={() => setLetterText(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 640, margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Move-out close-out letter</div>
          <button onClick={() => setLetterText(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)" }} aria-label="Close">×</button>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>Draft — review and edit before sending. Figures are pulled from the statement.</p>
        <textarea value={letterText} onChange={(e) => setLetterText(e.target.value)}
          style={{ width: "100%", minHeight: 300, lineHeight: 1.5, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(letterText).catch(() => {}); }} style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>Copy</button>
          <button className="btn primary" onClick={() => {
            const blob = new Blob([letterText], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `${meta?.name?.replace(/[^\w]+/g, "_") ?? "tenant"}_close_out_letter.txt`; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
          }} style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>Download .txt</button>
        </div>
      </div>
    </div>
  );
  const sanityCard = sanity && (
    <div className="card" style={{ borderColor: sanity.ok ? "rgba(21,128,61,0.4)" : "rgba(180,83,9,0.45)", background: sanity.ok ? "rgba(22,163,74,0.05)" : "rgba(217,119,6,0.06)" }}>
      <div style={{ fontWeight: 800, color: sanity.ok ? "#15803d" : "#b45309", marginBottom: sanity.findings.length ? 8 : 0 }}>
        {sanity.ok ? "✓ Looks reasonable — nothing flagged" : `⚠ ${sanity.findings.length} thing${sanity.findings.length === 1 ? "" : "s"} to check before sending`}
      </div>
      {sanity.findings.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          {sanity.findings.map((f, i) => (
            <li key={i} style={{ fontSize: 13 }}>
              {f.severity === "warn" && <span style={{ color: "#b45309", fontWeight: 700, marginRight: 4 }}>⚠</span>}
              {f.note}
            </li>
          ))}
        </ul>
      )}
      <div className="muted small" style={{ marginTop: 8, fontStyle: "italic" }}>AI review · a sanity check, not a guarantee — verify anything flagged.</div>
    </div>
  );

  // ── Move-out close-out package: CAM statement balance + security deposit +
  // letter, netted into a single settlement. The third leg the user asked for. ──
  const owedByTenant = Math.round(totalBalance) >= 0;
  const depositApplies = deposit != null && (deposit.status === "held" || deposit.status === "partial");
  const netToTenant = depositApplies ? deposit!.amount - grandTotal : null; // >0 refund, <0 still due
  const depositStatusLabel: Record<DepositStatus, string> = { held: "On file", refunded: "Already refunded", forfeited: "Applied / forfeited", partial: "Partially refunded" };

  // ── Approve & finalize (the one-click auto-flow) ──────────────────────────
  // Available for a real roster tenant (not a manual worksheet) whose occupied
  // window is fully posted to the GL. One click posts the true-up: it generates
  // the Skyline GL adjustment + final statement and emails the post-approval
  // package to the office. Matches the daily watcher's approval email link.
  const unpostedMonths = retail?.unpostedMonths ?? r?.unpostedMonths ?? 0;
  // Finalizing is a CLOSE-OUT, so it needs a confirmed move-out: gone from the
  // newest rent roll covering the property (the server checks it too). A
  // tenant still on the roll — renewed, or holding over — gets an interim
  // statement only.
  const confirmedGone = !!meta && candidates.some((c) => c.kind === "vacated" && c.propertyCode === meta.property && c.unitRef === meta.unitRef);
  const canFinalize = !!meta && !meta.manual && !!(r || retail) && unpostedMonths === 0 && confirmedGone;
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeMsg, setFinalizeMsg] = useState<string | null>(null);
  useEffect(() => { setFinalizing(false); setFinalizeMsg(null); }, [meta?.unitRef, meta?.year, meta?.asOfMonth]);
  const approveFinalize = useCallback(async () => {
    if (!meta) return;
    setFinalizing(true); setFinalizeMsg(null);
    try {
      const res = await fetch("/api/cam-recon/moveout/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property: meta.property, unitRef: meta.unitRef, year: meta.year, asOf: meta.asOfMonth }),
      });
      const j = await res.json();
      if (!res.ok || j.error) setFinalizeMsg(j.error ?? "Could not finalize.");
      else setFinalizeMsg(j.emailed ? "✓ Finalized — Skyline GL adjustment + final statement emailed to the office." : "✓ Finalized (email not configured).");
    } catch (e) { setFinalizeMsg(String(e)); } finally { setFinalizing(false); }
  }, [meta]);
  const finalizeDone = (finalizeMsg ?? "").startsWith("✓");

  // THE FINAL BILL — ONE card, at the top, answer first (owner: "i dont even
  // know what the number is theres too much going on"). The tenant's last
  // bill: the CAM/RET true-up (the statement below is its working), every
  // unpaid charge still on the account, less the deposit = what is left. The
  // tenant's final Skyline statement is imported right on its line.
  const depAmt = deposit && depositApplies && deposit.amount > 0 ? deposit.amount : 0;
  const finalNet = grandTotal - depAmt; // >0 owed by the tenant, <0 refund
  const lineRow = (label: React.ReactNode, value: React.ReactNode, sub?: React.ReactNode) => (
    <div style={{ padding: "9px 0", borderTop: "1px solid var(--border)" }}>
      {/* The reconciliation's BalanceRow type (13px / 500), so the Final Bill
          and the CAM rec below it read as one statement. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 13, fontWeight: 500 }}>
        <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      {sub && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const signed = (n: number) => money(n); // the CAM rec's own "-$3,144" style
  const finalBillCard = (r || retail) && meta && (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Final Bill</div>
          <div className="muted" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{meta.name} <code style={{ fontSize: 12 }}>{meta.unitRef}</code></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={retail ? downloadRetailPdf : downloadPdf} title="The final settlement, then the reconciliation — one PDF"
            style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>Download PDF</button>
          {letterButton}
          {canFinalize && (
            <button className="btn primary" onClick={approveFinalize} disabled={finalizing || finalizeDone}
              title="Post the true-up: generates the Skyline GL adjustment + final statement and emails the office"
              style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>
              {finalizing ? "Finalizing…" : finalizeDone ? "✓ Finalized" : "Approve & finalize"}
            </button>
          )}
        </div>
      </div>
      {finalizeMsg && <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600, color: finalizeDone ? "#15803d" : "#b91c1c" }}>{finalizeMsg}</div>}
      {!confirmedGone && !meta.manual && (
        <div className="muted small" style={{ marginTop: 6 }}>Still on the rent roll — an interim statement only; it can be finalized once a rent roll no longer shows them.</div>
      )}

      <div style={{ marginTop: 14 }}>
        {lineRow(`${retail ? "CAM / INS / RET" : "CAM / RET"} reconciliation`, signed(totalBalance),
          totalBalance < -0.5 ? "A credit — the statement below shows the working." : "The statement below shows the working.")}

        {!meta.manual && lineRow(
          <>Unpaid charges on account{openAr?.asOf ? <span className="muted"> · as of {new Date(openAr.asOf).toLocaleDateString("en-US")}</span> : ""}</>,
          openAr
            ? <HoverCard title="Unpaid charges" rows={openAr.byCategory.map((k) => ({ label: k.label, value: money(k.amount) }))} footer={{ label: "Total", value: money(openAr.balance) }}>
                <span style={{ cursor: "help", borderBottom: "1px dotted var(--muted)" }}>{money(openAr.balance)}</span>
              </HoverCard>
            : <span className="muted" style={{ fontWeight: 500 }}>not imported</span>,
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>
              {openAr ? "From their final Skyline statement." : <>Import the tenant&rsquo;s final Skyline statement (a moved-out tenant is <code>{meta.unitRef}-FO</code>).</>}
              {openAr && openAr.charges?.length > 0 && (
                <button className="btn-link" onClick={() => setShowCharges((v) => !v)}
                  style={{ marginLeft: 6, background: "none", border: "none", padding: 0, color: "#0b4a7d", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                  {showCharges ? "Hide charges" : `Show the ${openAr.charges.length} charges`}
                </button>
              )}
              {openAr?.nameMatched === false && <span style={{ color: "#b45309" }}> Filed under &ldquo;{openAr.tenantName}&rdquo; — check it is this tenant.</span>}
              {stmtMsg && <span style={{ fontWeight: 600, color: stmtMsg.ok ? "#15803d" : "#b91c1c" }}> {stmtMsg.text}</span>}
            </span>
            <input ref={stmtFileRef} type="file" accept=".xls,.xlsx" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importFinalStatement(f); }} />
            <button className={openAr ? "btn sm" : "btn sm primary"} disabled={stmtBusy} onClick={() => stmtFileRef.current?.click()}>
              {stmtBusy ? "Importing…" : openAr ? "Re-import" : "Import final statement"}
            </button>
          </span>,
        )}

        {openAr && showCharges && (
          <table style={{ width: "100%", fontSize: 12.5, margin: "0 0 8px", borderCollapse: "collapse" }}>
            <thead>
              <tr className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <th style={{ textAlign: "left", padding: "4px 0", width: 90 }}>Date</th>
                <th style={{ textAlign: "left", padding: "4px 0" }}>Description</th>
                <th style={{ textAlign: "right", padding: "4px 0" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {openAr.charges.map((k, i) => (
                <tr key={i} style={{ background: i % 2 ? "rgba(15,23,42,0.03)" : undefined }}>
                  <td style={{ padding: "3px 0", fontVariantNumeric: "tabular-nums" }}>{k.dateISO ? new Date(`${k.dateISO}T12:00:00`).toLocaleDateString("en-US") : ""}</td>
                  <td style={{ padding: "3px 0" }}>{k.description}{k.escrow && <span title="Billed estimate, not paid — the reconciliation credits it as billed" style={{ color: "#b45309", fontWeight: 700 }}> †</span>}</td>
                  <td style={{ padding: "3px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(k.amount)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800, borderTop: "1px solid var(--border)" }}>
                <td /><td style={{ padding: "4px 0" }}>Total unpaid charges</td>
                <td style={{ padding: "4px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(openAr.balance)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {lineRow(
          <>Security deposit{deposit && !depEdit ? <span className="muted">{deposit.checkNumber ? ` · ck# ${deposit.checkNumber}` : ""}{/^\d{4}-\d{2}-\d{2}$/.test(String(deposit.raw?.checkDate ?? "")) ? ` · ${String(deposit.raw!.checkDate).replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_m, y, mo, d) => `${Number(mo)}/${Number(d)}/${y}`)}` : ""}</span> : ""}</>,
          depEdit ? null : depAmt ? signed(-depAmt) : <span className="muted" style={{ fontWeight: 500 }}>—</span>,
          depEdit ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input value={depAmtIn} onChange={(e) => setDepAmtIn(e.target.value)} placeholder="Amount" inputMode="decimal" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveDepositHere(); }} style={{ width: 130 }} />
              <input value={depCkIn} onChange={(e) => setDepCkIn(e.target.value)} placeholder="Check #" style={{ width: 100 }} />
              <span style={{ width: 150 }}><Calendar value={depDateIn} onChange={setDepDateIn} variant="card" placeholder="Check date" maxISO={new Date().toISOString().slice(0, 10)} /></span>
              <button className="btn sm primary" disabled={depSaving} onClick={saveDepositHere}>{depSaving ? "Saving…" : "Save"}</button>
              <button className="btn sm" disabled={depSaving} onClick={() => setDepEdit(false)}>Cancel</button>
              {depErr && <span style={{ color: "#b91c1c", fontWeight: 600 }}>{depErr}</span>}
            </span>
          ) : (
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>
                {!deposit
                  ? "None on record."
                  : !depositApplies
                    ? `${depositStatusLabel[deposit.status]} — not applied.`
                    : !(deposit.amount > 0)
                      ? <span style={{ color: "#b45309", fontWeight: 600 }}>On file with no amount — enter it.</span>
                      : null}
              </span>
              {(!deposit || depositApplies) && (
                <button className={!deposit || !(deposit.amount > 0) ? "btn sm primary" : "btn sm"} onClick={startDepEdit}>
                  {!deposit ? "Add deposit" : !(deposit.amount > 0) ? "Enter amount" : "Edit"}
                </button>
              )}
            </span>
          ),
        )}

        {/* The CAM rec's own boxed balance row (owner: "format the total due
            like how we show amounts due on the CAM rec page") — the one place
            the answer is stated; no second big number above. */}
        <FinalBalanceRow label={finalNet >= 0 ? "Balance Due From Tenant" : "Refund Due to Tenant"} value={finalNet} />
        {!openAr && !meta.manual && <div className="muted small" style={{ marginTop: 6 }}>Before unpaid charges — import the final statement above.</div>}
      </div>
    </div>
  );

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>Move-Out Close-Out</h1>
          {/* The page's ONE driving control, as other pages place theirs: the
              brand pill in the header, sized to its contents, no label. */}
          {candidates.length > 0 && (
            <>
              <select
                value={candidates.some((c) => c.propertyCode === property && c.unitRef === unitRef) ? `${property}|${unitRef}` : ""}
                onChange={(e) => { const c = candidates.find((x) => `${x.propertyCode}|${x.unitRef}` === e.target.value); if (c) pickCandidate(c); }}
                className={SELECT_BRAND} aria-label="Move-out" style={{ maxWidth: "100%" }}
              >
                <option value="">Select a move-out or a lease ending…</option>
                {candidates.map((c) => {
                  const past = c.days != null && c.days < 0;
                  // Only "Moved out" is a close-out. A lease past its date while
                  // the tenant is still on the rent roll is a renewal not yet
                  // keyed, or a holdover — never offered as a move-out.
                  const status = c.kind === "vacated" ? "Moved out (off the rent roll)"
                    : past ? `Lease ended ${Math.abs(c.days!)}d ago · still on the rent roll`
                    : c.days != null ? `Lease ends in ${c.days}d` : "Lease ending";
                  return (
                    <option key={`${c.propertyCode}|${c.unitRef}|${c.name}`} value={`${c.propertyCode}|${c.unitRef}`}>
                      {c.name} — {c.propertyCode} {c.unitRef} · {status}
                    </option>
                  );
                })}
              </select>
              <button className="btn sm" onClick={() => setShowPicker((v) => !v)}>
                {pickerOpen ? "Hide other options" : "Other tenant / as of…"}
              </button>
            </>
          )}
        </div>
      </div>


      {pickerOpen && <div className="card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>Building
            <select value={property} onChange={(e) => { setProperty(e.target.value); setUnitRef(""); setData(null); setAsOf(""); }} className={SELECT_BRAND}>
              <option value="">Select…</option>
              {properties.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>Year
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={SELECT_BRAND}>
              {[now.getFullYear(), now.getFullYear() - 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>Tenant
            <select value={unitRef} onChange={(e) => { setUnitRef(e.target.value); const t = tenants.find((x) => x.unitRef === e.target.value); setAsOf(t?.expiresInYear ?? ""); setData(null); setError(null); }} className={SELECT_BRAND} style={{ minWidth: 240 }} disabled={!property}>
              <option value="">Select…</option>
              <option value="__MANUAL__">＋ Enter a tenant manually…</option>
              {tenants.map((t) => <option key={t.unitRef} value={t.unitRef}>{t.unitRef} · {t.name}{t.expiresInYear ? ` (expires ${MONTHS[t.expiresInYear - 1].slice(0, 3)})` : ""}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>As of
            <select value={asOf} onChange={(e) => setAsOf(e.target.value ? Number(e.target.value) : "")} className={SELECT_BRAND} disabled={!unitRef}>
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
      </div>}

      {finalBillCard}

      {r && meta && meta.manual && (
        <EditableOfficeStatement key={`${meta.unitRef}|${meta.name}|${meta.proRataPct}`} r={r} meta={meta} baseYears={baseYears} onBaseYear={(y) => generateManual({ baseYear: y })} />
      )}

      {r && meta && !meta.manual && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
            <div>
              {/* A SUBSECTION of the Final Bill (owner: "final bill is the header …
                  cam would be a subsection"): smaller, brand-coloured, and
                  without the tenant name the Final Bill already carries. */}
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0b4a7d" }}>CAM / RET Reconciliation</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {acctToggle}
              {sanityButton}
            </div>
          </div>
          <div className="muted small" style={{ marginBottom: 10 }}>
            Base year <b>{r.noBaseStop ? "NNN (full pool)" : r.baseYear}</b> · pro-rata <b>{pct2(r.proRataPct)}%</b> · occupied <b>{r.occupiedMonths}</b> of 12 months{meta.leaseTo ? <> · lease to <b>{meta.leaseTo}</b></> : null} · {meta.sqft.toLocaleString()} sf
          </div>
          {sanityCard}

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
              occupiedMonths={r.occupiedMonths} asOfLabel={asOfLabel} reconYear={meta.year} monthly={meta.opexMonth} showAcct={showAcct} />
            <Column title="Real Estate Taxes" lines={[r.retLine]} base={r.retLine.baseCost} actual={r.retLine.actual} net={r.retLine.netIncrease}
              due={r.retAmountDue} escrow={r.retEscrow} balance={r.retBalance} proRataPct={r.proRataPct}
              occupiedMonths={r.occupiedMonths} asOfLabel={asOfLabel} reconYear={meta.year} monthly={meta.reTaxMonth} showAcct={showAcct} />
          </div>

          <FinalBalanceRow label="Reconciliation Balance" value={r.opexBalance + r.retBalance} />
          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
            A positive balance is owed by the tenant; a credit is refunded. This is an interim figure as of {MONTHS[r.asOfMonth - 1]} {meta.year} — the Final Bill above carries it, with the unpaid charges and the deposit.
          </p>
        </div>
      )}

      {retail && meta && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
            <div>
              {/* A SUBSECTION of the Final Bill (owner: "final bill is the header …
                  cam would be a subsection"): smaller, brand-coloured, and
                  without the tenant name the Final Bill already carries. */}
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0b4a7d" }}>CAM / INS / RET Reconciliation</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {acctToggle}
              {sanityButton}
            </div>
          </div>
          <div className="muted small" style={{ marginBottom: 10 }}>
            Pro-rata <b>{pct2(retail.camPrs)}%</b> CAM (+{pct2(retail.adminFeePct)}% admin) · <b>{pct2(retail.insPrs)}%</b> INS · <b>{pct2(retail.retPrs)}%</b> RET · occupied <b>{retail.occupiedMonths}</b> of 12 months{meta.leaseTo ? <> · lease to <b>{meta.leaseTo}</b></> : null} · {meta.sqft.toLocaleString()} sf
          </div>
          {sanityCard}
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
                <thead><tr style={{ color: "var(--muted)", textAlign: "left" }}>{showAcct && <th style={{ textAlign: "left", paddingRight: 6 }}>Acct</th>}<th style={{ textAlign: "left", width: "100%" }}>Expense</th><th style={numTd}>{MONTHS[retail.asOfMonth - 1].slice(0, 3)} YTD</th></tr></thead>
                <tbody>
                  {retail.camSchedule.map((l) => (
                    <tr key={l.glAccount + l.label} style={{ textDecoration: l.billed ? "none" : "line-through", opacity: l.billed ? 1 : 0.5 }}>
                      {showAcct && <td style={{ whiteSpace: "nowrap" }}><code style={{ fontSize: 11 }}>{l.glAccount}</code></td>}
                      <td>{l.label}</td>
                      <td style={numTd}>{money(l.amount)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 800, borderTop: "1px solid var(--border)" }}>{showAcct && <td />}<td>Total billed pool</td><td style={numTd}>{money(retail.camPoolEffective)}</td></tr>
                </tbody>
              </table>
              <BalanceRow label={`× Share (${pct2(retail.camPrs)}%)`} value={money(retail.camShare)} />
              <BalanceRow label={`+ Admin fee (${pct2(retail.adminFeePct)}%)`} value={money(retail.camAdmin)} />
              <BalanceRow label="CAM Due" value={money(retail.camDue)} strong />
              <BalanceRow label={`Less: Billed (${money(meta.opexMonth)}/mo × ${retail.occupiedMonths})`} value={money(-retail.camEscrow)} />
              <FinalBalanceRow label="Balance, CAM Due" value={retail.camBalance} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ ...secLabel, color: "#0b4a7d", marginBottom: 6 }}>Insurance</div>
              <BalanceRow label={`Property INS pool ×${retail.occupiedMonths}/12`} value={money(retail.insPool)} />
              <BalanceRow label={`× Share (${pct2(retail.insPrs)}%)`} value={money(retail.insDue)} strong />
              <BalanceRow label="Less: Billed" value={money(-retail.insEscrow)} />
              <FinalBalanceRow label="Balance, INS Due" value={retail.insBalance} />
              <div style={{ height: 14 }} />
              <div style={{ ...secLabel, color: "#0b4a7d", marginBottom: 6 }}>Real Estate Taxes</div>
              <BalanceRow label={`RET pool ×${retail.occupiedMonths}/12`} value={money(retail.retPool)} />
              <BalanceRow label={`× Share (${pct2(retail.retPrs)}%)${retail.retDiscountPct ? ` − ${pct2(retail.retDiscountPct)}% disc` : ""}`} value={money(retail.retDue)} strong />
              <BalanceRow label={`Less: Billed (${money(meta.reTaxMonth)}/mo × ${retail.occupiedMonths})`} value={money(-retail.retEscrow)} />
              <FinalBalanceRow label="Balance, RET Due" value={retail.retBalance} />
            </div>
          </div>
          <FinalBalanceRow label="Reconciliation Balance" value={retail.camBalance + retail.insBalance + retail.retBalance} />
          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
            A positive balance is owed by the tenant; a credit is refunded. CAM pulls live YTD actuals from the GL; INS &amp; RET prorate the property pool to the occupied months. Interim figure as of {MONTHS[retail.asOfMonth - 1]} {meta.year} — the Final Bill above carries it, with the unpaid charges and the deposit.
          </p>
        </div>
      )}
      {letterModal}
    </main>
  );
}
