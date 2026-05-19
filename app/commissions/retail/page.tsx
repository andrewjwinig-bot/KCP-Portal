"use client";

import { useEffect, useMemo, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { RentRollData } from "../../../lib/rentroll/parseRentRollExcel";
import { PROPERTY_DEFS } from "../../../lib/properties/data";
import {
  type CommissionEntry,
  RETAIL_COMMISSION_RATE,
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

// The person these commissions are paid to. Update if Harry's full legal
// name should appear on the memo.
const PAYEE = "Harry";

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

  useEffect(() => {
    Promise.all([
      fetch("/api/rentroll").then((r) => r.json()).catch(() => ({ rentroll: null })),
      fetch("/api/commissions/retail").then((r) => r.json()).catch(() => ({ entries: [] })),
    ])
      .then(([rr, ce]) => {
        setRentroll(rr.rentroll ?? null);
        setEntries(Array.isArray(ce.entries) ? ce.entries : []);
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

  const commission = retailCommission(
    Number(form.sqft) || 0,
    Number(form.rate) || 0,
    Number(form.termYears) || 0,
  );

  async function persist(next: CommissionEntry[]) {
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
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function submit() {
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
    persist(next);
    setForm(emptyForm(form.quarter));
    setTenantSelection("");
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
    for (const arr of map.values()) arr.sort((a, b) => b.createdAt - a.createdAt);
    return [...map.entries()].sort((a, b) => quarterSort(b[0]) - quarterSort(a[0]));
  }, [entries]);

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
          <div>
            <label style={labelStyle}>Quarter Ended</label>
            <select value={form.quarter} onChange={(e) => patch("quarter", e.target.value)} style={inputStyle}>
              {quarterOpts.map((q) => <option key={q} value={q}>{q}</option>)}
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
                <span style={{ color: "var(--muted)", marginRight: 8 }}>= 3% ×</span>
                <span style={{ fontWeight: 600 }}>{(Number(form.sqft) || 0).toLocaleString()} sf</span>
                <span style={{ color: "var(--muted)", margin: "0 6px" }}>×</span>
                <span style={{ fontWeight: 600 }}>${(Number(form.rate) || 0).toFixed(2)}/sf</span>
                <span style={{ color: "var(--muted)", margin: "0 6px" }}>×</span>
                <span style={{ fontWeight: 600 }}>{Number(form.termYears) || 0} yr</span>
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
          Retail leasing commission is <b>3%</b> of total lease value (square feet × annual rent $/SF × term years).
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          {form.id && (
            <button className="btn" onClick={() => { setForm(emptyForm(form.quarter)); setTenantSelection(""); }} disabled={saving}>
              Cancel
            </button>
          )}
          <button className="btn primary" onClick={submit} disabled={saving || !form.tenant.trim()}>
            {form.id ? "Save Changes" : "Add Entry"}
          </button>
        </div>
      </div>

      {/* ── Pending commissions ── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
          <b style={{ fontSize: 17 }}>Pending Commissions</b>
          <span className="muted small">
            {entries.length} {entries.length === 1 ? "Entry" : "Entries"} · {toMoney(grandTotal)}
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
              return (
                <div key={quarter} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "rgba(11,74,125,0.05)", borderBottom: "1px solid var(--border)",
                  }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{quarter}</span>
                    <span className="muted small">{list.length} · {toMoney(total)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "14px 14px 16px", borderBottom: "1px solid var(--border)" }}>
                    <button className="btn primary large" onClick={() => downloadMemoPdf(quarter, list)}>
                      Download PDF Memo
                    </button>
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
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "var(--brand)" }}>
                            {toMoney(e.incentiveAmount)}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <button className="btn" onClick={() => editEntry(e)} style={{ padding: "4px 8px", fontSize: 11, marginRight: 6 }}>Edit</button>
                            <button onClick={() => deleteEntry(e.id)} title="Delete row" aria-label="Delete row"
                              style={{
                                width: 20, height: 20, padding: 0, borderRadius: 4,
                                border: "1px solid rgba(180,35,24,0.45)", background: "rgba(180,35,24,0.08)",
                                color: "#b42318", cursor: "pointer", fontSize: 14, lineHeight: 1, fontWeight: 700,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                              }}>×</button>
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

async function buildRetailMemoPdf(opts: {
  entries: CommissionEntry[];
  parsed: NonNullable<ReturnType<typeof parseQuarterLabel>>;
}): Promise<Uint8Array> {
  const { parsed } = opts;
  const periodEnd = parsed.periodEnd;
  const periodEndStr = `${periodEnd.getMonth() + 1}/${periodEnd.getDate()}/${periodEnd.getFullYear()}`;
  const entries = [...opts.entries].sort((a, b) => {
    const bd = a.building.localeCompare(b.building);
    return bd !== 0 ? bd : a.suite.localeCompare(b.suite);
  });
  const total = entries.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const navy  = rgb(11 / 255, 74 / 255, 125 / 255);
  const white = rgb(1, 1, 1);
  const ink   = rgb(0.10, 0.12, 0.15);
  const gray  = rgb(0.42, 0.46, 0.52);
  const shade = rgb(0.945, 0.955, 0.965);
  const rule  = rgb(0.80, 0.82, 0.86);

  const margin = 50;
  const pageW = 612;
  const right = pageW - margin;
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

  // Letterhead
  txt("KORMAN", margin, y, { b: true, size: 26, color: navy });
  txt("C O M M E R C I A L   P R O P E R T I E S", margin + 1, y - 13, { b: true, size: 7, color: gray });
  txtR("LEASING COMMISSION", right, y + 4, { b: true, size: 17, color: navy });
  txtR("Request for Payment", right, y - 12, { size: 9, color: gray });
  y -= 27;
  page.drawRectangle({ x: margin, y, width: contentW, height: 2, color: navy });
  y -= 26;

  // Memo block
  const memoRows: [string, string][] = [
    ["TO", "Payroll"],
    ["FROM", "Alison Korman"],
    ["DATE", periodEndStr],
    ["PERIOD", `Q${Math.floor(periodEnd.getMonth() / 3) + 1} ${periodEnd.getFullYear()}`],
    ["SUBJECT", `Leasing Commission — ${PAYEE}`],
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

  txt(`Please pay ${PAYEE} $${money(total)} in leasing commission for the following retail leases:`, margin, y, { size: 10.5 });
  y -= 28;

  // Table
  const cols = [
    { label: "Building",   x: 50,  w: 50, align: "l" as const },
    { label: "Suite",      x: 100, w: 38, align: "l" as const },
    { label: "Tenant",     x: 138, w: 136, align: "l" as const },
    { label: "Lease From", x: 274, w: 60, align: "l" as const },
    { label: "Lease To",   x: 334, w: 60, align: "l" as const },
    { label: "Term",       x: 394, w: 32, align: "r" as const },
    { label: "Rate $/SF",  x: 426, w: 50, align: "r" as const },
    { label: "Commission", x: 476, w: 86, align: "r" as const },
  ];

  // Section bar
  page.drawRectangle({ x: margin, y: y - 6, width: contentW, height: 18, color: navy });
  txt("SHOPPING CENTERS", margin + 8, y, { b: true, size: 10, color: white });
  y -= 24;
  // Header
  cols.forEach((c) => {
    if (c.align === "r") txtR(c.label, c.x + c.w, y, { b: true, size: 8, color: gray });
    else txt(c.label, c.x, y, { b: true, size: 8, color: gray });
  });
  y -= 5;
  page.drawLine({ start: { x: margin, y }, end: { x: right, y }, thickness: 0.75, color: rule });
  y -= 14;
  // Rows
  entries.forEach((e, idx) => {
    if (idx % 2 === 1) page.drawRectangle({ x: margin, y: y - 4, width: contentW, height: 15, color: shade });
    const vals = [
      e.building,
      e.suite,
      fit(e.tenant, cols[2].w - 4, 9),
      toDisplayDate(e.leaseFrom),
      toDisplayDate(e.leaseTo),
      String(e.termYears),
      `$${(e.rate ?? 0).toFixed(2)}`,
      money(Number(e.incentiveAmount) || 0),
    ];
    cols.forEach((c, i) => {
      if (!vals[i]) return;
      if (c.align === "r") txtR(vals[i], c.x + c.w, y, { size: 9 });
      else txt(vals[i], c.x, y, { size: 9 });
    });
    y -= 16;
  });
  // Grand total
  page.drawRectangle({ x: margin, y: y - 7, width: contentW, height: 22, color: navy });
  txtR("TOTAL", cols[7].x - 12, y, { b: true, size: 11, color: white });
  txtR(money(total), cols[7].x + cols[7].w, y, { b: true, size: 11, color: white });
  y -= 34;

  // Footnote
  txt("*  Commission is 3% of total lease value — square feet × annual rent $/SF × term years.", margin, y, { size: 8.5, color: gray });
  y -= 14;
  void RETAIL_COMMISSION_RATE;

  // Footer
  y -= 16;
  const note = "Leasing commission — Shopping Centers Division.";
  page.drawRectangle({ x: margin, y: y - 9, width: contentW, height: 24, color: shade });
  txtC(note, pageW / 2, y, { b: true, size: 9.5, color: navy });

  return pdf.save();
}
