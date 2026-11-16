"use client";

// Action item — this month's tenant account notices are waiting for Greg
// (owner, 11/2026: "tenant notices should also be on his action items on
// gregs dashboard"). Shown from the 15th's Credit Balance Report import until
// he sends them (or they go on their own); hidden otherwise.

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBanner } from "@/app/components/StatusBanner";
import { TENANT_NOTICES_PAGE } from "@/lib/users";

type Pending = { month: string; toSend: number; total: number; autoSendOn: string | null };

/** This month's batch when it is built and not yet sent — shared with the sidebar's count. */
export async function fetchPendingNotices(): Promise<Pending | null> {
  const j = await fetch("/api/tenant-notices", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const b = j?.batch;
  if (!b || b.approvedAt || !j?.counts?.toSend) return null;
  return { month: b.month, toSend: j.counts.toSend, total: j.counts.total, autoSendOn: b.autoSendOn ?? null };
}

const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export default function TenantNoticesReminder() {
  const [p, setP] = useState<Pending | null>(null);
  useEffect(() => { fetchPendingNotices().then(setP); }, []);
  if (!p) return null;
  return (
    <StatusBanner compact tone="warning" icon="clock" style={{ flex: "1 1 260px", minWidth: 0 }}
      title={`Approve ${monthName(p.month)}'s Tenant Notices`}
      actions={<Link className="btn sm" href={TENANT_NOTICES_PAGE} style={{ textDecoration: "none" }}>Review</Link>}>
      {p.toSend} ready to send · untick any to hold back{p.autoSendOn ? ` · they send on their own ${dayName(p.autoSendOn)}` : ""}
    </StatusBanner>
  );
}
