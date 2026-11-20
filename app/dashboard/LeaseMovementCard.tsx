"use client";

// The Monthly Review's Vacating & Expiring section, on its own, for the
// leasing dashboards (owner: "important for Nancy to see the office tenants on
// her dashboard and harry to see all tenants on his dashboard"). Same table,
// same rules — read from /api/leasing/movement, which carries no financials.

import { useEffect, useState } from "react";
import { LeaseMovement } from "@/app/reports/monthly/MonthlyReviewPanel";

type Movement = Parameters<typeof LeaseMovement>[0]["report"] & { year: number };

export default function LeaseMovementCard({ scope }: { scope: "office" | "retail" | "all" }) {
  const [data, setData] = useState<Movement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/leasing/movement?scope=${scope}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, [scope]);
  if (failed) return null;
  if (!data) return <div className="card muted" style={{ gridColumn: "1 / -1" }}>Reading the rent roll…</div>;
  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <LeaseMovement report={data} reconYear={data.year} scopeLabel={scope === "office" ? "Office" : scope === "retail" ? "Retail" : "All tenants"} />
    </div>
  );
}
