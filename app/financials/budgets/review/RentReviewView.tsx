"use client";

// The Rent Roll Review itself — shared by the signed-in page and the emailed
// link (`/budget-review/[token]`), which differ only in WHERE the data comes
// from (`ReviewApi`), so the two can never drift.
//
// One card, one table (the portal's roster shape): a row per property with its
// leasing calls and sign-off, expanding in place into that property's Revenue
// by tenant table — DECIDE pill on every expiring lease and vacancy — then
// "Rent & assumptions look good", disabled until every call is made.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Pill, StatPill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL, contributorTone } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import type { BudgetDraft } from "@/lib/financials/budgets/draft";
import { RevenueByTenantCard } from "../draft/RevenueByTenantCard";
import type { LeasingCall, SavePayload } from "../draft/LeasingDecision";

export type ReviewPropertyRow = {
  key: string; code: string; name: string;
  total: number; done: number; latest: string | null;
  review: { by: string; at: string } | null;
};
export type ReviewOverviewData = {
  group: "SC" | "BP"; title: string; year: number;
  person: { id: string; label: string };
  properties: ReviewPropertyRow[];
};
/** Where the page reads and writes. Each returns an error message, or null. */
export type ReviewApi = {
  overview: () => Promise<ReviewOverviewData | { error: string }>;
  draft: (key: string) => Promise<BudgetDraft | null>;
  save: (propertyCode: string, payload: SavePayload) => Promise<string | null>;
  confirm: (propertyCode: string, confirmed: boolean) => Promise<string | null>;
};

const stampOf = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function leasingCalls(leasing: NonNullable<BudgetDraft["leasing"]>): LeasingCall[] {
  return [
    ...leasing.expiring.map((e) => ({ unitRef: e.unitRef, mode: "inplace" as const, title: e.tenant, sqft: e.sqft, currentRent: e.monthlyRent, leaseTo: e.leaseTo, assumption: e.assumption })),
    ...leasing.vacant.map((v) => ({ unitRef: v.unitRef, mode: "vacant" as const, title: "Vacant", sqft: v.sqft, currentRent: 0, leaseTo: null, assumption: v.assumption })),
  ];
}

export function RentReviewView({ api, headerExtra }: { api: ReviewApi; headerExtra?: React.ReactNode }) {
  const [data, setData] = useState<ReviewOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.overview().then((j) => {
      if ("error" in j) { setError(j.error); return; }
      setData(j);
    }).catch(() => setError("Couldn't load the review."));
  }, [api]);
  useEffect(() => { refresh(); }, [refresh]);

  if (error && !data) return <div className="card" style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div>;
  if (!data) return <div className="card muted">Loading the rent rolls…</div>;

  const owner = { id: data.person.id, label: data.person.label.charAt(0) + data.person.label.slice(1).toLowerCase() };
  const tone = contributorTone(owner.id);
  const list = data.properties;
  const current = (p: ReviewPropertyRow) => !!p.review && !(p.latest && p.latest > p.review.at);
  const confirmed = list.filter(current).length;
  const totalCalls = list.reduce((a, p) => a + p.total, 0);
  const doneCalls = list.reduce((a, p) => a + p.done, 0);

  async function confirm(code: string, c: boolean) {
    setError(null);
    const err = await api.confirm(code, c);
    if (err) setError(err);
    refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0 }}>{data.year} Rent roll review — {data.title}</h1>
            <Pill tone={tone}>{data.person.label}&rsquo;S SIGN-OFF</Pill>
          </div>
          <p className="muted small" style={{ margin: "6px 0 0", maxWidth: 860 }}>
            For each property: check its {data.year} rent, click <b>DECIDE</b> on every expiring lease and vacancy to make the call (renew, hold, vacate, lease up — with rent, term, TI and commission), then confirm the rent and assumptions look good. Everything saves as you go, straight into the {data.year} budget.
          </p>
        </div>
        {headerExtra}
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
            {list.length === 0 && <tr><td colSpan={4} className="muted small" style={{ ...tdL, padding: 16 }}>No properties to review.</td></tr>}
            {list.map((p) => {
              const isOpen = open === p.key;
              const changed = !!p.review && !current(p);
              return (
                <Fragment key={p.key}>
                  <tr onClick={() => setOpen(isOpen ? null : p.key)} style={{ cursor: "pointer", background: isOpen ? "rgba(11,74,125,0.06)" : undefined }}>
                    <td style={{ ...tdL, fontWeight: 700 }}>
                      <span className="muted" style={{ marginRight: 6 }}>{isOpen ? "▾" : "▸"}</span>
                      {p.name} <code style={{ fontSize: 12, fontWeight: 700, color: "#0b4a7d", marginLeft: 6 }}>{p.code}</code>
                    </td>
                    <td style={td}>
                      {p.total === 0 ? <span className="muted">None needed</span>
                        : <Pill tone={p.done === p.total ? TONE_GREEN : TONE_AMBER}>{p.done} OF {p.total} DECIDED</Pill>}
                    </td>
                    <td style={tdL}>
                      {current(p) ? <Pill tone={TONE_GREEN}>✓ CONFIRMED BY {p.review!.by} · {stampOf(p.review!.at).toUpperCase()}</Pill>
                        : changed ? <Pill tone={TONE_AMBER}>CHANGED SINCE CONFIRMED</Pill>
                        : <Pill tone={TONE_NEUTRAL}>NOT CONFIRMED</Pill>}
                    </td>
                    <td style={{ ...td, color: "var(--brand)", fontWeight: 700 }}>{isOpen ? "Close" : "Review →"}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={4} style={{ padding: 0, maxWidth: 0, borderBottom: "2px solid var(--border)" }}>
                        <PropertyReview api={api} row={p} year={data.year} owner={owner} confirmed={current(p)} changed={changed}
                          onChanged={refresh} onConfirm={(c) => confirm(p.code, c)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PropertyReview({ api, row, year, owner, confirmed, changed, onChanged, onConfirm }: {
  api: ReviewApi; row: ReviewPropertyRow; year: number; owner: { id: string; label: string };
  confirmed: boolean; changed: boolean;
  onChanged: () => void;
  onConfirm: (confirmed: boolean) => void;
}) {
  const [draft, setDraft] = useState<BudgetDraft | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.draft(row.key).then((d) => { if (alive) setDraft(d); }).catch(() => { if (alive) setDraft(null); });
    return () => { alive = false; };
  }, [api, row.key, tick]);

  // Saves run one at a time — the store rewrites a property's whole set of
  // decisions per save (the same queue the budget page uses).
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const save = (payload: SavePayload) => {
    chain.current = chain.current.then(async () => {
      setSaveError(null);
      const err = await api.save(row.code, payload);
      if (err) { setSaveError(err); return; }
      setTick((n) => n + 1);
      onChanged();
    }).catch(() => {});
    return chain.current;
  };

  if (draft === undefined) return <div className="muted small" style={{ padding: 16 }}>Loading the {year} rent…</div>;
  if (!draft?.leasing) return <div className="muted small" style={{ padding: 16 }}>No rent roll for this property.</div>;
  const calls = leasingCalls(draft.leasing);
  const openCalls = calls.filter((c) => !c.assumption).length;

  return (
    <div>
      <RevenueByTenantCard embedded rows={draft.tenantRevenue ?? []} year={draft.budgetYear} fromSchedule={draft.leasing.fromSchedule}
        est={draft.reimbursementEstimate} tie={draft.recoveryTie ?? []} rentLine={draft.rentLineLabel}
        leasing={{ calls, owner, dealCapital: draft.leasing.dealCapital, onSave: save, error: saveError }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", borderTop: "1px solid var(--border)", background: "rgba(15,23,42,0.025)" }}>
        {confirmed ? (
          <>
            <Pill tone={TONE_GREEN}>✓ CONFIRMED BY {row.review!.by} · {stampOf(row.review!.at).toUpperCase()}</Pill>
            <button type="button" className="btn" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => onConfirm(false)}>Undo</button>
          </>
        ) : openCalls > 0 ? (
          <>
            <button type="button" className="btn" disabled style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700 }}>Rent &amp; assumptions look good</button>
            <span className="muted small">Make the {openCalls} open leasing call{openCalls === 1 ? "" : "s"} first — use <b>To decide</b> above.</span>
          </>
        ) : (
          <>
            <button type="button" className="btn primary" style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700 }} onClick={() => onConfirm(true)}>
              ✓ Rent &amp; assumptions look good
            </button>
            <span className="muted small">{changed ? "A decision changed since this was confirmed — confirm again." : `Confirms this property's ${draft.budgetYear} rent and leasing calls for the budget.`}</span>
          </>
        )}
      </div>
    </div>
  );
}
