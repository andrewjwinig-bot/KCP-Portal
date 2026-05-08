"use client";

import { useEffect, useMemo, useState } from "react";
import type { RentRollData } from "../../lib/rentroll/parseRentRollExcel";
import {
  EMPTY_LEASING_ACTIVITY,
  type LeasingActivity,
  type Prospect,
  type PendingLease,
  type TenantVacating,
  type OptionToRenew,
} from "../../lib/leasing/types";
import { PROPERTY_DEFS } from "../../lib/properties/data";

function uid() { return Math.random().toString(36).slice(2, 10); }

type TenantOption = { unitRef: string; label: string; tenant: string; building: string; sqft: number; leaseTo: string | null };
function tenantOptions(rentroll: RentRollData | null): TenantOption[] {
  if (!rentroll) return [];
  const out: TenantOption[] = [];
  for (const p of rentroll.properties) {
    const def = PROPERTY_DEFS.find((d) => d.id.toUpperCase() === p.propertyCode.toUpperCase());
    // For Prospects building dropdown: short label like "1" or "Kor A" derived from building name
    const shortBuilding = def?.name?.replace(/^Building\s+/i, "").replace(/^Kor Center\s+/i, "Kor ") ?? p.propertyCode;
    for (const u of p.units) {
      if (u.isVacant) continue;
      out.push({
        unitRef: u.unitRef,
        label: `${u.occupantName} — ${u.unitRef} (${u.sqft.toLocaleString()} sf)`,
        tenant: u.occupantName,
        building: shortBuilding,
        sqft: u.sqft,
        leaseTo: u.leaseTo,
      });
    }
  }
  return out.sort((a, b) => a.tenant.localeCompare(b.tenant));
}

// Office building short labels used in the Prospects building selector
const OFFICE_BUILDING_LABELS = ["1", "2", "4", "5", "6", "7", "8", "Kor A", "Kor B", "Kor C"];

const inputStyle: React.CSSProperties = {
  padding: "4px 7px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  width: "100%",
};

const tableHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--muted)",
  textAlign: "left",
  padding: "5px 6px",
};

const tableCellStyle: React.CSSProperties = {
  padding: "4px 6px",
  verticalAlign: "middle",
  fontSize: 12,
};

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Delete row"
      aria-label="Delete row"
      style={{
        width: 20,
        height: 20,
        padding: 0,
        borderRadius: 4,
        border: "1px solid rgba(180,35,24,0.45)",
        background: "rgba(180,35,24,0.08)",
        color: "#b42318",
        cursor: "pointer",
        fontSize: 14,
        lineHeight: 1,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      ×
    </button>
  );
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12,
        padding: "5px 12px",
        borderRadius: 999,
        border: "1px solid #0b4a7d",
        background: "rgba(11,74,125,0.06)",
        color: "#0b4a7d",
        cursor: "pointer",
        fontWeight: 600,
        marginTop: 6,
      }}
    >
      + {label}
    </button>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 6, color: "var(--text)" }}>
      {children}
    </div>
  );
}

export default function LeasingActivityCard({ rentroll }: { rentroll: RentRollData | null }) {
  const [data, setData] = useState<LeasingActivity>(EMPTY_LEASING_ACTIVITY);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leasing-activity")
      .then((r) => r.json())
      .then((j) => setData(j.leasingActivity ?? EMPTY_LEASING_ACTIVITY))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Debounced save on data change (skip the initial load)
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/leasing-activity", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Save failed");
        setSavedAt(Date.now());
        setError(null);
      } catch (err: any) {
        setError(err?.message ?? "Save failed");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [data, loading]);

  const opts = useMemo(() => tenantOptions(rentroll), [rentroll]);
  const optByRef = useMemo(() => Object.fromEntries(opts.map((o) => [o.unitRef, o])), [opts]);

  function update<K extends keyof LeasingActivity>(key: K, fn: (rows: LeasingActivity[K]) => LeasingActivity[K]) {
    setData((prev) => ({ ...prev, [key]: fn(prev[key]) }));
  }

  // ── Add helpers
  function addProspect()       { update("prospects",       (r) => [...r, { id: uid(), tenant: "", building: "", sqft: 0, typeOf: "", rating: null } as Prospect]); }
  function addPending()        { update("pendingLeases",   (r) => [...r, { id: uid(), tenant: "", building: "", sqft: 0, startDate: "" } as PendingLease]); }
  function addVacating()       { update("tenantsVacating", (r) => [...r, { id: uid(), unitRef: "", tenant: "", building: "", sqft: 0, expirationDate: "" } as TenantVacating]); }
  function addOption()         { update("optionsToRenew",  (r) => [...r, { id: uid(), unitRef: "", tenant: "", building: "", sqft: 0, term: "", noticeDate: "", optionTermExp: "" } as OptionToRenew]); }

  if (loading) {
    return <div className="card"><div className="muted small">Loading leasing activity…</div></div>;
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 17 }}>Leasing Activity</b>
        <span className="muted small">
          {error ? <span style={{ color: "#b91c1c" }}>{error}</span> : savedAt ? "Saved" : "Auto-saves on change"}
        </span>
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        Manual entries shown on the Status Report's Leasing Activity Summary page. Changes save automatically.
      </p>

      {/* Building autocomplete suggestions for the Prospects column */}
      <datalist id="leasing-buildings">
        {OFFICE_BUILDING_LABELS.map((b) => <option key={b} value={b} />)}
      </datalist>

      {/* ── Prospects ── */}
      <SectionHeader>Prospects</SectionHeader>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Tenant</th>
              <th style={tableHeaderStyle}>Building</th>
              <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Sq Ft</th>
              <th style={tableHeaderStyle}>Type Of</th>
              <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Rating&nbsp;(1-5)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.prospects.map((p) => (
              <tr key={p.id}>
                <td style={tableCellStyle}>
                  <input style={inputStyle} value={p.tenant} onChange={(e) => update("prospects", (r) => r.map(x => x.id === p.id ? { ...x, tenant: e.target.value } : x))} />
                </td>
                <td style={tableCellStyle}>
                  <input list="leasing-buildings" style={inputStyle} value={p.building} onChange={(e) => update("prospects", (r) => r.map(x => x.id === p.id ? { ...x, building: e.target.value } : x))} />
                </td>
                <td style={{ ...tableCellStyle, textAlign: "right" }}>
                  <input style={{ ...inputStyle, textAlign: "right" }} value={p.sqft || ""} onChange={(e) => update("prospects", (r) => r.map(x => x.id === p.id ? { ...x, sqft: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 } : x))} />
                </td>
                <td style={tableCellStyle}>
                  <input style={inputStyle} value={p.typeOf} onChange={(e) => update("prospects", (r) => r.map(x => x.id === p.id ? { ...x, typeOf: e.target.value } : x))} />
                </td>
                <td style={{ ...tableCellStyle, textAlign: "right" }}>
                  <select
                    style={{ ...inputStyle, textAlign: "right", width: 60 }}
                    value={p.rating ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n = v === "" ? null : Number(v);
                      update("prospects", (r) => r.map(x => x.id === p.id ? { ...x, rating: n } : x));
                    }}
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td style={tableCellStyle}><DeleteBtn onClick={() => update("prospects", (r) => r.filter(x => x.id !== p.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddBtn onClick={addProspect} label="Add prospect" />

      {/* ── Pending Leases ── */}
      <SectionHeader>Pending Leases</SectionHeader>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Tenant</th>
              <th style={tableHeaderStyle}>Building</th>
              <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Sq Ft</th>
              <th style={tableHeaderStyle}>Start Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.pendingLeases.map((p) => (
              <tr key={p.id}>
                <td style={tableCellStyle}>
                  <input style={inputStyle} value={p.tenant} onChange={(e) => update("pendingLeases", (r) => r.map(x => x.id === p.id ? { ...x, tenant: e.target.value } : x))} />
                </td>
                <td style={tableCellStyle}>
                  <input style={inputStyle} value={p.building} onChange={(e) => update("pendingLeases", (r) => r.map(x => x.id === p.id ? { ...x, building: e.target.value } : x))} />
                </td>
                <td style={{ ...tableCellStyle, textAlign: "right" }}>
                  <input style={{ ...inputStyle, textAlign: "right" }} value={p.sqft || ""} onChange={(e) => update("pendingLeases", (r) => r.map(x => x.id === p.id ? { ...x, sqft: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 } : x))} />
                </td>
                <td style={tableCellStyle}>
                  <input style={inputStyle} placeholder="MM/DD/YYYY" value={p.startDate} onChange={(e) => update("pendingLeases", (r) => r.map(x => x.id === p.id ? { ...x, startDate: e.target.value } : x))} />
                </td>
                <td style={tableCellStyle}><DeleteBtn onClick={() => update("pendingLeases", (r) => r.filter(x => x.id !== p.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddBtn onClick={addPending} label="Add pending lease" />

      {/* ── Tenants Vacating ── */}
      <SectionHeader>Tenants Vacating</SectionHeader>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Tenant</th>
              <th style={tableHeaderStyle}>Building</th>
              <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Sq Ft</th>
              <th style={tableHeaderStyle}>Expiration Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.tenantsVacating.map((v) => (
              <tr key={v.id}>
                <td style={tableCellStyle}>
                  <select
                    style={{ ...inputStyle, marginBottom: 4 }}
                    value={v.unitRef ?? ""}
                    onChange={(e) => {
                      const ref = e.target.value;
                      const auto = ref ? optByRef[ref] : null;
                      update("tenantsVacating", (r) => r.map(x => x.id === v.id
                        ? {
                            ...x,
                            unitRef: ref,
                            ...(auto ? {
                              tenant: auto.tenant,
                              building: auto.building,
                              sqft: auto.sqft,
                              expirationDate: auto.leaseTo ?? x.expirationDate,
                            } : {}),
                          }
                        : x));
                    }}
                  >
                    <option value="">— Pick a tenant —</option>
                    {opts.map((o) => <option key={o.unitRef} value={o.unitRef}>{o.label}</option>)}
                  </select>
                  <input style={inputStyle} placeholder="Tenant name" value={v.tenant} onChange={(e) => update("tenantsVacating", (r) => r.map(x => x.id === v.id ? { ...x, tenant: e.target.value } : x))} />
                </td>
                <td style={tableCellStyle}>
                  <input style={inputStyle} value={v.building} onChange={(e) => update("tenantsVacating", (r) => r.map(x => x.id === v.id ? { ...x, building: e.target.value } : x))} />
                </td>
                <td style={{ ...tableCellStyle, textAlign: "right" }}>
                  <input style={{ ...inputStyle, textAlign: "right" }} value={v.sqft || ""} onChange={(e) => update("tenantsVacating", (r) => r.map(x => x.id === v.id ? { ...x, sqft: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 } : x))} />
                </td>
                <td style={tableCellStyle}>
                  <input style={inputStyle} placeholder="MM/DD/YYYY" value={v.expirationDate} onChange={(e) => update("tenantsVacating", (r) => r.map(x => x.id === v.id ? { ...x, expirationDate: e.target.value } : x))} />
                </td>
                <td style={tableCellStyle}><DeleteBtn onClick={() => update("tenantsVacating", (r) => r.filter(x => x.id !== v.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddBtn onClick={addVacating} label="Add vacating tenant" />

      {/* ── Options to Renew ── */}
      <SectionHeader>Option to Renew</SectionHeader>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Tenant</th>
              <th style={tableHeaderStyle}>Building</th>
              <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Sq Ft</th>
              <th style={tableHeaderStyle}>Term / Prior Notice</th>
              <th style={tableHeaderStyle}>Notice Date</th>
              <th style={tableHeaderStyle}>Option Term Exp</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.optionsToRenew.map((o) => (
              <tr key={o.id}>
                <td style={tableCellStyle}>
                  <select
                    style={{ ...inputStyle, marginBottom: 4 }}
                    value={o.unitRef ?? ""}
                    onChange={(e) => {
                      const ref = e.target.value;
                      const auto = ref ? optByRef[ref] : null;
                      update("optionsToRenew", (r) => r.map(x => x.id === o.id
                        ? { ...x, unitRef: ref, ...(auto ? { tenant: auto.tenant, building: auto.building, sqft: auto.sqft } : {}) }
                        : x));
                    }}
                  >
                    <option value="">— Pick a tenant —</option>
                    {opts.map((opt2) => <option key={opt2.unitRef} value={opt2.unitRef}>{opt2.label}</option>)}
                  </select>
                  <input style={inputStyle} placeholder="Tenant name" value={o.tenant} onChange={(e) => update("optionsToRenew", (r) => r.map(x => x.id === o.id ? { ...x, tenant: e.target.value } : x))} />
                </td>
                <td style={tableCellStyle}>
                  <input style={inputStyle} value={o.building} onChange={(e) => update("optionsToRenew", (r) => r.map(x => x.id === o.id ? { ...x, building: e.target.value } : x))} />
                </td>
                <td style={{ ...tableCellStyle, textAlign: "right" }}>
                  <input style={{ ...inputStyle, textAlign: "right" }} value={o.sqft || ""} onChange={(e) => update("optionsToRenew", (r) => r.map(x => x.id === o.id ? { ...x, sqft: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 } : x))} />
                </td>
                <td style={tableCellStyle}>
                  <input style={inputStyle} placeholder="5 years / 6 mos." value={o.term} onChange={(e) => update("optionsToRenew", (r) => r.map(x => x.id === o.id ? { ...x, term: e.target.value } : x))} />
                </td>
                <td style={tableCellStyle}>
                  <input style={inputStyle} placeholder="MM/DD/YYYY" value={o.noticeDate} onChange={(e) => update("optionsToRenew", (r) => r.map(x => x.id === o.id ? { ...x, noticeDate: e.target.value } : x))} />
                </td>
                <td style={tableCellStyle}>
                  <input style={inputStyle} placeholder="MM/DD/YYYY" value={o.optionTermExp} onChange={(e) => update("optionsToRenew", (r) => r.map(x => x.id === o.id ? { ...x, optionTermExp: e.target.value } : x))} />
                </td>
                <td style={tableCellStyle}><DeleteBtn onClick={() => update("optionsToRenew", (r) => r.filter(x => x.id !== o.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddBtn onClick={addOption} label="Add option to renew" />
    </div>
  );
}
