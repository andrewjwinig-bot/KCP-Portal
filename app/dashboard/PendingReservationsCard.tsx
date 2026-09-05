"use client";

// Dashboard card listing reservation requests still awaiting a decision.
// Renders nothing when the queue is clear. Each row deep-links into the
// reservation modal so staff can approve / edit / decline.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pill, Badge, reservationStatusTone } from "../components/Pill";

type PendingReservation = {
  id: string;
  roomLabel: string;
  propertyName: string;
  tenantCompany: string;
  contactFirstName: string;
  contactLastName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  createdAt: string;
};

function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function prettyTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m[2]} ${ampm}`;
}

export default function PendingReservationsCard({ order = 0 }: { order?: number }) {
  const [pending, setPending] = useState<PendingReservation[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/reservations")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.reservations) return;
        const p = (j.reservations as PendingReservation[])
          .filter((x) => x.status === "Pending")
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        setPending(p);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!pending || pending.length === 0) return null;

  return (
    <div className="card" style={{ gridColumn: "1 / -1", order }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", display: "flex", alignItems: "center" }}>
          Pending Reservations
          <Badge>{pending.length}</Badge>
        </div>
        <Link href="/reservations" style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", textDecoration: "none" }}>
          Open Reservations →
        </Link>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pending.map((r) => (
          <Link
            key={r.id}
            href={`/reservations?openId=${encodeURIComponent(r.id)}`}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8,
              background: "#fafafa", textDecoration: "none", color: "inherit",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.roomLabel} · {r.tenantCompany}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {[
                  `${prettyDate(r.date)} · ${prettyTime(r.startTime)}–${prettyTime(r.endTime)}`,
                  `${r.contactFirstName} ${r.contactLastName}`.trim(),
                  r.propertyName,
                ].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Pill tone={reservationStatusTone("Pending")}>Pending</Pill>
            <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "var(--brand)" }}>Review →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
