"use client";

// Dashboard callout: what isn't posted to the GL yet across the portfolio —
// a budgeted line reading $0 all year, or debt the Debt Tracker schedules but
// that isn't posted. Reads the shared not-posted scan. Green "all posted" when
// clear; otherwise a compact table (top few, largest first) linking into the
// Statement Review hub. Styled to match the other dashboard status cards.

import { useEffect, useState } from "react";
import Link from "next/link";

type Item = {
  key: string; propertyCode: string; propertyName: string;
  section: string; line: string; type: "not-posted" | "missing-debt";
  expected: number; period: number; monthLabel: string;
};
type Summary = { year: number; asOf: string; items: Item[]; propertiesWithIssues: number };

function money0(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export default function NotPostedCard({ order = -1 }: { order?: number }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    fetch(`/api/financials/operating-statements/not-posted?year=${year}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j))
      .catch(() => setData(null))
      .finally(() => setLoaded(true));
  }, [year]);

  // Loading or scan unavailable — render nothing (don't clutter the dashboard).
  if (!loaded) return null;
  const items = data?.items ?? [];
  const TOP = 6;

  return (
    <div className="card" style={{ order }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          Not Posted to the GL
        </div>
        <Link href="/financials/operating-statements/review" style={{ fontSize: 12, fontWeight: 700, color: "#0b4a7d", textDecoration: "none", whiteSpace: "nowrap" }}>
          Statement Review →
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="small" style={{ display: "flex", alignItems: "center", gap: 8, color: "#15803d", fontWeight: 600 }}>
          <span style={{ fontSize: 15 }}>✅</span> Every budgeted / scheduled line is posted on the latest statements.
        </div>
      ) : (
        <>
          <div className="small" style={{ marginBottom: 10, color: "#9a3412", fontWeight: 600 }}>
            {items.length} line{items.length === 1 ? "" : "s"} across {data!.propertiesWithIssues} propert{data!.propertiesWithIssues === 1 ? "y" : "ies"} — a budgeted or scheduled figure still reads $0.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.slice(0, TOP).map((it) => (
              <Link
                key={`${it.key}::${it.section}::${it.line}`}
                href={`/financials/operating-statements?key=${encodeURIComponent(it.key)}&year=${year}&period=${it.period}`}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, textDecoration: "none", color: "var(--text)", background: "rgba(180,83,9,0.05)" }}
              >
                <span style={{ fontSize: 13 }}>⚠️</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                  <b style={{ fontWeight: 700 }}>{it.propertyCode}</b> · {it.line}
                  {it.type === "missing-debt" && <span className="muted"> (debt)</span>}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#9a3412", whiteSpace: "nowrap" }}>~{money0(it.expected)}</span>
              </Link>
            ))}
          </div>
          {items.length > TOP && (
            <Link href="/financials/operating-statements/review" style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 700, color: "#0b4a7d", textDecoration: "none" }}>
              + {items.length - TOP} more →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
