"use client";

// The month-end close at a glance (owner, 11/2026): what is still open for
// last month, each line saying what is left. The full checklist and the
// sign-off are on /close. Flags to Investigate is counted there, not here —
// its sweep is too slow for the dashboard.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Circle, CircleCheck } from "lucide-react";
import type { MonthClose } from "@/lib/close/monthClose";

export default function MonthCloseCard({ close }: { close?: MonthClose | null } = {}) {
  const [own, setData] = useState<MonthClose | null>(null);
  const [failed, setFailed] = useState(false);
  const data = close !== undefined ? close : own;
  useEffect(() => {
    if (close !== undefined) return;
    fetch("/api/close", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, [close]);
  if (failed) return null;
  const items = data?.sections.flatMap((s) => s.items) ?? [];
  const openItems = items.filter((i) => !i.done);
  const monthName = data?.label.split(" ")[0] ?? "";

  return (
    <div className="card" style={{ order: -1, display: "grid", gap: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          {data ? `${monthName} Close` : "Month-End Close"}
        </span>
        {data && (
          <span style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: data.signedOff ? "var(--c-067647)" : openItems.length ? "var(--c-b54708)" : "var(--c-067647)" }}>
            {data.signedOff ? "Signed off" : openItems.length ? `${openItems.length} to go` : "Ready to sign off"}
          </span>
        )}
      </div>
      {!data && <span style={{ color: "var(--muted)", fontSize: "var(--fs-13)", padding: "8px 2px" }}>Checking…</span>}
      {items.map((it) => (
        <Link key={it.id} href={it.link} className="task-row"
          style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "9px 2px", borderBottom: "1px solid var(--hairline)", color: "inherit", textDecoration: "none" }}>
          {it.done
            ? <CircleCheck size={20} strokeWidth={1.75} color="var(--c-067647)" aria-label="Done" />
            : <Circle size={20} strokeWidth={1.75} color="var(--c-98a2b3)" aria-label="Open" />}
          <span style={{ fontWeight: 600, fontSize: "var(--fs-14)" }}>{it.label}</span>
          <span style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: it.done ? "var(--c-067647)" : "var(--c-b54708)", textAlign: "right" }}>{it.status}</span>
        </Link>
      ))}
      {data && (
        <Link href="/close" className="text-link" style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--fs-14)" }}>
          Open the close checklist <ChevronRight size={16} strokeWidth={1.75} />
        </Link>
      )}
    </div>
  );
}
