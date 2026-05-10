"use client";

import { useEffect, useState } from "react";
import type { RentRollData } from "../../../lib/rentroll/parseRentRollExcel";
import LeasingActivityCard from "../LeasingActivityCard";

export default function LeasingActivityPage() {
  const [rentroll, setRentroll] = useState<RentRollData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rentroll")
      .then((r) => r.json())
      .then((j) => setRentroll(j.rentroll ?? null))
      .catch(() => setRentroll(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h1 style={{ margin: 0 }}>Leasing Activity</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </header>

      {loading ? (
        <div className="card"><div className="muted small">Loading rent roll…</div></div>
      ) : (
        <LeasingActivityCard rentroll={rentroll} />
      )}
    </main>
  );
}
