"use client";

// Stacked bar chart showing upcoming office-lease expirations,
// switchable between % of Office SF and annualized Gross Rent, and
// between a 24-month and 5-year horizon. Office-only (JV III + NI LLC
// + The Office Works). Each bar is stacked / colored by building.

import { useMemo, useState } from "react";
import type { RentRollData } from "../../lib/rentroll/parseRentRollExcel";

// Office buildings (matches lib/users.ts OFFICE_AND_OW_INDIVIDUAL).
const OFFICE_CODES = new Set([
  "3610", "3620", "3640",
  "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0",
  "4900",
]);

// Stable color per building (mix of the Office + OW palette so codes
// from each fund visually separate).
const BUILDING_COLOR: Record<string, string> = {
  "3610": "#0b4a7d",
  "3620": "#1d6fa5",
  "3640": "#3b82f6",
  "4050": "#14b8a6",
  "4060": "#0d9488",
  "4070": "#0f766e",
  "4080": "#059669",
  "40A0": "#84cc16",
  "40B0": "#a3e635",
  "40C0": "#65a30d",
  "4900": "#7c3aed",
};

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Horizon = "24m" | "5y";
type Metric = "pct" | "rent";

type Period = { key: string; label: string; start: Date; end: Date };

function buildPeriods(horizon: Horizon, anchor: Date): Period[] {
  if (horizon === "24m") {
    const out: Period[] = [];
    for (let i = 0; i < 24; i++) {
      const start = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + i + 1, 0);
      end.setHours(23, 59, 59);
      out.push({
        key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
        label: `${MONTHS_SHORT[start.getMonth()]} '${String(start.getFullYear()).slice(-2)}`,
        start,
        end,
      });
    }
    return out;
  }
  // 5y: current year + next 4
  const out: Period[] = [];
  for (let i = 0; i < 5; i++) {
    const year = anchor.getFullYear() + i;
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);
    out.push({ key: String(year), label: String(year), start, end });
  }
  return out;
}

function parseRentDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function ExpirationChart({ rentroll }: { rentroll: RentRollData | null }) {
  const [horizon, setHorizon] = useState<Horizon>("24m");
  const [metric, setMetric] = useState<Metric>("pct");

  const { periods, perPeriod, totalOfficeSqft, buildings, grandTotal } = useMemo(() => {
    const today = new Date();
    today.setDate(1);
    today.setHours(0, 0, 0, 0);
    const periods = buildPeriods(horizon, today);

    const officeProps = (rentroll?.properties ?? []).filter((p) =>
      OFFICE_CODES.has(p.propertyCode.toUpperCase()),
    );
    const totalOfficeSqft = officeProps.reduce((s, p) => s + p.totalSqft, 0);

    // periodKey → propertyCode → { sqft, annualGross }
    const perPeriod = new Map<string, Map<string, { sqft: number; annualGross: number }>>();
    const buildings = new Set<string>();
    let grandTotal = { sqft: 0, annualGross: 0 };

    for (const p of officeProps) {
      const code = p.propertyCode.toUpperCase();
      for (const u of p.units) {
        if (u.isVacant) continue;
        const lt = parseRentDate(u.leaseTo);
        if (!lt) continue;
        const period = periods.find((pp) => lt >= pp.start && lt <= pp.end);
        if (!period) continue;
        let byProp = perPeriod.get(period.key);
        if (!byProp) { byProp = new Map(); perPeriod.set(period.key, byProp); }
        let bucket = byProp.get(code);
        if (!bucket) { bucket = { sqft: 0, annualGross: 0 }; byProp.set(code, bucket); }
        bucket.sqft += u.sqft;
        bucket.annualGross += u.grossRentTotal * 12;
        buildings.add(code);
        grandTotal.sqft += u.sqft;
        grandTotal.annualGross += u.grossRentTotal * 12;
      }
    }

    return { periods, perPeriod, totalOfficeSqft, buildings: [...buildings].sort(), grandTotal };
  }, [rentroll, horizon]);

  // Determine max bar value (in raw units of the chosen metric) to scale Y.
  const maxPeriodValue = useMemo(() => {
    let max = 0;
    for (const p of periods) {
      const byProp = perPeriod.get(p.key);
      if (!byProp) continue;
      let total = 0;
      for (const v of byProp.values()) total += metric === "pct" ? v.sqft : v.annualGross;
      if (total > max) max = total;
    }
    return max;
  }, [perPeriod, periods, metric]);

  // For % metric the denominator is totalOfficeSqft; bar heights are the
  // fraction of total office SF expiring in that period. For $ metric we
  // scale to the largest period so the chart fills nicely.
  const chartMax = metric === "pct"
    ? Math.max(maxPeriodValue / Math.max(1, totalOfficeSqft), 0.05)  // floor 5%
    : Math.max(maxPeriodValue, 1);

  function valueFor(periodKey: string, code: string): number {
    const v = perPeriod.get(periodKey)?.get(code);
    if (!v) return 0;
    return metric === "pct" ? v.sqft / Math.max(1, totalOfficeSqft) : v.annualGross;
  }

  function periodTotal(periodKey: string): number {
    const byProp = perPeriod.get(periodKey);
    if (!byProp) return 0;
    let total = 0;
    for (const v of byProp.values()) total += metric === "pct" ? v.sqft / Math.max(1, totalOfficeSqft) : v.annualGross;
    return total;
  }

  function fmt(v: number): string {
    return metric === "pct" ? pct(v) : money(v);
  }

  const barCount = periods.length;
  const chartHeight = 220;

  if (!rentroll) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Office Lease Expirations</div>
        <div className="muted small">No rent roll loaded.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Office Lease Expirations</div>
          <div className="muted small" style={{ marginTop: 2 }}>
            Stacked by building · {metric === "pct" ? "% of Office SF expiring" : "Annualized Gross Rent expiring"} · {horizon === "24m" ? "next 24 months" : "next 5 calendar years"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <SegToggle
            value={metric}
            onChange={(v) => setMetric(v as Metric)}
            options={[
              { value: "pct", label: "% SF" },
              { value: "rent", label: "$ Gross Rent" },
            ]}
          />
          <SegToggle
            value={horizon}
            onChange={(v) => setHorizon(v as Horizon)}
            options={[
              { value: "24m", label: "24 mo" },
              { value: "5y", label: "Calendar yrs" },
            ]}
          />
        </div>
      </div>

      {grandTotal.sqft === 0 ? (
        <div className="muted small" style={{ padding: "20px 0", textAlign: "center" }}>
          No office leases expire in the selected window.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: chartHeight + 26, paddingBottom: 26, position: "relative" }}>
            {periods.map((p) => {
              const total = periodTotal(p.key);
              const barH = chartMax > 0 ? (total / chartMax) * chartHeight : 0;
              return (
                <div key={p.key} title={`${p.label}: ${fmt(total)}`}
                  style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: chartHeight, position: "relative" }}>
                  <div style={{ display: "flex", flexDirection: "column-reverse", width: "70%", maxWidth: 28, height: barH, borderRadius: "3px 3px 0 0", overflow: "hidden", border: barH > 0 ? "1px solid rgba(15,23,42,0.12)" : "none" }}>
                    {buildings.map((code) => {
                      const v = valueFor(p.key, code);
                      if (v === 0) return null;
                      const segH = chartMax > 0 ? (v / chartMax) * chartHeight : 0;
                      return (
                        <div key={code} style={{
                          height: segH,
                          background: BUILDING_COLOR[code] ?? "#94a3b8",
                        }} />
                      );
                    })}
                  </div>
                  {total > 0 && (
                    <div style={{
                      position: "absolute",
                      bottom: barH + 2,
                      fontSize: 9, fontWeight: 700, color: "var(--text)",
                      whiteSpace: "nowrap",
                    }}>{fmt(total)}</div>
                  )}
                  <div style={{
                    position: "absolute", bottom: -22,
                    fontSize: 9, color: "var(--muted)",
                    whiteSpace: "nowrap",
                    transform: barCount > 12 ? "rotate(-45deg)" : "none",
                    transformOrigin: "center",
                    width: barCount > 12 ? 50 : "auto",
                    textAlign: "center",
                  }}>{p.label}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            {buildings.map((code) => (
              <div key={code} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ width: 12, height: 12, background: BUILDING_COLOR[code] ?? "#94a3b8", borderRadius: 3 }} />
                <span style={{ fontWeight: 600 }}>{code}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            Total expiring in window: <b style={{ color: "var(--text)" }}>{(grandTotal.sqft).toLocaleString()} sf</b> · <b style={{ color: "var(--text)" }}>{money(grandTotal.annualGross)} gross rent / yr</b>
            {totalOfficeSqft > 0 && (
              <>{" "}· <b style={{ color: "var(--text)" }}>{pct(grandTotal.sqft / totalOfficeSqft)}</b> of office portfolio</>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SegToggle({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div role="tablist" style={{
      display: "inline-flex", border: "1px solid var(--border)", borderRadius: 999,
      overflow: "hidden", background: "var(--card)",
    }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            role="tab"
            aria-selected={active}
            style={{
              padding: "4px 11px", fontSize: 11, fontWeight: 700,
              background: active ? "var(--brand)" : "transparent",
              color: active ? "#fff" : "var(--text)",
              border: "none", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
