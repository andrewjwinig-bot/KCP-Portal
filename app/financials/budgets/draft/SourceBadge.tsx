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
import { Pill, StatPill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL, tiesTone, type PillTone } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import type { ExpenseInput } from "@/lib/financials/budgets/expenseInputs";

type Source = NonNullable<ExpenseInput["source"]>;

const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const usd = (n: number | null | undefined) => (n == null ? "–" : `$${Math.round(n).toLocaleString("en-US")}`);

export function SourceBadge({ source, tone, text, label, basis }: { source: Source; tone: PillTone; text: string; label: string;
  /** This year's line as the draft reprojects it — actuals to date. */ basis?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HoverCard title={source.title} width={340} rows={source.rows} footer={{ ...source.total, color: "var(--brand)" }} help={false}>
        <button type="button" onClick={() => setOpen(true)} aria-label={`Sources for ${label}`}
          style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer" }}>
          <Pill tone={tone}>{text}</Pill>
        </button>
      </HoverCard>
      {open && <SourceDialog source={source} label={label} basis={basis} onClose={() => setOpen(false)} />}
    </>
  );
}

function SourceDialog({ source, label, basis, onClose }: { source: Source; label: string; basis?: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parcels = source.parcels ?? [];
  const bills = source.bills ?? [];
  const f = source.formula;
  const op: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: "var(--muted)", padding: "0 2px", alignSelf: "center" };
  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Sources for ${label}`}
        style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 760, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={secLabel}>{label} · Source</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{source.title}</div>
          </div>
          <button type="button" className="btn sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: "4px 18px 16px", display: "grid", gap: 16 }}>
          {/* The calculation, as the tiles that feed it. */}
          {f ? (
            <div className="pills" style={{ alignItems: "stretch" }}>
              <StatPill label="Assessed value" value={usd(f.assessed)} sub={`${parcels.length} parcel${parcels.length === 1 ? "" : "s"}`} />
              <span style={op}>×</span>
              <StatPill label="Millage" value={f.mills.toFixed(3)} sub={`${bills.length} bill${bills.length === 1 ? "" : "s"}`} />
              <span style={op}>=</span>
              <StatPill label={source.total.label} value={source.total.value} accent="var(--brand)" total />
            </div>
          ) : source.method ? <div className="small">{source.method}</div> : null}

          {/* The check against the actual bills: this year's tax at this
              year's adopted rates, against what the ledger carries for the
              year (the draft's reprojection — actuals to date). */}
          {f?.thisYear != null && basis != null && Math.abs(basis) >= 1 && (() => {
            const diff = basis - f.thisYear!;
            const ties = Math.abs(diff) <= Math.max(250, Math.abs(f.thisYear!) * 0.02);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)" }}>
                <span style={secLabel}>Check against this year</span>
                <span className="small"><span className="muted">{f.thisYearLabel}</span> <b>{usd(f.thisYear)}</b></span>
                <span className="small"><span className="muted">on the ledger (reprojection)</span> <b>{usd(basis)}</b></span>
                <span style={{ marginLeft: "auto" }}><Pill tone={tiesTone(ties)}>{ties ? "TIES" : `DOESN'T TIE · ${diff > 0 ? "+" : "-"}${usd(Math.abs(diff))}`}</Pill></span>
              </div>
            );
          })()}

          {bills.length > 0 && (
            <div>
              <div style={secLabel}>Bills</div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
                <thead>
                  <tr><th style={thL}>Bill</th><th style={thL}>Due</th><th style={thL}>Taxing bodies</th><th style={th}>Mills</th><th style={th}>Tax</th></tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.label}>
                      <td style={{ ...tdL, fontWeight: 700 }}>{b.label}</td>
                      <td style={tdL}><Pill tone={TONE_NEUTRAL}>{b.month}</Pill></td>
                      <td style={tdL}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {b.levies.map((l) => (
                            <span key={l.body} className="small" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <span className="muted">{l.body}</span>
                              <b style={{ fontVariantNumeric: "tabular-nums" }}>{l.mills}</b>
                              {!l.adopted && <Pill tone={TONE_AMBER}>{l.rateYear} + 3%</Pill>}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={td}>{b.mills.toFixed(3)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{usd(b.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {parcels.length > 0 && (
            <div>
              <div style={secLabel}>Parcels</div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
                <thead>
                  <tr><th style={thL}>Parcel</th><th style={th}>Prior year</th><th style={th}>Assessed</th><th style={th}>Tax</th><th style={thL}>CAM</th></tr>
                </thead>
                <tbody>
                  {parcels.map((p) => (
                    <tr key={`${p.number}-${p.label}`}>
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
                      <td style={tdL}>{p.recoverable ? <Pill tone={TONE_GREEN}>In CAM</Pill> : <Pill tone={TONE_AMBER}>Not in CAM</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(source.links?.length ?? 0) > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ ...secLabel, marginRight: 4 }}>Retrace it</span>
              {source.links!.map((l) => (
                <a key={l.href} className="btn sm" href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a>
              ))}
            </div>
          )}

          {source.footnote && <div className="muted small">{source.footnote}</div>}
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}
