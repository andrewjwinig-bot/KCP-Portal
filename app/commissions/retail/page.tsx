"use client";

import LoadingState from "@/app/components/LoadingState";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RentRollData } from "../../../lib/rentroll/parseRentRollExcel";
import { PROPERTY_DEFS } from "../../../lib/properties/data";
import {
  type CommissionEntry,
  RETAIL_COMMISSION_PER_SQFT,
  retailCommission,
  buildingFromUnitRef,
  parseQuarterLabel,
  quarterShortCode,
  recentQuarterLabels,
  suiteFromUnitRef,
  termYearsBetween,
  toDisplayDate,
  toIsoDate,
} from "../../../lib/commissions";
import { Calendar } from "@/app/components/Calendar";
import { downloadCommissionInvoice, downloadCommissionInvoicesZip } from "@/lib/commissions/downloadInvoices";
import { buildRetailMemoPdf, RETAIL_PAYEE } from "@/lib/commissions/retailMemoPdf";
import { formatSentDate, CommissionSectionHeading, SendToAvidBillButton } from "../SendToAvidBillButton";

/** Billed to AvidXchange at commission × 1.2, as the office commissions are. */
const MARKUP = 1.2;

const PAYEE = RETAIL_PAYEE;

// Retail property codes — Shopping Centers Division.
const RETAIL_CODES = new Set(
  PROPERTY_DEFS.filter((p) => p.type === "Retail" && !p.entityKind).map((p) => p.id.toUpperCase()),
);

const NEW_TENANT_VALUE = "__NEW__";

type FormState = {
  id: string | null;
  quarter: string;
  tenant: string;
  building: string;
  suite: string;
  sqft: string;
  rate: string;
  leaseFrom: string;
  leaseTo: string;
  termYears: string;
  comments: string;
  unitRef?: string;
};

function emptyForm(defaultQuarter: string): FormState {
  return {
    id: null, quarter: defaultQuarter, tenant: "",
    building: "", suite: "", sqft: "", rate: "",
    leaseFrom: "", leaseTo: "", termYears: "", comments: "", unitRef: undefined,
  };
}

function toMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function quarterSort(label: string): number {
  const m = /^Q(\d)\s*(\d{2,4})/.exec(label) || /^(\d)\w+ Quarter (\d{4})/.exec(label);
  if (!m) return 0;
  const q = Number(m[1]);
  let y = Number(m[2]);
  if (y < 100) y += 2000;
  return y * 4 + q;
}

export default function RetailCommissionsPage() {
  const [rentroll, setRentroll] = useState<RentRollData | null>(null);
  const [entries, setEntries]   = useState<CommissionEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const quarterOpts = useMemo(() => recentQuarterLabels(12), []);
  const [form, setForm] = useState<FormState>(() => emptyForm(quarterOpts[0]));
  const [tenantSelection, setTenantSelection] = useState<string>("");

  // Avid send-log keyed by quarter — shared across office + retail
  // since both stores feed the same email batch.
  const [avidSent, setAvidSent] = useState<Record<string, { sentAt: string; count: number; total: number }>>({});
  // What went to Avid, as sent — the record of past quarters (owner: "store
  // historical records once they're sent to avid … reference prior quarters").
  // A sent commission stays listed (read-only) even if its live entry is gone.
  const [sentHistory, setSentHistory] = useState<Record<string, { entry: CommissionEntry; amount: number; invoiceNumber: string; sentAt: string }[]>>({});
  const refreshAvidSent = useCallback(() => {
    fetch("/api/commissions/avidbill-sent")
      .then((r) => r.json())
      .then((d) => { setAvidSent({ ...((d?.log && typeof d.log === "object") ? d.log : {}), ...(d?.sentByKind?.retail ?? {}) }); setSentHistory(d?.history?.retail ?? {}); })
      .catch(() => { /* best-effort */ });
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/rentroll").then((r) => r.json()).catch(() => ({ rentroll: null })),
      fetch("/api/commissions/retail").then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/commissions/avidbill-sent").then((r) => r.json()).catch(() => ({ log: {} })),
    ])
      .then(([rr, ce, av]) => {
        setRentroll(rr.rentroll ?? null);
        setEntries(Array.isArray(ce.entries) ? ce.entries : []);
        setAvidSent({ ...((av?.log && typeof av.log === "object") ? av.log : {}), ...(av?.sentByKind?.retail ?? {}) });
        setSentHistory(av?.history?.retail ?? {});
      })
      .finally(() => setLoading(false));
  }, []);

  const retailTenants = useMemo(() => {
    if (!rentroll) return [] as { value: string; label: string; unit: any }[];
    const rows: { value: string; label: string; unit: any }[] = [];
    for (const prop of rentroll.properties) {
      if (!RETAIL_CODES.has(prop.propertyCode.toUpperCase())) continue;
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

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyTenantSelection(unitRef: string) {
    setTenantSelection(unitRef);
    if (unitRef === NEW_TENANT_VALUE || !unitRef) {
      setForm((prev) => ({
        ...prev,
        tenant: "", building: "", suite: "", sqft: "", rate: "",
        leaseFrom: "", leaseTo: "", termYears: "", unitRef: undefined,
      }));
      return;
    }
    const opt = retailTenants.find((o) => o.value === unitRef);
    if (!opt) return;
    const u = opt.unit;
    const leaseFrom = u.leaseFrom ?? "";
    const leaseTo   = u.leaseTo   ?? "";
    const term = termYearsBetween(leaseFrom, leaseTo);
    // Rate auto-fills from the rent roll's annual $/SF — still editable.
    const rate = Number(u.annualRentPerSqft) || 0;
    setForm((prev) => ({
      ...prev,
      tenant: u.occupantName,
      building: buildingFromUnitRef(u.unitRef),
      suite: suiteFromUnitRef(u.unitRef),
      sqft: String(u.sqft ?? ""),
      rate: rate ? rate.toFixed(2) : "",
      leaseFrom,
      leaseTo,
      termYears: term ? String(term) : "",
      unitRef: u.unitRef,
    }));
  }

  /** Recompute term when dates change. */
  function recompute(next: Partial<FormState>) {
    setForm((prev) => {
      const merged = { ...prev, ...next };
      if (next.leaseFrom !== undefined || next.leaseTo !== undefined) {
        const term = termYearsBetween(merged.leaseFrom, merged.leaseTo);
        merged.termYears = term ? String(term) : "";
      }
      return merged;
    });
  }

  const commission = retailCommission(Number(form.sqft) || 0);

  async function persist(next: CommissionEntry[]): Promise<boolean> {
    setSaving(true);
    setEntries(next);
    try {
      const res = await fetch("/api/commissions/retail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: next }),
      });
      if (!res.ok) throw new Error("Save failed");
      setError(null);
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** Harry's commissions go to AvidXchange as he saves them (owner): the
   *  invoice (× 1.2), the GL import to Marie, and his payroll figure to him. */
  const [sendNote, setSendNote] = useState<{ ok: boolean; text: string } | null>(null);
  async function sendEntryToAvid(entry: CommissionEntry) {
    setSaving(true);
    setSendNote(null);
    try {
      const r = await fetch("/api/commissions/retail/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      const j = await r.json().catch(() => ({}));
      setSendNote(j?.avid
        ? { ok: !!j.ok, text: j.ok
            ? `✓ ${entry.tenant} sent to AvidXchange as ${j.invoiceNumber} — GL import to Marie, ${toMoney(j.amount ?? 0)} to you for payroll.`
            : `${entry.tenant} reached AvidXchange as ${j.invoiceNumber}, but ${j.reason ?? "a follow-up email did not go"}.` }
        : { ok: false, text: `${entry.tenant} was saved but NOT sent to AvidXchange: ${j?.reason ?? "send failed"}. Use Send to AvidXchange on the quarter to retry.` });
      refreshAvidSent();
    } catch {
      setSendNote({ ok: false, text: `${entry.tenant} was saved but NOT sent to AvidXchange. Use Send to AvidXchange on the quarter to retry.` });
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!form.tenant.trim()) { setError("Tenant is required"); return; }
    const entry: CommissionEntry = {
      id: form.id ?? crypto.randomUUID(),
      quarter: form.quarter,
      tenant: form.tenant.trim(),
      building: form.building.trim(),
      suite: form.suite.trim(),
      sqft: Number(form.sqft) || 0,
      rate: Number(form.rate) || 0,
      leaseFrom: form.leaseFrom,
      leaseTo: form.leaseTo,
      termYears: Number(form.termYears) || 0,
      incentiveAmount: commission,
      comments: form.comments,
      unitRef: form.unitRef,
      createdAt: Date.now(),
    };
    const next = form.id
      ? entries.map((e) => (e.id === form.id ? { ...entry, createdAt: e.createdAt } : e))
      : [entry, ...entries];
    const isNew = !form.id;
    setForm(emptyForm(form.quarter));
    setTenantSelection("");
    const saved = await persist(next);
    if (saved && isNew) await sendEntryToAvid(entry);
  }

  function editEntry(e: CommissionEntry) {
    setForm({
      id: e.id, quarter: e.quarter, tenant: e.tenant, building: e.building,
      suite: e.suite, sqft: String(e.sqft), rate: e.rate != null ? String(e.rate) : "",
      leaseFrom: e.leaseFrom, leaseTo: e.leaseTo, termYears: String(e.termYears),
      comments: e.comments, unitRef: e.unitRef,
    });
    setTenantSelection(e.unitRef ?? (e.tenant ? NEW_TENANT_VALUE : ""));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Relabel every entry on a quarter's card to another quarter — for a batch
   *  entered under the wrong period. Invoice numbers and dates follow it. */
  function moveQuarter(from: string, list: CommissionEntry[], to: string) {
    if (!to || to === from) return;
    if (!window.confirm(`Move all ${list.length} commission${list.length === 1 ? "" : "s"} from ${from} to ${to}?`)) return;
    const ids = new Set(list.map((e) => e.id));
    persist(entries.map((e) => (ids.has(e.id) ? { ...e, quarter: to } : e)));
  }

  function deleteEntry(id: string) {
    if (!confirm("Delete this commission entry?")) return;
    persist(entries.filter((e) => e.id !== id));
    if (form.id === id) { setForm(emptyForm(form.quarter)); setTenantSelection(""); }
  }

  async function downloadMemoPdf(quarter: string, list: CommissionEntry[]) {
    const parsed = parseQuarterLabel(quarter);
    if (!parsed) { setError(`Could not parse quarter "${quarter}"`); return; }
    try {
      const bytes = await buildRetailMemoPdf({ entries: list, parsed });
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const blob = new Blob([ab], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Retail Commissions ${quarterShortCode(parsed.quarter, parsed.year)} - ${PAYEE}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "PDF failed");
    }
  }

  const entriesByQuarter = useMemo(() => {
    const map = new Map<string, CommissionEntry[]>();
    for (const e of entries) {
      const k = e.quarter || "Unscheduled";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    // A sent commission whose live entry was deleted is still on record.
    const live = new Set(entries.map((e) => e.id));
    for (const [q, sent] of Object.entries(sentHistory)) {
      for (const h of sent) {
        if (live.has(h.entry.id)) continue;
        if (!map.has(q)) map.set(q, []);
        map.get(q)!.push({ ...h.entry, quarter: q });
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => b.createdAt - a.createdAt);
    return [...map.entries()].sort((a, b) => quarterSort(b[0]) - quarterSort(a[0]));
  }, [entries, sentHistory]);
  /** When each commission went to Avid — a sent one is a record, not editable. */
  const sentAtById = useMemo(() => {
    const m = new Map<string, string>();
    for (const sent of Object.values(sentHistory)) for (const h of sent) m.set(h.entry.id, h.sentAt);
    return m;
  }, [sentHistory]);

  const grandTotal = entries.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);
  const isExistingTenant = !!form.unitRef;

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

  /** The quarter cards, split: "pending" = not yet at AvidXchange, "paid" = sent. */
  function renderSections(mode: "pending" | "paid") {
          // Split into Pending vs Paid sections — same layout shape
          // as /commissions (office) so staff get a consistent
          // visual treatment across both pages.
          const pendingQuarters = entriesByQuarter.filter(([q]) => !avidSent[q]);
          const paidQuarters    = entriesByQuarter.filter(([q]) =>  avidSent[q]);
          const renderQuarterCard = ([quarter, list]: [string, CommissionEntry[]]) => {
              const total = list.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);
              const sentRecord = avidSent[quarter];
              const sentDateLabel = sentRecord ? formatSentDate(sentRecord.sentAt) : null;
              return (
                <div key={quarter} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", opacity: sentRecord ? 0.85 : 1 }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px",
                    background: sentRecord ? "rgba(22,163,74,0.07)" : "rgba(11,74,125,0.05)",
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
                    <span className="muted small" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {list.length} · Commission {toMoney(total)} · Gross {toMoney(total * MARKUP)}
                      {!sentRecord && (
                        <select className="select-sm" value="" disabled={saving}
                          onChange={(ev) => moveQuarter(quarter, list, ev.target.value)}>
                          <option value="">Move to…</option>
                          {quarterOpts.slice(0, 4).filter((q) => q !== quarter).map((q) => (
                            <option key={q} value={q}>{q}</option>
                          ))}
                        </select>
                      )}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "14px 14px 16px", borderBottom: "1px solid var(--border)" }}>
                    <button className="btn primary large" onClick={() => downloadMemoPdf(quarter, list)}>
                      Download PDF Memo
                    </button>
                    {/* Each invoice bills the commission × 1.2 (the 20%
                        markup), as the office invoices do. */}
                    <button
                      className="btn large"
                      onClick={() => downloadCommissionInvoicesZip(quarter, list.map((e) => ({
                        entry: e,
                        amount: (Number(e.incentiveAmount) || 0) * MARKUP,
                      })))}
                    >
                      Download Invoices (Zip)
                    </button>
                    {!sentRecord && <SendToAvidBillButton quarterLabel={quarter} kind="retail" onSent={refreshAvidSent} />}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>TENANT</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>BUILDING</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>SUITE</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "right" }}>SQ FT</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "right" }}>RATE</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>TERM</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}>LEASE</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "right" }}>COMMISSION</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "right" }}>TOTAL</th>
                        <th style={{ padding: "8px 12px", fontWeight: 700 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((e) => (
                        <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                            {e.tenant}
                            {e.comments && <div className="muted small" style={{ marginTop: 2, whiteSpace: "pre-wrap" }}>{e.comments}</div>}
                          </td>
                          <td style={{ padding: "10px 12px" }}>{e.building}</td>
                          <td style={{ padding: "10px 12px" }}>{e.suite}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>{e.sqft.toLocaleString()}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>${(e.rate ?? 0).toFixed(2)}</td>
                          <td style={{ padding: "10px 12px" }}>{e.termYears} yr</td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{toDisplayDate(e.leaseFrom)} – {toDisplayDate(e.leaseTo)}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>
                            {toMoney(e.incentiveAmount)}
                          </td>
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
                            {sentAtById.has(e.id) ? (
                              <span className="muted small" title="Sent to AvidXchange — kept as sent">Sent {formatSentDate(sentAtById.get(e.id)!)}</span>
                            ) : (<>
                            <button className="btn" onClick={() => editEntry(e)} style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}>Edit</button>
                            <button onClick={() => deleteEntry(e.id)} title="Delete row" aria-label="Delete row"
                              style={{
                                width: 20, height: 20, padding: 0, borderRadius: 4,
                                border: "1px solid rgba(180,35,24,0.45)", background: "rgba(180,35,24,0.08)",
                                color: "#b42318", cursor: "pointer", fontSize: 14, lineHeight: 1, fontWeight: 700,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                              }}>×</button>
                            </>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
          };
          // Pending is only what has NOT gone to AvidXchange (owner); a sent
          // quarter is a record and sits in its own Processed card below.
          if (mode === "pending") {
            return pendingQuarters.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {pendingQuarters.map(renderQuarterCard)}
              </div>
            ) : (
              <div className="muted small">Nothing pending — every quarter logged has gone to AvidXchange.</div>
            );
          }
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {paidQuarters.map(renderQuarterCard)}
            </div>
          );
  }
  const processedCount = entriesByQuarter.filter(([q]) => avidSent[q]).length;
  const pendingEntries = entries.filter((e) => !avidSent[e.quarter]);
  const pendingTotal = pendingEntries.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Retail Commissions</h1>
          <p className="muted small" style={{ marginTop: 4 }}>Request for Leasing Commission · Shopping Centers Division</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div>COMMERCIAL</div><div>PROPERTIES</div>
          </div>
        </div>
      </header>

      {/* ── Add / Edit form ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <b style={{ fontSize: 17 }}>{form.id ? "Edit Commission Entry" : "New Commission Entry"}</b>
          {error && <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>}
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 2.2fr) minmax(0, 0.9fr) minmax(0, 0.7fr) minmax(0, 0.9fr) minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr)",
          gap: 12,
        }}>
          {/* Period — the current quarter by default; an earlier one can be
              picked so a deal closed in Q3 but keyed in Q4 is billed with Q3
              (same as the office page). */}
          <div>
            <label style={labelStyle}>Period</label>
            <select
              value={form.quarter}
              onChange={(e) => setForm((f) => ({ ...f, quarter: e.target.value }))}
              style={inputStyle}
            >
              {[...new Set([form.quarter, ...quarterOpts.slice(0, 4)])].map((q) => (
                <option key={q} value={q}>{q}{q === quarterOpts[0] ? " (current)" : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Tenant</label>
            <select value={tenantSelection} onChange={(e) => applyTenantSelection(e.target.value)} style={inputStyle}>
              <option value="">— Select tenant —</option>
              <option value={NEW_TENANT_VALUE}>+ New tenant (enter manually)</option>
              <optgroup label="Retail tenants">
                {retailTenants.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </optgroup>
            </select>
            {tenantSelection === NEW_TENANT_VALUE && (
              <input type="text" value={form.tenant} onChange={(e) => patch("tenant", e.target.value)}
                placeholder="Tenant name" style={{ ...inputStyle, marginTop: 6 }} autoFocus />
            )}
          </div>

          <div>
            <label style={labelStyle}>Building</label>
            <input type="text" value={form.building} onChange={(e) => patch("building", e.target.value)}
              style={isExistingTenant ? lockedStyle : inputStyle} readOnly={isExistingTenant} />
          </div>

          <div>
            <label style={labelStyle}>Suite</label>
            <input type="text" value={form.suite} onChange={(e) => patch("suite", e.target.value)}
              style={isExistingTenant ? lockedStyle : inputStyle} readOnly={isExistingTenant} />
          </div>

          <div>
            <label style={labelStyle}>Square Feet</label>
            <input type="text" inputMode="numeric"
              value={form.sqft ? Number(form.sqft).toLocaleString() : ""}
              onChange={(e) => patch("sqft", e.target.value.replace(/[^\d]/g, ""))}
              style={isExistingTenant ? lockedStyle : inputStyle} readOnly={isExistingTenant} />
          </div>

          <div>
            <label style={labelStyle}>Rate $/SF</label>
            <input type="number" step="0.01" value={form.rate}
              onChange={(e) => patch("rate", e.target.value)}
              placeholder="0.00" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Lease From</label>
            <Calendar value={toIsoDate(form.leaseFrom)} onChange={(iso) => recompute({ leaseFrom: iso })}
              variant="card" placeholder="Pick lease start" />
          </div>

          <div>
            <label style={labelStyle}>Lease To</label>
            <Calendar value={toIsoDate(form.leaseTo)} onChange={(iso) => recompute({ leaseTo: iso })}
              variant="card" placeholder="Pick lease end" />
          </div>

          <div>
            <label style={labelStyle}>Term (years)</label>
            <input type="number" step="0.1" value={form.termYears}
              onChange={(e) => patch("termYears", e.target.value)} style={inputStyle} />
          </div>

          {/* Commission — calculated */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Commission</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <input type="text" value={commission ? toMoney(commission) : "—"} readOnly tabIndex={-1}
                style={{ ...lockedStyle, width: 160, textAlign: "right", fontWeight: 700, fontSize: 15 }} />
              <span style={{ fontSize: 13, color: "var(--text)" }}>
                <span style={{ color: "var(--muted)", marginRight: 8 }}>=</span>
                <span style={{ fontWeight: 600 }}>{(Number(form.sqft) || 0).toLocaleString()} sf</span>
                <span style={{ color: "var(--muted)", margin: "0 6px" }}>×</span>
                <span style={{ fontWeight: 600 }}>${RETAIL_COMMISSION_PER_SQFT.toFixed(2)}/sf</span>
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Comments</label>
          <textarea value={form.comments} onChange={(e) => patch("comments", e.target.value)} rows={2}
            style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} />
        </div>

        <p className="muted small" style={{ marginTop: 12, marginBottom: 0, fontSize: 11 }}>
          Retail leasing commission is <b>$1.00 per square foot</b> leased (square feet × $1).
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          {form.id && (
            <button className="btn" onClick={() => { setForm(emptyForm(form.quarter)); setTenantSelection(""); }} disabled={saving}>
              Cancel
            </button>
          )}
          <button className="btn primary" onClick={submit} disabled={saving || !form.tenant.trim()}>
            {form.id ? "Save Changes" : saving ? "Sending…" : "Send to Avid"}
          </button>
        </div>
        {sendNote && (
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: sendNote.ok ? "#15803d" : "#b45309" }}>{sendNote.text}</div>
        )}
      </div>

      {/* ── Pending commissions ── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
          <b style={{ fontSize: 17 }}>Pending Commissions</b>
          <span className="muted small">
            {pendingEntries.length} {pendingEntries.length === 1 ? "Entry" : "Entries"} · Commission {toMoney(pendingTotal)} · Gross (20%) {toMoney(pendingTotal * MARKUP)}
          </span>
        </div>

        {loading ? (
          <LoadingState card={false} status="Loading retail commissions…" rows={4} />
        ) : entries.length === 0 ? (
          <div className="muted small">No commission entries yet. Add one above.</div>
        ) : renderSections("pending")}
      </div>

      {/* ── Processed: every quarter already at AvidXchange — the record ── */}
      {!loading && processedCount > 0 && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <b style={{ fontSize: 17 }}>Processed Commissions</b>
            <span className="muted small">Sent to AvidXchange · {processedCount} {processedCount === 1 ? "quarter" : "quarters"}</span>
          </div>
          {renderSections("paid")}
        </div>
      )}
    </main>
  );
}
