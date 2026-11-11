"use client";
// Dashboard prompt — a seasonal tenant email (Winter Tips, Summer Tips) is due
// (owner, 11/2026: "add to the calendar timing to send all these … so it
// prompts him when to send them"). Shown from each email's reminder date until
// it has been sent that season; hidden otherwise. The timing lives on the
// template (`schedule` in lib/communications/templates.ts).

import { useEffect, useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";

type Due = { id: string; name: string; dueISO: string; overdue: boolean };
const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });

export default function TenantEmailsDueCard({ order = -1 }: { order?: number }) {
  const [due, setDue] = useState<Due[]>([]);
  useEffect(() => {
    fetch("/api/communications?due=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDue(j?.due ?? []))
      .catch(() => setDue([]));
  }, []);
  if (!due.length) return null;
  return (
    <div className="card" style={{ order }}>
      <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 6 }}>
        Tenant Emails to Send
      </div>
      {due.map((d) => (
        <div key={d.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 2px", borderBottom: "1px solid var(--hairline)" }}>
          <TriangleAlert size={20} strokeWidth={1.75} color="var(--c-b54708)" />
          <span style={{ fontWeight: 600, fontSize: "var(--fs-15)" }}>{d.name}</span>
          <span className="muted" style={{ fontSize: "var(--fs-13)" }}>{d.overdue ? "Was due" : "Send by"} {fmt(d.dueISO)}</span>
          <a className="text-link" href="/communications" style={{ marginLeft: "auto" }}>Send it<ChevronRight size={16} strokeWidth={1.75} /></a>
        </div>
      ))}
    </div>
  );
}
