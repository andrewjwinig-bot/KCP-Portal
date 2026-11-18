"use client";

// The ⓘ on an amortized capital-project CAM line (owner: "have the i icon to
// show the amort schedule and some basic info just to help us quickly pull it
// up"). Everything comes from lib/cam/retail/capex.ts — one source with the
// recon and the budget.

import { InfoPopover } from "@/app/components/InfoPopover";
import { capexByLabelAny, capexSchedule, capexTotal } from "@/lib/cam/retail/capex";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CapexInfo({ label, year }: { label: string; year?: number }) {
  const c = capexByLabelAny(label);
  if (!c) return null;
  const rows = capexSchedule(c);
  const total = capexTotal(c);
  const cell: React.CSSProperties = { padding: "3px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const head: React.CSSProperties = { ...cell, fontWeight: 700, color: "var(--muted)", fontSize: "var(--fs-12)", borderBottom: "1px solid var(--hairline)" };
  return (
    <InfoPopover label={`${label} amortization schedule`} align="left">
      <div style={{ display: "grid", gap: 10, minWidth: 300, maxWidth: 420 }}>
        <div>
          <div style={{ fontWeight: 800 }}>{c.project ?? label}</div>
          <div className="muted" style={{ fontSize: "var(--fs-13)" }}>
            {money(c.annual)} a year{c.firstYear && c.lastYear ? ` · ${c.firstYear}–${c.lastYear}` : c.lastYear ? ` · through ${c.lastYear}` : ""}
            {c.cost ? ` · over ${c.cost.years} years` : ""}
          </div>
        </div>
        {c.cost && (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              <tr><td style={{ ...cell, textAlign: "left" }}>Project invoices</td><td style={cell}>{money(c.cost.invoices)}</td></tr>
              {c.cost.less && <tr><td style={{ ...cell, textAlign: "left" }}>Less {c.cost.less.label.toLowerCase()}</td><td style={cell}>({money(c.cost.less.amount)})</td></tr>}
              <tr style={{ fontWeight: 700 }}><td style={{ ...cell, textAlign: "left" }}>Amortized</td><td style={cell}>{money(c.cost.amortized)}</td></tr>
              {c.billedBefore?.map((b) => (
                <tr key={b.year}><td style={{ ...cell, textAlign: "left" }}>Billed {b.year}</td><td style={cell}>({money(b.amount)})</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > 0 && (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr><th style={{ ...head, textAlign: "left" }}>Year</th><th style={head}>Amortize</th><th style={head}>Balance</th></tr>
            </thead>
            <tbody>
              {c.openingBalance != null && (
                <tr className="muted"><td style={{ ...cell, textAlign: "left" }}>Start {rows[0].year}</td><td style={cell} /><td style={cell}>{money(c.openingBalance)}</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.year} style={r.year === year ? { fontWeight: 800, color: "var(--c-0b4a7d)" } : undefined}>
                  <td style={{ ...cell, textAlign: "left" }}>{r.year}</td>
                  <td style={cell}>{money(r.amount)}</td>
                  <td style={cell}>{r.remaining > 0 ? money(r.remaining) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total != null && !c.cost && <div className="muted" style={{ fontSize: "var(--fs-13)" }}>Total over the term: {money(total)}</div>}
        {c.note && <div className="muted" style={{ fontSize: "var(--fs-13)" }}>{c.note}</div>}
      </div>
    </InfoPopover>
  );
}
