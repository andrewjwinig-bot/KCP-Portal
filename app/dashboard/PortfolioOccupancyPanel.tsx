"use client";

// Full-width portfolio occupancy panel: a bold headline rate, a thick
// occupied-vs-vacant bar, and a vertical bar chart underneath. Supports
// one or more scope toggles — "All" rolls up by category, the others
// break down per property.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RentRollData } from "../../lib/rentroll/parseRentRollExcel";
import { PROPERTY_DEFS } from "../../lib/properties/data";

export type OccupancyScope = "category" | "office" | "jv3" | "ni" | "retail" | "residential";

const OFFICE_CODES = new Set(["3610", "3620", "3640", "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
const JV_III_CODES = new Set(["3610", "3620", "3640"]);
const NI_LLC_CODES = new Set(["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
const RETAIL_CODES = new Set(["1100", "1500", "2300", "4500", "5600", "7010", "7200", "7300", "8200", "9200", "9510"]);
const RESIDENTIAL_CODES = new Set(["9800", "9820", "9840", "9860"]);
const OW_CODES = new Set(["4900"]);

const SCOPE_LABEL: Record<OccupancyScope, string> = {
  category: "All",
  office: "Office",
  jv3: "JV III",
  ni: "NI LLC",
  retail: "Retail",
  residential: "Residential",
};

type Bar = { key: string; label: string; fullName: string; occupied: number; vacant: number; total: number };

function occColor(pct: number): string {
  return pct >= 90 ? "#16a34a" : pct >= 70 ? "#0b4a7d" : "#d97706";
}
function sqftFmt(n: number): string {
  return n.toLocaleString();
}
function kSqft(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}
function propName(code: string): string {
  const d = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
  return d?.name ?? code;
}

export default function PortfolioOccupancyPanel({
  rentroll,
  scopes,
  order = 0,
}: {
  rentroll: RentRollData | null;
  scopes: OccupancyScope[];
  order?: number;
}) {
  const [scope, setScope] = useState<OccupancyScope>(scopes[0]);
  const BAR_H = 104;

  const bars: Bar[] = useMemo(() => {
    if (!rentroll) return [];
    const propsByCodes = (codes: Set<string>) =>
      rentroll.properties.filter((p) => codes.has(p.propertyCode.toUpperCase()));

    if (scope === "category") {
      const cat = (label: string, codes: Set<string>): Bar => {
        const ps = propsByCodes(codes);
        const occupied = ps.reduce((s, p) => s + p.occupiedSqft, 0);
        const vacant = ps.reduce((s, p) => s + p.vacantSqft, 0);
        return { key: label, label, fullName: label, occupied, vacant, total: occupied + vacant };
      };
      return [
        cat("Office", OFFICE_CODES),
        cat("Retail", RETAIL_CODES),
        cat("Residential", RESIDENTIAL_CODES),
        cat("Office Works", OW_CODES),
      ].filter((b) => b.total > 0);
    }

    const codes =
      scope === "office" ? OFFICE_CODES
      : scope === "jv3" ? JV_III_CODES
      : scope === "ni" ? NI_LLC_CODES
      : scope === "retail" ? RETAIL_CODES
      : RESIDENTIAL_CODES;
    return rentroll.properties
      .filter((p) => codes.has(p.propertyCode.toUpperCase()) && p.totalSqft > 0)
      .map((p) => ({
        key: p.propertyCode,
        label: p.propertyCode,
        fullName: `${p.propertyCode} ${propName(p.propertyCode)}`,
        occupied: p.occupiedSqft,
        vacant: p.vacantSqft,
        total: p.totalSqft,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [rentroll, scope]);

  const totalOcc = bars.reduce((s, b) => s + b.occupied, 0);
  const totalSf = bars.reduce((s, b) => s + b.total, 0);
  const totalVac = totalSf - totalOcc;
  const pct = totalSf > 0 ? (totalOcc / totalSf) * 100 : 0;

  return (
    <div className="card" style={{ gridColumn: "1 / -1", order }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          Portfolio Occupancy
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {scopes.length > 1 && scopes.map((s) => {
            const active = s === scope;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                style={{
                  padding: "5px 12px", borderRadius: 999, fontSize: 12,
                  fontWeight: active ? 700 : 500, cursor: "pointer",
                  border: `1.5px solid ${active ? "#0b4a7d" : "var(--border)"}`,
                  background: active ? "rgba(11,74,125,0.10)" : "transparent",
                  color: active ? "#0b4a7d" : "var(--muted)",
                  fontFamily: "inherit", transition: "all 0.15s ease",
                }}
              >
                {SCOPE_LABEL[s]}
              </button>
            );
          })}
          <Link href="/rentroll" style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", textDecoration: "none" }}>
            Rent roll →
          </Link>
        </div>
      </div>

      {!rentroll ? (
        <div className="muted small">Loading…</div>
      ) : bars.length === 0 ? (
        <div className="muted small">No rent roll data.</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, color: occColor(pct) }}>{pct.toFixed(1)}%</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginTop: 5 }}>
                Occupied
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(15,23,42,0.12)" }}>
                <div style={{ width: `${pct}%`, background: occColor(pct) }} />
                <div style={{ flex: 1, background: "rgba(15,23,42,0.07)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginTop: 7 }}>
                <span><b style={{ color: "var(--text)" }}>{sqftFmt(totalOcc)}</b> occupied</span>
                <span><b style={{ color: "var(--text)" }}>{sqftFmt(totalVac)}</b> vacant</span>
                <span><b style={{ color: "var(--text)" }}>{sqftFmt(totalSf)}</b> total sf</span>
              </div>
            </div>
          </div>

          <div style={{
            marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)",
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))", gap: 12,
          }}>
            {bars.map((b) => {
              const bpct = b.total > 0 ? (b.occupied / b.total) * 100 : 0;
              const color = occColor(bpct);
              return (
                <div
                  key={b.key}
                  title={`${b.fullName} — ${sqftFmt(b.occupied)} / ${sqftFmt(b.total)} sf · ${sqftFmt(b.vacant)} vacant`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, color }}>{bpct.toFixed(1)}%</span>
                  <div style={{
                    width: 38, height: BAR_H, borderRadius: "5px 5px 0 0",
                    border: "1px solid rgba(15,23,42,0.12)", background: "rgba(15,23,42,0.05)",
                    display: "flex", flexDirection: "column-reverse", overflow: "hidden",
                  }}>
                    <div style={{ height: (bpct / 100) * BAR_H, background: color }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text)", textAlign: "center", lineHeight: 1.2 }}>
                    {b.label}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {kSqft(b.occupied)}/{kSqft(b.total)} sf
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
