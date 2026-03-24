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
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m[1]) - 1]} ${Number(m[2])}, ${m[3]}`;
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      padding: "14px 20px",
      borderRadius: 12,
      border: "1px solid var(--border)",
      background: "#fff",
      display: "flex",
      flexDirection: "column",
      gap: 2,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>}
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
              <th style={{ textAlign: "right" }}>Base Rent/mo</th>
              <th style={{ textAlign: "right" }}>Annual $/sf</th>
              <th style={{ textAlign: "right" }}>CAM/mo</th>
              <th style={{ textAlign: "right" }}>RE Tax/mo</th>
              <th style={{ textAlign: "right" }}>Other/mo</th>
              <th style={{ textAlign: "right" }}>Gross/mo</th>
              <th>Next Escalation</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((unit, i) => {
              const status  = leaseStatus(unit.leaseTo);
              const nextEsc = nextEscalation(unit);
              const escDays = nextEsc ? daysUntil(parseRentDate(nextEsc.date)!) : null;
              const rowBg   = unit.isVacant
                ? "rgba(15,23,42,0.025)"
                : status.days !== null && status.days <= 90
                  ? status.days < 0
                    ? "rgba(220,38,38,0.04)"
                    : "rgba(217,119,6,0.04)"
                  : undefined;

              return (
                <tr key={i} style={{ background: rowBg }}>
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
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{formatDate(unit.leaseTo)}</span>
                        {!unit.isVacant && (
                          <AlertBadge
                            label={status.label}
                            color={status.color}
                            bg={status.bg}
                            border={status.border}
                          />
                        )}
                      </div>
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
                  <td style={{ fontSize: 13 }}>
                    {nextEsc ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>{money(nextEsc.amount)}/mo</span>
                        <span style={{
                          fontSize: 11,
                          color: escDays !== null && escDays <= 90 ? "#d97706" : "var(--muted)",
                          fontWeight: escDays !== null && escDays <= 90 ? 700 : 400,
                        }}>
                          {formatDate(nextEsc.date)}
                          {escDays !== null && escDays <= 90 && ` · ${escDays}d`}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
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
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{name}</span>
                <code style={{ fontSize: 12, color: "var(--muted)" }}>{prop.propertyCode}</code>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                {sqftFmt(prop.occupiedSqft)} / {sqftFmt(prop.totalSqft)} sq ft occupied
                {" · "}
                {occupancyPct.toFixed(0)}% occupied
                {totalGross > 0 && ` · ${money(totalGross)}/mo gross`}
              </div>
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
              {prop.vacantSqft > 0 && (
                <AlertBadge
                  label={`${sqftFmt(prop.vacantSqft)} sf vacant`}
                  color="var(--muted)"
                  bg="rgba(15,23,42,0.04)"
                  border="var(--border)"
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
            <div style={{ marginTop: 16, marginBottom: 16 }}>
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  type AlertRow = {
    propertyCode: string;
    unit: RentRollUnit;
    days: number;
  };

  const expirations: AlertRow[] = [];
  const escalations: AlertRow[] = [];

  for (const prop of rentroll.properties) {
    for (const unit of prop.units) {
      if (!unit.isVacant && unit.leaseTo) {
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

  if (!expirations.length && !escalations.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {expirations.length > 0 && (
        <div className="card">
          <SectionLabel>
            {expirations.some((e) => e.days < 0)
              ? "Expired / Expiring within 90 Days"
              : "Expiring within 90 Days"}
          </SectionLabel>
          <div className="tableWrap" style={{ marginTop: 0 }}>
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

  // Portfolio totals
  const totalSqft    = rentroll?.properties.reduce((s, p) => s + p.totalSqft,    0) ?? 0;
  const occupiedSqft = rentroll?.properties.reduce((s, p) => s + p.occupiedSqft, 0) ?? 0;
  const vacantSqft   = rentroll?.properties.reduce((s, p) => s + p.vacantSqft,   0) ?? 0;
  const totalGross   = rentroll?.properties.reduce((s, p) =>
    s + p.units.reduce((u, unit) => u + unit.grossRentTotal, 0), 0) ?? 0;
  const occupancyPct = totalSqft > 0 ? (occupiedSqft / totalSqft) * 100 : 0;

  return (
    <main>
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 36, letterSpacing: "-0.03em", marginBottom: 4 }}>Rent Roll</h1>
          {rentroll && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Report period: {rentroll.reportFrom} – {rentroll.reportTo}
              {" · "}
              Uploaded {new Date(rentroll.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <button
            className="btn primary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Uploading…" : rentroll ? "Replace Rent Roll" : "Upload Rent Roll"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          {uploadError && (
            <div style={{ fontSize: 13, color: "#dc2626", maxWidth: 320, textAlign: "right" }}>{uploadError}</div>
          )}
        </div>
      </div>

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ color: "var(--muted)", fontSize: 15, padding: "40px 0" }}>Loading…</div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!loading && !rentroll && (
        <div className="card" style={{ textAlign: "center", padding: "60px 40px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No Rent Roll Uploaded</div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20, maxWidth: 440, margin: "0 auto 20px" }}>
            Upload the monthly Excel rent roll to view occupancy data, lease expirations, and scheduled escalations across all properties.
          </div>
          <button
            className="btn primary large"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Rent Roll
          </button>
        </div>
      )}

      {/* ── Dashboard ─────────────────────────────────────────────────────── */}
      {rentroll && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Portfolio summary */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatPill label="Total Sq Ft"     value={sqftFmt(totalSqft)} />
            <StatPill
              label="Occupied"
              value={sqftFmt(occupiedSqft)}
              sub={`${occupancyPct.toFixed(1)}% occupancy`}
            />
            <StatPill label="Vacant"          value={sqftFmt(vacantSqft)} />
            <StatPill label="Properties"      value={String(rentroll.properties.length)} />
            {totalGross > 0 && (
              <StatPill label="Gross Rent/mo"  value={money(totalGross)} />
            )}
          </div>

          {/* Occupancy bar */}
          {totalSqft > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 8, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${occupancyPct}%`,
                  borderRadius: 999,
                  background: occupancyPct >= 90 ? "#16a34a" : occupancyPct >= 70 ? "#0b4a7d" : "#d97706",
                  transition: "width 0.4s ease",
                }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap" }}>
                {occupancyPct.toFixed(1)}% occupied
              </span>
            </div>
          )}

          {/* Alerts */}
          <AlertsPanel rentroll={rentroll} />

          {/* Per-property cards */}
          <div>
            <SectionLabel>Properties ({rentroll.properties.length})</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {rentroll.properties.map((prop) => (
                <PropertyCard key={prop.propertyCode} prop={prop} />
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
