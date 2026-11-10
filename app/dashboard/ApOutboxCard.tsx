"use client";
import { CircleCheck, Clock, TriangleAlert } from "lucide-react";

// Dashboard "AP Outbox" — a timestamped audit trail of every batch released to
// AvidXchange (Allocated, Credit Card, Payroll, Commissions): when, by whom, how many
// invoices, and the total. Records are what matters here, so nothing is ever
// hidden — newest first, each linking to the flow that sent it. Drew sees the
// Credit Card and Payroll batches here even though Harry sends them (owner:
// "visible so i can see if they went out") — the record, not the to-do.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCanOpen } from "@/app/components/useCanOpen";

type AvidSource = "allocated" | "credit-card" | "payroll" | "commissions";
type Send = {
  source: AvidSource; label: string; period: string;
  sentAt: string; sentBy: string | null;
  invoiceCount: number; propertyCount: number; total: number; partial: boolean;
};

/** Where each batch came from. Commissions has no link: the page differs by
 *  person (and Drew has none), so the row is the record on its own. */
const HREF: Partial<Record<AvidSource, string>> = {
  allocated: "/allocated-invoicer",
  "credit-card": "/expenses",
  payroll: "/",
};

function money0(n: number): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}
function when(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ApOutboxCard({ order = -1 }: { order?: number }) {
  const canOpen = useCanOpen();
  // A row links to its invoicer only for someone who can open it.
  const hrefFor = (src: AvidSource) => { const h = HREF[src]; return h && canOpen(h) ? h : undefined; };
  const [sends, setSends] = useState<Send[] | null>(null);
  // A batch generated but never sent — the thing this card exists to catch.
  const [unsent, setUnsent] = useState<{ source: AvidSource; label: string; period: string; at: string; by?: string | null; days: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/avid-sends?limit=8", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { setSends(j?.sends ?? []); setUnsent(j?.unsent ?? []); })
      .catch(() => setSends([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;
  const rows = sends ?? [];
  const TOP = 6;

  return (
    <div className="card" style={{ order }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          AP Outbox · Sent to AvidXchange
        </div>
      </div>

      {unsent.map((u) => {
        const Row = (hrefFor(u.source) ? Link : "div") as any;
        return (
          <Row key={`unsent-${u.source}`} href={hrefFor(u.source)} className="outbox-row"
            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 2px", borderBottom: "1px solid var(--hairline, var(--border))", textDecoration: "none", color: "var(--text)" }}>
            <TriangleAlert size={18} strokeWidth={1.75} color="var(--c-b54708)" aria-label="Not sent" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "var(--fs-14)", fontWeight: 700 }}>{u.label}{u.period ? ` · ${u.period}` : ""}</span>
              <span style={{ display: "block", fontSize: "var(--fs-12-5)", color: "var(--c-b54708)", fontWeight: 600 }}>Not sent to AvidXchange</span>
              <span style={{ display: "block", fontSize: "var(--fs-12-5)", color: "var(--muted)" }}>Generated {when(u.at)}{u.by ? ` · ${titleName(u.by)}` : ""}</span>
            </span>
          </Row>
        );
      })}

      {rows.length === 0 && unsent.length === 0 ? (
        <div className="small muted">
          Nothing sent to AvidXchange yet. Each invoicer's last batch will show here once it goes out.
        </div>
      ) : rows.length === 0 ? null : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.slice(0, TOP).map((s) => {
            const Row = (hrefFor(s.source) ? Link : "div") as any;
            return (
            <Row
              key={`${s.source}-${s.period}`}
              href={hrefFor(s.source)}
              className="outbox-row"
              style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 2px", borderBottom: "1px solid var(--hairline, var(--border))", textDecoration: "none", color: "var(--text)" }}
            >
              {s.partial
                ? <Clock size={18} strokeWidth={1.75} color="var(--c-b54708)" aria-label="Partly sent" style={{ flexShrink: 0, marginTop: 1 }} />
                : <CircleCheck size={18} strokeWidth={1.75} color="var(--c-067647)" aria-label="Sent" style={{ flexShrink: 0, marginTop: 1 }} />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "var(--fs-14)", fontWeight: 700 }}>{s.label}</span>
                <span style={{ display: "block", fontSize: "var(--fs-12-5)", color: "var(--muted)" }}>
                  {s.period} · {s.invoiceCount} invoice{s.invoiceCount === 1 ? "" : "s"}
                </span>
                <span style={{ display: "block", fontSize: "var(--fs-12-5)", color: "var(--muted)" }}>
                  Sent {when(s.sentAt)}{s.sentBy ? ` · ${titleName(s.sentBy)}` : ""}
                </span>
              </span>
              <span style={{ fontSize: "var(--fs-14)", fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money0(s.total)}</span>
            </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** "HARRY" / "harry" / "DREW (auto)" → "Harry" / "Drew (auto)". */
function titleName(n: string): string {
  return n.replace(/\b([A-Za-z])([A-Za-z]*)/g, (_m, a: string, b: string) => a.toUpperCase() + b.toLowerCase());
}
