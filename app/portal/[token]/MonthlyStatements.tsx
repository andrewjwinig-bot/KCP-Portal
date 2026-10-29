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
  period: string; periodLabel: string; asOf: string | null; asOfLabel: string | null;
  unitRef: string; tenantName: string; suite: string;
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
export function BalanceCallout({ st, token }: { st: MonthlyStatement; token: string }) {
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
          {settled ? "Nothing is currently open on your account." : (
            <>
              This month <strong style={{ color: "var(--text)" }}>{money2(st.summary.currentCharges)}</strong>
              {"  ·  "}
              Prior balance <strong style={{ color: st.summary.priorBalance > 0.005 ? AMBER : "var(--text)" }}>{money2(st.summary.priorBalance)}</strong>
            </>
          )}
        </div>
        {/* The single most important caveat: this lists what's STILL OPEN. A
            tenant who has paid must understand why their rent isn't here,
            rather than assuming we forgot to bill them. */}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          Unpaid charges only{st.asOfLabel ? `, as of ${st.asOfLabel}` : ""}. Anything already paid has come off.
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
function ChargeTable({ st, hasRecon, onOpenRecon, selected, onToggle, onToggleAll }: {
  st: MonthlyStatement; hasRecon: (year: number) => boolean; onOpenRecon: (year: number) => void;
  /** Null when selection is off (a settled statement has nothing to pay). */
  selected: Set<number> | null;
  onToggle: (i: number) => void;
  onToggleAll: (on: boolean) => void;
}) {
  const pickable = selected !== null;
  const allOn = pickable && st.charges.every((_, i) => selected!.has(i));
  const GRID = pickable ? "38px 112px 1fr 150px 118px" : "112px 1fr 150px 118px";
  const pad = "9px 14px";
  return (
    <section style={{ marginTop: 26 }}>
      <SectionLabel>Open charges{st.asOfLabel ? ` — as of ${st.asOfLabel}` : ""}</SectionLabel>
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)", background: "var(--card)" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ minWidth: 520 }}>
            <div style={{ display: "grid", gridTemplateColumns: GRID, background: "rgba(11,74,125,0.09)", borderBottom: "1px solid var(--border)", padding: "9px 0", alignItems: "center" }}>
              {pickable && (
                <div style={{ padding: "0 0 0 14px" }}>
                  <input type="checkbox" checked={allOn} aria-label="Select every charge"
                    onChange={(e) => onToggleAll(e.target.checked)} style={{ cursor: "pointer" }} />
                </div>
              )}
              {["Date", "Charge", "Type", "Amount"].map((h, i) => (
                <div key={h} style={{ padding: "0 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: i === 1 ? BRAND : "var(--muted)", textAlign: i === 3 ? "right" : "left" }}>{h}</div>
              ))}
            </div>
            {st.charges.map((c, i) => {
              const linkYear = c.reconYear && hasRecon(c.reconYear) ? c.reconYear : null;
              const on = !pickable || selected!.has(i);
              return (
                <div key={`${c.dateISO}-${c.description}-${i}`}
                  onClick={pickable ? () => onToggle(i) : undefined}
                  style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "baseline", borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    background: i % 2 === 1 ? "rgba(15,23,42,0.02)" : undefined, fontSize: 14,
                    cursor: pickable ? "pointer" : undefined, opacity: on ? 1 : 0.45 }}>
                  {pickable && (
                    <div style={{ padding: "9px 0 9px 14px" }}>
                      <input type="checkbox" checked={on} onChange={() => onToggle(i)} onClick={(e) => e.stopPropagation()}
                        aria-label={`Pay ${c.description}`} style={{ cursor: "pointer" }} />
                    </div>
                  )}
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
              <div style={{ gridColumn: pickable ? "1 / 5" : "1 / 4", padding: pad }}>Total amount due</div>
              <div style={{ padding: pad, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money2(st.summary.totalDue)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.55 }}>
        This lists charges that are still open{st.asOfLabel ? ` as of ${st.asOfLabel}` : ""} — a charge you&rsquo;ve already
        paid won&rsquo;t appear here. Payments made after that date aren&rsquo;t reflected yet.
      </div>
    </section>
  );
}

/** How to pay — the remittance details staff maintain on the admin page. */
export function HowToPay({ payment, unitRef, reference }: { payment: PaymentInstructions; unitRef: string; reference?: string | null }) {
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
          Reference {reference ? `${unitRef} · ${reference}` : unitRef} on every payment
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


type Remittance = {
  id: string; reference: string; period: string; submittedAt: string;
  method: "check" | "ach" | "other"; amount: number; statementTotal: number;
  paying: { dateISO: string | null; description: string; amount: number }[];
  holding: { dateISO: string | null; description: string; amount: number }[];
  note: string;
  requestId?: string;
  receivedAmount?: number;
};

type AllocationRequest = {
  id: string; period: string; amount: number; paymentRef: string;
  receivedOn: string | null; note: string; askedAt: string | null;
};

const METHOD_LABEL: Record<Remittance["method"], string> = {
  check: "Check", ach: "ACH or wire", other: "Something else",
};

/**
 * "Tell us what you're paying" — the whole point of the selection.
 *
 * A tenant who can only cover part of the balance today picks the charges,
 * sees the total, and tells us. That reaches AR as a remittance advice before
 * the cheque does, which is what stops a payment being applied by guesswork.
 * It is NOT a payment: nothing is charged and nothing is marked paid.
 */
function DeclarePayment({ token, st, selected, total, onDone, request }: {
  token: string; st: MonthlyStatement; selected: Set<number>; total: number; onDone: (r: Remittance) => void;
  /** When set, we already hold this payment and are asking where it goes. */
  request: AllocationRequest | null;
}) {
  const [method, setMethod] = useState<Remittance["method"]>("check");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const full = Math.abs(total - st.summary.totalDue) < 0.011;
  // Allocating a known payment: the target is the amount we hold, not the
  // whole balance, so the tenant is matching to a number they recognise.
  const gap = request ? Math.round((request.amount - total) * 100) / 100 : 0;
  const matched = request ? Math.abs(gap) < 0.011 : false;

  async function submit() {
    if (busy || selected.size === 0) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/portal/${token}/remittance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: st.period, charges: [...selected], method, note, requestId: request?.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not save that.");
      onDone(j.remittance);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that.");
    } finally { setBusy(false); }
  }

  return (
    <section style={{ marginTop: 26 }}>
      <SectionLabel>{request ? "Which charges did your payment cover?" : "Tell us what you\u2019re paying"}</SectionLabel>
      <div style={{ border: `1.5px solid ${BRAND}`, borderRadius: 14, background: "var(--card)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "16px 18px", background: "rgba(11,74,125,0.05)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>
              {request
                ? (matched ? "That accounts for your whole payment" : `Selected ${selected.size} of ${st.charges.length} charges`)
                : full ? "Paying your balance in full" : `Paying ${selected.size} of ${st.charges.length} charges`}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
              {request
                ? matched
                  ? "Confirm and we'll apply it to exactly these charges."
                  : gap > 0
                    ? `That's ${money2(gap)} less than the ${money2(request.amount)} we received — select more, or confirm and we'll hold the rest on account.`
                    : `That's ${money2(-gap)} more than the ${money2(request.amount)} we received — unselect some, or the difference stays open.`
                : full
                  ? "Tick off charges above if you need to pay only part of it."
                  : `Leaving ${money2(st.summary.totalDue - total)} open. Let us know and we'll apply your payment to exactly these charges.`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: "tabular-nums",
              color: request ? (matched ? GREEN : AMBER) : BRAND }}>{money2(total)}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{request ? `of ${money2(request.amount)} received` : "you\u2019re paying"}</div>
          </div>
        </div>
        <div style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
          {!request && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12.5 }}>Sending by</span>
            {(["check", "ach", "other"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999,
                  border: `1px solid ${method === m ? BRAND : "var(--border)"}`,
                  background: method === m ? "rgba(11,74,125,0.08)" : "transparent",
                  color: method === m ? BRAND : "var(--muted)" }}>
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} rows={2}
            placeholder="Anything we should know? (optional)"
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13.5, padding: "9px 11px", fontFamily: "inherit", resize: "vertical", border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg, #fff)", color: "var(--text)" }} />
          {err && <div style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{err}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={submit} disabled={busy || selected.size === 0}
              style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 9, padding: "11px 18px", fontSize: 14, fontWeight: 700,
                cursor: busy || selected.size === 0 ? "default" : "pointer", opacity: busy || selected.size === 0 ? 0.6 : 1, fontFamily: "inherit" }}>
              {busy ? "Sending…" : request ? "Confirm how to apply it" : "Confirm what I'm paying"}
            </button>
            <span className="muted" style={{ fontSize: 12, maxWidth: 420 }}>
              {request
                ? "This only tells us where to apply the payment we already have — you won't be charged again."
                : "This tells us how to apply your payment — it doesn't charge you anything."}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** What the tenant sees after telling us — and the reference to put on the cheque. */
function DeclaredPayment({ r, onRevise }: { r: Remittance; onRevise: () => void }) {
  const full = Math.abs(r.amount - r.statementTotal) < 0.011;
  return (
    <section style={{ marginTop: 26 }}>
      <SectionLabel>What you told us</SectionLabel>
      <div style={{ border: `1.5px solid ${GREEN}`, borderRadius: 14, background: "rgba(21,128,61,0.05)", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: GREEN }}>
              Thanks — we know how to apply this{full ? "" : ` (${r.paying.length} of ${r.paying.length + r.holding.length} charges)`}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {money2(r.amount)} by {METHOD_LABEL[r.method]}, sent {new Date(r.submittedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Write this on your check</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "0.08em", color: GREEN, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{r.reference}</div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(21,128,61,0.25)", padding: "12px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12.5, flex: 1, minWidth: 240 }}>
            Paying something different? Update your selection and tell us again.
          </span>
          <button type="button" onClick={onRevise} className="btn" style={{ fontSize: 12.5, padding: "6px 12px", fontWeight: 700 }}>Change this</button>
        </div>
      </div>
    </section>
  );
}

/** One monthly statement, rendered in full. The chronological index above it
 *  owns which one is showing, so this is a pure presentation of one document. */
export function MonthlyStatementDetail({ token, st, payment, reconYears, onOpenRecon }: {
  token: string;
  st: MonthlyStatement;
  payment: PaymentInstructions;
  /** Recon years this unit has an annual statement for — a year-end adjustment
   *  line links straight to it rather than leaving the tenant guessing. */
  reconYears: number[];
  onOpenRecon: (year: number) => void;
}) {
  // Everything starts selected: paying in full is what we want, and the
  // checkboxes exist for the tenant who genuinely can't.
  const allIdx = () => new Set(st.charges.map((_, i) => i));
  const [selected, setSelected] = useState<Set<number>>(allIdx);
  const [declared, setDeclared] = useState<Remittance | null>(null);
  const [request, setRequest] = useState<AllocationRequest | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Reset when the tenant switches months, and pull back anything they've
  // already told us about THIS month.
  useEffect(() => {
    setSelected(allIdx());
    setDeclared(null);
    setRequest(null);
    let alive = true;
    fetch(`/api/portal/${token}/remittance`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        setDeclared((j?.remittances ?? []).find((r: Remittance) => r.period === st.period) ?? null);
        // A payment we already hold outranks anything they might declare —
        // start them from nothing selected so they build up to its amount.
        const open = (j?.requests ?? []).find((r: AllocationRequest) => r.period === st.period) ?? null;
        setRequest(open);
        if (open) setSelected(new Set());
        setLoadedFor(st.period);
      })
      .catch(() => { if (alive) setLoadedFor(st.period); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, st.period]);

  const total = Math.round(st.charges.reduce((a, c, i) => (selected.has(i) ? a + c.amount : a), 0) * 100) / 100;
  // Nothing to select on a settled or credit statement.
  const payable = st.summary.totalDue > 0.005 && st.charges.length > 0;
  const toggle = (i: number) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <>
      {request && !declared && (
        <div style={{ marginBottom: 18, borderRadius: 12, padding: "14px 17px", background: "rgba(11,74,125,0.06)", border: `1.5px solid ${BRAND}` }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: BRAND }}>
            We received your payment of {money2(request.amount)}{request.paymentRef ? ` (${request.paymentRef})` : ""} — thank you.
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 5, lineHeight: 1.55 }}>
            It didn&rsquo;t say which charges it covers, and we&rsquo;d rather apply it where you intended than guess.
            Tick the charges below that this payment should pay.
          </div>
          {request.note && <div className="muted" style={{ fontSize: 12.5, marginTop: 6, fontStyle: "italic" }}>{request.note}</div>}
        </div>
      )}
      {st.underReview && (
        <div style={{ marginBottom: 16, borderRadius: 12, padding: "12px 16px", background: "rgba(180,83,9,0.08)", border: "1px solid rgba(180,83,9,0.35)", color: AMBER, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span>We&rsquo;re reviewing this statement — please contact us before remitting.</span>
        </div>
      )}
      <AgingStrip st={st} />
      <CategoryTiles st={st} />
      {st.charges.length > 0 && (
        <ChargeTable st={st} hasRecon={(y) => reconYears.includes(y)} onOpenRecon={onOpenRecon}
          selected={payable && !declared ? selected : null}
          onToggle={toggle}
          onToggleAll={(on) => setSelected(on ? allIdx() : new Set())} />
      )}
      {payable && loadedFor === st.period && (
        declared
          ? <DeclaredPayment r={declared} onRevise={() => setDeclared(null)} />
          : <DeclarePayment token={token} st={st} selected={selected} total={total} request={request}
              onDone={(r) => { setDeclared(r); setRequest(null); }} />
      )}
      <HowToPay payment={payment} unitRef={st.unitRef} reference={declared?.reference ?? null} />
    </>
  );
}
