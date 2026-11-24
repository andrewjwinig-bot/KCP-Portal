"use client";
import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import { Pill, TONE_GREEN, TONE_AMBER } from "@/app/components/Pill";
import { thDetail, tdDetail, thDetailL, tdDetailL } from "@/app/components/tableStyles";
import { buildInvoicePdf, makeInvoiceId } from "@/lib/expenses/invoice";
import { rebuildPropertyCharges, type SavedCharge } from "@/lib/expenses/rebuild";
import { PROPERTIES } from "@/lib/expenses/coding";
import { HoverCard } from "@/app/components/HoverCard";

// The invoices a Credit Card statement produced, as they went to AvidXchange
// (owner: "i see the charges history but i need to see the actual invoices
// history as well"). PDFs are archived at send (`sentInvoiceArchive.ts`); a
// month sent before that lists the file names the send ledger kept.

type Inv = { fileName: string; propertyLabel: string; code: string | null; amount: number | null; sentAt: string };
type Data = {
  archived: boolean; sentAt: string | null; sentBy: string | null; total: number | null;
  invoices: Inv[]; ledgerFiles: { fileName: string; sentAt: string }[];
};

const money = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const ICON = { strokeWidth: 1.75, "aria-hidden": true, style: { verticalAlign: "-3px", flexShrink: 0 } } as const;

/** "2026-08 - 4500.pdf" gives "4500"; the reimbursement file gives "REIMB". */
function codeFromFile(f: string): string {
  if (/REIMBURSEMENT/i.test(f)) return "REIMB";
  const m = f.match(/ - ([^-]+?)\.pdf$/i);
  return m ? m[1].trim() : f;
}

/** Rebuild one property's invoice from the saved statement and open or save it. */
function openRebuilt(tx: SavedCharge[], code: string, period: string, periodText: string, save: boolean) {
  const r = rebuildPropertyCharges(tx, code);
  const name = (PROPERTIES as readonly { id: string; name: string }[]).find((p) => p.id === code)?.name ?? code;
  const blob = buildInvoicePdf({
    propertyName: name, propertyCode: code, categoryGroups: r.categoryGroups,
    invoiceDate: "", statementMonth: period, periodText, invoiceId: makeInvoiceId(code, period), reconstructed: true,
  });
  const url = URL.createObjectURL(blob);
  if (save) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${period} - ${code} (rebuilt copy).pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

export function InvoicesPanel({ period, tx, periodText }: { period: string; tx?: SavedCharge[]; periodText?: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/statements/invoices?period=${encodeURIComponent(period)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!live) return; if (!r.ok) setErr(j.error ?? "Could not load the invoices."); else setD(j); })
      .catch(() => live && setErr("Could not load the invoices."));
    return () => { live = false; };
  }, [period]);

  const base = `/api/statements/invoices?period=${encodeURIComponent(period)}`;
  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 16px 6px" }}>
      <b style={{ fontSize: 15, flex: 1 }}>Invoices</b>
      {d?.sentAt
        ? <Pill tone={TONE_GREEN}>SENT TO AVIDXCHANGE</Pill>
        : d && <Pill tone={TONE_AMBER}>NOT SENT</Pill>}
      {d?.archived && d.invoices.length > 1 && (
        <a className="btn sm" style={{ textDecoration: "none" }} href={`${base}&zip=1`}><Download size={16} {...ICON} /> All invoices (ZIP)</a>
      )}
    </div>
  );

  if (err) return <div>{head}<div className="small" style={{ padding: "0 16px 14px", color: "var(--c-b42318)" }}>{err}</div></div>;
  if (!d) return <div>{head}<div className="small muted" style={{ padding: "0 16px 14px" }}>Loading…</div></div>;

  const meta = d.sentAt ? `Sent ${when(d.sentAt)}${d.sentBy ? ` by ${d.sentBy}` : ""}${d.total != null ? ` · $${money(d.total)} billed to properties` : ""}` : null;

  if (!d.sentAt && !d.ledgerFiles.length && !d.invoices.length) {
    return <div>{head}<div className="small muted" style={{ padding: "0 16px 14px" }}>This statement has not been sent to AvidXchange. Its invoices are kept here once it is.</div></div>;
  }

  return (
    <div>
      {head}
      {meta && <div className="small muted" style={{ padding: "0 16px 8px" }}>{meta}</div>}
      {d.archived ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead><tr><th style={thDetailL}>Invoice #</th><th style={thDetailL}>Property</th><th style={thDetail}>Billed</th><th style={thDetailL}>Sent</th><th style={thDetail} /></tr></thead>
            <tbody>
              {d.invoices.map((i) => (
                <tr key={i.fileName} className="task-row" style={{ borderBottom: "1px solid var(--hairline)" }}>
                  <td style={tdDetailL}><code>{makeInvoiceId(i.code ?? (/REIMB/i.test(i.fileName) ? "REIMB" : codeFromFile(i.fileName)), period)}</code></td>
                  <td style={tdDetailL}>{i.propertyLabel}</td>
                  <td style={tdDetail}>{money(i.amount)}</td>
                  <td style={tdDetailL}>{when(i.sentAt)}</td>
                  <td style={{ ...tdDetail, whiteSpace: "nowrap" }}>
                    <a className="btn sm" style={{ textDecoration: "none" }} href={`${base}&file=${encodeURIComponent(i.fileName)}`} target="_blank" rel="noreferrer"><FileText size={16} {...ICON} /> View PDF</a>{" "}
                    <a className="btn sm" style={{ textDecoration: "none" }} href={`${base}&file=${encodeURIComponent(i.fileName)}&download=1`} title="Download"><Download size={16} {...ICON} /></a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
              <thead><tr><th style={thDetailL}>Invoice #</th><th style={thDetailL}>File</th><th style={thDetail}>Charges</th><th style={thDetailL}>Sent</th><th style={thDetail} /></tr></thead>
              <tbody>
                {d.ledgerFiles.map((f) => {
                  const code = codeFromFile(f.fileName);
                  const r = tx && code !== "REIMB" ? rebuildPropertyCharges(tx, code) : null;
                  const can = !!r && r.count > 0;
                  return (
                    <tr key={f.fileName} className="task-row" style={{ borderBottom: "1px solid var(--hairline)" }}>
                      <td style={tdDetailL}><code>{makeInvoiceId(code, period)}</code></td>
                      <td style={tdDetailL}>{f.fileName}</td>
                      <td style={tdDetail}>{r ? money(r.total) : "—"}</td>
                      <td style={tdDetailL}>{when(f.sentAt)}</td>
                      <td style={{ ...tdDetail, whiteSpace: "nowrap" }}>
                        {can ? (
                          <HoverCard title="Rebuilt copy" rows={[{ label: "This month's charges", value: `$${money(r!.total)}` }]}
                            footer={{ label: "Held balances not included", value: "" }}>
                            <span>
                              <button className="btn sm" onClick={() => openRebuilt(tx!, code, period, periodText ?? "", false)}><FileText size={16} {...ICON} /> View copy</button>{" "}
                              <button className="btn sm" aria-label="Download copy" onClick={() => openRebuilt(tx!, code, period, periodText ?? "", true)}><Download size={16} {...ICON} /></button>
                            </span>
                          </HoverCard>
                        ) : <span className="small muted">{code === "REIMB" ? "Reimbursement" : tx ? "No charges saved" : "Loading…"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ padding: "8px 16px 14px" }}>
            Sent before invoices were archived, so the original PDFs are not kept here. View copy rebuilds a property's invoice from this statement's saved charges, marked as a copy; a balance held from earlier months and billed with it is not included. The originals are in AvidXchange and in the team summary email for this month.
          </div>
        </>
      )}
    </div>
  );
}
