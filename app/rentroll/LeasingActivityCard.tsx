"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// Office buildings (JV III + NI LLC + The Office Works) — used to scope the
// Tenants Vacating / Option to Renew tenant dropdown so Nancy doesn't have to
// scroll through retail tenants.
const OFFICE_PROPERTY_CODES = new Set([
  "3610", "3620", "3640",
  "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0",
  "4900",
]);

type TenantOption = { unitRef: string; label: string; tenant: string; building: string; sqft: number; leaseTo: string | null };
function tenantOptions(rentroll: RentRollData | null): TenantOption[] {
  if (!rentroll) return [];
  const out: TenantOption[] = [];
  for (const p of rentroll.properties) {
    if (!OFFICE_PROPERTY_CODES.has(p.propertyCode.toUpperCase())) continue;
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

// Headers add this much horizontal padding so their text lines up with the
// input/select text inside the cell below (inputs have ~11px of effective
// extra inset from the cell edge — 1px border + 10px internal padding).
const HEADER_INSET = 11;
const thLeft: React.CSSProperties  = { paddingLeft:  10 + HEADER_INSET };
const thRight: React.CSSProperties = { textAlign: "right", paddingRight: 10 + HEADER_INSET };
const thCenter: React.CSSProperties = { textAlign: "center" };
const tdReadLeft: React.CSSProperties  = { paddingLeft:  10 + HEADER_INSET };
const tdReadRight: React.CSSProperties = { textAlign: "right", paddingRight: 10 + HEADER_INSET };
const tdReadCenter: React.CSSProperties = { textAlign: "center" };

// Office building short labels (in display order) used in the Prospects building selector
const OFFICE_BUILDING_LABELS = ["1", "2", "4", "5", "6", "7", "8", "Kor A", "Kor B", "Kor C"];

function parseMDY(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}
function daysFromToday(d: Date): number {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}
type NoticeStatus = { days: number | null; bg?: string; pastDue?: boolean };
function noticeStatus(noticeDate: string | undefined | null): NoticeStatus {
  const d = parseMDY(noticeDate);
  if (!d) return { days: null };
  const days = daysFromToday(d);
  if (days < 0)   return { days, bg: "rgba(220,38,38,0.18)", pastDue: true };
  if (days <= 30) return { days, bg: "rgba(220,38,38,0.10)" };
  if (days <= 60) return { days, bg: "rgba(234,88,12,0.10)" };
  if (days <= 90) return { days, bg: "rgba(217,119,6,0.10)" };
  return { days };
}

function parseBuildings(value: string): string[] {
  return value.split(",").map(s => s.trim()).filter(Boolean);
}
function joinBuildings(values: string[]): string {
  // Preserve label order
  const set = new Set(values);
  return OFFICE_BUILDING_LABELS.filter(b => set.has(b)).concat(values.filter(v => !OFFICE_BUILDING_LABELS.includes(v))).join(",");
}

function BuildingMultiSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(() => new Set(parseBuildings(value)), [value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(label: string) {
    const next = new Set(selected);
    if (next.has(label)) next.delete(label); else next.add(label);
    onChange(joinBuildings([...next]));
  }

  const display = value || "Select…";
  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          ...inputStyle,
          textAlign: "center",
          cursor: "pointer",
          position: "relative",
          color: value ? "var(--text)" : "var(--muted)",
          paddingRight: 24,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: 8, top: "50%", transform: `translateY(-50%) ${open ? "rotate(180deg)" : ""}`, opacity: 0.6, transition: "transform 0.15s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 8px 22px rgba(15,23,42,0.16)",
            padding: 4,
            zIndex: 30,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {OFFICE_BUILDING_LABELS.map((label) => {
            const checked = selected.has(label);
            return (
              <label
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                  background: checked ? "rgba(11,74,125,0.08)" : "transparent",
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(label)} />
                {label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  fontSize: 14,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "#fff",
  width: "100%",
  fontFamily: "inherit",
  color: "var(--text)",
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
        fontSize: 13,
        padding: "8px 16px",
        borderRadius: 999,
        border: "1.5px solid rgba(11,74,125,0.3)",
        background: "rgba(11,74,125,0.06)",
        color: "#0b4a7d",
        cursor: "pointer",
        fontWeight: 600,
        marginTop: 10,
      }}
    >
      + {label}
    </button>
  );
}

function SectionHeader({ children, open, onToggle, count }: { children: React.ReactNode; open?: boolean; onToggle?: () => void; count?: number }) {
  if (onToggle == null) {
    return <div style={{ fontSize: 17, fontWeight: 700, marginTop: 24, marginBottom: 10, color: "var(--text)" }}>{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        width: "100%",
        padding: "14px 16px",
        marginTop: 18,
        marginBottom: open ? 10 : 0,
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: 10,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>{children}</span>
        {count != null && (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>({count})</span>
        )}
      </span>
      <span style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
    </button>
  );
}


export default function LeasingActivityCard({ rentroll }: { rentroll: RentRollData | null }) {
  const [data, setData] = useState<LeasingActivity>(EMPTY_LEASING_ACTIVITY);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    prospects: false,
    pending: false,
    vacating: false,
    options: false,
    expirations: false,
  });
  function toggleSection(k: string) {
    setOpenSections((p) => ({ ...p, [k]: !p[k] }));
  }

  // Snapshot of the most recently persisted payload — saves are skipped when
  // the current data matches this. Set on initial GET and after each successful PUT.
  const lastSavedRef = useRef<string>(JSON.stringify(EMPTY_LEASING_ACTIVITY));

  useEffect(() => {
    fetch("/api/leasing-activity")
      .then((r) => r.json())
      .then((j) => {
        const initial = j.leasingActivity ?? EMPTY_LEASING_ACTIVITY;
        lastSavedRef.current = JSON.stringify(initial);
        setData(initial);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Debounced save when the user actually changes something
  useEffect(() => {
    if (loading) return;
    const serialized = JSON.stringify(data);
    if (serialized === lastSavedRef.current) return; // nothing changed since last save

    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/leasing-activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: serialized,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text ? text.slice(0, 120) : `Save failed (${res.status})`);
        }
        lastSavedRef.current = serialized;
        setSavedAt(Date.now());
        setError(null);
      } catch (err: any) {
        setError(err?.message ?? "Save failed");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [data, loading]);

  const opts = useMemo(() => tenantOptions(rentroll), [rentroll]);
  const expirationsCount = useMemo(() => {
    if (!rentroll) return 0;
    let n = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const p of rentroll.properties) {
      if (!OFFICE_PROPERTY_CODES.has(p.propertyCode.toUpperCase())) continue;
      for (const u of p.units) {
        if (u.isVacant || !u.leaseTo) continue;
        if (u.baseRent === 0 && u.grossRentTotal === 0) continue;
        const d = parseMDY(u.leaseTo);
        if (!d) continue;
        const days = Math.round((d.getTime() - today.getTime()) / 86400000);
        if (days >= 0 && days <= 365) n++;
      }
    }
    return n;
  }, [rentroll]);
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <b style={{ fontSize: 18 }}>Leasing Activity</b>
        <span className="muted small">
          {error ? <span style={{ color: "#b91c1c" }}>{error}</span> : savedAt ? "Saved" : "Auto-saves on change"}
        </span>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        Manual entries shown on the Status Report's Leasing Activity Summary page. Changes save automatically.
      </p>

      {/* ── Prospects ── */}
      <SectionHeader open={openSections.prospects} onToggle={() => toggleSection("prospects")} count={data.prospects.length}>Prospects</SectionHeader>
      {openSections.prospects && (<>

      <div className="tableWrap">
        <table>
          <colgroup>
            <col />               {/* Tenant — flex */}
            <col />               {/* Type Of — flex */}
            <col style={{ width: 150 }} />  {/* Building */}
            <col style={{ width: 90  }} />  {/* Sq Ft */}
            <col style={{ width: 120 }} />  {/* Rating (matches date columns) */}
            <col style={{ width: 36  }} />  {/* × */}
          </colgroup>
          <thead>
            <tr>
              <th style={thLeft}>Tenant</th>
              <th style={thLeft}>Type Of</th>
              <th style={thCenter}>Building</th>
              <th style={thRight}>Sq Ft</th>
              <th style={{ ...thCenter, whiteSpace: "nowrap" }}>Rating (1-5)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.prospects.map((p) => (
              <tr key={p.id}>
                <td >
                  <input style={inputStyle} value={p.tenant} onChange={(e) => update("prospects", (r) => r.map(x => x.id === p.id ? { ...x, tenant: e.target.value } : x))} />
                </td>
                <td >
                  <input style={inputStyle} value={p.typeOf} onChange={(e) => update("prospects", (r) => r.map(x => x.id === p.id ? { ...x, typeOf: e.target.value } : x))} />
                </td>
                <td >
                  <BuildingMultiSelect
                    value={p.building}
                    onChange={(v) => update("prospects", (r) => r.map(x => x.id === p.id ? { ...x, building: v } : x))}
                  />
                </td>
                <td style={{ textAlign: "right" }}>
                  <input style={{ ...inputStyle, textAlign: "right" }} value={p.sqft ? p.sqft.toLocaleString() : ""} onChange={(e) => update("prospects", (r) => r.map(x => x.id === p.id ? { ...x, sqft: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 } : x))} />
                </td>
                <td style={{ textAlign: "center" }}>
                  <select
                    style={{ ...inputStyle, textAlign: "center" }}
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
                <td ><DeleteBtn onClick={() => update("prospects", (r) => r.filter(x => x.id !== p.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddBtn onClick={addProspect} label="Add Prospect" />
      </>)}

      {/* ── Pending Leases ── */}
      <SectionHeader open={openSections.pending} onToggle={() => toggleSection("pending")} count={data.pendingLeases.length}>Pending Leases</SectionHeader>
      {openSections.pending && (<>
      <div className="tableWrap">
        <table>
          <colgroup>
            <col />                          {/* Tenant — flex */}
            <col style={{ width: 150 }} />   {/* Building (matches Prospects) */}
            <col style={{ width: 90  }} />   {/* Sq Ft */}
            <col style={{ width: 120 }} />   {/* Start Date */}
            <col style={{ width: 36  }} />   {/* × */}
          </colgroup>
          <thead>
            <tr>
              <th style={thLeft}>Tenant</th>
              <th style={thCenter}>Building</th>
              <th style={thRight}>Sq Ft</th>
              <th style={thLeft}>Start Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.pendingLeases.map((p) => (
              <tr key={p.id}>
                <td >
                  <input style={inputStyle} value={p.tenant} onChange={(e) => update("pendingLeases", (r) => r.map(x => x.id === p.id ? { ...x, tenant: e.target.value } : x))} />
                </td>
                <td >
                  <input style={{ ...inputStyle, textAlign: "center" }} value={p.building} onChange={(e) => update("pendingLeases", (r) => r.map(x => x.id === p.id ? { ...x, building: e.target.value } : x))} />
                </td>
                <td style={{ textAlign: "right" }}>
                  <input style={{ ...inputStyle, textAlign: "right" }} value={p.sqft ? p.sqft.toLocaleString() : ""} onChange={(e) => update("pendingLeases", (r) => r.map(x => x.id === p.id ? { ...x, sqft: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 } : x))} />
                </td>
                <td >
                  <input style={inputStyle} placeholder="MM/DD/YYYY" value={p.startDate} onChange={(e) => update("pendingLeases", (r) => r.map(x => x.id === p.id ? { ...x, startDate: e.target.value } : x))} />
                </td>
                <td ><DeleteBtn onClick={() => update("pendingLeases", (r) => r.filter(x => x.id !== p.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddBtn onClick={addPending} label="Add Pending Lease" />
      </>)}

      {/* ── Tenants Vacating ── */}
      <SectionHeader open={openSections.vacating} onToggle={() => toggleSection("vacating")} count={data.tenantsVacating.length}>Tenants Vacating</SectionHeader>
      {openSections.vacating && (<>
      <div className="tableWrap">
        <table>
          <colgroup>
            <col />                          {/* Tenant — flex */}
            <col style={{ width: 150 }} />   {/* Building */}
            <col style={{ width: 110 }} />   {/* Suite */}
            <col style={{ width: 90  }} />   {/* Sq Ft */}
            <col style={{ width: 120 }} />   {/* Expiration Date */}
            <col style={{ width: 36  }} />   {/* × */}
          </colgroup>
          <thead>
            <tr>
              <th style={thLeft}>Tenant</th>
              <th style={thCenter}>Building</th>
              <th style={thCenter}>Suite</th>
              <th style={thRight}>Sq Ft</th>
              <th style={thLeft}>Expiration Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.tenantsVacating.map((v) => (
              <tr key={v.id}>
                <td>
                  <select
                    style={inputStyle}
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
                    <option value="">{v.tenant || "— Pick a tenant —"}</option>
                    {opts.map((o) => <option key={o.unitRef} value={o.unitRef}>{o.label}</option>)}
                  </select>
                </td>
                <td style={tdReadCenter}><span style={{ fontSize: 14 }}>{v.building || "—"}</span></td>
                <td style={tdReadCenter}><span style={{ fontSize: 14 }}>{v.unitRef || "—"}</span></td>
                <td style={tdReadRight}><span style={{ fontSize: 14 }}>{v.sqft ? v.sqft.toLocaleString() : "—"}</span></td>
                <td style={tdReadLeft}><span style={{ fontSize: 14 }}>{v.expirationDate || "—"}</span></td>
                <td><DeleteBtn onClick={() => update("tenantsVacating", (r) => r.filter(x => x.id !== v.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddBtn onClick={addVacating} label="Add Vacating Tenant" />
      </>)}

      {/* ── Options to Renew ── */}
      <SectionHeader open={openSections.options} onToggle={() => toggleSection("options")} count={data.optionsToRenew.length}>Option to Renew</SectionHeader>
      {openSections.options && (<>
      <div className="tableWrap">
        <table>
          <colgroup>
            <col />                          {/* Tenant — flex (gets the slack) */}
            <col style={{ width: 80  }} />   {/* Building */}
            <col style={{ width: 90  }} />   {/* Sq Ft */}
            <col style={{ width: 180 }} />   {/* Term / Prior Notice */}
            <col style={{ width: 120 }} />   {/* Notice Date */}
            <col style={{ width: 120 }} />   {/* Option Term Exp */}
            <col style={{ width: 36  }} />   {/* × */}
          </colgroup>
          <thead>
            <tr>
              <th style={thLeft}>Tenant</th>
              <th style={thCenter}>Building</th>
              <th style={thRight}>Sq Ft</th>
              <th style={thLeft}>Term / Prior Notice</th>
              <th style={thLeft}>Notice Date</th>
              <th style={thLeft}>Option Term Exp</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.optionsToRenew
              .slice()
              .sort((a, b) => {
                const da = parseMDY(a.noticeDate);
                const db = parseMDY(b.noticeDate);
                if (!da && !db) return 0;
                if (!da) return 1;
                if (!db) return -1;
                return da.getTime() - db.getTime();
              })
              .map((o) => {
                const ns = noticeStatus(o.noticeDate);
                return (
              <tr key={o.id} style={ns.bg ? { background: ns.bg } : undefined}>
                <td>
                  <select
                    style={inputStyle}
                    value={o.unitRef ?? ""}
                    onChange={(e) => {
                      const ref = e.target.value;
                      const auto = ref ? optByRef[ref] : null;
                      update("optionsToRenew", (r) => r.map(x => x.id === o.id
                        ? { ...x, unitRef: ref, ...(auto ? { tenant: auto.tenant, building: auto.building, sqft: auto.sqft } : {}) }
                        : x));
                    }}
                  >
                    <option value="">{o.tenant || "— Pick a tenant —"}</option>
                    {opts.map((opt2) => <option key={opt2.unitRef} value={opt2.unitRef}>{opt2.label}</option>)}
                  </select>
                  {ns.pastDue && (
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(220,38,38,0.18)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.45)", letterSpacing: "0.04em" }}>PAST DUE</span>
                  )}
                </td>
                <td style={tdReadCenter}><span style={{ fontSize: 14 }}>{o.building || "—"}</span></td>
                <td style={tdReadRight}><span style={{ fontSize: 14 }}>{o.sqft ? o.sqft.toLocaleString() : "—"}</span></td>
                <td>
                  <input style={inputStyle} placeholder="5 years / 6 mos." value={o.term} onChange={(e) => update("optionsToRenew", (r) => r.map(x => x.id === o.id ? { ...x, term: e.target.value } : x))} />
                </td>
                <td>
                  <input style={inputStyle} placeholder="MM/DD/YYYY" value={o.noticeDate} onChange={(e) => update("optionsToRenew", (r) => r.map(x => x.id === o.id ? { ...x, noticeDate: e.target.value } : x))} />
                </td>
                <td>
                  <input style={inputStyle} placeholder="MM/DD/YYYY" value={o.optionTermExp} onChange={(e) => update("optionsToRenew", (r) => r.map(x => x.id === o.id ? { ...x, optionTermExp: e.target.value } : x))} />
                </td>
                <td><DeleteBtn onClick={() => update("optionsToRenew", (r) => r.filter(x => x.id !== o.id))} /></td>
              </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <AddBtn onClick={addOption} label="Add Option to Renew" />
      </>)}

      {/* ── Upcoming Lease Expirations (auto-populated from rent roll) ── */}
      <SectionHeader open={openSections.expirations} onToggle={() => toggleSection("expirations")} count={expirationsCount}>Upcoming Lease Expirations</SectionHeader>
      {openSections.expirations && (
        <ExpirationsSection
          rentroll={rentroll}
          comments={data.expirationComments ?? {}}
          onChange={(unitRef, patch) => {
            setData((prev) => {
              const cur = { ...(prev.expirationComments ?? {}) };
              const merged = { ...(cur[unitRef] ?? {}), ...patch };
              // Drop empty entries
              if (!merged.tenantStatus) delete cur[unitRef];
              else cur[unitRef] = merged;
              return { ...prev, expirationComments: cur };
            });
          }}
        />
      )}
    </div>
  );
}

function ExpirationsSection({ rentroll, comments, onChange }: {
  rentroll: RentRollData | null;
  comments: Record<string, { lastContact?: string; tenantStatus?: string }>;
  onChange: (unitRef: string, patch: { lastContact?: string; tenantStatus?: string }) => void;
}) {
  type Row = { unitRef: string; tenant: string; sqft: number; expires: string; building: string; days: number };
  const buckets = useMemo(() => {
    const empty = { label: "Three Month Expirations",       min: -9999, max: 90,  rows: [] as Row[] };
    const four  = { label: "Four – Six Month Expirations",  min: 91,    max: 180, rows: [] as Row[] };
    const seven = { label: "Seven – Twelve Month Expirations", min: 181, max: 365, rows: [] as Row[] };
    if (!rentroll) return [empty, four, seven];
    // Scope to office tenants (JV III + NI LLC + The Office Works)
    const officeCodes = OFFICE_PROPERTY_CODES;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const p of rentroll.properties) {
      if (!officeCodes.has(p.propertyCode.toUpperCase())) continue;
      const def = PROPERTY_DEFS.find((d) => d.id.toUpperCase() === p.propertyCode.toUpperCase());
      const shortBuilding = def?.name?.replace(/^Building\s+/i, "").replace(/^Kor Center\s+/i, "Kor ") ?? p.propertyCode;
      for (const u of p.units) {
        if (u.isVacant) continue;
        if (!u.leaseTo) continue;
        if (u.baseRent === 0 && u.grossRentTotal === 0) continue;
        const d = parseMDY(u.leaseTo);
        if (!d) continue;
        const days = Math.round((d.getTime() - today.getTime()) / 86400000);
        // Skip past-due leases; only show upcoming within the next 12 months.
        if (days < 0 || days > 365) continue;
        const row: Row = { unitRef: u.unitRef, tenant: u.occupantName, sqft: u.sqft, expires: u.leaseTo, building: shortBuilding, days };
        if (days <= 90) empty.rows.push(row);
        else if (days <= 180) four.rows.push(row);
        else seven.rows.push(row);
      }
    }
    for (const b of [empty, four, seven]) b.rows.sort((a, b) => a.days - b.days);
    return [empty, four, seven];
  }, [rentroll]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {buckets.map((b) => (
        <div key={b.label}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{b.label}</div>
          {b.rows.length === 0 ? (
            <div className="muted small">No tenants in this window.</div>
          ) : (
            <div className="tableWrap">
              <table>
                <colgroup>
                  <col />                          {/* Tenant — flex */}
                  <col style={{ width: 80  }} />   {/* Sq Ft */}
                  <col style={{ width: 110 }} />   {/* Expires */}
                  <col style={{ width: 130 }} />   {/* Building — fits "The Office Works" */}
                  <col />                          {/* Tenant Status — flex */}
                </colgroup>
                <thead>
                  <tr>
                    <th style={thLeft}>Tenant</th>
                    <th style={thRight}>Sq Ft</th>
                    <th style={thLeft}>Expires</th>
                    <th style={thCenter}>Building</th>
                    <th style={thLeft}>Tenant Status</th>
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r) => {
                    const c = comments[r.unitRef] ?? {};
                    return (
                      <tr key={r.unitRef}>
                        <td><span style={{ fontSize: 14, fontWeight: 600 }}>{r.tenant}</span></td>
                        <td style={tdReadRight}><span style={{ fontSize: 14 }}>{r.sqft.toLocaleString()}</span></td>
                        <td style={tdReadLeft}><span style={{ fontSize: 14 }}>{r.expires}</span></td>
                        <td style={tdReadCenter}><span style={{ fontSize: 14 }}>{r.building}</span></td>
                        <td>
                          <input
                            style={inputStyle}
                            placeholder="e.g. RENEWING"
                            value={c.tenantStatus ?? ""}
                            onChange={(e) => onChange(r.unitRef, { tenantStatus: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
