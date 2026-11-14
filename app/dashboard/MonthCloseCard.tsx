"use client";

// The month-end close at a glance (owner, 11/2026): what is still open for
// last month — one row per item, what is left on hover. The full checklist and the
// sign-off are on /close. Flags to Investigate is counted there, not here —
// its sweep is too slow for the dashboard.

import { useEffect, useState } from "react";
import { ImportStepsButton } from "@/app/components/ImportStepsButton";
import { CLOSE_ITEM_STEPS } from "@/lib/tracker/importSteps";
import Link from "next/link";
import { ChevronRight, Circle, CircleCheck } from "lucide-react";
import type { MonthClose } from "@/lib/close/monthClose";
import { HoverCard } from "@/app/components/HoverCard";

const TOP = 5;
const statusStyle = (done: boolean): React.CSSProperties => ({ fontSize: "var(--fs-13)", fontWeight: 700, color: done ? "var(--c-067647)" : "var(--c-b54708)", textAlign: "right", whiteSpace: "nowrap" });

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
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600, fontSize: "var(--fs-14)", minWidth: 0 }}>{it.label}{CLOSE_ITEM_STEPS[it.id] && <ImportStepsButton id={CLOSE_ITEM_STEPS[it.id]} />}</span>
          {/* What is left lives in the hover, not on the card (owner: "too
              much to list on here"). */}
          {!it.done && it.detail.length > 0 ? (
            <HoverCard title={`Still to ${it.id === "gl" ? "import" : "do"}`} width={300}
              rows={it.detail.slice(0, TOP).map((d) => ({ label: d.text, value: d.meta ?? "" }))}
              footer={it.detail.length > TOP ? { label: `${it.detail.length - TOP} more`, value: "on the checklist" } : undefined}>
              <span style={statusStyle(false)}>{it.status}</span>
            </HoverCard>
          ) : (
            <span style={statusStyle(it.done)}>{it.status}</span>
          )}
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
