"use client";

// Invoice History — every batch sent to AvidXchange, all four flows, each
// opening into its invoices as sent (owner, 11/2026: "give tanya all invoice
// history"). Reads lib/invoicing/invoiceHistory.ts through /api/invoice-history.

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileText } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { HeaderSelect } from "@/app/components/HeaderSelect";
import { MetaLine } from "@/app/components/LastImported";
import { StatusBanner } from "@/app/components/StatusBanner";
import { StatPill } from "@/app/components/Pill";
import LoadingState from "@/app/components/LoadingState";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import { batchPeriodLabel, FLOW_LABEL, sentDay, usd } from "./format";
import type { BatchInvoices, HistoryBatch } from "@/lib/invoicing/invoiceHistory";

const ICON = { size: 16, strokeWidth: 1.75 } as const;
const q = (b: { source: string; period: string }) => `source=${encodeURIComponent(b.source)}&period=${encodeURIComponent(b.period)}`;

export default function InvoiceHistoryPage() {
  const [batches, setBatches] = useState<HistoryBatch[] | null>(null);
  const [error, setError] = useState("");
  const [flow, setFlow] = useState("all");
  const [year, setYear] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/invoice-history").then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not load the invoice history.");
      setBatches(j.batches ?? []);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const years = useMemo(() => [...new Set((batches ?? []).map((b) => b.sentAt.slice(0, 4)))].sort().reverse(), [batches]);
  const shown = useMemo(() => (batches ?? []).filter((b) => (flow === "all" || b.source === flow) && (year === "all" || b.sentAt.startsWith(year))), [batches, flow, year]);
  const total = shown.reduce((s, b) => s + (b.total || 0), 0);
  const invoices = shown.reduce((s, b) => s + (b.invoiceCount || 0), 0);
  const byFlow = (src: string) => shown.filter((b) => b.source === src).reduce((s, b) => s + (b.total || 0), 0);

  const header = (
    <PageHeader
      title="Invoice History"
      info={<>Every batch sent to AvidXchange — Allocated Expenses, Credit Card, Payroll and Commissions — newest first. Open a batch for its invoices as sent: view or download each PDF, or the whole batch as a ZIP.</>}
      pickers={
        <>
          <HeaderSelect value={flow} onChange={setFlow} displayLabel={flow === "all" ? "All invoices" : FLOW_LABEL[flow]} ariaLabel="Flow">
            <option value="all">All invoices</option>
            {Object.entries(FLOW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </HeaderSelect>
          <HeaderSelect value={year} onChange={setYear} displayLabel={year === "all" ? "All years" : year} ariaLabel="Year" muted>
            <option value="all">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </HeaderSelect>
        </>
      }
      meta={batches && (
        <MetaLine>
          <span>{shown.length} batch{shown.length === 1 ? "" : "es"} · {invoices.toLocaleString("en-US")} invoices</span>
          {shown[0] && <span>· Last sent {sentDay(shown[0].sentAt)}</span>}
        </MetaLine>
      )}
    />
  );

  if (!batches) return <main className="page">{header}{error ? <StatusBanner tone="danger" title="Something went wrong">{error}</StatusBanner> : <LoadingState status="Loading invoice history…" columns={6} rows={8} />}</main>;

  return (
    <main className="page">
      {header}
      <div className="pills" style={{ marginTop: 16 }}>
        <StatPill label="Total sent" value={usd(total)} total />
        {(["allocated", "credit-card", "payroll", "commissions"] as const).filter((s) => flow === "all" || flow === s).map((s) => (
          <StatPill key={s} label={FLOW_LABEL[s]} value={usd(byFlow(s))} />
        ))}
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: "auto" }}>
        {shown.length === 0 ? (
          <div style={{ padding: 16, color: "var(--muted)" }}>Nothing sent to AvidXchange{flow !== "all" ? ` for ${FLOW_LABEL[flow]}` : ""}{year !== "all" ? ` in ${year}` : ""}.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={thL}>Sent</th>
                <th style={thL}>Flow</th>
                <th style={thL}>Period</th>
                <th style={th}>Invoices</th>
                <th style={th}>Total</th>
                <th style={thL}>By</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => {
                const key = `${b.source}|${b.period}`;
                const isOpen = open === key;
                return (
                  <Fragment key={key}>
                    <tr className="task-row" style={{ cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : key)}>
                      <td style={tdL}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {isOpen ? <ChevronDown {...ICON} /> : <ChevronRight {...ICON} />}
                          {sentDay(b.sentAt)}
                        </span>
                      </td>
                      <td style={tdL}>{FLOW_LABEL[b.source] ?? b.label}</td>
                      <td style={{ ...tdL, fontWeight: 600 }}>
                        {batchPeriodLabel(b.source, b.period)}
                        {b.partial && <span style={{ color: "var(--amber-text)", fontWeight: 600, marginLeft: 8 }}>Partly sent</span>}
                      </td>
                      <td style={td}>{b.invoiceCount}</td>
                      <td style={td}>{usd(b.total)}</td>
                      <td style={tdL}>{b.sentBy ? b.sentBy.charAt(0) + b.sentBy.slice(1).toLowerCase() : "Automatic"}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ padding: "4px 12px 16px 32px", maxWidth: 0 }}>
                          <BatchDetail batch={b} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function BatchDetail({ batch }: { batch: HistoryBatch }) {
  const [data, setData] = useState<BatchInvoices | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/invoice-history?${q(batch)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not load the invoices.");
      setData(j);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [batch]);
  if (error) return <StatusBanner tone="danger" compact title="Could not load the invoices">{error}</StatusBanner>;
  if (!data) return <div style={{ color: "var(--muted)", padding: "8px 0" }}>Loading…</div>;
  if (data.kind === "none") {
    return <StatusBanner tone="info" compact title="No PDFs on file">This batch went out before the portal kept the invoices as sent. AvidXchange has them.</StatusBanner>;
  }
  const file = (f: string, dl = false) => `/api/invoice-history?${q(batch)}&file=${encodeURIComponent(f)}${dl ? "&download=1" : ""}`;
  return (
    <div>
      {data.kind === "rebuilt" && (
        <div style={{ marginBottom: 8 }}>
          <StatusBanner tone="warning" compact title="Rebuilt from the GL">These copies were rebuilt after the fact. They are not the exact invoices sent.</StatusBanner>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
        <a className="btn sm" href={`/api/invoice-history?${q(batch)}&zip=1`}><Download {...ICON} /> Download All (ZIP)</a>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thL}>Invoice #</th>
            <th style={thL}>Bills</th>
            <th style={th}>Amount</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {data.invoices.map((i) => (
            <tr key={i.fileName} className="task-row">
              <td style={tdL}><code>{i.invoiceNumber ?? i.fileName}</code></td>
              <td style={tdL}>{i.label}</td>
              <td style={td}>{i.amount != null ? usd(i.amount) : "—"}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                <a className="btn sm" href={file(i.fileName)} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}><FileText {...ICON} /> View</a>
                <a className="btn sm" href={file(i.fileName, true)} aria-label="Download PDF"><Download {...ICON} /></a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
