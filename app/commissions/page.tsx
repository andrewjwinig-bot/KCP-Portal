"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { RentRollData } from "../../lib/rentroll/parseRentRollExcel";
import { PROPERTY_DEFS, type FundGroup } from "../../lib/properties/data";
import {
  type CommissionEntry,
  INCENTIVE_TIERS,
  buildingFromUnitRef,
  buildJournalEntryRows,
  computeIncentive,
  incentiveRate,
  type JEFund,
  parseQuarterLabel,
  quarterShortCode,
  recentQuarterLabels,
  suiteFromUnitRef,
  termYearsBetween,
  toDisplayDate,
  toIsoDate,
} from "../../lib/commissions";
import { Calendar } from "@/app/components/Calendar";
import { downloadCommissionInvoice, downloadCommissionInvoicesZip } from "@/lib/commissions/downloadInvoices";
import { SendToAvidBillButton, formatSentDate } from "./SendToAvidBillButton";

// Office property codes — Business Parks Division commissions.
const OFFICE_CODES = new Set(
  PROPERTY_DEFS.filter((p) => p.type === "Office" && !p.entityKind).map((p) => p.id.toUpperCase()),
);

/** Building codes grouped by fund (entity cards excluded — Journal Entries hit
 *  real buildings only). Order here drives the DIST row order in the export. */
const FUND_BUILDINGS: Record<FundGroup, string[]> = {
  "JV III": PROPERTY_DEFS.filter((p) => p.fundGroup === "JV III" && !p.entityKind).map((p) => p.id),
  "NI LLC": PROPERTY_DEFS.filter((p) => p.fundGroup === "NI LLC" && !p.entityKind).map((p) => p.id),
};

const BATCH_STORAGE_KEY = "kcp:commissions:batchNumber";

const NEW_TENANT_VALUE = "__NEW__";

type FormState = {
  id: string | null;        // existing entry id when editing
  quarter: string;
  tenant: string;
  building: string;
  suite: string;
  sqft: string;             // string for input handling
  leaseFrom: string;
  leaseTo: string;
  termYears: string;
  incentiveAmount: string;
  comments: string;
  unitRef?: string;
};

function emptyForm(defaultQuarter: string): FormState {
  return {
    id: null, quarter: defaultQuarter, tenant: "",
    building: "", suite: "", sqft: "",
    leaseFrom: "", leaseTo: "", termYears: "", incentiveAmount: "",
    comments: "", unitRef: undefined,
  };
}

function toMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function CommissionsPage() {
  const [rentroll, setRentroll] = useState<RentRollData | null>(null);
  const [entries, setEntries]   = useState<CommissionEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const quarterOpts = useMemo(() => recentQuarterLabels(12), []);
  const [form, setForm] = useState<FormState>(() => emptyForm(quarterOpts[0]));
  /** Tracks the tenant dropdown selection independently of form.unitRef so the
   *  "Tenant name" manual input can be hidden until the user explicitly picks
   *  "+ New tenant". Values: "" | NEW_TENANT_VALUE | <unitRef>. */
  const [tenantSelection, setTenantSelection] = useState<string>("");

  // Avid send-log keyed by quarter — drives the "Sent to AvidXchange
  // on MM/DD/YY" badge that replaces the per-row action area once a
  // quarter has been billed.
  const [avidSent, setAvidSent] = useState<Record<string, { sentAt: string; count: number; total: number }>>({});
  const refreshAvidSent = useCallback(() => {
    fetch("/api/commissions/avidbill-sent")
      .then((r) => r.json())
      .then((d) => setAvidSent((d?.log && typeof d.log === "object") ? d.log : {}))
      .catch(() => { /* best-effort */ });
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([
      fetch("/api/rentroll").then((r) => r.json()).catch(() => ({ rentroll: null })),
      fetch("/api/commissions").then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/commissions/avidbill-sent").then((r) => r.json()).catch(() => ({ log: {} })),
    ])
      .then(([rr, ce, av]) => {
        setRentroll(rr.rentroll ?? null);
        setEntries(Array.isArray(ce.entries) ? ce.entries : []);
        setAvidSent((av?.log && typeof av.log === "object") ? av.log : {});
      })
      .finally(() => setLoading(false));
  }, []);

  // Build the office-tenant list for the dropdown
  const officeTenants = useMemo(() => {
    if (!rentroll) return [] as { value: string; label: string; unit: any }[];
    const rows: { value: string; label: string; unit: any }[] = [];
    for (const prop of rentroll.properties) {
      if (!OFFICE_CODES.has(prop.propertyCode.toUpperCase())) continue;
      for (const u of prop.units) {
        if (u.isVacant || !u.occupantName) continue;
        const suite = suiteFromUnitRef(u.unitRef);
        rows.push({
          value: u.unitRef,
          label: `${u.occupantName} · ${prop.propertyCode}${suite ? "-" + suite : ""}`,
          unit: u,
        });
      }
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label));
  }, [rentroll]);

  // ── Form helpers ─────────────────────────────────────────────────
  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Triggered when the user picks an existing tenant from the dropdown. */
  function applyTenantSelection(unitRef: string) {
    setTenantSelection(unitRef);
    if (unitRef === NEW_TENANT_VALUE || !unitRef) {
      setForm((prev) => ({
        ...prev,
        id: prev.id,
        tenant: "", building: "", suite: "", sqft: "",
        leaseFrom: "", leaseTo: "", termYears: "", incentiveAmount: "",
        unitRef: undefined,
      }));
      return;
    }
    const opt = officeTenants.find((o) => o.value === unitRef);
    if (!opt) return;
    const u = opt.unit;
    const suite = suiteFromUnitRef(u.unitRef);
    const building = buildingFromUnitRef(u.unitRef);
    const leaseFrom = u.leaseFrom ?? "";
    const leaseTo   = u.leaseTo   ?? "";
    const term = termYearsBetween(leaseFrom, leaseTo);
    const incentive = computeIncentive(term, u.sqft ?? 0);
    setForm((prev) => ({
      ...prev,
      tenant: u.occupantName,
      building,
      suite,
      sqft: String(u.sqft ?? ""),
      leaseFrom,
      leaseTo,
      termYears: term ? String(term) : "",
      incentiveAmount: incentive != null ? incentive.toFixed(2) : "",
      unitRef: u.unitRef,
    }));
  }

  /** Recompute term + incentive when dates or sqft change manually. */
  function recomputeFromDates(next: Partial<FormState>) {
    setForm((prev) => {
      const merged = { ...prev, ...next };
      const term = termYearsBetween(merged.leaseFrom, merged.leaseTo);
      const incentive = computeIncentive(term, Number(merged.sqft) || 0);
      return {
        ...merged,
        termYears: term ? String(term) : "",
        incentiveAmount: incentive != null ? incentive.toFixed(2) : "",
      };
    });
  }

  async function persist(next: CommissionEntry[]) {
    setSaving(true);
    setEntries(next);
    try {
      const res = await fetch("/api/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: next }),
      });
      if (!res.ok) throw new Error("Save failed");
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    if (!form.tenant.trim()) { setError("Tenant is required"); return; }
    const sqft = Number(form.sqft) || 0;
    const termYears = Number(form.termYears) || 0;
    const incentiveAmount = Number(form.incentiveAmount) || 0;
    const entry: CommissionEntry = {
      id: form.id ?? crypto.randomUUID(),
      quarter: form.quarter,
      tenant: form.tenant.trim(),
      building: form.building.trim(),
      suite: form.suite.trim(),
      sqft,
      leaseFrom: form.leaseFrom,
      leaseTo: form.leaseTo,
      termYears,
      incentiveAmount,
      comments: form.comments,
      unitRef: form.unitRef,
      createdAt: Date.now(),
    };
    const next = form.id
      ? entries.map((e) => (e.id === form.id ? { ...entry, createdAt: e.createdAt } : e))
      : [entry, ...entries];
    persist(next);
    setForm(emptyForm(form.quarter));
    setTenantSelection("");
  }

  function editEntry(e: CommissionEntry) {
    setForm({
      id: e.id, quarter: e.quarter, tenant: e.tenant, building: e.building,
      suite: e.suite, sqft: String(e.sqft),
      leaseFrom: e.leaseFrom, leaseTo: e.leaseTo,
      termYears: String(e.termYears),
      incentiveAmount: String(e.incentiveAmount),
      comments: e.comments, unitRef: e.unitRef,
    });
    setTenantSelection(e.unitRef ?? (e.tenant ? NEW_TENANT_VALUE : ""));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Generates and downloads a Journal Entry .xlsx for one fund + quarter group. */
  function downloadJournalEntry(fund: JEFund, quarter: string, list: CommissionEntry[]) {
    const parsed = parseQuarterLabel(quarter);
    if (!parsed) { setError(`Could not parse quarter "${quarter}"`); return; }
    const batchNumber = nextBatchNumber();
    const uniqueId = Math.floor(1_000_000 + Math.random() * 9_000_000); // 7-digit pseudo-unique placeholder
    const rows = buildJournalEntryRows({
      entries: list,
      fund,
      fundBuildings: FUND_BUILDINGS[fund],
      quarter: parsed.quarter,
      year: parsed.year,
      periodEnd: parsed.periodEnd,
      batchNumber,
      uniqueId,
    });
    if (!rows) {
      setError(`No ${fund} commissions for ${quarter}`);
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${fund.replace(/ /g, "_")} ${quarterShortCode(parsed.quarter, parsed.year)}`);
    const filename = `JE_${fund.replace(/ /g, "_")}_${quarterShortCode(parsed.quarter, parsed.year)}.xlsx`;
    XLSX.writeFile(wb, filename);
    setError(null);
  }

  function nextBatchNumber(): number {
    if (typeof window === "undefined") return 1;
    const raw = localStorage.getItem(BATCH_STORAGE_KEY);
    const current = raw ? Number(raw) : 97338; // seed close to the sample so it's recognizable
    const next = (Number.isFinite(current) ? current : 97338) + 1;
    try { localStorage.setItem(BATCH_STORAGE_KEY, String(next)); } catch { /* ignore */ }
    return next;
  }

  /** Generates and downloads Nancy L. Fox incentive-compensation memo
   *  PDFs for the chosen quarter — one PDF per fund (JV III, NI LLC).
   *  A fund with no entries that quarter is skipped silently. */
  async function downloadMemoPdf(quarter: string, list: CommissionEntry[]) {
    const parsed = parseQuarterLabel(quarter);
    if (!parsed) { setError(`Could not parse quarter "${quarter}"`); return; }
    try {
      const funds: ("JV III" | "NI LLC")[] = ["JV III", "NI LLC"];
      let downloaded = 0;
      for (const fund of funds) {
        const bytes = await buildCommissionMemoPdf({ quarter, entries: list, parsed, fund });
        if (!bytes) continue; // fund had no entries this quarter
        // Wrap in a fresh ArrayBuffer to satisfy lib.dom's BlobPart typing
        // (pdf-lib returns a Uint8Array which is technically ArrayBufferView).
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        const blob = new Blob([ab], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Commissions ${quarterShortCode(parsed.quarter, parsed.year)} - ${fund} - Nancy L Fox.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        downloaded++;
      }
      if (downloaded === 0) {
        setError("No commissions found for this quarter.");
      } else {
        setError(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "PDF failed");
    }
  }

  function deleteEntry(id: string) {
    if (!confirm("Delete this commission entry?")) return;
    persist(entries.filter((e) => e.id !== id));
    if (form.id === id) {
      setForm(emptyForm(form.quarter));
      setTenantSelection("");
    }
  }

  // Group entries by quarter for display
  const entriesByQuarter = useMemo(() => {
    const map = new Map<string, CommissionEntry[]>();
    for (const e of entries) {
      const k = e.quarter || "Unscheduled";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    for (const arr of map.values()) arr.sort((a, b) => b.createdAt - a.createdAt);
    return [...map.entries()].sort((a, b) => quarterSort(b[0]) - quarterSort(a[0]));
  }, [entries]);

  // Incentive paid to Nancy, then grossed up 20% for property billing.
  const MARKUP = 1.2;
  const grandTotal = entries.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);
  const grandTotalGross = grandTotal * MARKUP;

  // Standard rates table for reference card
  const rate = incentiveRate(Number(form.termYears) || 0);
  const isCalculatedExact = rate != null;
  const isExistingTenant = !!form.unitRef;

  // Same styling for all inputs
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px",
    border: "1px solid var(--border)", borderRadius: 6,
    background: "var(--card)", color: "var(--text)",
    fontSize: 13, fontFamily: "inherit", outline: "none",
  };
  const lockedStyle: React.CSSProperties = {
    ...inputStyle, background: "rgba(15,23,42,0.04)", color: "var(--muted)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.04em",
    textTransform: "uppercase", marginBottom: 4, display: "block",
  };

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Commissions</h1>
          <p className="muted small" style={{ marginTop: 4 }}>Request for Incentive Compensation · Business Parks Division</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div>COMMERCIAL</div><div>PROPERTIES</div>
          </div>
        </div>
      </header>

      {/* ── Submission reminder — incentive comp goes out each quarter-end ── */}
      {(() => {
        const now = new Date();
        const qNum = Math.floor(now.getMonth() / 3) + 1;
        const qEnd = new Date(now.getFullYear(), qNum * 3, 0);
        const daysLeft = Math.ceil((qEnd.getTime() - new Date(now.toDateString()).getTime()) / 86400000);
        const due = daysLeft <= 21;
        const qEndStr = `${qEnd.getMonth() + 1}/${qEnd.getDate()}/${qEnd.getFullYear()}`;
        return (
          <div style={{
            padding: "10px 14px", borderRadius: 8, fontSize: 13, lineHeight: 1.5,
            border: `1px solid ${due ? "rgba(217,119,6,0.45)" : "var(--border)"}`,
            background: due ? "rgba(217,119,6,0.08)" : "rgba(15,23,42,0.025)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: due ? "#d97706" : "#64748b" }} />
            <span>
              {due ? (
                <><b>Time to submit.</b> Nancy&rsquo;s incentive compensation goes to Payroll at the end of each quarter — Q{qNum} ends {qEndStr} ({daysLeft} day{daysLeft === 1 ? "" : "s"} left).</>
              ) : (
                <>Nancy&rsquo;s incentive compensation is submitted to Payroll at the end of each quarter. The current quarter (Q{qNum}) ends {qEndStr}.</>
              )}
            </span>
          </div>
        );
      })()}

      {/* ── Add / Edit form ─────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <b style={{ fontSize: 17 }}>{form.id ? "Edit Commission Entry" : "New Commission Entry"}</b>
          {error && <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>}
        </div>

        {/* Explicit fractional columns so the inputs stretch to fill the full row
            instead of auto-fit leaving empty tracks at the end. 8 columns: the
            wider Tenant column gets ~2.4fr, others scale to fit. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 2.4fr) minmax(0, 0.95fr) minmax(0, 0.75fr) minmax(0, 1fr) minmax(0, 1.05fr) minmax(0, 1.05fr) minmax(0, 0.9fr)",
          gap: 12,
        }}>
          {/* Period — fixed to the current quarter */}
          <div>
            <label style={labelStyle}>Period</label>
            <input type="text" value={form.quarter} readOnly tabIndex={-1} style={lockedStyle} />
          </div>

          {/* Tenant — pick existing OR new */}
          <div>
            <label style={labelStyle}>Tenant</label>
            <select
              value={tenantSelection}
              onChange={(e) => applyTenantSelection(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Select tenant —</option>
              <option value={NEW_TENANT_VALUE}>+ New tenant (enter manually)</option>
              <optgroup label="Office tenants">
                {officeTenants.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </optgroup>
            </select>
            {tenantSelection === NEW_TENANT_VALUE && (
              <input
                type="text"
                value={form.tenant}
                onChange={(e) => patch("tenant", e.target.value)}
                placeholder="Tenant name"
                style={{ ...inputStyle, marginTop: 6 }}
                autoFocus
              />
            )}
          </div>

          {/* Building */}
          <div>
            <label style={labelStyle}>Building</label>
            <input type="text" value={form.building} onChange={(e) => patch("building", e.target.value)}
              style={isExistingTenant ? lockedStyle : inputStyle}
              readOnly={isExistingTenant} />
          </div>

          {/* Suite */}
          <div>
            <label style={labelStyle}>Suite</label>
            <input type="text" value={form.suite} onChange={(e) => patch("suite", e.target.value)}
              style={isExistingTenant ? lockedStyle : inputStyle}
              readOnly={isExistingTenant} />
          </div>

          {/* Sqft */}
          <div>
            <label style={labelStyle}>Square Feet</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.sqft ? Number(form.sqft).toLocaleString() : ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                recomputeFromDates({ sqft: digits });
              }}
              style={isExistingTenant ? lockedStyle : inputStyle}
              readOnly={isExistingTenant}
            />
          </div>

          {/* Lease From — shared Calendar popover (card variant) */}
          <div>
            <label style={labelStyle}>Lease From</label>
            <Calendar
              value={toIsoDate(form.leaseFrom)}
              onChange={(iso) => recomputeFromDates({ leaseFrom: iso })}
              variant="card"
              placeholder="Pick lease start"
            />
          </div>

          {/* Lease To — shared Calendar popover (card variant) */}
          <div>
            <label style={labelStyle}>Lease To</label>
            <Calendar
              value={toIsoDate(form.leaseTo)}
              onChange={(iso) => recomputeFromDates({ leaseTo: iso })}
              variant="card"
              placeholder="Pick lease end"
            />
          </div>

          {/* Term Years */}
          <div>
            <label style={labelStyle}>Term (years)</label>
            <input
              type="number" step="0.1" value={form.termYears}
              onChange={(e) => {
                const term = Number(e.target.value) || 0;
                const incentive = computeIncentive(term, Number(form.sqft) || 0);
                setForm((prev) => ({
                  ...prev,
                  termYears: e.target.value,
                  incentiveAmount: incentive != null ? incentive.toFixed(2) : "",
                }));
              }}
              style={inputStyle}
            />
          </div>

          {/* Incentive Amount (auto-calculated, read-only) — spans full row so the
              breakdown sits inline like the spreadsheet ($91.80 = $0.15 × 612 sf). */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Incentive Amount</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <input
                type="text"
                value={form.incentiveAmount ? toMoney(Number(form.incentiveAmount)) : "—"}
                readOnly
                tabIndex={-1}
                style={{ ...lockedStyle, width: 160, textAlign: "right", fontWeight: 700, fontSize: 15 }}
              />
              {isCalculatedExact ? (
                <span style={{ fontSize: 14, color: "var(--text)" }}>
                  <span style={{ color: "var(--muted)", marginRight: 8 }}>=</span>
                  <span style={{ fontWeight: 600 }}>${rate!.toFixed(2)}</span>
                  <span style={{ color: "var(--muted)", margin: "0 6px" }}>×</span>
                  <span style={{ fontWeight: 600 }}>{Number(form.sqft || 0).toLocaleString()} sf</span>
                </span>
              ) : (
                <span className="muted small">Non-standard term — no standard rate applies</span>
              )}
            </div>
          </div>
        </div>

        {/* Comments */}
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Comments</label>
          <textarea
            value={form.comments}
            onChange={(e) => patch("comments", e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical", minHeight: 56 }}
          />
        </div>

        {/* Standard rates footnote */}
        <p className="muted small" style={{ marginTop: 12, marginBottom: 0, fontSize: 11, lineHeight: 1.6 }}>
          <span style={{ fontWeight: 700, marginRight: 6 }}>Standard Rates / SF:</span>
          {INCENTIVE_TIERS.map((r, i) => (
            <span key={r.years}>
              {i > 0 && <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>}
              {r.years} yr <span style={{ fontWeight: 600 }}>${r.ratePerSqft.toFixed(3)}</span>
            </span>
          ))}
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          {form.id && (
            <button className="btn" onClick={() => { setForm(emptyForm(form.quarter)); setTenantSelection(""); }} disabled={saving}>
              Cancel
            </button>
          )}
          <button
            className="btn primary"
            onClick={submit}
            disabled={saving || !form.tenant.trim()}
          >
            {form.id ? "Save Changes" : "Add Entry"}
          </button>
        </div>
      </div>

      {/* ── Saved entries ───────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
          <b style={{ fontSize: 17 }}>Pending Commissions</b>
          <span className="muted small">
            {entries.length} {entries.length === 1 ? "Entry" : "Entries"} · Incentive {toMoney(grandTotal)} · Gross (20%) {toMoney(grandTotalGross)}
          </span>
        </div>

        {loading ? (
          <div className="muted small">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="muted small">No commission entries yet. Add one above.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {entriesByQuarter.map(([quarter, list]) => {
              const total = list.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);
              const totalGross = total * MARKUP;
              const sentRecord = avidSent[quarter];
              const sentDateLabel = sentRecord ? formatSentDate(sentRecord.sentAt) : null;
              return (
                <div key={quarter} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", opacity: sentRecord ? 0.85 : 1 }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: sentRecord ? "rgba(22,163,74,0.07)" : "rgba(11,74,125,0.05)",
                    borderBottom: "1px solid var(--border)", gap: 12, flexWrap: "wrap",
                  }}>
                    <span style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      {quarter}
                      {sentRecord && (
                        <span style={{
                          fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                          padding: "2px 8px", borderRadius: 999,
                          background: "rgba(22,163,74,0.18)", color: "#15803d",
                          border: "1px solid rgba(22,163,74,0.35)",
                        }}>
                          SENT TO AVIDXCHANGE · {sentDateLabel}
                        </span>
                      )}
                    </span>
                    <span className="muted small">
                      {list.length} · Incentive {toMoney(total)} · Gross {toMoney(totalGross)}
                    </span>
                  </div>

                  {/* Download bar — same `btn large` / `btn primary large` pattern
                      used on the Payroll and CC Expense Coder pages. */}
                  <div style={{
                    display: "flex", gap: 8, flexWrap: "wrap",
                    padding: "14px 14px 16px",
                    borderBottom: "1px solid var(--border)",
                  }}>
                    <button className="btn primary large" onClick={() => downloadMemoPdf(quarter, list)}>
                      Download PDF Memo
                    </button>
                    <button className="btn large" onClick={() => downloadJournalEntry("JV III", quarter, list)}>
                      Download JV III JE
                    </button>
                    <button className="btn large" onClick={() => downloadJournalEntry("NI LLC", quarter, list)}>
                      Download NI LLC JE
                    </button>
                    {/* Bulk invoice zip — one PDF per commission, all
                        sent to AvidBill at quarter-end. Office side
                        bills incentive × 1.2 markup, same as the
                        TOTAL column on the table. */}
                    <button
                      className="btn large"
                      onClick={() => downloadCommissionInvoicesZip(quarter, list.map((e) => ({
                        entry: e,
                        amount: (Number(e.incentiveAmount) || 0) * MARKUP,
                      })))}
                    >
                      Download Invoices (Zip)
                    </button>
                    {/* Sends the same PDFs the zip would carry to
                        kormancommercial@avidbill.com via Postmark.
                        Prompts a dry-run preview first so staff can
                        eyeball the count + total before firing. */}
                    <SendToAvidBillButton quarterLabel={quarter} onSent={refreshAvidSent} />
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>TENANT</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>BUILDING</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>SUITE</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "right" }}>SQ FT</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>TERM</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>LEASE</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "right" }}>INCENTIVE</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "right" }}>TOTAL</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((e) => (
                        <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                            {e.tenant}
                            {e.comments && (
                              <div className="muted small" style={{ marginTop: 2, whiteSpace: "pre-wrap" }}>{e.comments}</div>
                            )}
                          </td>
                          <td style={{ padding: "10px 12px" }}>{e.building}</td>
                          <td style={{ padding: "10px 12px" }}>{e.suite}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>{e.sqft.toLocaleString()}</td>
                          <td style={{ padding: "10px 12px" }}>{e.termYears} yr</td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{toDisplayDate(e.leaseFrom)} – {toDisplayDate(e.leaseTo)}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{toMoney(e.incentiveAmount)}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "var(--brand)" }}>
                            {toMoney((Number(e.incentiveAmount) || 0) * MARKUP)}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <button
                              className="btn"
                              onClick={() => downloadCommissionInvoice(e, (Number(e.incentiveAmount) || 0) * MARKUP)}
                              style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}
                              title="Download AvidBill invoice for this commission"
                            >Invoice</button>
                            <button className="btn" onClick={() => editEntry(e)} style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}>Edit</button>
                            <button
                              onClick={() => deleteEntry(e.id)}
                              title="Delete row"
                              aria-label="Delete row"
                              style={{
                                width: 20, height: 20, padding: 0,
                                borderRadius: 4,
                                border: "1px solid rgba(180,35,24,0.45)",
                                background: "rgba(180,35,24,0.08)",
                                color: "#b42318",
                                cursor: "pointer",
                                fontSize: 14, lineHeight: 1, fontWeight: 700,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                              }}
                            >×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

// ─── PDF memo generator ─────────────────────────────────────────────────

const COMMISSIONS_MARKUP = 1.2;

async function buildCommissionMemoPdf(opts: {
  quarter: string;
  entries: CommissionEntry[];
  parsed: NonNullable<ReturnType<typeof parseQuarterLabel>>;
  /** Which fund to render. The PDF only contains rows for buildings
   *  belonging to this fund; the other fund's entries are ignored. */
  fund: "JV III" | "NI LLC";
}): Promise<Uint8Array | null> {
  const { entries, parsed, fund } = opts;
  const periodEnd = parsed.periodEnd;
  const periodEndStr = `${periodEnd.getMonth() + 1}/${periodEnd.getDate()}/${periodEnd.getFullYear()}`;

  // Filter entries to just this fund. Buildings whose code matches the
  // requested fund's PROPERTY_DEFS are included; entries that don't
  // resolve to a known fund are dropped from both PDFs.
  const fundSet = new Set(
    PROPERTY_DEFS.filter((p) => p.fundGroup === fund).map((p) => p.id.toUpperCase()),
  );
  const sorted = [...entries].sort((a, b) => {
    const bd = a.building.localeCompare(b.building);
    return bd !== 0 ? bd : a.suite.localeCompare(b.suite);
  });
  const fundEntries = sorted.filter((e) => fundSet.has((e.building || "").toUpperCase()));

  // No work to do for this fund this quarter — caller skips downloading.
  if (fundEntries.length === 0) return null;

  const subtotal = fundEntries.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);
  const total    = subtotal * COMMISSIONS_MARKUP;

  // ── pdf-lib setup ──
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // Letter portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const navy  = rgb(11 / 255, 74 / 255, 125 / 255);
  const white = rgb(1, 1, 1);
  const ink   = rgb(0.10, 0.12, 0.15);
  const gray  = rgb(0.42, 0.46, 0.52);
  const shade = rgb(0.945, 0.955, 0.965);
  const rule  = rgb(0.80, 0.82, 0.86);

  const margin = 50;
  const pageW  = 612;
  const right  = pageW - margin; // 562
  const contentW = pageW - margin * 2;
  let y = 736;

  const txt = (s: string, x: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(s, { x, y: yy, font: o.b ? bold : font, size: o.size ?? 10, color: o.color ?? ink });
  const txtR = (s: string, xr: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const f = o.b ? bold : font, sz = o.size ?? 10;
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, sz), y: yy, font: f, size: sz, color: o.color ?? ink });
  };
  const txtC = (s: string, cx: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const f = o.b ? bold : font, sz = o.size ?? 10;
    page.drawText(s, { x: cx - f.widthOfTextAtSize(s, sz) / 2, y: yy, font: f, size: sz, color: o.color ?? ink });
  };
  const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fit = (s: string, w: number, sz: number) => {
    if (font.widthOfTextAtSize(s, sz) <= w) return s;
    let t = s;
    while (t.length > 1 && font.widthOfTextAtSize(t + "…", sz) > w) t = t.slice(0, -1);
    return t + "…";
  };

  // ── Letterhead — Korman Commercial logo (left) + document title (right) ──
  txt("KORMAN", margin, y, { b: true, size: 26, color: navy });
  txt("C O M M E R C I A L   P R O P E R T I E S", margin + 1, y - 13, { b: true, size: 7, color: gray });
  txtR("INCENTIVE COMPENSATION", right, y + 4, { b: true, size: 17, color: navy });
  txtR("Request for Payment", right, y - 12, { size: 9, color: gray });
  y -= 27;
  page.drawRectangle({ x: margin, y, width: contentW, height: 2, color: navy });
  y -= 26;

  // ── Memo block (To / From / Date / Subject) ──
  const memoRows: [string, string][] = [
    ["TO", "Payroll"],
    ["FROM", "Alison Korman"],
    ["DATE", periodEndStr],
    ["PERIOD", `Q${Math.floor(periodEnd.getMonth() / 3) + 1} ${periodEnd.getFullYear()}`],
    ["FUND", fund],
    ["SUBJECT", "Incentive Compensation — Nancy L. Fox"],
  ];
  const memoH = memoRows.length * 16 + 12;
  page.drawRectangle({ x: margin, y: y - memoH + 12, width: contentW, height: memoH, color: shade });
  let my = y;
  for (const [k, v] of memoRows) {
    txt(k, margin + 12, my, { b: true, size: 8, color: navy });
    txt(v, margin + 92, my, { size: 10 });
    my -= 16;
  }
  y -= memoH + 14;

  // ── Intro ──
  txt(`Please pay Nancy L. Fox $${money(subtotal)} in incentive compensation for the following leases:`, margin, y, { size: 10.5 });
  y -= 26;

  // ── Table ──
  const cols = [
    { key: "building", label: "Building",   x: 50,  w: 52, align: "l" as const },
    { key: "suite",    label: "Suite",      x: 102, w: 40, align: "l" as const },
    { key: "tenant",   label: "Tenant",     x: 142, w: 150, align: "l" as const },
    { key: "from",     label: "Lease From", x: 292, w: 64, align: "l" as const },
    { key: "to",       label: "Lease To",   x: 356, w: 64, align: "l" as const },
    { key: "term",     label: "Term",       x: 420, w: 36, align: "r" as const },
    { key: "sub",      label: "Subtotal",   x: 456, w: 50, align: "r" as const },
    { key: "tot",      label: "Total *",    x: 506, w: 56, align: "r" as const },
  ];
  const subColEnd = cols[6].x + cols[6].w;
  const totColEnd = cols[7].x + cols[7].w;

  function dataRow(vals: string[], fill?: ReturnType<typeof rgb>) {
    if (fill) page.drawRectangle({ x: margin, y: y - 4, width: contentW, height: 15, color: fill });
    cols.forEach((c, i) => {
      const v = vals[i] ?? "";
      if (!v) return;
      if (c.align === "r") txtR(v, c.x + c.w, y, { size: 9 });
      else txt(v, c.x, y, { size: 9 });
    });
  }

  function section(title: string, list: CommissionEntry[]) {
    if (!list.length) return;
    // Section bar
    page.drawRectangle({ x: margin, y: y - 6, width: contentW, height: 18, color: navy });
    txt(title, margin + 8, y, { b: true, size: 10, color: white });
    y -= 24;
    // Column headers
    cols.forEach((c) => {
      if (c.align === "r") txtR(c.label, c.x + c.w, y, { b: true, size: 8, color: gray });
      else txt(c.label, c.x, y, { b: true, size: 8, color: gray });
    });
    y -= 5;
    page.drawLine({ start: { x: margin, y }, end: { x: right, y }, thickness: 0.75, color: rule });
    y -= 14;
    // Data rows
    let sub = 0;
    list.forEach((e, idx) => {
      const s = Number(e.incentiveAmount) || 0;
      sub += s;
      dataRow([
        e.building,
        e.suite,
        fit(e.tenant, cols[2].w - 4, 9),
        toDisplayDate(e.leaseFrom),
        toDisplayDate(e.leaseTo),
        String(e.termYears),
        money(s),
        money(s * COMMISSIONS_MARKUP),
      ], idx % 2 === 1 ? shade : undefined);
      y -= 16;
    });
    // Section total
    page.drawLine({ start: { x: margin, y: y + 11 }, end: { x: right, y: y + 11 }, thickness: 0.75, color: rule });
    txtR(`${title} TOTAL`, subColEnd - cols[6].w - 12, y, { b: true, size: 9 });
    txtR(money(sub), subColEnd, y, { b: true, size: 9 });
    txtR(money(sub * COMMISSIONS_MARKUP), totColEnd, y, { b: true, size: 9 });
    y -= 26;
  }

  section(fund, fundEntries);

  // ── Grand total bar ──
  page.drawRectangle({ x: margin, y: y - 7, width: contentW, height: 22, color: navy });
  txtR("TOTAL", subColEnd - cols[6].w - 12, y, { b: true, size: 11, color: white });
  txtR(money(subtotal), subColEnd, y, { b: true, size: 11, color: white });
  txtR(money(total), totColEnd, y, { b: true, size: 11, color: white });
  y -= 34;

  // ── Footnote ──
  txt("*  Total reflects the incentive subtotal grossed up 20% for property billing.", margin, y, { size: 8.5, color: gray });
  y -= 30;

  // ── Charge instruction ──
  const note = "Please charge commissions to 6620-8501 and deposit into LIK Clearing x1622";
  page.drawRectangle({ x: margin, y: y - 9, width: contentW, height: 24, color: shade });
  txtC(note, pageW / 2, y, { b: true, size: 9.5, color: navy });

  return pdf.save();
}

/** Numeric sort key for quarter labels (most recent → highest number).
 *  Handles both the short "Q2 26" format and the legacy "2nd Quarter 2026" format. */
function quarterSort(label: string): number {
  const short = /^Q(\d)\s+(\d{2,4})/.exec(label);
  if (short) {
    const yr = Number(short[2]);
    const fullYear = yr < 100 ? 2000 + yr : yr;
    return fullYear * 10 + Number(short[1]);
  }
  const long = /^(\d)\w+ Quarter (\d{4})/.exec(label);
  if (long) return Number(long[2]) * 10 + Number(long[1]);
  return 0;
}
