"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PROPERTY_DEFS } from "../../lib/properties/data";
import type { RentRollData, RentRollUnit, RentRollProperty } from "../../lib/rentroll/parseRentRollExcel";
import { amenityFor } from "../../lib/rentroll/amenities";
import { useUser } from "../components/UserProvider";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function sqftFmt(n: number) {
  return n.toLocaleString("en-US");
}

function parseRentDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

function daysUntil(d: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3].slice(2)}`;
}

function leaseStatus(leaseTo: string | null | undefined): {
  label: string;
  color: string;
  bg: string;
  border: string;
  days: number | null;
} {
  const d = parseRentDate(leaseTo);
  if (!d) return { label: "No Exp", color: "var(--muted)", bg: "transparent", border: "var(--border)", days: null };
  const days = daysUntil(d);
  if (days < 0)    return { label: "Expired",  color: "#dc2626", bg: "rgba(220,38,38,0.08)",   border: "rgba(220,38,38,0.25)",  days };
  if (days <= 30)  return { label: `${days}d`, color: "#dc2626", bg: "rgba(220,38,38,0.08)",   border: "rgba(220,38,38,0.25)",  days };
  if (days <= 60)  return { label: `${days}d`, color: "#ea580c", bg: "rgba(234,88,12,0.08)",   border: "rgba(234,88,12,0.25)",  days };
  if (days <= 90)  return { label: `${days}d`, color: "#d97706", bg: "rgba(217,119,6,0.08)",   border: "rgba(217,119,6,0.25)",  days };
  if (days <= 365) return { label: `${days}d`, color: "#0b4a7d", bg: "rgba(11,74,125,0.06)",   border: "rgba(11,74,125,0.18)",  days };
  return { label: "OK", color: "#16a34a", bg: "rgba(22,163,74,0.07)", border: "rgba(22,163,74,0.2)", days };
}

function nextEscalation(unit: RentRollUnit): { date: string; amount: number } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const esc of unit.futureEscalations) {
    const d = parseRentDate(esc.date);
    if (d && d >= today) return esc;
  }
  return null;
}

function propName(code: string): string {
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
  return def?.name ?? code;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed to read file"));
    r.onload = () => {
      const v = r.result;
      if (typeof v !== "string") return reject(new Error("Unexpected FileReader result"));
      const i = v.indexOf(",");
      if (i === -1) return reject(new Error("Invalid data URL"));
      resolve(v.slice(i + 1));
    };
    r.readAsDataURL(file);
  });
}

// ─── Excluded units ───────────────────────────────────────────────────────────

const EXCLUDED_UNIT_REFS = new Set(["3060-207"]);

// ─── Portfolio definitions ────────────────────────────────────────────────────

const JV_III_CODES  = new Set(["3610", "3620", "3640"]);
const NI_LLC_CODES  = new Set(["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
const NI_LLC_ORDER  = ["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"];
const SC_CODES      = new Set(["1100", "2300", "4500", "7010", "9510", "7200", "7300", "1500", "9200", "5600", "8200"]);
const KH_CODES      = new Set(["9800", "9820", "9840", "9860"]);

// ─── Category filter sets ─────────────────────────────────────────────────────

const CATEGORY_OFFICE_CODES      = new Set([...JV_III_CODES, ...NI_LLC_CODES]);
const CATEGORY_RETAIL_CODES      = new Set([...SC_CODES]);
const CATEGORY_RESIDENTIAL_CODES = new Set([...KH_CODES]);
const CATEGORY_OW_CODES          = new Set(["4900"]);

type CategoryFilter = "All" | "Office" | "Retail" | "Residential" | "The Office Works";

const CATEGORY_OPTIONS: { label: CategoryFilter; color: string; activeColor: string }[] = [
  { label: "All",              color: "var(--muted)",  activeColor: "#0f172a"  },
  { label: "Office",           color: "#0b4a7d",       activeColor: "#0b4a7d"  },
  { label: "Retail",           color: "#0d9488",       activeColor: "#0d9488"  },
  { label: "Residential",      color: "#6d28d9",       activeColor: "#6d28d9"  },
  { label: "The Office Works", color: "#475569",       activeColor: "#475569"  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="pill">
      <b>{value}</b>
      <span className="small muted">{label}</span>
      {sub && <span className="small muted">{sub}</span>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 10 }}>
      {children}
    </div>
  );
}

function AlertBadge({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 9px",
      borderRadius: 999, fontSize: 11, fontWeight: 700,
      color, background: bg, border: `1px solid ${border}`,
    }}>
      {label}
    </span>
  );
}

// ─── Units Table ─────────────────────────────────────────────────────────────

type BaseYearResetInfo = {
  resetDate: string;
  originalBaseYear: number | null;
  newBaseYear: number;
  notes?: string;
};
const BaseYearResetsContext = createContext<Record<string, BaseYearResetInfo>>({});

function fmtResetDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function BaseYearCell({ unitRef, isVacant, value, onChange }: {
  unitRef: string;
  isVacant: boolean;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const resets = useContext(BaseYearResetsContext);
  const reset = resets[unitRef];
  const [text, setText] = useState<string>(value != null ? String(value) : "");
  useEffect(() => { setText(value != null ? String(value) : ""); }, [value]);

  if (isVacant) return <span style={{ color: "var(--muted)" }}>—</span>;

  function commit() {
    const trimmed = text.trim();
    if (trimmed === "") {
      if (value !== null) onChange(null);
      return;
    }
    // Allow 2-digit shorthand: "23" → 2023
    let normalized = trimmed;
    if (/^\d{2}$/.test(normalized)) normalized = `20${normalized}`;
    if (!/^\d{4}$/.test(normalized)) {
      setText(value != null ? String(value) : ""); // revert invalid (1- or 3-digit input)
      return;
    }
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 1900 || n > 2100) {
      setText(value != null ? String(value) : ""); // revert invalid range
      return;
    }
    if (n !== value) onChange(n);
    setText(String(n)); // reflect expansion in the input
  }

  const resetTitle = reset ? `Base year reset on ${fmtResetDate(reset.resetDate)}${reset.originalBaseYear ? ` (was ${reset.originalBaseYear})` : ""}${reset.notes ? ` — ${reset.notes}` : ""}` : undefined;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="—"
        title={resetTitle}
        style={{
          width: 56,
          padding: "3px 6px",
          fontSize: 12,
          fontWeight: reset ? 700 : 400,
          textAlign: "center",
          border: reset ? "1.5px solid rgba(220,38,38,0.55)" : "1px solid var(--border)",
          borderRadius: 6,
          background: reset ? "rgba(220,38,38,0.08)" : "transparent",
          color: reset ? "#b91c1c" : "var(--text)",
        }}
      />
      {reset && (
        <sup
          title={resetTitle}
          style={{
            fontSize: 10, fontWeight: 800,
            color: "#b91c1c", cursor: "help",
            lineHeight: 1,
          }}
        >※</sup>
      )}
    </span>
  );
}

function UnitsTable({ units, propertyCode, hideNNN, tenantMeta, onBaseYearChange, vacatingUnitRefs }: {
  units: RentRollUnit[];
  propertyCode: string;
  hideNNN?: boolean;
  tenantMeta: Record<string, { baseYear?: number | null }>;
  onBaseYearChange: (unitRef: string, baseYear: number | null) => void;
  vacatingUnitRefs?: Set<string>;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(true);
  const displayed = showAll ? units : units.slice(0, 10);
  const upperCode = propertyCode.toUpperCase();
  // Base Year only applies to office leases (JV III + NI LLC + The Office Works)
  const showBaseYear = JV_III_CODES.has(upperCode) || NI_LLC_CODES.has(upperCode) || upperCode === "4900";

  const totSqft      = units.reduce((s, u) => s + u.sqft, 0);
  const totBaseRent  = units.reduce((s, u) => s + u.baseRent, 0);
  const totCAM       = units.reduce((s, u) => s + u.opexMonth, 0);
  const totRET       = units.reduce((s, u) => s + u.reTaxMonth, 0);
  const totOther     = units.reduce((s, u) => s + u.otherMonth, 0);
  const totGross     = units.reduce((s, u) => s + u.grossRentTotal, 0);
  const avgPerSf     = totSqft > 0 ? (totBaseRent * 12) / totSqft : null;

  return (
    <div>
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Unit</th>
              <th style={{ textAlign: "right" }}>Sq Ft</th>
              <th>Lease From</th>
              <th>Lease To</th>
              {showBaseYear && <th style={{ textAlign: "center" }}>Base<br/>Year</th>}
              <th style={{ textAlign: "right" }}>Base Rent<br/>/mo</th>
              <th style={{ textAlign: "right" }}>Annual<br/>$/sf</th>
              {!hideNNN && <th style={{ textAlign: "right" }}>CAM<br/>/mo</th>}
              {!hideNNN && <th style={{ textAlign: "right" }}>RET<br/>/mo</th>}
              {!hideNNN && <th style={{ textAlign: "right" }}>Other<br/>/mo</th>}
              <th style={{ textAlign: "right" }}>Gross<br/>/mo</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((unit, i) => {
              // Render-time amenity overlay so the rent-roll labels work
              // even on parsed JSON that pre-dates the amenity field.
              const amenity = unit.amenity ?? amenityFor(unit.unitRef);
              const isAmenity = !!amenity;
              const effectiveVacant = isAmenity ? false : unit.isVacant;
              const occupantLabel = isAmenity ? amenity!.label : unit.occupantName;

              const status  = leaseStatus(unit.leaseTo);
              const rowBg   = isAmenity
                ? "rgba(13,148,136,0.06)"
                : effectiveVacant
                  ? "rgba(15,23,42,0.025)"
                  : status.days !== null && status.days <= 90
                    ? status.days < 0  ? "rgba(220,38,38,0.10)"
                    : status.days <= 30 ? "rgba(220,38,38,0.10)"
                    : status.days <= 60 ? "rgba(234,88,12,0.10)"
                    :                     "rgba(217,119,6,0.10)"
                    : undefined;

              const rowId = `unit-${unit.unitRef.replace(/[^a-zA-Z0-9]/g, "-")}`;

              return (
                <tr
                  key={i}
                  id={rowId}
                  onClick={() => router.push(`/rentroll/units/${encodeURIComponent(unit.unitRef)}`)}
                  style={{ background: rowBg, cursor: "pointer" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
                >
                  <td style={{
                    fontWeight: effectiveVacant ? 400 : 600,
                    color: effectiveVacant
                      ? "var(--muted)"
                      : isAmenity
                        ? "#0d9488"
                        : "var(--text)",
                  }}>
                    {effectiveVacant
                      ? <em style={{ color: "var(--muted)" }}>Vacant</em>
                      : isAmenity
                        ? <span>
                            {occupantLabel}
                            <span style={{
                              marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
                              padding: "2px 7px", borderRadius: 999,
                              background: "rgba(13,148,136,0.10)", color: "#0d9488",
                              border: "1px solid rgba(13,148,136,0.35)", textTransform: "uppercase",
                            }}>
                              In-House
                            </span>
                          </span>
                        : occupantLabel}
                    {!effectiveVacant && !isAmenity && vacatingUnitRefs?.has(unit.unitRef) && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(220,38,38,0.1)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.35)", letterSpacing: "0.04em" }}>VACATING</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <code style={{
                      fontSize: 12, fontWeight: 700,
                      color: "#0b4a7d",
                      whiteSpace: "nowrap",
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}>{unit.unitRef}</code>
                  </td>
                  <td style={{ textAlign: "right", fontSize: 13 }}>{sqftFmt(unit.sqft)}</td>
                  <td style={{ fontSize: 13, color: "var(--muted)" }}>{formatDate(unit.leaseFrom)}</td>
                  <td style={{ fontSize: 13 }}>
                    {unit.leaseTo ? (
                      <span>{formatDate(unit.leaseTo)}</span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                  {showBaseYear && (
                    <td
                      onClick={(e) => e.stopPropagation()}
                      style={{ textAlign: "center", fontSize: 13 }}
                    >
                      <BaseYearCell
                        unitRef={unit.unitRef}
                        isVacant={unit.isVacant}
                        value={tenantMeta[unit.unitRef]?.baseYear ?? null}
                        onChange={(v) => onBaseYearChange(unit.unitRef, v)}
                      />
                    </td>
                  )}
                  <td style={{ textAlign: "right", fontSize: 13 }}>{unit.baseRent ? money(unit.baseRent) : "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>
                    {unit.annualRentPerSqft ? `$${unit.annualRentPerSqft.toFixed(2)}` : "—"}
                  </td>
                  {!hideNNN && <td style={{ textAlign: "right", fontSize: 13 }}>{unit.opexMonth ? money(unit.opexMonth) : "—"}</td>}
                  {!hideNNN && <td style={{ textAlign: "right", fontSize: 13 }}>{unit.reTaxMonth ? money(unit.reTaxMonth) : "—"}</td>}
                  {!hideNNN && <td style={{ textAlign: "right", fontSize: 13 }}>{unit.otherMonth ? money(unit.otherMonth) : "—"}</td>}
                  <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>
                    {unit.grossRentTotal ? money(unit.grossRentTotal) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700, fontSize: 13 }}>
              <td colSpan={2} style={{ color: "var(--muted)", fontSize: 12 }}>Totals</td>
              <td style={{ textAlign: "right" }}>{sqftFmt(totSqft)}</td>
              <td colSpan={showBaseYear ? 3 : 2} />
              <td style={{ textAlign: "right" }}>{totBaseRent ? money(totBaseRent) : "—"}</td>
              <td style={{ textAlign: "right", color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>
                {avgPerSf != null ? `$${avgPerSf.toFixed(2)}` : "—"}
              </td>
              {!hideNNN && <td style={{ textAlign: "right" }}>{totCAM ? money(totCAM) : "—"}</td>}
              {!hideNNN && <td style={{ textAlign: "right" }}>{totRET ? money(totRET) : "—"}</td>}
              {!hideNNN && <td style={{ textAlign: "right" }}>{totOther ? money(totOther) : "—"}</td>}
              <td style={{ textAlign: "right" }}>{totGross ? money(totGross) : "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {units.length > 10 && (
        <button
          className="linkBtn left"
          style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show fewer" : `Show all ${units.length} units`}
        </button>
      )}
    </div>
  );
}

// ─── Property Card ────────────────────────────────────────────────────────────

function PropertyCard({ prop, tenantMeta, onBaseYearChange, vacatingUnitRefs }: {
  prop: RentRollProperty;
  tenantMeta: Record<string, { baseYear?: number | null }>;
  onBaseYearChange: (unitRef: string, baseYear: number | null) => void;
  vacatingUnitRefs?: Set<string>;
}) {
  const [open, setOpen] = useState(false);

  // Auto-expand and scroll into view when the URL hash points at one of our units
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    const hash = window.location.hash.replace(/^#/, "");
    const match = prop.units.some((u) => `unit-${u.unitRef.replace(/[^a-zA-Z0-9]/g, "-")}` === hash);
    if (match) {
      setOpen(true);
      // Defer until after the row is rendered
      setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    }
  }, [prop]);

  const name            = propName(prop.propertyCode);
  const occupancyPct    = prop.totalSqft > 0 ? (prop.occupiedSqft / prop.totalSqft) * 100 : 0;
  const totalGross      = prop.units.reduce((s, u) => s + u.grossRentTotal, 0);

  const expiringCount = prop.units.filter((u) => {
    if (u.isVacant) return false;
    if (u.baseRent === 0 && u.grossRentTotal === 0) return false;
    const d = parseRentDate(u.leaseTo);
    if (!d) return false;
    return daysUntil(d) <= 90;
  }).length;

  const escalatingCount = prop.units.filter((u) => {
    const esc = nextEscalation(u);
    if (!esc) return false;
    const d = parseRentDate(esc.date);
    return d ? daysUntil(d) <= 90 : false;
  }).length;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Card header */}
      <button
        className="linkBtn"
        onClick={() => setOpen(!open)}
        style={{ padding: "16px 20px", textAlign: "left", width: "100%" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <code style={{ fontSize: 12, color: "var(--muted)" }}>{prop.propertyCode}</code>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{name}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span>Occupied: <b style={{ color: "var(--text)" }}>{sqftFmt(prop.occupiedSqft)} sf</b></span>
              <span>Vacant: <b style={{ color: "var(--text)" }}>{sqftFmt(prop.vacantSqft)} sf</b></span>
              <span>Total: <b style={{ color: "var(--text)" }}>{sqftFmt(prop.totalSqft)} sf</b></span>
              {totalGross > 0 && <span>${Math.round(totalGross).toLocaleString()}/mo gross</span>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {expiringCount > 0 && (
                <AlertBadge
                  label={`${expiringCount} exp${expiringCount > 1 ? "s" : ""} ≤90d`}
                  color="#d97706"
                  bg="rgba(217,119,6,0.08)"
                  border="rgba(217,119,6,0.25)"
                />
              )}
              {escalatingCount > 0 && (
                <AlertBadge
                  label={`${escalatingCount} esc ≤90d`}
                  color="#0b4a7d"
                  bg="rgba(11,74,125,0.08)"
                  border="rgba(11,74,125,0.25)"
                />
              )}
            </div>
          </div>
          <span style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "0 20px 20px" }}>
          {/* Occupancy bar */}
          {prop.totalSqft > 0 && (
            <div style={{ marginTop: 16, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Occupancy</span>
                <span style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: occupancyPct >= 90 ? "#16a34a" : occupancyPct >= 70 ? "#0b4a7d" : "#d97706",
                }}>
                  {occupancyPct.toFixed(1)}%
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  ({sqftFmt(prop.occupiedSqft)} / {sqftFmt(prop.totalSqft)} sf)
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${occupancyPct}%`,
                  borderRadius: 999,
                  background: occupancyPct >= 90 ? "#16a34a" : occupancyPct >= 70 ? "#0b4a7d" : "#d97706",
                }} />
              </div>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
              Tenants · {prop.units.length} {prop.units.length === 1 ? "unit" : "units"}
            </div>
            <UnitsTable units={prop.units} propertyCode={prop.propertyCode} hideNNN={KH_CODES.has(prop.propertyCode.toUpperCase()) || prop.propertyCode.toUpperCase() === "4900"} tenantMeta={tenantMeta} onBaseYearChange={onBaseYearChange} vacatingUnitRefs={vacatingUnitRefs} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Alerts Panel ─────────────────────────────────────────────────────────────

function AlertsPanel({ rentroll }: { rentroll: RentRollData }) {
  const [expOpen, setExpOpen] = useState(false);
  const [vacOpen, setVacOpen] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  type AlertRow = {
    propertyCode: string;
    unit: RentRollUnit;
    days: number;
  };

  type VacancyRow = {
    propertyCode: string;
    unit: RentRollUnit;
  };

  const expirations: AlertRow[] = [];
  const escalations: AlertRow[] = [];
  const vacancies: VacancyRow[] = [];

  for (const prop of rentroll.properties) {
    for (const unit of prop.units) {
      if (unit.isVacant) {
        vacancies.push({ propertyCode: prop.propertyCode, unit });
      }
      if (prop.propertyCode !== "4900" && !unit.isVacant && unit.leaseTo && (unit.baseRent > 0 || unit.grossRentTotal > 0)) {
        const d = parseRentDate(unit.leaseTo);
        if (d) {
          const days = daysUntil(d);
          if (days <= 90) expirations.push({ propertyCode: prop.propertyCode, unit, days });
        }
      }
      const nextEsc = nextEscalation(unit);
      if (nextEsc) {
        const d = parseRentDate(nextEsc.date);
        if (d) {
          const days = daysUntil(d);
          if (days <= 90) escalations.push({ propertyCode: prop.propertyCode, unit, days });
        }
      }
    }
  }

  expirations.sort((a, b) => a.days - b.days);
  escalations.sort((a, b) => a.days - b.days);

  const totalVacantSqft = vacancies.reduce((s, v) => s + v.unit.sqft, 0);

  if (!expirations.length && !escalations.length && !vacancies.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {expirations.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <button
            className="linkBtn"
            onClick={() => setExpOpen(!expOpen)}
            style={{ padding: "14px 20px", textAlign: "left", width: "100%" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ marginBottom: 0, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>
                {expirations.some((e) => e.days < 0)
                  ? "Expired / Expiring within 90 Days"
                  : "Expiring within 90 Days"}
              </div>
              <span style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0, marginLeft: 12 }}>{expOpen ? "▲" : "▼"}</span>
            </div>
          </button>
          {expOpen && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "0 20px 20px" }}>
              <div className="tableWrap" style={{ marginTop: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Tenant</th>
                      <th>Unit</th>
                      <th style={{ textAlign: "right" }}>Sq Ft</th>
                      <th>Expires</th>
                      <th style={{ textAlign: "right" }}>Base Rent/mo</th>
                      <th style={{ textAlign: "right" }}>Gross/mo</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expirations.map(({ propertyCode, unit, days }, i) => {
                      const status = leaseStatus(unit.leaseTo);
                      return (
                        <tr key={i} style={{ background: days < 0 || days <= 30 ? "rgba(220,38,38,0.10)" : days <= 60 ? "rgba(234,88,12,0.10)" : "rgba(217,119,6,0.10)" }}>
                          <td style={{ fontSize: 13 }}>
                            <div style={{ fontWeight: 600 }}>{propName(propertyCode)}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{propertyCode}</div>
                          </td>
                          <td style={{ fontWeight: 600 }}>{unit.occupantName}</td>
                          <td><code style={{ fontSize: 12 }}>{unit.unitRef}</code></td>
                          <td style={{ textAlign: "right", fontSize: 13 }}>{sqftFmt(unit.sqft)}</td>
                          <td style={{ fontSize: 13 }}>{formatDate(unit.leaseTo)}</td>
                          <td style={{ textAlign: "right", fontSize: 13 }}>{unit.baseRent ? money(unit.baseRent) : "—"}</td>
                          <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>{unit.grossRentTotal ? money(unit.grossRentTotal) : "—"}</td>
                          <td>
                            <AlertBadge label={days < 0 ? "Expired" : `${days}d`} color={status.color} bg={status.bg} border={status.border} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {vacancies.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <button
            className="linkBtn"
            onClick={() => setVacOpen(!vacOpen)}
            style={{ padding: "14px 20px", textAlign: "left", width: "100%" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>
                Vacancy Summary
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {vacancies.length} unit{vacancies.length !== 1 ? "s" : ""} · {sqftFmt(totalVacantSqft)} sf vacant
                </span>
                <span style={{ color: "var(--muted)", fontSize: 18 }}>{vacOpen ? "▲" : "▼"}</span>
              </div>
            </div>
          </button>
          {vacOpen && (() => {
            const OW_CODES = new Set(["4900"]);
            const vacGroups: { label: string; codes: Set<string> }[] = [
              { label: "JV III LLC",        codes: JV_III_CODES },
              { label: "NI LLC",            codes: NI_LLC_CODES },
              { label: "Shopping Centers",  codes: SC_CODES },
              { label: "Korman Homes",      codes: KH_CODES },
              { label: "The Office Works",  codes: OW_CODES },
            ];
            const allKnown = new Set([...JV_III_CODES, ...NI_LLC_CODES, ...SC_CODES, ...KH_CODES, ...OW_CODES]);
            const groupedRows = vacGroups.map(({ label, codes }) => ({
              label,
              rows: vacancies.filter(v => codes.has(v.propertyCode.toUpperCase())),
            })).filter(g => g.rows.length > 0);
            const otherRows = vacancies.filter(v => !allKnown.has(v.propertyCode.toUpperCase()));
            if (otherRows.length > 0) groupedRows.push({ label: "Other", rows: otherRows });

            return (
              <div style={{ borderTop: "1px solid var(--border)", padding: "0 20px 16px" }}>
                <div className="tableWrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Property</th>
                        <th>Unit</th>
                        <th style={{ textAlign: "right" }}>Sq Ft</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedRows.map(({ label, rows }) => {
                        const groupSqft = rows.reduce((s, r) => s + r.unit.sqft, 0);
                        return (
                          <>
                            <tr key={`hdr-${label}`} style={{ background: "rgba(15,23,42,0.04)" }}>
                              <td colSpan={2} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", paddingTop: 6, paddingBottom: 6 }}>{label}</td>
                              <td style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", paddingTop: 6, paddingBottom: 6 }}>{rows.length} unit{rows.length !== 1 ? "s" : ""} · {sqftFmt(groupSqft)} sf</td>
                            </tr>
                            {rows.map(({ propertyCode, unit }, i) => (
                              <tr key={`${label}-${i}`} style={{ background: "rgba(15,23,42,0.012)" }}>
                                <td style={{ fontSize: 13, paddingLeft: 20 }}>{propName(propertyCode)}</td>
                                <td><code style={{ fontSize: 12 }}>{unit.unitRef}</code></td>
                                <td style={{ textAlign: "right", fontSize: 13 }}>{sqftFmt(unit.sqft)}</td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {escalations.length > 0 && (
        <div className="card">
          <SectionLabel>Upcoming Escalations within 90 Days</SectionLabel>
          <div className="tableWrap" style={{ marginTop: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Tenant</th>
                  <th>Unit</th>
                  <th style={{ textAlign: "right" }}>Sq Ft</th>
                  <th>Escalation Date</th>
                  <th style={{ textAlign: "right" }}>Current Rent</th>
                  <th style={{ textAlign: "right" }}>New Rent</th>
                  <th style={{ textAlign: "right" }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {escalations.map(({ propertyCode, unit, days }, i) => {
                  const esc    = nextEscalation(unit)!;
                  const change = esc.amount - unit.baseRent;
                  return (
                    <tr key={i} style={{ background: "rgba(217,119,6,0.03)" }}>
                      <td style={{ fontSize: 13 }}>
                        <div style={{ fontWeight: 600 }}>{propName(propertyCode)}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{propertyCode}</div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{unit.occupantName}</td>
                      <td><code style={{ fontSize: 12 }}>{unit.unitRef}</code></td>
                      <td style={{ textAlign: "right", fontSize: 13 }}>{sqftFmt(unit.sqft)}</td>
                      <td style={{ fontSize: 13 }}>
                        <div style={{ fontWeight: 600 }}>{formatDate(esc.date)}</div>
                        <div style={{ fontSize: 11, color: "#d97706" }}>{days}d away</div>
                      </td>
                      <td style={{ textAlign: "right", fontSize: 13 }}>{money(unit.baseRent)}</td>
                      <td style={{ textAlign: "right", fontSize: 13, fontWeight: 700 }}>{money(esc.amount)}</td>
                      <td style={{ textAlign: "right", fontSize: 13, color: change >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                        {change >= 0 ? "+" : ""}{money(change)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Occupancy / Rent stacked bar chart ───────────────────────────────────────

type ChartMetric = "occupancy" | "rent";

const CHART_METRICS: { key: ChartMetric; label: string }[] = [
  { key: "occupancy", label: "Occupancy" },
  { key: "rent",      label: "Rent Breakdown" },
];

// Stacked-segment definitions per metric — drives both the bars and the legend.
const METRIC_SEGMENTS: Record<ChartMetric, { key: string; label: string; color: string }[]> = {
  occupancy: [
    { key: "occ", label: "Occupied", color: "#16a34a" },
    { key: "vac", label: "Vacant",   color: "#cbd5e1" },
  ],
  rent: [
    { key: "base",  label: "Base Rent", color: "#0b4a7d" },
    { key: "cam",   label: "CAM",       color: "#0d9488" },
    { key: "ret",   label: "RE Tax",    color: "#d97706" },
    { key: "other", label: "Other",     color: "#94a3b8" },
  ],
};

const PORTFOLIO_GROUPS: { key: string; label: string; codes: Set<string> }[] = [
  { key: "jv3", label: "JV III LLC",       codes: JV_III_CODES },
  { key: "ni",  label: "NI LLC",           codes: NI_LLC_CODES },
  { key: "sc",  label: "Shopping Centers", codes: SC_CODES },
  { key: "kh",  label: "Korman Homes",     codes: KH_CODES },
  { key: "ow",  label: "The Office Works", codes: CATEGORY_OW_CODES },
];

function moneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

type ChartSegment = { key: string; label: string; value: number; color: string };
type ChartBar = { key: string; label: string; fullName: string; segments: ChartSegment[]; total: number };

function OccupancyChart({ rentroll, categoryFilter }: { rentroll: RentRollData; categoryFilter: CategoryFilter }) {
  const [metric, setMetric] = useState<ChartMetric>("occupancy");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; bar: ChartBar; seg: ChartSegment } | null>(null);

  // One bar per portfolio group when the "All" filter is active; otherwise
  // one bar per individual property in the filtered set.
  const bars: ChartBar[] = useMemo(() => {
    type Source = { key: string; label: string; fullName: string; props: RentRollProperty[] };
    const sources: Source[] = categoryFilter === "All"
      ? PORTFOLIO_GROUPS
          .map((g) => ({
            key: g.key,
            label: g.label,
            fullName: g.label,
            props: rentroll.properties.filter((p) => g.codes.has(p.propertyCode.toUpperCase())),
          }))
          .filter((s) => s.props.length > 0)
      : rentroll.properties.map((p) => ({
          key: p.propertyCode,
          label: p.propertyCode,
          fullName: propName(p.propertyCode),
          props: [p],
        }));

    const defs = METRIC_SEGMENTS[metric];
    return sources
      .map((s): ChartBar => {
        const raw: Record<string, number> = {};
        if (metric === "occupancy") {
          raw.occ = s.props.reduce((a, p) => a + p.occupiedSqft, 0);
          raw.vac = s.props.reduce((a, p) => a + p.vacantSqft, 0);
        } else {
          raw.base = raw.cam = raw.ret = raw.other = 0;
          for (const p of s.props) for (const u of p.units) {
            raw.base += u.baseRent; raw.cam += u.opexMonth;
            raw.ret += u.reTaxMonth; raw.other += u.otherMonth;
          }
        }
        const segments: ChartSegment[] = defs
          .map((d) => ({ key: d.key, label: d.label, color: d.color, value: raw[d.key] ?? 0 }))
          .filter((seg) => seg.value > 0);
        const total = segments.reduce((a, seg) => a + seg.value, 0);
        return { key: s.key, label: s.label, fullName: s.fullName, segments, total };
      })
      .filter((b) => b.total > 0);
  }, [rentroll, categoryFilter, metric]);

  const chartMax = Math.max(1, ...bars.map((b) => b.total));
  const chartHeight = 200;
  const isMoney = metric !== "occupancy";
  // Occupancy is shown as a percentage: every bar is full height and the
  // segments split it into occupied vs vacant share.
  const normalized = metric === "occupancy";
  const fmt = (n: number) => (isMoney ? moneyShort(n) : `${sqftFmt(Math.round(n))} sf`);
  const legend = METRIC_SEGMENTS[metric];

  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {CHART_METRICS.find((m) => m.key === metric)!.label}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {categoryFilter === "All" ? "By portfolio group" : "By property"}
            {metric === "occupancy" ? " · % occupied" : " · monthly $"}
          </div>
        </div>
        {/* Metric toggles */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CHART_METRICS.map(({ key, label }) => {
            const active = metric === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setMetric(key); setHover(null); }}
                style={{
                  padding: "5px 14px", borderRadius: 999, fontSize: 12,
                  fontWeight: active ? 700 : 500, cursor: "pointer",
                  border: `1.5px solid ${active ? "#0b4a7d" : "var(--border)"}`,
                  background: active ? "rgba(11,74,125,0.10)" : "transparent",
                  color: active ? "#0b4a7d" : "var(--muted)",
                  fontFamily: "inherit", transition: "all 0.15s ease",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {bars.length === 0 ? (
        <div className="muted small" style={{ padding: "24px 0", textAlign: "center" }}>
          No data for the selected metric.
        </div>
      ) : (
        <>
          <div
            ref={wrapRef}
            style={{ display: "flex", alignItems: "flex-end", gap: 8, height: chartHeight + 34, paddingBottom: 34, position: "relative" }}
            onMouseLeave={() => setHover(null)}
          >
            {bars.map((bar) => {
              const barH = normalized ? chartHeight : (bar.total / chartMax) * chartHeight;
              const denom = normalized ? bar.total : chartMax;
              const occSeg = bar.segments.find((s) => s.key === "occ");
              const topLabel = normalized
                ? `${(((occSeg?.value ?? 0) / bar.total) * 100).toFixed(1)}%`
                : fmt(bar.total);
              return (
                <div key={bar.key}
                  style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: chartHeight, position: "relative" }}>
                  <div style={{ display: "flex", flexDirection: "column-reverse", width: "62%", maxWidth: 56, height: barH, borderRadius: "4px 4px 0 0", overflow: "hidden", border: barH > 0 ? "1px solid rgba(15,23,42,0.12)" : "none" }}>
                    {bar.segments.map((seg) => {
                      const segH = (seg.value / denom) * chartHeight;
                      const isHovered = hover?.bar.key === bar.key && hover?.seg.key === seg.key;
                      return (
                        <div key={seg.key}
                          onMouseMove={(e) => {
                            const rect = wrapRef.current?.getBoundingClientRect();
                            if (!rect) return;
                            setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, bar, seg });
                          }}
                          style={{
                            height: segH,
                            background: seg.color,
                            cursor: "pointer",
                            filter: hover && !isHovered ? "brightness(0.88)" : "none",
                            transition: "filter 0.12s",
                          }}
                        />
                      );
                    })}
                  </div>
                  <div style={{ position: "absolute", bottom: barH + 3, fontSize: 9, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>
                    {topLabel}
                  </div>
                  <div style={{ position: "absolute", bottom: -26, fontSize: 10, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }}>
                    {bar.label}
                  </div>
                </div>
              );
            })}
            {hover && (
              <div style={{
                position: "absolute",
                left: Math.min(hover.x + 14, 540),
                top: Math.max(hover.y - 8, 0),
                background: "rgba(15,23,42,0.94)", color: "#fff",
                padding: "8px 11px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                pointerEvents: "none", whiteSpace: "nowrap",
                boxShadow: "0 4px 14px rgba(15,23,42,0.25)", zIndex: 30, lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{hover.bar.fullName}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, background: hover.seg.color, borderRadius: 2 }} />
                  <span>{hover.seg.label}: <b>{fmt(hover.seg.value)}</b></span>
                </div>
                <div style={{ opacity: 0.85, marginTop: 2 }}>
                  {((hover.seg.value / hover.bar.total) * 100).toFixed(1)}% of {fmt(hover.bar.total)} total
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            {legend.map((seg) => (
              <div key={seg.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ width: 12, height: 12, background: seg.color, borderRadius: 3 }} />
                <span style={{ fontWeight: 600 }}>{seg.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Portfolio Group ──────────────────────────────────────────────────────────

function PortfolioGroup({ name, props, tenantMeta, onBaseYearChange, vacatingUnitRefs }: {
  name: string;
  props: RentRollProperty[];
  tenantMeta: Record<string, { baseYear?: number | null }>;
  onBaseYearChange: (unitRef: string, baseYear: number | null) => void;
  vacatingUnitRefs?: Set<string>;
}) {
  if (!props.length) return null;
  const totalSqft    = props.reduce((s, p) => s + p.totalSqft,    0);
  const occupiedSqft = props.reduce((s, p) => s + p.occupiedSqft, 0);
  const vacantSqft   = props.reduce((s, p) => s + p.vacantSqft,   0);
  const gross        = props.reduce((s, p) => s + p.units.reduce((u, unit) => u + unit.grossRentTotal, 0), 0);
  const pct          = totalSqft > 0 ? (occupiedSqft / totalSqft) * 100 : 0;

  return (
    <div>
      {/* Portfolio header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text)" }}>
          {name} <span style={{ fontWeight: 600, color: "var(--muted)" }}>({props.length})</span>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
          <span><b style={{ fontWeight: 700, color: "var(--text)" }}>{sqftFmt(totalSqft)}</b> Total SF</span>
          <span><b style={{ fontWeight: 700, color: "var(--text)" }}>{sqftFmt(occupiedSqft)}</b> Occupied</span>
          {vacantSqft > 0 && <span><b style={{ fontWeight: 700, color: "var(--text)" }}>{sqftFmt(vacantSqft)}</b> Vacant</span>}
          <span><b style={{ fontWeight: 700, color: pct >= 90 ? "#16a34a" : pct >= 70 ? "#0b4a7d" : "#d97706" }}>{pct.toFixed(1)}%</b> Occ</span>
          {gross > 0 && <span><b style={{ fontWeight: 700, color: "var(--text)" }}>${Math.round(gross).toLocaleString()}</b>/mo Gross</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {props.map(p => <PropertyCard key={p.propertyCode} prop={p} tenantMeta={tenantMeta} onBaseYearChange={onBaseYearChange} vacatingUnitRefs={vacatingUnitRefs} />)}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RentRollPage() {
  const { user } = useUser();
  const [rawRentroll, setRawRentroll] = useState<RentRollData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [snapshotList, setSnapshotList] = useState<import("../../lib/rentroll/snapshot").RentRollSnapshotSummary[]>([]);
  const [reportMonth, setReportMonth] = useState<string>(""); // "" = current; otherwise YYYY-MM
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(user.defaultRentRollCategory as CategoryFilter);
  // Re-apply persona default when the active user changes (until the user clicks a different chip)
  useEffect(() => { setCategoryFilter(user.defaultRentRollCategory as CategoryFilter); }, [user.id, user.defaultRentRollCategory]);
  const [generatingReport, setGeneratingReport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tenantMeta, setTenantMeta] = useState<Record<string, { baseYear?: number | null }>>({});
  const [baseYearResets, setBaseYearResets] = useState<Record<string, { resetDate: string; originalBaseYear: number | null; newBaseYear: number; notes?: string }>>({});
  const [vacatingMatchers, setVacatingMatchers] = useState<{ unitRefs: Set<string>; names: Set<string> }>({ unitRefs: new Set(), names: new Set() });

  useEffect(() => {
    fetch("/api/tenant-meta").then((r) => r.json()).then((j) => setTenantMeta(j.tenantMeta ?? {})).catch(() => {});
    fetch("/api/base-year-resets").then((r) => r.json()).then((j) => setBaseYearResets(j.resets ?? {})).catch(() => {});
    fetch("/api/leasing-activity").then((r) => r.json()).then((j) => {
      const list = (j?.leasingActivity?.tenantsVacating ?? []) as { unitRef?: string; tenant?: string }[];
      setVacatingMatchers({
        unitRefs: new Set(list.map(v => v.unitRef ?? "").filter(Boolean)),
        names:    new Set(list.map(v => (v.tenant ?? "").toLowerCase().trim()).filter(Boolean)),
      });
    }).catch(() => {});
  }, []);

  // Build the set of unit refs whose tenant is currently flagged Vacating
  // (matched either by unitRef link or by tenant-name match).
  const vacatingUnitRefs = useMemo(() => {
    const out = new Set<string>(vacatingMatchers.unitRefs);
    if (rawRentroll && vacatingMatchers.names.size > 0) {
      for (const p of rawRentroll.properties) {
        for (const u of p.units) {
          if (vacatingMatchers.names.has((u.occupantName ?? "").toLowerCase().trim())) out.add(u.unitRef);
        }
      }
    }
    return out;
  }, [rawRentroll, vacatingMatchers]);

  async function updateBaseYear(unitRef: string, baseYear: number | null) {
    // Optimistic update
    setTenantMeta((prev) => {
      const next = { ...prev };
      const cur = { ...(next[unitRef] ?? {}) };
      if (baseYear === null) delete cur.baseYear; else cur.baseYear = baseYear;
      if (Object.keys(cur).length === 0) delete next[unitRef]; else next[unitRef] = cur;
      return next;
    });
    try {
      await fetch("/api/tenant-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitRef, baseYear }),
      });
    } catch { /* surface a toast later if needed */ }
  }

  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  async function handleStatusReport() {
    const isHistorical = !!reportMonth;
    if (!isHistorical && (!categoryRentroll || !filteredRentroll)) return;
    setGeneratingReport(true);
    try {
      const requestBody: any = { category: categoryFilter, tenantMeta };
      if (isHistorical) {
        requestBody.month = reportMonth;
      } else {
        requestBody.properties = categoryRentroll!.properties;
        requestBody.reportFrom = filteredRentroll!.reportFrom;
      }
      const res = await fetch("/api/status-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      let period: string;
      if (isHistorical) {
        const [yy, mm] = reportMonth.split("-");
        period = `${MONTHS_SHORT[parseInt(mm) - 1]}-${yy.slice(2)}`;
      } else {
        const m = filteredRentroll!.reportFrom.match(/^(\d{1,2})\/\d+\/(\d{4})$/);
        period = m ? `${MONTHS_SHORT[parseInt(m[1]) - 1]}-${m[2].slice(2)}` : "";
      }
      a.href     = url;
      a.download = `${categoryFilter} - ${period} Status Report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingReport(false);
    }
  }

  // Load existing rent roll on mount
  useEffect(() => {
    fetch("/api/rentroll")
      .then((r) => r.json())
      .then((data) => {
        setRawRentroll(data.rentroll ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch("/api/rentroll/history")
      .then((r) => r.json())
      .then((j) => {
        const snaps = (j.snapshots ?? []) as import("../../lib/rentroll/snapshot").RentRollSnapshotSummary[];
        setSnapshotList(snaps);
      })
      .catch(() => {});
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setUploadError(null);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch("/api/rentroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64 }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Upload failed");
      setRawRentroll(data.rentroll);
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // No persona property scope — everyone sees all properties; default category filter is applied per persona instead.
  const rentroll: RentRollData | null = rawRentroll;

  // Filter excluded units from all properties
  const filteredRentroll = rentroll
    ? {
        ...rentroll,
        properties: rentroll.properties.map((p) => ({
          ...p,
          units: p.units.filter((u) => !EXCLUDED_UNIT_REFS.has(u.unitRef)),
        })),
      }
    : null;

  // Category-filtered rent roll (used for the dashboard sections below)
  const categoryRentroll = filteredRentroll
    ? {
        ...filteredRentroll,
        properties: categoryFilter === "All"
          ? filteredRentroll.properties
          : filteredRentroll.properties.filter((p) => {
              const code = p.propertyCode.toUpperCase();
              if (categoryFilter === "Office")           return CATEGORY_OFFICE_CODES.has(code);
              if (categoryFilter === "Retail")           return CATEGORY_RETAIL_CODES.has(code);
              if (categoryFilter === "Residential")      return CATEGORY_RESIDENTIAL_CODES.has(code);
              if (categoryFilter === "The Office Works") return CATEGORY_OW_CODES.has(code);
              return true;
            }),
      }
    : null;

  // Portfolio totals (category-aware)
  const totalSqft    = categoryRentroll?.properties.reduce((s, p) => s + p.totalSqft,    0) ?? 0;
  const occupiedSqft = categoryRentroll?.properties.reduce((s, p) => s + p.occupiedSqft, 0) ?? 0;
  const vacantSqft   = categoryRentroll?.properties.reduce((s, p) => s + p.vacantSqft,   0) ?? 0;
  const totalGross   = categoryRentroll?.properties.reduce((s, p) =>
    s + p.units.reduce((u, unit) => u + unit.grossRentTotal, 0), 0) ?? 0;
  const occupancyPct = totalSqft > 0 ? (occupiedSqft / totalSqft) * 100 : 0;

  // "May-26" style label derived from the rent roll's report period — shown
  // alongside the page heading.
  const periodLabel = (() => {
    const m = filteredRentroll?.reportFrom?.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
    return m ? `${MONTHS_SHORT[parseInt(m[1]) - 1]}-${m[2].slice(2)}` : null;
  })();

  return (
    <BaseYearResetsContext.Provider value={baseYearResets}>
    <main>
      <h1 style={{ marginBottom: 24 }}>
        Rent Roll
        {periodLabel && <span style={{ color: "var(--muted)", fontWeight: 400 }}> – {periodLabel}</span>}
      </h1>

      {/* ── Import card ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              className="btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ whiteSpace: "nowrap", fontSize: 13, padding: "8px 16px" }}
            >
              {uploading ? "Uploading…" : "Import"}
            </button>
            <button
              className="btn"
              style={{ borderRadius: 999, fontWeight: 700, whiteSpace: "nowrap", fontSize: 13, padding: "8px 16px" }}
              onClick={() => setRawRentroll(null)}
              disabled={!rentroll}
            >
              Clear
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {((filteredRentroll && categoryRentroll) || snapshotList.length > 0) && (
              <>
                {snapshotList.length > 0 && (
                  <select
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    title="Status report period"
                    style={{
                      borderRadius: 999, padding: "8px 12px",
                      fontSize: 13, fontWeight: 600,
                      border: "1px solid rgba(11,74,125,0.3)",
                      background: "var(--card)", color: "#0b4a7d",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">Current</option>
                    {snapshotList.slice().reverse().map((s) => {
                      const [yy, mm] = s.month.split("-");
                      const label = `${MONTHS_SHORT[parseInt(mm) - 1]} ${yy}`;
                      return <option key={s.month} value={s.month}>{label}</option>;
                    })}
                  </select>
                )}
                <button
                  onClick={handleStatusReport}
                  disabled={generatingReport || (!reportMonth && (!filteredRentroll || !categoryRentroll))}
                  style={{
                    background: generatingReport ? "rgba(11,74,125,0.4)" : "rgba(11,74,125,0.85)",
                    color: "#fff", borderRadius: 999, padding: "8px 16px",
                    fontSize: 13, fontWeight: 700, border: "1px solid transparent",
                    display: "inline-flex", alignItems: "center", cursor: generatingReport ? "default" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {generatingReport ? "Generating…" : "Status Report"}
                </button>
              </>
            )}
            <span style={{ background: "rgba(22, 163, 74, 0.85)", color: "#fff", borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 700, border: "1px solid transparent", display: "inline-flex", alignItems: "center" }}>Monthly</span>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Import the <b>Commercial Rent Roll</b> Excel file (.xls or .xlsx).
        </p>
        {uploadError && <div style={{ color: "#b42318", fontSize: 13, marginTop: 6 }}>{uploadError}</div>}
        {loading && <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}>Loading…</div>}
        {filteredRentroll && (
          <>
            {/* Category filter pills */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {CATEGORY_OPTIONS.map(({ label, color, activeColor }) => {
                const active = categoryFilter === label;
                return (
                  <button
                    key={label}
                    onClick={() => setCategoryFilter(label)}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer",
                      border: `1.5px solid ${active ? activeColor : "var(--border)"}`,
                      background: active
                        ? label === "All"
                          ? "rgba(15,23,42,0.08)"
                          : `${activeColor}18`
                        : "transparent",
                      color: active ? activeColor : "var(--muted)",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="pills" style={{ justifyContent: "flex-start", marginTop: 12, marginBottom: 0 }}>
              <StatPill label="Occupied"       value={sqftFmt(occupiedSqft)} />
              <StatPill label="Vacant"         value={sqftFmt(vacantSqft)} />
              <StatPill label="Total Sq Ft"    value={sqftFmt(totalSqft)} />
              <StatPill label="Properties"     value={String(categoryRentroll!.properties.length)} />
              {totalGross > 0 && <StatPill label="Gross Rent/mo" value={`$${Math.round(totalGross).toLocaleString()}`} />}
            </div>
            {/* Occupancy chart — driven by the category pills above */}
            {categoryRentroll!.properties.reduce((s, p) => s + p.totalSqft, 0) > 0 && (
              <OccupancyChart
                rentroll={categoryRentroll!}
                categoryFilter={categoryFilter}
              />
            )}
          </>
        )}
      </div>

      {/* ── Dashboard ─────────────────────────────────────────────────────── */}
      {filteredRentroll && categoryRentroll && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Alerts */}
          <AlertsPanel rentroll={categoryRentroll} />

          {/* Per-property cards grouped by portfolio */}
          {(() => {
            const props = categoryRentroll.properties;
            const jvIII  = props.filter(p => JV_III_CODES.has(p.propertyCode.toUpperCase()));
            const niLLC  = props
              .filter(p => NI_LLC_CODES.has(p.propertyCode.toUpperCase()))
              .sort((a, b) => {
                const ai = NI_LLC_ORDER.indexOf(a.propertyCode.toUpperCase());
                const bi = NI_LLC_ORDER.indexOf(b.propertyCode.toUpperCase());
                return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
              });
            const sc     = props.filter(p => SC_CODES.has(p.propertyCode.toUpperCase()));
            const kh     = props.filter(p => KH_CODES.has(p.propertyCode.toUpperCase()));
            const allGrouped = new Set([...JV_III_CODES, ...NI_LLC_CODES, ...SC_CODES, ...KH_CODES]);
            const other  = props.filter(p => !allGrouped.has(p.propertyCode.toUpperCase()));
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                <PortfolioGroup name="JV III LLC"         props={jvIII}  tenantMeta={tenantMeta} onBaseYearChange={updateBaseYear} vacatingUnitRefs={vacatingUnitRefs} />
                <PortfolioGroup name="NI LLC"             props={niLLC}  tenantMeta={tenantMeta} onBaseYearChange={updateBaseYear} vacatingUnitRefs={vacatingUnitRefs} />
                <PortfolioGroup name="Shopping Centers"   props={sc}     tenantMeta={tenantMeta} onBaseYearChange={updateBaseYear} vacatingUnitRefs={vacatingUnitRefs} />
                <PortfolioGroup name="Korman Homes"       props={kh}     tenantMeta={tenantMeta} onBaseYearChange={updateBaseYear} vacatingUnitRefs={vacatingUnitRefs} />
                {other.length > 0 && <PortfolioGroup name="Other Properties" props={other} tenantMeta={tenantMeta} onBaseYearChange={updateBaseYear} vacatingUnitRefs={vacatingUnitRefs} />}
              </div>
            );
          })()}
        </div>
      )}
    </main>
    </BaseYearResetsContext.Provider>
  );
}
