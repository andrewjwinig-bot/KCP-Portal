"use client";

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
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          AP Outbox — sent to AvidXchange
        </div>
      </div>

      {unsent.map((u) => {
        const Row = (hrefFor(u.source) ? Link : "div") as any;
        return (
          <Row key={`unsent-${u.source}`} href={hrefFor(u.source)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", marginBottom: 4, borderRadius: 8, textDecoration: "none", color: "var(--text)", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.30)" }}>
            <span style={{ fontSize: 13 }}>⚠️</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              <b style={{ fontWeight: 700 }}>{u.label}</b>{u.period ? ` · ${u.period}` : ""}
              <span style={{ color: "#b45309", fontWeight: 700 }}> · not sent to AvidXchange</span>
              <span className="muted"> — generated {when(u.at)}{u.by ? ` by ${u.by}` : ""}</span>
            </span>
          </Row>
        );
      })}

      {rows.length === 0 && unsent.length === 0 ? (
        <div className="small muted" style={{ fontWeight: 600 }}>
          Nothing sent to AvidXchange yet — the last batch released from each invoicer will show here with a timestamp.
        </div>
      ) : rows.length === 0 ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {rows.slice(0, TOP).map((s) => {
            const Row = (hrefFor(s.source) ? Link : "div") as any;
            return (
            <Row
              key={`${s.source}-${s.period}`}
              href={hrefFor(s.source)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, textDecoration: "none", color: "var(--text)", background: "rgba(22,163,74,0.05)" }}
            >
              <span style={{ fontSize: 13 }}>{s.partial ? "🕗" : "✅"}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                <b style={{ fontWeight: 700 }}>{s.label}</b> · {s.period}
                <span className="muted"> · {s.invoiceCount} invoice{s.invoiceCount === 1 ? "" : "s"}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{money0(s.total)}</span>
              <span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap", minWidth: 96, textAlign: "right" }}>
                {when(s.sentAt)}{s.sentBy ? ` · ${s.sentBy}` : ""}
              </span>
            </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}
