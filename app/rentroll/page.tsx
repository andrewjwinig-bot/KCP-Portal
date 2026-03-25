"use client";

import { useEffect, useRef, useState } from "react";
import { PROPERTY_DEFS } from "../../lib/properties/data";
import type { RentRollData, RentRollUnit, RentRollProperty } from "../../lib/rentroll/parseRentRollExcel";

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
  if (days < 0)   return { label: "Expired",    color: "#dc2626", bg: "rgba(220,38,38,0.08)",  border: "rgba(220,38,38,0.25)",  days };
  if (days <= 30)  return { label: `${days}d`,   color: "#dc2626", bg: "rgba(220,38,38,0.08)",  border: "rgba(220,38,38,0.25)",  days };
  if (days <= 90)  return { label: `${days}d`,   color: "#d97706", bg: "rgba(217,119,6,0.08)", border: "rgba(217,119,6,0.25)",  days };
  if (days <= 365) return { label: `${days}d`,   color: "#0b4a7d", bg: "rgba(11,74,125,0.06)", border: "rgba(11,74,125,0.18)", days };
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
const SC_CODES      = new Set(["1100", "2300", "4500", "7010", "9510", "7200", "7300", "1500", "9200", "5600", "8200"]);
const KH_CODES      = new Set(["9800", "9820", "9840", "9860"]);

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

function UnitsTable({ units, propertyCode }: { units: RentRollUnit[]; propertyCode: string }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? units : units.slice(0, 10);

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
              <th style={{ textAlign: "right" }}>Base Rent<br/>/mo</th>
              <th style={{ textAlign: "right" }}>Annual<br/>$/sf</th>
              <th style={{ textAlign: "right" }}>CAM<br/>/mo</th>
              <th style={{ textAlign: "right" }}>RET<br/>/mo</th>
              <th style={{ textAlign: "right" }}>Other<br/>/mo</th>
              <th style={{ textAlign: "right" }}>Gross<br/>/mo</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((unit, i) => {
              const status  = leaseStatus(unit.leaseTo);
              const rowBg   = unit.isVacant
                ? "rgba(15,23,42,0.025)"
                : status.days !== null && status.days <= 90
                  ? status.days < 0
                    ? "rgba(220,38,38,0.04)"
                    : "rgba(217,119,6,0.04)"
                  : undefined;

              const rowId = `unit-${unit.unitRef.replace(/[^a-zA-Z0-9]/g, "-")}`;

              return (
                <tr key={i} id={rowId} style={{ background: rowBg }}>
                  <td style={{ fontWeight: unit.isVacant ? 400 : 600, color: unit.isVacant ? "var(--muted)" : "var(--text)" }}>
                    {unit.isVacant ? <em style={{ color: "var(--muted)" }}>Vacant</em> : unit.occupantName}
                  </td>
                  <td>
                    <code style={{ fontSize: 12 }}>{unit.unitRef}</code>
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
                  <td style={{ textAlign: "right", fontSize: 13 }}>{unit.baseRent ? money(unit.baseRent) : "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>
                    {unit.annualRentPerSqft ? `$${unit.annualRentPerSqft.toFixed(2)}` : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontSize: 13 }}>{unit.opexMonth ? money(unit.opexMonth) : "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 13 }}>{unit.reTaxMonth ? money(unit.reTaxMonth) : "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 13 }}>{unit.otherMonth ? money(unit.otherMonth) : "—"}</td>
                  <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>
                    {unit.grossRentTotal ? money(unit.grossRentTotal) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
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

function PropertyCard({ prop }: { prop: RentRollProperty }) {
  const [open, setOpen] = useState(true);
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
              <span style={{ fontWeight: 700, fontSize: 16 }}>{name}</span>
              <code style={{ fontSize: 12, color: "var(--muted)" }}>{prop.propertyCode}</code>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span>Occupied: <b style={{ color: "var(--text)" }}>{sqftFmt(prop.occupiedSqft)} sf</b></span>
              <span>Vacant: <b style={{ color: "var(--text)" }}>{sqftFmt(prop.vacantSqft)} sf</b></span>
              <span>Total: <b style={{ color: "var(--text)" }}>{sqftFmt(prop.totalSqft)} sf</b></span>
              {totalGross > 0 && <span>{money(totalGross)}/mo gross</span>}
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
          <UnitsTable units={prop.units} propertyCode={prop.propertyCode} />
        </div>
      )}
    </div>
  );
}

// ─── Alerts Panel ─────────────────────────────────────────────────────────────

function AlertsPanel({ rentroll }: { rentroll: RentRollData }) {
  const [expOpen, setExpOpen] = useState(true);
  const [vacOpen, setVacOpen] = useState(true);

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
                        <tr key={i} style={{ background: days < 0 ? "rgba(220,38,38,0.04)" : "rgba(217,119,6,0.03)" }}>
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
              <div style={{ borderTop: "1px solid var(--border)", padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
                {groupedRows.map(({ label, rows }) => {
                  const groupSqft = rows.reduce((s, r) => s + r.unit.sqft, 0);
                  return (
                    <div key={label} style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>{label}</span>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>{rows.length} unit{rows.length !== 1 ? "s" : ""} · {sqftFmt(groupSqft)} sf</span>
                      </div>
                      <div className="tableWrap" style={{ marginTop: 0 }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Property</th>
                              <th>Unit</th>
                              <th style={{ textAlign: "right" }}>Sq Ft</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(({ propertyCode, unit }, i) => (
                              <tr key={i} style={{ background: "rgba(15,23,42,0.025)" }}>
                                <td style={{ fontSize: 13 }}>
                                  <div style={{ fontWeight: 600 }}>{propName(propertyCode)}</div>
                                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{propertyCode}</div>
                                </td>
                                <td><code style={{ fontSize: 12 }}>{unit.unitRef}</code></td>
                                <td style={{ textAlign: "right", fontSize: 13 }}>{sqftFmt(unit.sqft)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
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

// ─── Multi-line Occupancy Bars ────────────────────────────────────────────────

function OccupancyLines({ rentroll }: { rentroll: RentRollData }) {
  function pctFor(codes: Set<string>): number | null {
    const props = rentroll.properties.filter(p => codes.has(p.propertyCode.toUpperCase()));
    const total    = props.reduce((s, p) => s + p.totalSqft,    0);
    const occupied = props.reduce((s, p) => s + p.occupiedSqft, 0);
    return total > 0 ? (occupied / total) * 100 : null;
  }

  const totalSqft    = rentroll.properties.reduce((s, p) => s + p.totalSqft,    0);
  const totalOccupied = rentroll.properties.reduce((s, p) => s + p.occupiedSqft, 0);
  const totalPct     = totalSqft > 0 ? (totalOccupied / totalSqft) * 100 : null;

  const lines = [
    { label: "% Occupied – Total",            pct: totalPct },
    { label: "% Occupied – JV III LLC",        pct: pctFor(JV_III_CODES) },
    { label: "% Occupied – NI LLC",            pct: pctFor(NI_LLC_CODES) },
    { label: "% Occupied – Shopping Centers",  pct: pctFor(SC_CODES) },
    { label: "% Occupied – Korman Homes",      pct: pctFor(KH_CODES) },
  ].filter((l): l is { label: string; pct: number } => l.pct !== null);

  return (
    <div className="card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      {lines.map(({ label, pct }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", width: 230, flexShrink: 0 }}>{label}</span>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: 999,
              background: pct >= 90 ? "#16a34a" : pct >= 70 ? "#0b4a7d" : "#d97706",
              transition: "width 0.4s ease",
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap", width: 44, textAlign: "right" }}>
            {pct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Portfolio Group ──────────────────────────────────────────────────────────

function PortfolioGroup({ name, props }: { name: string; props: RentRollProperty[] }) {
  if (!props.length) return null;
  const totalSqft    = props.reduce((s, p) => s + p.totalSqft,    0);
  const occupiedSqft = props.reduce((s, p) => s + p.occupiedSqft, 0);
  const vacantSqft   = props.reduce((s, p) => s + p.vacantSqft,   0);
  const gross        = props.reduce((s, p) => s + p.units.reduce((u, unit) => u + unit.grossRentTotal, 0), 0);
  const pct          = totalSqft > 0 ? (occupiedSqft / totalSqft) * 100 : 0;

  return (
    <div>
      {/* Portfolio header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>
          {name} <span style={{ fontWeight: 500 }}>({props.length})</span>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 12, color: "var(--muted)" }}>
          <span>{sqftFmt(totalSqft)} total sf</span>
          <span>{sqftFmt(occupiedSqft)} occupied</span>
          {vacantSqft > 0 && <span>{sqftFmt(vacantSqft)} vacant</span>}
          <span style={{ fontWeight: 700, color: pct >= 90 ? "#16a34a" : pct >= 70 ? "#0b4a7d" : "#d97706" }}>{pct.toFixed(1)}% occ</span>
          {gross > 0 && <span>{money(gross)}/mo gross</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {props.map(p => <PropertyCard key={p.propertyCode} prop={p} />)}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RentRollPage() {
  const [rentroll, setRentroll] = useState<RentRollData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing rent roll on mount
  useEffect(() => {
    fetch("/api/rentroll")
      .then((r) => r.json())
      .then((data) => {
        setRentroll(data.rentroll ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
      setRentroll(data.rentroll);
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

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

  // Portfolio totals
  const totalSqft    = filteredRentroll?.properties.reduce((s, p) => s + p.totalSqft,    0) ?? 0;
  const occupiedSqft = filteredRentroll?.properties.reduce((s, p) => s + p.occupiedSqft, 0) ?? 0;
  const vacantSqft   = filteredRentroll?.properties.reduce((s, p) => s + p.vacantSqft,   0) ?? 0;
  const totalGross   = filteredRentroll?.properties.reduce((s, p) =>
    s + p.units.reduce((u, unit) => u + unit.grossRentTotal, 0), 0) ?? 0;
  const occupancyPct = totalSqft > 0 ? (occupiedSqft / totalSqft) * 100 : 0;

  return (
    <main>
      <h1 style={{ fontSize: 36, letterSpacing: "-0.03em", marginBottom: 24 }}>Rent Roll</h1>

      {/* ── Import card ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <b>Import Rent Roll</b>
          <span style={{ background: "rgba(22, 163, 74, 0.85)", color: "#fff", borderRadius: 999, padding: "12px 18px", fontSize: 15, fontWeight: 700, border: "1px solid transparent", display: "inline-flex", alignItems: "center" }}>Monthly</span>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Import the <b>Commercial Rent Roll</b> Excel file (.xls or .xlsx).
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button className="btn large" onClick={() => fileInputRef.current?.click()} style={{ whiteSpace: "nowrap" }} disabled={uploading}>
            {uploading ? "Uploading…" : "Choose Rent Roll File…"}
          </button>
          <button
            className="btn"
            style={{ borderRadius: 999, fontWeight: 700, whiteSpace: "nowrap" }}
            onClick={() => setRentroll(null)}
            disabled={!rentroll}
          >
            Clear
          </button>
        </div>
        {uploadError && <div style={{ color: "#b42318", fontSize: 13, marginTop: 6 }}>{uploadError}</div>}
        {loading && <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}>Loading…</div>}
        {filteredRentroll && (
          <>
            <div className="pills" style={{ justifyContent: "flex-start", marginTop: 16, marginBottom: 0 }}>
              <StatPill label="Total Sq Ft"    value={sqftFmt(totalSqft)} />
              <StatPill label="Occupied"       value={sqftFmt(occupiedSqft)} />
              <StatPill label="Vacant"         value={sqftFmt(vacantSqft)} />
              <StatPill label="Properties"     value={String(filteredRentroll.properties.length)} />
              {totalGross > 0 && <StatPill label="Gross Rent/mo" value={money(totalGross)} />}
            </div>
            <div className="small muted" style={{ textAlign: "center", marginTop: 6 }}>
              <b>Period:</b> {filteredRentroll.reportFrom} – {filteredRentroll.reportTo}
            </div>
          </>
        )}
      </div>

      {/* ── Dashboard ─────────────────────────────────────────────────────── */}
      {filteredRentroll && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Multi-line occupancy bars */}
          {totalSqft > 0 && <OccupancyLines rentroll={filteredRentroll} />}

          {/* Alerts */}
          <AlertsPanel rentroll={filteredRentroll} />

          {/* Per-property cards grouped by portfolio */}
          {(() => {
            const jvIII  = filteredRentroll.properties.filter(p => JV_III_CODES.has(p.propertyCode.toUpperCase()));
            const niLLC  = filteredRentroll.properties.filter(p => NI_LLC_CODES.has(p.propertyCode.toUpperCase()));
            const sc     = filteredRentroll.properties.filter(p => SC_CODES.has(p.propertyCode.toUpperCase()));
            const kh     = filteredRentroll.properties.filter(p => KH_CODES.has(p.propertyCode.toUpperCase()));
            const allGrouped = new Set([...JV_III_CODES, ...NI_LLC_CODES, ...SC_CODES, ...KH_CODES]);
            const other  = filteredRentroll.properties.filter(p => !allGrouped.has(p.propertyCode.toUpperCase()));
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                <PortfolioGroup name="JV III LLC"         props={jvIII} />
                <PortfolioGroup name="NI LLC"             props={niLLC} />
                <PortfolioGroup name="Shopping Centers"   props={sc} />
                <PortfolioGroup name="Korman Homes"       props={kh} />
                {other.length > 0 && <PortfolioGroup name="Other Properties" props={other} />}
              </div>
            );
          })()}
        </div>
      )}
    </main>
  );
}
