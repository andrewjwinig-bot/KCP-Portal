"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Compact "jump to this tenant's CAM statement" links shown in the header of
// the CAM config cards on the unit page. Each available reconciliation year for
// the tenant's property becomes a chip that deep-links to the CAM / RET
// Reconciliation page pre-opened on THIS tenant's statement for that year
// (?property&year&unit). Years come from the same availability endpoint the
// recon page uses, so the list always matches what actually reconciles.

export default function CamStatementHistory({
  unitRef,
  propertyCode,
  kind,
}: {
  unitRef: string;
  propertyCode: string;
  kind: "office" | "retail";
}) {
  const [years, setYears] = useState<number[] | null>(null);

  useEffect(() => {
    const endpoint = kind === "retail" ? "/api/cam-recon/retail" : "/api/cam-recon/office";
    let alive = true;
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const avail = (j?.available ?? []).find(
          (a: { propertyCode: string; years?: number[] }) => a.propertyCode === propertyCode,
        );
        setYears(Array.isArray(avail?.years) ? avail.years : []);
      })
      .catch(() => alive && setYears([]));
    return () => {
      alive = false;
    };
  }, [propertyCode, kind]);

  // Loading or nothing to link — render nothing so the header stays clean.
  if (!years || years.length === 0) return null;

  const sorted = [...years].sort((a, b) => b - a);
  const from = `/units/${encodeURIComponent(unitRef)}`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--muted)",
        }}
      >
        Statements
      </span>
      {sorted.map((y) => (
        <Link
          key={y}
          href={`/cam-recon?property=${encodeURIComponent(propertyCode)}&year=${y}&unit=${encodeURIComponent(unitRef)}&from=${encodeURIComponent(from)}`}
          title={`View this tenant's ${y} CAM / RET statement`}
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid rgba(11,74,125,0.3)",
            background: "rgba(11,74,125,0.06)",
            color: "#0b4a7d",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {y} →
        </Link>
      ))}
    </div>
  );
}
