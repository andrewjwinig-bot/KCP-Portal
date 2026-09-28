"use client";

// The pill on a line whose figure was PROVIDED rather than estimated — a tax
// read off the city's certified assessments. Hover for the working in brief;
// click for the whole trail: every parcel with its address, last year's and
// this year's taxable value, the tax, whether it is in CAM, where the value
// was read, and links to the city's own pages and data, so anyone can retrace
// the figure without asking how it was built.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HoverCard } from "@/app/components/HoverCard";
import { Pill, type PillTone } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import type { ExpenseInput } from "@/lib/financials/budgets/expenseInputs";

type Source = NonNullable<ExpenseInput["source"]>;

const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const usd = (n: number | null | undefined) => (n == null ? "–" : `$${Math.round(n).toLocaleString("en-US")}`);

export function SourceBadge({ source, tone, text, label }: { source: Source; tone: PillTone; text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HoverCard title={source.title} width={340} rows={source.rows} footer={{ ...source.total, color: "var(--brand)" }} help={false}>
        <button type="button" onClick={() => setOpen(true)} aria-label={`Sources for ${label}`}
          style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer" }}>
          <Pill tone={tone}>{text}</Pill>
        </button>
      </HoverCard>
      {open && <SourceDialog source={source} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function SourceDialog({ source, label, onClose }: { source: Source; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parcels = source.parcels ?? [];
  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Sources for ${label}`}
        style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 820, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={secLabel}>Source · {label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{source.title}</div>
          </div>
          <button type="button" className="btn sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: "14px 18px", display: "grid", gap: 14 }}>
          {source.method && <div className="small">{source.method}</div>}

          {parcels.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thL}>Parcel</th>
                    <th style={th}>Prior year</th>
                    <th style={th}>Taxable value</th>
                    <th style={th}>Tax</th>
                    <th style={thL}>CAM</th>
                    <th style={thL}>Read from</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map((p) => (
                    <tr key={p.number}>
                      <td style={tdL}>
                        <div style={{ fontWeight: 700 }}>{p.label}</div>
                        <div className="muted small">
                          {p.href ? <a href={p.href} target="_blank" rel="noreferrer">{p.number}</a> : p.number}
                          {p.address ? ` · ${p.address}` : ""}
                        </div>
                      </td>
                      <td style={{ ...td, color: "var(--muted)" }}>{usd(p.prior)}</td>
                      <td style={td}>{usd(p.assessed)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{usd(p.tax)}</td>
                      <td style={tdL}>{p.recoverable ? "In CAM" : <span style={{ color: "#b45309", fontWeight: 700 }}>Not in CAM</span>}</td>
                      <td style={{ ...tdL, fontSize: 12 }} className="muted">{p.from}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...tdL, fontWeight: 800 }}>{source.total.label}</td>
                    <td style={td} /><td style={td} />
                    <td style={{ ...td, fontWeight: 800, color: "var(--brand)" }}>{source.total.value}</td>
                    <td style={tdL} /><td style={tdL} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {(source.links?.length ?? 0) > 0 && (
            <div>
              <div style={secLabel}>Retrace it</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4 }} className="small">
                {source.links!.map((l) => (
                  <li key={l.href}><a href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}
