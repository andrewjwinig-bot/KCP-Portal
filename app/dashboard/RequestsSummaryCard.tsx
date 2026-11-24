"use client";

// REQUESTS AT A GLANCE — the maintenance team's dashboard (owner, 11/2026: "for
// gregs dashboard maybe can you add any requests summary just high level he
// can see"). Four tiles — open, new (not started), high priority, completed
// this week — each opening the Requests page filtered to it, and the five open
// requests that have waited longest. The full board is the Requests page.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Pill, StatPill, maintenanceStatusTone, priorityTone } from "@/app/components/Pill";
import { staffName } from "@/lib/maintenance/staff";
import type { MaintenanceRequest } from "@/lib/maintenance/requests";

const DAY = 86_400_000;
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY));

export default function RequestsSummaryCard({ me, order = 0 }: { me?: string; order?: number }) {
  const router = useRouter();
  const [requests, setRequests] = useState<MaintenanceRequest[] | null>(null);

  useEffect(() => {
    fetch("/api/maintenance/requests", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRequests(j?.requests ?? []))
      .catch(() => setRequests([]));
  }, []);

  const s = useMemo(() => {
    const all = requests ?? [];
    const open = all.filter((r) => r.status !== "Complete");
    const weekAgo = Date.now() - 7 * DAY;
    const opened = (r: MaintenanceRequest) => r.submittedDate || r.createdAt;
    return {
      open: open.length,
      fresh: open.filter((r) => r.status === "New").length,
      high: open.filter((r) => r.priority === "High").length,
      mine: me ? open.filter((r) => (r.assignedToIds ?? []).includes(me as never)).length : 0,
      doneWeek: all.filter((r) => r.status === "Complete" && r.completedDate && Date.parse(r.completedDate) >= weekAgo).length,
      longest: [...open].sort((a, b) => opened(a).localeCompare(opened(b))).slice(0, 5),
      opened,
    };
  }, [requests, me]);

  if (!requests) return null;
  const go = (q: string) => router.push(`/maintenance${q}`);

  return (
    <section className="card" style={{ order, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>Requests</span>
        <Link className="text-link" href="/maintenance">All requests<ChevronRight size={16} strokeWidth={1.75} aria-hidden /></Link>
      </div>
      <div className="pills">
        <StatPill label="Open" value={s.open} onClick={() => go("")} hint="Open requests" />
        <StatPill label="New · not started" value={s.fresh} accent={s.fresh ? "var(--c-b54708)" : undefined} onClick={() => go("?status=New")} hint="New requests" />
        <StatPill label="High priority" value={s.high} accent={s.high ? "var(--c-b42318)" : undefined} onClick={() => go("?priority=High")} hint="High priority" />
        {me && <StatPill label="Assigned to me" value={s.mine} onClick={() => go(`?assignee=${me}`)} hint="Mine" />}
        <StatPill label="Done · last 7 days" value={s.doneWeek} accent={s.doneWeek ? "var(--c-067647)" : undefined} onClick={() => go("?tab=completed")} hint="Completed" />
      </div>
      {s.longest.length > 0 && (
        <div>
          <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 2 }}>Waiting longest</div>
          {s.longest.map((r) => {
            const d = daysSince(s.opened(r));
            const who = (r.assignedToIds ?? []).map((id) => staffName(id)).join(", ");
            return (
              <Link key={r.id} href={`/maintenance?tenant=${encodeURIComponent(r.tenantCompany)}`} className="task-row"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 2px", borderBottom: "1px solid var(--hairline)", color: "inherit", textDecoration: "none" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.subject || "Request"}</span>
                  <span className="muted" style={{ fontSize: "var(--fs-13)" }}>
                    {r.tenantCompany || r.propertyName}{r.tenantSuite ? ` · ${r.tenantSuite}` : ""}{who ? ` · ${who}` : " · unassigned"}
                  </span>
                </span>
                {r.priority === "High" && <Pill tone={priorityTone(r.priority)}>High</Pill>}
                <Pill tone={maintenanceStatusTone(r.status)}>{r.status}</Pill>
                <span style={{ fontSize: "var(--fs-14)", fontWeight: 600, color: d >= 14 ? "var(--c-b42318)" : d >= 7 ? "var(--c-b54708)" : "var(--muted)", minWidth: 56, textAlign: "right" }}>
                  {d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
