"use client";

// Tenant-facing monthly statement — "what do I owe right now, and how do I pay
// it". Reads the published Skyline statement import for this token's one unit.
//
// Deliberately reuses the portal's existing statement language (navy section
// bars, GL-style tables, the boxed balance callout) so the monthly statement
// and the annual CAM reconciliation read as one document family.

import { useEffect, useState } from "react";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { HoverCard } from "@/app/components/HoverCard";
import { BRAND, money, money2 } from "@/app/statement/[token]/StatementView";
import {
  AGING_LABEL, CATEGORY_LABEL,
  type AgingBucket, type ChargeCategory, type StatementCharge,
} from "@/lib/statements/types";

type Summary = {
  totalDue: number; currentCharges: number; priorBalance: number; credits: number;
  byCategory: { category: ChargeCategory; amount: number; count: number }[];
  byAging: { bucket: AgingBucket; amount: number }[];
  pastDue: boolean; pastDueAmount: number; oldestISO: string | null;
};
export type MonthlyStatement = {
  period: string; periodLabel: string; unitRef: string; tenantName: string; suite: string;
  underReview: boolean; charges: StatementCharge[]; summary: Summary;
};
export type PaymentInstructions = {
  payableTo: string; remitTo: string[]; achNote: string;
  contactName: string; contactEmail: string; contactPhone: string; note: string;
};
type Payload = { ok: true; payment: PaymentInstructions; statements: MonthlyStatement[] };

const AMBER = "#b45309";
const GREEN = "#15803d";

/** Colour per category — shared by the rollup tiles and their hover cards. */
const CATEGORY_COLOR: Record<ChargeCategory, string> = {
  rent: BRAND, cam: "#0e7490", insurance: "#7c3aed", ret: "#b45309",
  uando: "#be185d", utilities: "#0f766e", other: "#64748b", credit: GREEN,
};

export function useMonthlyStatements(token: string) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch(`/api/portal/${token}/monthly`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j?.ok ? j : null); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
  }, [token]);
  return { data, loading };
}

const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${y}`;
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 12px" }}>{children}</div>
);

/** The headline: what's owed, split into this month vs. what's carried over. */
function BalanceCallout({ st, token }: { st: MonthlyStatement; token: string }) {
  const due = st.summary.totalDue;
  const credit = due < -0.005;
  const settled = Math.abs(due) <= 0.005;
  const tone = credit || settled ? GREEN : AMBER;
  return (
    <div style={{
      borderRadius: 14, border: `1.5px solid ${tone}`, padding: "20px 22px",
      background: credit || settled ? "rgba(21,128,61,0.06)" : "rgba(180,83,9,0.06)",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: tone }}>
          {settled ? "Your account is current" : credit ? "Credit on account" : "Total amount due"}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {settled ? `Nothing open as of ${st.periodLabel}.` : (
            <>
              This month <strong style={{ color: "var(--text)" }}>{money2(st.summary.currentCharges)}</strong>
              {"  ·  "}
              Prior balance <strong style={{ color: st.summary.priorBalance > 0.005 ? AMBER : "var(--text)" }}>{money2(st.summary.priorBalance)}</strong>
            </>
          )}
        </div>
        {st.summary.credits > 0.005 && (
          <div style={{ fontSize: 12.5, marginTop: 4, color: GREEN, fontWeight: 600 }}>Includes {money2(st.summary.credits)} of credits already applied.</div>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: tone, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{money2(Math.abs(due))}</div>
        <div style={{ marginTop: 10 }}>
          <DownloadMenu
            label="Download"
            items={[{ label: "Statement PDF", description: `${st.periodLabel} statement of account`, href: `/api/portal/${token}/monthly/pdf?period=${st.period}` }]}
            variant="primary"
          />
        </div>
      </div>
    </div>
  );
}

/** Aging strip — only shown once something has actually gone past due. */
function AgingStrip({ st }: { st: MonthlyStatement }) {
  // One bucket just restates the headline — the split is the point.
  if (!st.summary.pastDue || st.summary.byAging.length < 2) return null;
  return (
    <section style={{ marginTop: 26 }}>
      <SectionLabel>Aging</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--card)", boxShadow: "var(--shadow)" }}>
        {st.summary.byAging.map((b, i) => (
          <div key={b.bucket} style={{ flex: "1 1 auto", minWidth: 118, padding: "12px 16px", borderLeft: i ? "1px solid var(--border)" : "none" }}>
            <div style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: b.bucket === "current" ? "var(--text)" : AMBER }}>{money(b.amount)}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{AGING_LABEL[b.bucket]}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Category rollup tiles. Each hovers to the individual lines behind it —
 *  the shared HoverCard, never a plain browser tooltip. */
function CategoryTiles({ st }: { st: MonthlyStatement }) {
  if (st.summary.byCategory.length < 2) return null;
  return (
    <section style={{ marginTop: 26 }}>
      <SectionLabel>What you&rsquo;re being billed for</SectionLabel>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))" }}>
        {st.summary.byCategory.map((c) => {
          const lines = st.charges.filter((x) => x.category === c.category);
          return (
            <HoverCard
              key={c.category}
              title={CATEGORY_LABEL[c.category]}
              width={296}
              rows={lines.slice(0, 8).map((l) => ({ label: `${dateLabel(l.dateISO)} · ${l.description}`, value: money2(l.amount), color: CATEGORY_COLOR[c.category] }))}
              footer={{ label: lines.length > 8 ? `Total (${lines.length} charges)` : "Total", value: money2(c.amount) }}
              style={{ display: "block" }}
            >
              <div style={{ border: "1px solid var(--border)", borderLeft: `3px solid ${CATEGORY_COLOR[c.category]}`, borderRadius: 12, padding: "13px 15px", background: "var(--card)", boxShadow: "var(--shadow)", height: "100%", boxSizing: "border-box" }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: c.amount < 0 ? GREEN : "var(--text)" }}>{money2(c.amount)}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {CATEGORY_LABEL[c.category]} · {c.count} {c.count === 1 ? "charge" : "charges"}
                </div>
              </div>
            </HoverCard>
          );
        })}
      </div>
    </section>
  );
}

/** The line-by-line ledger, mirroring the annual statement's schedule table. */
function ChargeTable({ st, hasRecon, onOpenRecon }: { st: MonthlyStatement; hasRecon: (year: number) => boolean; onOpenRecon: (year: number) => void }) {
  const GRID = "112px 1fr 150px 118px"; // Date | Charge | Type | Amount
  const pad = "9px 14px";
  return (
    <section style={{ marginTop: 26 }}>
      <SectionLabel>Open charges</SectionLabel>
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)", background: "var(--card)" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ minWidth: 520 }}>
            <div style={{ display: "grid", gridTemplateColumns: GRID, background: "rgba(11,74,125,0.09)", borderBottom: "1px solid var(--border)", padding: "9px 0" }}>
              {["Date", "Charge", "Type", "Amount"].map((h, i) => (
                <div key={h} style={{ padding: "0 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: i === 1 ? BRAND : "var(--muted)", textAlign: i === 3 ? "right" : "left" }}>{h}</div>
              ))}
            </div>
            {st.charges.map((c, i) => {
              const linkYear = c.reconYear && hasRecon(c.reconYear) ? c.reconYear : null;
              return (
                <div key={`${c.dateISO}-${c.description}-${i}`} style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "baseline", borderTop: i === 0 ? "none" : "1px solid var(--border)", background: i % 2 === 1 ? "rgba(15,23,42,0.02)" : undefined, fontSize: 14 }}>
                  <div style={{ padding: pad, color: "var(--muted)", fontSize: 12.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{dateLabel(c.dateISO)}</div>
                  <div style={{ padding: pad }}>
                    {c.description}
                    {linkYear && (
                      <button type="button" onClick={() => onOpenRecon(linkYear)}
                        style={{ marginLeft: 8, padding: 0, border: "none", background: "none", font: "inherit", fontSize: 11.5, fontWeight: 700, color: BRAND, cursor: "pointer", whiteSpace: "nowrap" }}>
                        View {linkYear} reconciliation &rarr;
                      </button>
                    )}
                  </div>
                  <div style={{ padding: pad, fontSize: 12, color: CATEGORY_COLOR[c.category], fontWeight: 700 }}>{CATEGORY_LABEL[c.category]}</div>
                  <div style={{ padding: pad, textAlign: "right", fontVariantNumeric: "tabular-nums", color: c.amount < 0 ? GREEN : "var(--text)", fontWeight: c.amount < 0 ? 700 : 400 }}>{money2(c.amount)}</div>
                </div>
              );
            })}
            <div style={{ display: "grid", gridTemplateColumns: GRID, borderTop: `2px solid ${BRAND}`, background: "rgba(11,74,125,0.06)", fontWeight: 800 }}>
              <div style={{ gridColumn: "1 / 4", padding: pad }}>Total amount due</div>
              <div style={{ padding: pad, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money2(st.summary.totalDue)}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** How to pay — the remittance details staff maintain on the admin page. */
export function HowToPay({ payment, unitRef }: { payment: PaymentInstructions; unitRef: string }) {
  const Row = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 14, padding: "16px 18px", borderTop: "1px solid var(--border)" }}>
      <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: "rgba(11,74,125,0.09)", color: BRAND, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </div>
      <div style={{ minWidth: 0, fontSize: 13.5, lineHeight: 1.55 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{title}</div>
        <div className="muted">{children}</div>
      </div>
    </div>
  );
  return (
    <section style={{ marginTop: 26 }}>
      <SectionLabel>How to pay</SectionLabel>
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--card)", boxShadow: "var(--shadow)" }}>
        <div style={{ background: "rgba(11,74,125,0.09)", padding: "9px 18px", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND }}>
          Reference {unitRef} on every payment
        </div>
        <Row icon={<><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>} title="By check">
          Make checks payable to <strong style={{ color: "var(--text)" }}>{payment.payableTo}</strong> and mail to:
          <div style={{ marginTop: 4, color: "var(--text)" }}>{payment.remitTo.map((l) => <div key={l}>{l}</div>)}</div>
        </Row>
        {payment.achNote && (
          <Row icon={<><path d="M3 21h18" /><path d="M5 21V9l7-5 7 5v12" /><path d="M9 21v-6h6v6" /></>} title="By ACH or wire">{payment.achNote}</Row>
        )}
        {(payment.contactName || payment.contactEmail || payment.contactPhone) && (
          <Row icon={<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></>} title="Questions about a charge">
            {payment.contactName && <>{payment.contactName}</>}
            {payment.contactEmail && <> · <a href={`mailto:${payment.contactEmail}?subject=${encodeURIComponent(`Statement question — ${unitRef}`)}`} style={{ color: BRAND, fontWeight: 600 }}>{payment.contactEmail}</a></>}
            {payment.contactPhone && <> · {payment.contactPhone}</>}
          </Row>
        )}
        {payment.note && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "12px 18px", fontSize: 12.5, fontStyle: "italic", color: "var(--muted)", background: "rgba(15,23,42,0.015)" }}>{payment.note}</div>
        )}
      </div>
    </section>
  );
}

/** Prior months, newest first — the history the tenant can pull a PDF from. */
function History({ items, token, activePeriod, onPick }: { items: MonthlyStatement[]; token: string; activePeriod: string; onPick: (p: string) => void }) {
  if (items.length < 2) return null;
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>Statement history</h2>
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--card)" }}>
        {items.map((s, i) => {
          const active = s.period === activePeriod;
          return (
            <div key={s.period} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? "1px solid var(--border)" : "none", background: active ? "rgba(11,74,125,0.05)" : undefined }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{s.periodLabel}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>
                  {s.charges.length} open {s.charges.length === 1 ? "charge" : "charges"}
                  {s.summary.pastDue ? ` · ${money(s.summary.pastDueAmount)} past due` : ""}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: s.summary.totalDue > 0.005 ? AMBER : GREEN }}>{money2(s.summary.totalDue)}</div>
              {!active && (
                <button type="button" onClick={() => onPick(s.period)} className="btn" style={{ fontSize: 12.5, padding: "7px 12px", fontWeight: 700 }}>View</button>
              )}
              <a href={`/api/portal/${token}/monthly/pdf?period=${s.period}`} aria-label={`Download the ${s.periodLabel} statement`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: BRAND, color: "#fff", textDecoration: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 700 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                PDF
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The whole "Account Balance" view for one selected period. */
export function MonthlyStatementView({ token, statements, payment, reconYears, onOpenRecon }: {
  token: string;
  statements: MonthlyStatement[];
  payment: PaymentInstructions;
  /** Recon years this unit has an annual statement for — a year-end adjustment
   *  line links straight to it rather than leaving the tenant guessing. */
  reconYears: number[];
  onOpenRecon: (year: number) => void;
}) {
  const [period, setPeriod] = useState(statements[0]?.period ?? "");
  const st = statements.find((s) => s.period === period) ?? statements[0];
  if (!st) return null;
  return (
    <>
      {st.underReview && (
        <div style={{ marginBottom: 16, borderRadius: 12, padding: "12px 16px", background: "rgba(180,83,9,0.08)", border: "1px solid rgba(180,83,9,0.35)", color: AMBER, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span>We&rsquo;re reviewing this statement — please contact us before remitting.</span>
        </div>
      )}
      <BalanceCallout st={st} token={token} />
      <AgingStrip st={st} />
      <CategoryTiles st={st} />
      {st.charges.length > 0 && (
        <ChargeTable st={st} hasRecon={(y) => reconYears.includes(y)} onOpenRecon={onOpenRecon} />
      )}
      <HowToPay payment={payment} unitRef={st.unitRef} />
      <History items={statements} token={token} activePeriod={st.period} onPick={setPeriod} />
    </>
  );
}
