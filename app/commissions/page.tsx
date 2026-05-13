"use client";

import { useEffect, useMemo, useState } from "react";
import type { RentRollData } from "../../lib/rentroll/parseRentRollExcel";
import { PROPERTY_DEFS } from "../../lib/properties/data";
import {
  type CommissionEntry,
  INCENTIVE_TIERS,
  buildingFromUnitRef,
  computeIncentive,
  incentiveRate,
  recentQuarterLabels,
  suiteFromUnitRef,
  termYearsBetween,
  toDisplayDate,
  toIsoDate,
} from "../../lib/commissions";

// Office property codes — Business Parks Division commissions.
const OFFICE_CODES = new Set(
  PROPERTY_DEFS.filter((p) => p.type === "Office" && !p.entityKind).map((p) => p.id.toUpperCase()),
);

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

  // Initial load
  useEffect(() => {
    Promise.all([
      fetch("/api/rentroll").then((r) => r.json()).catch(() => ({ rentroll: null })),
      fetch("/api/commissions").then((r) => r.json()).catch(() => ({ entries: [] })),
    ])
      .then(([rr, ce]) => {
        setRentroll(rr.rentroll ?? null);
        setEntries(Array.isArray(ce.entries) ? ce.entries : []);
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
          {/* Quarter */}
          <div>
            <label style={labelStyle}>Quarter Ended</label>
            <select value={form.quarter} onChange={(e) => patch("quarter", e.target.value)} style={inputStyle}>
              {quarterOpts.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
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

          {/* Lease From — native date picker, always editable */}
          <div>
            <label style={labelStyle}>Lease From</label>
            <input
              type="date"
              value={toIsoDate(form.leaseFrom)}
              onChange={(e) => recomputeFromDates({ leaseFrom: e.target.value })}
              style={inputStyle}
            />
          </div>

          {/* Lease To — native date picker, always editable */}
          <div>
            <label style={labelStyle}>Lease To</label>
            <input
              type="date"
              value={toIsoDate(form.leaseTo)}
              onChange={(e) => recomputeFromDates({ leaseTo: e.target.value })}
              style={inputStyle}
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
          <b style={{ fontSize: 17 }}>Saved Entries</b>
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
              return (
                <div key={quarter} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "rgba(11,74,125,0.05)",
                    borderBottom: "1px solid var(--border)",
                  }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{quarter}</span>
                    <span className="muted small">
                      {list.length} · Incentive {toMoney(total)} · Gross {toMoney(totalGross)}
                    </span>
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
