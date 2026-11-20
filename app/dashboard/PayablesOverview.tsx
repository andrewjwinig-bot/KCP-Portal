"use client";

// Tanya's dashboard (owner, 11/2026: "tanyas dashboard should show invoice
// history summaries for her to view. remove portfolio occupancy and expiring
// tenants. also U&O summary"). Two cards, read off the same endpoints their
// pages use: what went to AvidXchange (/api/invoice-history) and where the
// month's Philadelphia U&O stands (/api/uo) — including the tenants whose UO
// charge no longer matches their share, which is the part she keys in Skyline.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import QuickLinks from "./QuickLinks";
import { StatPill } from "@/app/components/Pill";
import { StatusBanner } from "@/app/components/StatusBanner";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import { batchPeriodLabel, FLOW_LABEL, sentDay, usd } from "@/app/invoices/format";
import type { HistoryBatch } from "@/lib/invoicing/invoiceHistory";

const ICON = { size: 16, strokeWidth: 1.75 } as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const SECTION: React.CSSProperties = { fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const FLOWS = ["allocated", "credit-card", "payroll", "commissions"] as const;

type UoLines = { maxTax: number; totalOff: number; delinquent: number; net: number; beforeDiscount: number };
type UoView = {
  month: string;
  stage: "not-open" | "review" | "ready" | "filed" | "overdue";
  dates: { due: string; fileBy: string };
  properties: { code: string; name: string; lines: UoLines; filed: { lines: UoLines } | null; noTenancy: boolean; billed: { unitRef: string; tenant: string; share: number; billed: number | null }[] }[];
  record: { confirmedAt?: string; confirmedBy?: string };
};

const STAGE: Record<UoView["stage"], { tone: "success" | "warning" | "danger" | "info"; text: string }> = {
  "not-open": { tone: "info", text: "Delinquent review opens the 16th" },
  review: { tone: "warning", text: "Delinquents being reviewed" },
  ready: { tone: "warning", text: "Ready to file" },
  filed: { tone: "success", text: "Filed" },
  overdue: { tone: "danger", text: "Past due — not filed" },
};

export default function PayablesOverview() {
  const [batches, setBatches] = useState<HistoryBatch[] | null>(null);
  const [uo, setUo] = useState<UoView | null>(null);
  const [errors, setErrors] = useState<{ inv?: string; uo?: string }>({});

  useEffect(() => {
    fetch("/api/invoice-history", { cache: "no-store" }).then((r) => r.json())
      .then((j) => (Array.isArray(j?.batches) ? setBatches(j.batches) : setErrors((e) => ({ ...e, inv: j?.error ?? "Could not load the invoice history." }))))
      .catch(() => setErrors((e) => ({ ...e, inv: "Could not load the invoice history." })));
    fetch("/api/uo", { cache: "no-store" }).then((r) => r.json())
      .then((j) => (j?.ok ? setUo(j) : setErrors((e) => ({ ...e, uo: j?.error ?? "Could not load the U&O month." }))))
      .catch(() => setErrors((e) => ({ ...e, uo: "Could not load the U&O month." })));
  }, []);

  const latest = useMemo(() => new Map(FLOWS.map((f) => [f, (batches ?? []).find((b) => b.source === f) ?? null])), [batches]);
  const recent = (batches ?? []).slice(0, 8);
  const linesOf = (p: UoView["properties"][number]) => p.filed?.lines ?? (p.noTenancy ? null : p.lines);
  const uoSum = (k: keyof UoLines) => (uo?.properties ?? []).reduce((s, p) => s + (linesOf(p)?.[k] ?? 0), 0);
  const mismatched = (uo?.properties ?? []).flatMap((p) => p.billed.filter((b) => b.billed == null || Math.abs(b.billed - b.share) >= 1).map((b) => ({ ...b, code: p.code })));
  const filedCount = (uo?.properties ?? []).filter((p) => p.filed).length;

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Payables &amp; U&amp;O</h1>
          <div className="muted small" style={{ marginTop: 6 }}>What went to AvidXchange, and where this month&apos;s Philadelphia U&amp;O stands.</div>
        </div>
        <QuickLinks compact />
      </header>

      <section className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Sent to AvidXchange</h2>
          <Link className="text-link" href="/invoices">Invoice History <ChevronRight {...ICON} aria-hidden style={{ verticalAlign: "-3px" }} /></Link>
        </div>
        {errors.inv && <StatusBanner tone="danger" compact title="Could not load the invoice history">{errors.inv}</StatusBanner>}
        {!batches && !errors.inv && <div className="muted small">Loading…</div>}
        {batches && (
          <>
            <div className="pills" style={{ justifyContent: "flex-start", margin: 0 }}>
              {FLOWS.map((f) => {
                const b = latest.get(f);
                return <StatPill key={f} label={FLOW_LABEL[f]} value={b ? usd(b.total) : "—"} sub={b ? `${batchPeriodLabel(f, b.period)} · sent ${sentDay(b.sentAt)}` : "Nothing sent yet"} />;
              })}
            </div>
            {recent.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <div style={{ ...SECTION, marginBottom: 6 }}>Recent batches</div>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead>
                    <tr><th style={thL}>Sent</th><th style={thL}>Flow</th><th style={thL}>Period</th><th style={th}>Invoices</th><th style={th}>Total</th></tr>
                  </thead>
                  <tbody>
                    {recent.map((b) => (
                      <tr key={`${b.source}|${b.period}`} className="task-row">
                        <td style={tdL}>{sentDay(b.sentAt)}</td>
                        <td style={tdL}>{FLOW_LABEL[b.source] ?? b.label}</td>
                        <td style={{ ...tdL, fontWeight: 600 }}>{batchPeriodLabel(b.source, b.period)}{b.partial && <span style={{ color: "var(--amber-text)", marginLeft: 8 }}>Partly sent</span>}</td>
                        <td style={td}>{b.invoiceCount}</td>
                        <td style={td}>{usd(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Philadelphia U&amp;O{uo ? ` · ${monthName(uo.month)}` : ""}</h2>
          <Link className="text-link" href="/uo-tax">Phila U&amp;O <ChevronRight {...ICON} aria-hidden style={{ verticalAlign: "-3px" }} /></Link>
        </div>
        {errors.uo && <StatusBanner tone="danger" compact title="Could not load the U&O month">{errors.uo}</StatusBanner>}
        {!uo && !errors.uo && <div className="muted small">Loading…</div>}
        {uo && (
          <>
            <StatusBanner tone={STAGE[uo.stage].tone} compact title={STAGE[uo.stage].text}>
              {filedCount} of {uo.properties.length} returns filed · due {Number(uo.dates.due.slice(5, 7))}/{Number(uo.dates.due.slice(8, 10))}
              {uo.record.confirmedAt ? ` · delinquents confirmed by ${uo.record.confirmedBy}` : ""}
            </StatusBanner>
            <div className="pills" style={{ justifyContent: "flex-start", margin: 0 }}>
              <StatPill label="Maximum tax" value={usd(uoSum("maxTax"))} sub="Line 1" />
              <StatPill label="Vacant & exempt" value={usd(uoSum("totalOff"))} sub="Lines 2–3" />
              <StatPill label="Delinquent" value={usd(uoSum("delinquent"))} sub="Line 8 · to reverse in Skyline" />
              <StatPill label="Paid to the City" value={usd(uoSum("net"))} sub="Line 11" total />
            </div>
            {mismatched.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <div style={{ ...SECTION, marginBottom: 6 }}>UO charges to update in Skyline ({mismatched.length})</div>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead><tr><th style={thL}>Suite</th><th style={thL}>Tenant</th><th style={th}>Billed today</th><th style={th}>Their share</th></tr></thead>
                  <tbody>
                    {mismatched.slice(0, 10).map((m) => (
                      <tr key={m.unitRef} className="task-row">
                        <td style={tdL}><code>{m.unitRef}</code></td>
                        <td style={tdL}>{m.tenant}</td>
                        <td style={td}>{m.billed != null ? usd(m.billed) : "Not billed"}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{usd(m.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mismatched.length > 10 && <div className="muted small" style={{ marginTop: 6 }}>+ {mismatched.length - 10} more on the U&amp;O page.</div>}
              </div>
            ) : (
              <div className="muted small">Every taxable tenant&apos;s UO charge matches their share.</div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
