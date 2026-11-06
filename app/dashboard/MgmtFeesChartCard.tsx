"use client";

// Alison's dashboard: the Management Fees report's "Actual vs Budget — by
// month" chart (the SAME component), with the intercompany tie-out as one
// line beneath it — the one thing on that report someone has to act on.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LineChart, ChartLegend, feeChartSeries, kFmt } from "@/app/financials/management-fees/FeeChart";
import type { MgmtFeeData } from "@/lib/financials/management-fees/compute";

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const money = (n: number) => "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

export default function MgmtFeesChartCard({ order = 0 }: { order?: number }) {
  const year = new Date().getFullYear();
  const [data, setData] = useState<MgmtFeeData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/financials/management-fees?year=${year}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setData(j))
      .catch(() => setFailed(true));
  }, [year]);
  const series = useMemo(() => feeChartSeries(data), [data]);
  const tie = data?.intercompany ?? null;
  const tieOk = tie ? tie.clean && (data?.flags?.length ?? 0) === 0 && tie.missingGl.length === 0 : null;

  return (
    <div className="card" style={{ gridColumn: "1 / -1", order }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          Management Fees · Actual vs Budget — by month
        </div>
        <Link href="/financials/management-fees" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>
          Full report →
        </Link>
      </div>
      {!data && !failed && <div className="muted small">Loading…</div>}
      {failed && <div className="muted small">Management fees couldn&rsquo;t load.</div>}
      {data && (
        <>
          <LineChart series={series} fmt={kFmt} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <ChartLegend series={series} />
            {tie && tie.through > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: tieOk ? "#15803d" : "#b45309" }}>
                {tieOk
                  ? `Intercompany ties through ${MONTHS_LONG[tie.through - 1]}`
                  : `Intercompany doesn’t tie — ${money(tie.varianceYtd)} ${tie.varianceYtd > 0 ? "over" : "under"} through ${MONTHS_LONG[tie.through - 1]}`}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
