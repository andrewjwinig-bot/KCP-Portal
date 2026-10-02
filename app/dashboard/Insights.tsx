"use client";

// Dashboard "briefing" — a small set of single-sentence insights driven
// by the loaded rent roll, ownership, and tax-filing data. Persona-aware:
// each user sees the recommendations that match what they actually do.

import Link from "next/link";
import { useMemo } from "react";
import type { RentRollData } from "../../lib/rentroll/parseRentRollExcel";
import { PROPERTY_DEFS } from "../../lib/properties/data";
import { PROPERTY_OWNERSHIP } from "../../lib/properties/ownership";
import { TAX_TASKS, isTaskEffectivelyDone, type TaxTask } from "../tracker/tax-data";

type Insight = {
  /** Headline number / phrase. */
  metric: string;
  /** Body text (one sentence). */
  body: string;
  /** Tone — drives the colored side bar. */
  tone: "neutral" | "good" | "warn" | "alert";
  /** Where to drill in. */
  href: string;
  cta?: string;
};

const OFFICE_CODES = new Set([
  "3610", "3620", "3640",
  "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0",
  "4900",
]);
const RETAIL_CODES = new Set(
  PROPERTY_DEFS.filter((p) => p.type === "Retail").map((p) => p.id.toUpperCase()),
);

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

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function sf(n: number): string {
  return `${Math.round(n).toLocaleString()} sf`;
}

const TONE: Record<Insight["tone"], { bar: string; bg: string }> = {
  neutral: { bar: "#0b4a7d", bg: "rgba(11,74,125,0.04)"  },
  good:    { bar: "#16a34a", bg: "rgba(22,163,74,0.05)"  },
  warn:    { bar: "#d97706", bg: "rgba(217,119,6,0.05)"  },
  alert:   { bar: "#dc2626", bg: "rgba(220,38,38,0.05)"  },
};

export default function Insights({
  rentroll,
  checked,
  personaId,
}: {
  rentroll: RentRollData | null;
  checked: Record<string, boolean>;
  personaId: string;
}) {
  const insights = useMemo(() => buildInsights(rentroll, checked, personaId), [rentroll, checked, personaId]);

  if (insights.length === 0) return null;

  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#0b4a7d",
          background: "rgba(11,74,125,0.08)", border: "1px solid rgba(11,74,125,0.25)",
          padding: "3px 10px", borderRadius: 999,
        }}>Briefing</span>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{insights.length}</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {insights.map((ins, i) => {
          const t = TONE[ins.tone];
          return (
            <Link
              key={i}
              href={ins.href}
              style={{
                display: "flex", flexDirection: "column",
                padding: "12px 14px",
                background: t.bg,
                border: "1px solid var(--border)",
                borderLeft: `4px solid ${t.bar}`,
                borderRadius: 10,
                textDecoration: "none", color: "inherit",
                transition: "transform 0.1s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px rgba(2,6,23,0.08)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "";
                (e.currentTarget as HTMLElement).style.transform = "";
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{ins.metric}</div>
              <div style={{ fontSize: 13, color: "var(--text)", marginTop: 4, lineHeight: 1.35 }}>{ins.body}</div>
              {ins.cta && (
                <div style={{ fontSize: 11, color: t.bar, fontWeight: 700, marginTop: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {ins.cta} →
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function buildInsights(
  rentroll: RentRollData | null,
  checked: Record<string, boolean>,
  personaId: string,
): Insight[] {
  const out: Insight[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const wantsOffice = personaId === "admin" || personaId === "nancy";
  const wantsRetail = personaId === "admin" || personaId === "harry";
  const wantsAll    = personaId === "admin" || personaId === "marie";

  // ── Filings: overdue + due-soon ─────────────────────────────────────────
  if (wantsAll || personaId === "admin") {
    let overdue = 0;
    let dueSoon = 0; // next 14 days
    let oldestOverdue: TaxTask | null = null;
    let oldestOverdueDays = 0;
    for (const t of TAX_TASKS) {
      if (isTaskEffectivelyDone(t, checked)) continue;
      const due = new Date(today.getFullYear(), t.dueMonth - 1, t.dueDay);
      const days = daysUntil(due);
      if (days < 0) {
        overdue += 1;
        if (-days > oldestOverdueDays) { oldestOverdueDays = -days; oldestOverdue = t; }
      } else if (days <= 14) {
        dueSoon += 1;
      }
    }
    if (overdue > 0) {
      out.push({
        metric: `${overdue} overdue`,
        body: oldestOverdue
          ? `Oldest is ${oldestOverdue.entity} (${oldestOverdueDays} day${oldestOverdueDays === 1 ? "" : "s"} late). File these first.`
          : `Tax / entity filings have passed their due date.`,
        tone: "alert",
        href: "/tracker/taxes",
        cta: "Open Filing Tracker",
      });
    }
    if (dueSoon > 0) {
      out.push({
        metric: `${dueSoon} due ≤ 14 days`,
        body: `Filings coming up. Knock them out before they slip.`,
        tone: "warn",
        href: "/tracker/taxes",
        cta: "Open Filing Tracker",
      });
    }
  }

  // ── Rent roll based insights ────────────────────────────────────────────
  if (rentroll) {
    const props = rentroll.properties;

    function relevantProps(scope: "office" | "retail" | "all") {
      return props.filter((p) => {
        const code = p.propertyCode.toUpperCase();
        if (scope === "office") return OFFICE_CODES.has(code);
        if (scope === "retail") return RETAIL_CODES.has(code);
        return true;
      });
    }

    function expirationsAhead(scope: "office" | "retail" | "all", windowDays: number) {
      const set = relevantProps(scope);
      const rows: { propertyCode: string; sqft: number; annualGross: number; daysLeft: number; tenant: string }[] = [];
      for (const p of set) {
        for (const u of p.units) {
          if (u.isVacant) continue;
          const d = parseRentDate(u.leaseTo);
          if (!d) continue;
          const days = daysUntil(d);
          if (days >= 0 && days <= windowDays) {
            rows.push({
              propertyCode: p.propertyCode,
              sqft: u.sqft,
              annualGross: u.grossRentTotal * 12,
              daysLeft: days,
              tenant: u.occupantName,
            });
          }
        }
      }
      return rows;
    }

    function totalSqft(scope: "office" | "retail" | "all") {
      return relevantProps(scope).reduce((s, p) => s + p.totalSqft, 0);
    }

    // Office insights for Nancy / admin
    if (wantsOffice) {
      const next12 = expirationsAhead("office", 365);
      const totalRiskRent = next12.reduce((s, r) => s + r.annualGross, 0);
      const totalRiskSf = next12.reduce((s, r) => s + r.sqft, 0);
      const denom = totalSqft("office");
      if (totalRiskRent > 0) {
        out.push({
          metric: money(totalRiskRent),
          body: `Annualized gross rent on office leases expiring in the next 12 months — ${denom > 0 ? pct(totalRiskSf / denom) : "?"} of office SF.`,
          tone: "warn",
          href: "/dashboard",
          cta: "See expiration chart",
        });
      }
      const next90 = next12.filter((r) => r.daysLeft <= 90);
      if (next90.length > 0) {
        const top = [...next90].sort((a, b) => b.annualGross - a.annualGross)[0];
        out.push({
          metric: `${next90.length} lease${next90.length === 1 ? "" : "s"} ≤ 90 days`,
          body: `Largest: ${top.tenant} at ${top.propertyCode} (${money(top.annualGross)}/yr, ${sf(top.sqft)}). Start renewal outreach.`,
          tone: "alert",
          href: "/rentroll",
          cta: "Open Rent Roll",
        });
      }
    }

    // Retail for Harry / admin
    if (wantsRetail) {
      const next180 = expirationsAhead("retail", 180);
      if (next180.length > 0) {
        const total = next180.reduce((s, r) => s + r.annualGross, 0);
        out.push({
          metric: `${next180.length} retail lease${next180.length === 1 ? "" : "s"}`,
          body: `Expiring in the next 6 months — ${money(total)}/yr in gross rent at risk.`,
          tone: "warn",
          href: "/rentroll",
          cta: "Open Rent Roll",
        });
      }
    }

    // Vacancy insight (everyone office-aware)
    if (wantsOffice || personaId === "admin") {
      const officeProps = relevantProps("office");
      const vacancySf = officeProps.reduce((s, p) => s + p.vacantSqft, 0);
      const totalOfficeSf = officeProps.reduce((s, p) => s + p.totalSqft, 0);
      if (totalOfficeSf > 0 && vacancySf > 0) {
        const tone: Insight["tone"] = vacancySf / totalOfficeSf > 0.15 ? "warn" : "neutral";
        out.push({
          metric: pct(vacancySf / totalOfficeSf),
          body: `Office portfolio vacancy — ${sf(vacancySf)} across ${officeProps.length} buildings.`,
          tone,
          href: "/rentroll",
        });
      }
    }
  } else if (personaId === "admin") {
    out.push({
      metric: "No rent roll",
      body: "Upload the latest rent roll so dashboard insights can populate.",
      tone: "warn",
      href: "/rentroll",
      cta: "Upload",
    });
  }

  // ── Ownership coverage (admin only) ─────────────────────────────────────
  if (personaId === "admin") {
    const total = PROPERTY_DEFS.filter((p) => !p.entityKind).length;
    const covered = PROPERTY_OWNERSHIP.filter((p) => p.owners.some((o) => (o.profitPct ?? o.ownerPct ?? 0) > 0)).length;
    const missing = total - covered;
    if (missing > 0) {
      const tone: Insight["tone"] = missing / total > 0.5 ? "warn" : "neutral";
      out.push({
        metric: `${missing} missing`,
        body: `${covered}/${total} properties have ownership data. Backfill the rest in lib/properties/ownership.ts.`,
        tone,
        href: "/investors",
        cta: "Open Investor Info",
      });
    }
  }

  return out;
}
