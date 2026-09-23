"use client";

// Rent roll review — the page the leasing owner is sent: Harry for every
// shopping centre, Nancy for every business park. One property at a time they
// check next year's rent (Revenue by tenant — every suite, month by month),
// make the leasing call on each expiring lease and vacancy from the row's
// DECIDE pill, and CONFIRM that the property's rent and assumptions look good.
// Every decision is saved straight into the budget draft; the confirmation
// shows there too, beside the property's revenue table.
//
// One card, one table (the portal's roster shape): a row per property with its
// progress and sign-off, expanding in place into that property's table.

import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pill, StatPill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL, contributorTone } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { useUser } from "@/app/components/UserProvider";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { BudgetDraft } from "@/lib/financials/budgets/draft";
import type { RentReviews } from "@/lib/financials/budgets/rentReviewStore";
import { RevenueByTenantCard } from "../draft/RevenueByTenantCard";
import type { LeasingCall, SavePayload } from "../draft/LeasingDecision";

type Group = "SC" | "BP";
const GROUP: Record<Group, { title: string; category: string; owner: string }> = {
  SC: { title: "Shopping centers", category: "Shopping Centers", owner: "harry" },
  BP: { title: "Business parks", category: "Office", owner: "nancy" },
};
type PropRow = { key: string; propertyCode: string; entityName: string };
type Contribution = { kind: string; propertyCode: string; filledAt: string | null };

const stampOf = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function leasingCalls(leasing: NonNullable<BudgetDraft["leasing"]>): LeasingCall[] {
  return [
    ...leasing.expiring.map((e) => ({ unitRef: e.unitRef, mode: "inplace" as const, title: e.tenant, sqft: e.sqft, currentRent: e.monthlyRent, leaseTo: e.leaseTo, assumption: e.assumption })),
    ...leasing.vacant.map((v) => ({ unitRef: v.unitRef, mode: "vacant" as const, title: "Vacant", sqft: v.sqft, currentRent: 0, leaseTo: null, assumption: v.assumption })),
  ];
}

export default function RentReviewPage() {
  return <Suspense fallback={null}><RentReview /></Suspense>;
}

function RentReview() {
  const params = useSearchParams();
  const { user } = useUser();
  const group: Group = params.get("group") === "BP" ? "BP" : params.get("group") === "SC" ? "SC" : user.id === "nancy" ? "BP" : "SC";
  const year = Number(params.get("year")) || new Date().getFullYear() + 1;
  const g = GROUP[group];
  const owner = { id: g.owner, label: g.owner.charAt(0).toUpperCase() + g.owner.slice(1) };
  const tone = contributorTone(owner.id);

  const [props, setProps] = useState<PropRow[] | null>(null);
  const [calls, setCalls] = useState<Contribution[]>([]);
  const [reviews, setReviews] = useState<RentReviews>({});
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The group's buildings that have a statement to budget from, in code order.
  useEffect(() => {
    const codes = new Set(PROPERTY_DEFS.filter((d) => d.allocGroup === group).map((d) => d.id));
    fetch("/api/financials/budgets/draft", { cache: "no-store" }).then((r) => r.json())
      .then((j) => setProps(((j.properties ?? []) as PropRow[]).filter((p) => codes.has(p.propertyCode)).sort((a, b) => a.propertyCode.localeCompare(b.propertyCode))))
      .catch(() => setProps([]));
  }, [group]);

  // Progress per property (the rail's own list) and the sign-offs.
  const refreshStatus = useCallback(() => {
    fetch(`/api/financials/budgets/progress?year=${year}&category=${encodeURIComponent(g.category)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => setCalls(((j.contributions ?? []) as Contribution[]).filter((c) => c.kind === "vacancy" || c.kind === "renewal")))
      .catch(() => {});
    fetch(`/api/financials/budgets/rent-review?year=${year}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => setReviews(j.reviews ?? {})).catch(() => {});
  }, [year, g.category]);
  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  async function confirm(code: string, confirmed: boolean) {
    setError(null);
    const r = await fetch("/api/financials/budgets/rent-review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, propertyCode: code, confirmed }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setError(j?.error ?? "Couldn't save the sign-off."); return; }
    setReviews(j.reviews ?? {});
  }

  const statusOf = (code: string) => {
    const mine = calls.filter((c) => c.propertyCode === code);
    const done = mine.filter((c) => c.filledAt).length;
    const latest = mine.reduce((m, c) => (c.filledAt && c.filledAt > m ? c.filledAt : m), "");
    const rv = reviews[code];
    return { total: mine.length, done, review: rv, changed: !!rv && latest > rv.at };
  };
  const list = props ?? [];
  const confirmed = list.filter((p) => { const s = statusOf(p.propertyCode); return s.review && !s.changed; }).length;
  const totalCalls = calls.filter((c) => list.some((p) => p.propertyCode === c.propertyCode)).length;
  const doneCalls = calls.filter((c) => c.filledAt && list.some((p) => p.propertyCode === c.propertyCode)).length;

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1360, width: "100%" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>{year} Rent roll review — {g.title}</h1>
          <Pill tone={tone}>{owner.label.toUpperCase()}&rsquo;S SIGN-OFF</Pill>
        </div>
        <p className="muted small" style={{ margin: "6px 0 0", maxWidth: 860 }}>
          For each property: check its {year} rent, click <b>DECIDE</b> on every expiring lease and vacancy to make the call (renew, hold, vacate, lease up — with rent, term, TI and commission), then confirm the rent and assumptions look good. Everything saves as you go, straight into the {year} budget.
        </p>
      </div>

      <div className="pills">
        <StatPill label="Properties confirmed" value={`${confirmed} / ${list.length}`} accent={list.length && confirmed === list.length ? "#15803d" : "#b45309"} />
        <StatPill label="Leasing calls made" value={`${doneCalls} / ${totalCalls}`} accent={totalCalls && doneCalls === totalCalls ? "#15803d" : undefined} />
      </div>

      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thL}>Property</th>
              <th style={th}>Leasing calls</th>
              <th style={thL}>Sign-off</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {props == null && <tr><td colSpan={4} className="muted small" style={{ ...tdL, padding: 16 }}>Loading…</td></tr>}
            {props != null && list.length === 0 && <tr><td colSpan={4} className="muted small" style={{ ...tdL, padding: 16 }}>No properties to review.</td></tr>}
            {list.map((p) => {
              const s = statusOf(p.propertyCode);
              const isOpen = open === p.key;
              return (
                <Fragment key={p.key}>
                  <tr onClick={() => setOpen(isOpen ? null : p.key)} style={{ cursor: "pointer", background: isOpen ? "rgba(11,74,125,0.06)" : undefined }}>
                    <td style={{ ...tdL, fontWeight: 700 }}>
                      <span className="muted" style={{ marginRight: 6 }}>{isOpen ? "▾" : "▸"}</span>
                      <code style={{ fontSize: 12, marginRight: 8 }}>{p.propertyCode}</code>{PROPERTY_DEFS.find((d) => d.id === p.propertyCode)?.name ?? p.entityName}
                    </td>
                    <td style={td}>
                      {s.total === 0 ? <span className="muted">None needed</span>
                        : <Pill tone={s.done === s.total ? TONE_GREEN : TONE_AMBER}>{s.done} OF {s.total} DECIDED</Pill>}
                    </td>
                    <td style={tdL}>
                      {s.review && !s.changed ? <Pill tone={TONE_GREEN}>✓ CONFIRMED BY {s.review.by} · {stampOf(s.review.at).toUpperCase()}</Pill>
                        : s.changed ? <Pill tone={TONE_AMBER}>CHANGED SINCE CONFIRMED</Pill>
                        : <Pill tone={TONE_NEUTRAL}>NOT CONFIRMED</Pill>}
                    </td>
                    <td style={{ ...td, color: "var(--brand)", fontWeight: 700 }}>{isOpen ? "Close" : "Review →"}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={4} style={{ padding: 0, maxWidth: 0, borderBottom: "2px solid var(--border)" }}>
                        <PropertyReview propKey={p.key} year={year} owner={owner} status={s}
                          onChanged={refreshStatus} onConfirm={(c) => confirm(p.propertyCode, c)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

/** One property, opened: its Revenue by tenant table with the leasing calls,
 *  and the sign-off beneath it. */
function PropertyReview({ propKey, year, owner, status, onChanged, onConfirm }: {
  propKey: string; year: number; owner: { id: string; label: string };
  status: { total: number; done: number; review?: { by: string; at: string }; changed: boolean };
  onChanged: () => void;
  onConfirm: (confirmed: boolean) => void;
}) {
  const [draft, setDraft] = useState<BudgetDraft | null>(null);
  const [tick, setTick] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/financials/budgets/draft?key=${encodeURIComponent(propKey)}&year=${year}&growth=3`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (alive) setDraft(j.missingBasis ? null : j); }).catch(() => {});
    return () => { alive = false; };
  }, [propKey, year, tick]);

  // Saves run one at a time — the store rewrites a property's whole set of
  // decisions per save (the same queue the budget page uses).
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const save = (payload: SavePayload) => {
    chain.current = chain.current.then(async () => {
      if (!draft?.leasing) return;
      setSaveError(null);
      const r = await fetch("/api/financials/budgets/leasing-assumptions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, propertyCode: draft.leasing.propertyCode, ...payload }),
      }).catch(() => null);
      if (!r || !r.ok) {
        const j = r ? await r.json().catch(() => ({})) : {};
        setSaveError(j?.error ?? "Couldn't save that decision.");
        return;
      }
      setTick((n) => n + 1);
      onChanged();
    }).catch(() => {});
    return chain.current;
  };

  if (!draft) return <div className="muted small" style={{ padding: 16 }}>Loading the {year} rent…</div>;
  if (!draft.leasing) return <div className="muted small" style={{ padding: 16 }}>No rent roll for this property.</div>;
  const calls = leasingCalls(draft.leasing);
  const open = calls.filter((c) => !c.assumption).length;
  const confirmed = !!status.review && !status.changed;

  return (
    <div>
      <RevenueByTenantCard embedded rows={draft.tenantRevenue ?? []} year={draft.budgetYear} fromSchedule={draft.leasing.fromSchedule}
        est={draft.reimbursementEstimate} tie={draft.recoveryTie ?? []} rentLine={draft.rentLineLabel}
        leasing={{ calls, owner, dealCapital: draft.leasing.dealCapital, onSave: save, error: saveError }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", borderTop: "1px solid var(--border)", background: "rgba(15,23,42,0.025)" }}>
        {confirmed ? (
          <>
            <Pill tone={TONE_GREEN}>✓ CONFIRMED BY {status.review!.by} · {stampOf(status.review!.at).toUpperCase()}</Pill>
            <button type="button" className="btn" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => onConfirm(false)}>Undo</button>
          </>
        ) : open > 0 ? (
          <>
            <button type="button" className="btn" disabled style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700 }}>Rent &amp; assumptions look good</button>
            <span className="muted small">Make the {open} open leasing call{open === 1 ? "" : "s"} first — use <b>To decide</b> above.</span>
          </>
        ) : (
          <>
            <button type="button" className="btn primary" style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700 }} onClick={() => onConfirm(true)}>
              ✓ Rent &amp; assumptions look good
            </button>
            <span className="muted small">{status.changed ? "A decision changed since you confirmed — confirm again." : `Confirms this property's ${draft.budgetYear} rent and leasing calls for the budget.`}</span>
          </>
        )}
      </div>
    </div>
  );
}
