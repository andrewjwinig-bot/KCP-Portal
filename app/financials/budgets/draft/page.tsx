"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StatPill, Pill, TONE_BLUE, TONE_NEUTRAL, TONE_GREEN, TONE_TEAL, TONE_RED, type PillTone } from "../../../components/Pill";
import { BudgetStatementTable, growthOnNothing } from "./BudgetStatementTable";
import { RevenueByTenantCard } from "./RevenueByTenantCard";
import { STEP_LABEL, SUB_LABEL } from "./stepStyles";
import { BudgetKpis } from "./BudgetKpis";
import LoadingState from "@/app/components/LoadingState";
import { scaleToTotal } from "@/lib/financials/budgets/lineOverrides";
import type { BudgetDraft, BudgetDraftSection, DraftSource } from "../../../../lib/financials/budgets/draft";
import { SELECT_BRAND } from "@/app/components/YearSelect";
import { InPlaceRevenueCard } from "./InPlaceRevenueCard";
import { BookMasthead } from "./BookMasthead";
import { PropertyBreakdownModal } from "./PropertyBreakdownModal";
import { useUser } from "@/app/components/UserProvider";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { bookById, bookForProperty } from "@/lib/financials/budgets/books";
import { LineHistoryModal } from "./LineHistoryModal";
import { scopeAllowsLine } from "@/lib/financials/budgets/contributors";
import { NoteDialog } from "./LineNote";
import { PayrollPoolsCard } from "./PayrollPoolsCard";

import type { LeasingCall, SavePayload } from "./LeasingDecision";

// Every expense line carries its own basis (entered, tax +3%, a lease, the
// recovery estimate); what is left grows by this. Not a knob on the page — a
// per-line figure is where a line gets argued, not a master percentage.
const GROWTH = 3;

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

function sourceBadge(source: DraftSource, growthPct: number, feePct?: number): { tone: PillTone; text: string } {
  switch (source) {
    case "reproj-growth": return { tone: TONE_BLUE, text: `${growthPct >= 0 ? "+" : ""}${growthPct}%` };
    case "reproj-flat": return { tone: TONE_NEUTRAL, text: "Flat" };
    case "leases": return { tone: TONE_GREEN, text: "Leases" };
    case "cam-estimate": return { tone: TONE_TEAL, text: "Recoveries" };
    case "ret-default": return { tone: TONE_BLUE, text: "Tax +3%" };
    case "entered": return { tone: TONE_GREEN, text: "Entered" };
    case "loans": return { tone: TONE_TEAL, text: "Loans" };
    case "items": return { tone: TONE_BLUE, text: "Items" };
    case "pool": return { tone: TONE_TEAL, text: "Payroll" };
    case "fee-rollup": return { tone: TONE_TEAL, text: "Buildings' fees" };
    case "fee": return { tone: TONE_TEAL, text: `${feePct ?? "–"}% of revenue` };
  }
}

type PropRow = { key: string; propertyCode: string; entityName: string };

export default function BudgetDraftPage() {
  // Budget season builds NEXT year's budget (2027 in 2026), seeded from this
  // year's forecast — actuals so far, budget for the rest. The owner's call.
  const thisYear = new Date().getFullYear();
  const [props, setProps] = useState<PropRow[]>([]);
  const [key, setKey] = useState<string>("");
  const [year, setYear] = useState(thisYear + 1);
  const [draft, setDraft] = useState<BudgetDraft | null>(null);
  // The line open in the note dialog.
  const [noteLine, setNoteLine] = useState<{ section: string; label: string } | null>(null);
  // A roll-up line's split by property (the book's "All …" view).
  const [breakdown, setBreakdown] = useState<{ label: string; section: string; rows: { code: string; name: string; total: number }[] } | null>(null);
  const [missingBasis, setMissingBasis] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/financials/budgets/draft", { cache: "no-store" })
      .then((r) => r.json()).then((j) => {
        const list: PropRow[] = j.properties ?? [];
        setProps(list);
        // Land on the first property of the book that is open, not simply the
        // first on file — Nancy opens on a park, not a shopping centre.
        const inBook = (bookById(bookId)?.properties ?? []).map((c) => list.find((p) => p.propertyCode === c)).find(Boolean);
        const first = inBook ?? list[0];
        if (first) setKey(first.key);
      }).catch(() => {});
  }, []);

  const [refreshTick, setRefreshTick] = useState(0);
  // The line whose history is open. Clicking a line is how you argue its
  // number from its own five years rather than from last year plus a percent.
  const [histLine, setHistLine] = useState<{ label: string; mask: string; sign: 1 | -1; section: string; locked?: boolean; forecast?: number; budget?: number; months?: number[]; poolKeys?: string[] } | null>(null);
  // Which BOOK is open. A property's budget is a sheet inside its book, so the
  // book leads and the property follows — picking a property inside a book
  // never changes which book you are in.
  // Each person opens on their own book — Nancy's parks, everyone else the
  // shopping centres — and can switch.
  const { user } = useUser();
  const [bookId, setBookId] = useState<string>(user.budgetScope?.codes.has("3610") ? "jv3" : "shopping-centers");
  const book = bookById(bookId) ?? bookById("shopping-centers")!;
  // The progress + rent-schedule category the book belongs to (the leasing
  // owner splits the same way: shopping centres → Harry, parks → Nancy).
  const category = bookId === "shopping-centers" ? "Shopping Centers" : bookId === "jv3" || bookId === "ni-llc" ? "Office" : book.name;

  // Typing a month re-projects the draft, and several can be in flight at once
  // as someone Tabs along a row: only the LATEST request may land, or an older
  // answer would overwrite the newer figure on screen.
  const reqSeq = useRef(0);
  const shownFor = useRef("");
  useEffect(() => {
    if (!key) return;
    const seq = ++reqSeq.current;
    const target = `${key}|${year}`;
    // A different property or year clears the grid; a refresh of the same one
    // keeps it on screen, so typing into a cell does not blank the page.
    if (shownFor.current !== target) setDraft(null);
    setLoading(true);
    const t = setTimeout(() => {
      // Wait for any save still in flight: a reload read before it lands
      // would put the old figure back on screen over the one just typed.
      const url = key.startsWith("book:")
        ? `/api/financials/budgets/draft?book=${encodeURIComponent(key.slice(5))}&year=${year}&growth=${GROWTH}`
        : `/api/financials/budgets/draft?key=${encodeURIComponent(key)}&year=${year}&growth=${GROWTH}`;
      writeQ.current.then(() => fetch(url, { cache: "no-store" }))
        .then((r) => r.json())
        .then((j) => {
          if (seq !== reqSeq.current) return;
          shownFor.current = target;
          if (j.missingBasis) { setDraft(null); setMissingBasis(true); } else { setDraft(j); setMissingBasis(false); }
        })
        .catch(() => { if (seq === reqSeq.current) { setDraft(null); setMissingBasis(false); } })
        .finally(() => { if (seq === reqSeq.current) setLoading(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [key, year, refreshTick]);

  // The history's suggestion, applied: the line set to that annual TOTAL with
  // its month-by-month shape kept (each month scaled by the same factor). A
  // line budgeted through sub-lines scales every sub-line alike; a Budget
  // Inputs line is keyed there, so it takes no suggestion here.
  // EVERY WRITE GOES OUT ONE AT A TIME, IN ORDER. The stores rewrite a
  // property's whole document per save, so two saves in flight at once — a
  // Tab across three months fires three — each read the document before the
  // other wrote it, and the last to land erased the rest: typed months that
  // were there until the page was refreshed.
  const writeQ = useRef<Promise<unknown>>(Promise.resolve());
  const queued = <T,>(fn: () => Promise<T>): Promise<T> => {
    const p = writeQ.current.then(fn, fn);
    writeQ.current = p.catch(() => {});
    return p;
  };

  async function applySuggestion(section: string, label: string, amount: number) {
    const sec = draft?.sections.find((x) => x.name === section);
    const line = sec?.lines.find((l) => l.label === label);
    if (!draft || !sec || !line || line.inputKind) return;
    const post = (months: number[], account?: string) => queued(() => fetch("/api/financials/budgets/line-overrides", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: draft.budgetYear, propertyCode: draft.propertyCode, section, label, account, months }),
    }));
    setEditError(null);
    const subs = line.subLines?.filter((x) => x.typeable) ?? [];
    const results = subs.length
      ? await Promise.all(subs.map((x) => post(scaleToTotal(x.months, line.total ? (x.total / line.total) * amount : amount / subs.length), x.account)))
      : [await post(scaleToTotal(line.months, amount))];
    if (results.some((r) => !r.ok)) setEditError("Couldn't apply the suggestion.");
    setRefreshTick((n) => n + 1);
  }

  // Type one month (or spread an annual, or clear the line). The cell shows the
  // figure at once; the re-projected draft — subtotals, NOI, recoveries on a
  // CAM line — follows from the server.
  const [editError, setEditError] = useState<string | null>(null);
  // Save (or, with "", remove) a line's note; the draft's notes update in place.
  async function saveNote(section: string, label: string, text: string): Promise<string | null> {
    if (!draft) return "No draft loaded.";
    const r = await fetch("/api/financials/budgets/line-notes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: draft.budgetYear, propertyCode: draft.propertyCode, section, label, text }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) return j?.error ?? "Couldn't save the note.";
    setDraft((d) => d && ({ ...d, notes: j.notes ?? {} }));
    return null;
  }

  async function editLine(sec: BudgetDraftSection, line: BudgetDraftSection["lines"][number], month: number | "all" | "accept", value: number | null, account?: string) {
    if (!draft) return;
    setEditError(null);
    // A BUCKETED line (maintenance, insurance, cleaning): its base bucket IS
    // the line's own figure, so it saves exactly as the line did — to Budget
    // Inputs for insurance / building maintenance, else as the line's typed
    // months. Every other bucket saves as a typed sub-line and adds on.
    const baseOf = (l: BudgetDraftSection["lines"][number]) => l.subLines?.find((x) => x.bucket === "base");
    const baseBucket = account ? line.subLines?.find((x) => x.account === account && x.bucket === "base") : undefined;
    const saveAccount = baseBucket ? undefined : account;
    // TAXES, INSURANCE AND BUILDING MAINTENANCE are keyed into the Budget
    // Inputs store — the same figures Greg keys on his page — never into the
    // grid's typed months. A kind can sit on more than one line, so the save is
    // the KIND's months: every line carrying it, with this edit applied.
    if (line.inputKind && (!account || baseBucket)) {
      const kind = line.inputKind;
      // The kind's figure is each line's BASE — a bucketed line's extras
      // (a Big Project, a Liability policy) are its own typed months.
      const monthsOf = (l: BudgetDraftSection["lines"][number]) => baseOf(l)?.months ?? l.months;
      const totalOf = (l: BudgetDraftSection["lines"][number]) => baseOf(l)?.total ?? l.total;
      const lines = draft.sections.flatMap((x) => x.lines.filter((l) => l.inputKind === kind));
      const kindMonths = new Array(12).fill(0);
      for (const l of lines) monthsOf(l).forEach((v, i) => { kindMonths[i] += v || 0; });
      let body: Record<string, unknown>;
      if (month === "accept") body = { months: kindMonths };
      else if (month === "all" && value == null) body = { clear: true };
      else if (month === "all") body = { annual: Math.round(value! + lines.filter((l) => l.label !== line.label).reduce((a, l) => a + totalOf(l), 0)) };
      else {
        kindMonths[month] += Math.round(value ?? 0) - (monthsOf(line)[month] || 0);
        body = { months: kindMonths.map((v) => Math.max(0, Math.round(v))) };
        if (!baseBucket) setDraft((d) => d && ({
          ...d,
          sections: d.sections.map((x) => x.name !== sec.name ? x : {
            ...x,
            lines: x.lines.map((l) => {
              if (l.label !== line.label) return l;
              const months = l.months.slice(); months[month] = Math.round(value ?? 0);
              return { ...l, months, total: months.reduce((a, b) => a + b, 0) };
            }),
          }),
        }));
      }
      const r = await queued(() => fetch("/api/budget-inputs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: draft.budgetYear, propertyCode: draft.propertyCode, kind, ...body }),
      })).catch(() => null);
      if (!r || !r.ok) {
        const j = r ? await r.json().catch(() => ({})) : {};
        setEditError(j?.error ?? "Couldn't save that figure.");
      }
      setRefreshTick((n) => n + 1);
      return;
    }
    if (month === "accept") return;
    if (typeof month === "number" && value != null && account) {
      // A sub-line: set its month, and the line (their sum) moves with it.
      setDraft((d) => d && ({
        ...d,
        sections: d.sections.map((s) => s.name !== sec.name ? s : {
          ...s,
          lines: s.lines.map((l) => {
            if (l.label !== line.label || !l.subLines) return l;
            const subLines = l.subLines.map((x) => {
              if (x.account !== account) return x;
              const months = x.months.slice(); months[month] = Math.round(value);
              const typed = (x.typed ?? new Array(12).fill(false)).slice(); typed[month] = true;
              return { ...x, months, typed, total: months.reduce((a, b) => a + b, 0) };
            });
            const months = l.months.map((_, i) => subLines.reduce((a, x) => a + x.months[i], 0));
            return { ...l, subLines, months, total: months.reduce((a, b) => a + b, 0) };
          }),
        }),
      }));
    } else if (typeof month === "number" && value != null) {
      setDraft((d) => d && ({
        ...d,
        sections: d.sections.map((s) => s.name !== sec.name ? s : {
          ...s,
          lines: s.lines.map((l) => {
            if (l.label !== line.label) return l;
            const months = l.months.slice(); months[month] = Math.round(value);
            const typed = (l.typed ?? new Array(12).fill(false)).slice(); typed[month] = true;
            return { ...l, months, typed, total: months.reduce((a, b) => a + b, 0) };
          }),
        }),
      }));
    }
    const r = await queued(() => fetch("/api/financials/budgets/line-overrides", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: draft.budgetYear, propertyCode: draft.propertyCode, section: sec.name, label: line.label, account: saveAccount, month, value }),
    })).catch(() => null);
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {};
      setEditError(j?.error ?? "Couldn't save that figure.");
    }
    setRefreshTick((n) => n + 1);
  }

  // Save one unit's leasing assumption, then re-project the draft.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Saves run ONE AT A TIME: the store rewrites a property's whole set of
  // decisions on every save, so two in flight (a live-typed rent and a term
  // picked a moment later) could each write back a copy missing the other.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  function saveAssumption(payload: SavePayload) {
    saveChain.current = saveChain.current.then(() => saveAssumptionNow(payload)).catch(() => {});
    return saveChain.current;
  }
  async function saveAssumptionNow(payload: SavePayload) {
    if (!draft?.leasing) return;
    setSaveError(null);
    const r = await fetch("/api/financials/budgets/leasing-assumptions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: draft.budgetYear, propertyCode: draft.leasing.propertyCode, ...payload }),
    }).catch(() => null);
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {};
      setSaveError(j?.error ?? "Couldn't save that assumption.");
      return;
    }
    setRefreshTick((n) => n + 1);
  }

  const label = useMemo(() => props.find((p) => p.key === key), [props, key]);

  return (
    <main style={{ maxWidth: "none", width: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <BookMasthead
        book={book}
        year={year}
        propertyCode={label?.propertyCode ?? null}
        years={[thisYear, thisYear + 1, thisYear + 2]}
        onYear={setYear}
        onBook={(id) => {
          setBookId(id);
          // Land on the book's first property, so switching books never leaves
          // the page showing a building that is not in the book you opened.
          const b = bookById(id);
          const first = b?.properties[0];
          const match = first ? props.find((p) => p.propertyCode === first) : undefined;
          if (match) setKey(match.key);
        }}
        onProperty={(code) => {
          // The book's roll-up: every property in it, summed (consolidate.ts).
          if (!code) { if (book.rollsUp) setKey(`book:${book.id}`); return; }
          const match = props.find((p) => p.propertyCode === code);
          if (match) setKey(match.key);
        }}
      />

      {/* The property's budget at a glance — revenue, operating expenses,
          NOI and cash flow, each against this year's forecast. */}
      {draft && <BudgetKpis draft={draft} />}


      {loading && !draft && (
        <LoadingState status={`Building the ${year} draft…`} context="Rent schedule, leasing calls, recoveries, expenses and loans" columns={4} rows={5} />
      )}

      {missingBasis && !loading && (
        <div className="card" style={{ borderColor: "rgba(217,119,6,0.5)", background: "rgba(217,119,6,0.07)", color: "#b45309" }}>
          No {year - 1} reprojection is available for {label?.propertyCode ?? key} yet — import its {year - 1} GL so the draft has an expense baseline to grow from.
        </div>
      )}

      {draft && (
        <>


          {/* The budget reads like the full-year operating statement it will
              be measured against: every month in its own column, revenue
              filled month by month from the leases and the recovery estimate. */}
          {/* STEP 2 — the budget itself, every month in its own column. The
              keyed expenses (taxes and insurance — Drew; building maintenance —
              Greg) are typed right here too, into the Budget Inputs store. */}
          <div id="step-expenses" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={STEP_LABEL}>Expenses &amp; review — the {draft.budgetYear} budget</div>
            </div>
            <span className="muted small">{draft.consolidated
              ? <>The sum of {draft.consolidated.properties.length} properties — click a line for its split by property · edit on each property&rsquo;s own tab</>
              : <>Click any month or the Budget total to type it · <b>Accept</b> keeps a keyed line as shown</>}</span>
          </div>
          {editError && <div className="card" style={{ color: "#b91c1c", borderColor: "rgba(185,28,28,0.4)" }}>{editError}</div>}
          <BudgetStatementTable
            draft={draft}
            onEdit={draft.lineEditScope && !draft.consolidated ? editLine : undefined}
            canType={(section, label) => scopeAllowsLine(draft.lineEditScope ?? null, section, label)}
            notes={draft.notes}
            onNote={draft.consolidated ? undefined : (sec, label) => setNoteLine({ section: sec.name, label })}
            badgeFor={(src, feePct) => sourceBadge(src, GROWTH, feePct)}
            onLine={draft.consolidated
              ? (sec, l) => setBreakdown({ label: l.label, section: sec.name, rows: (l.byProperty ?? []).map((b) => ({ code: b.code, name: b.name, total: b.total })) })
              : (sec, l) => setHistLine({ label: l.label, mask: l.mask, section: sec.name, sign: sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1, locked: !!l.inputKind || l.source === "cam-estimate" || l.source === "leases" || l.source === "items" || l.source === "pool" || l.source === "fee" || l.source === "fee-rollup", forecast: l.basisTotal, budget: l.total, months: l.months, poolKeys: l.pool?.map((p) => p.key) })}
          />

          {/* The loans behind the debt-service lines — so "why is interest
              $X" is answered on the page, and a maturity inside the year is
              called out rather than silently refinanced. */}
          {draft.debt && draft.debt.loans.length > 0 && (
            <details className="card" style={{ padding: 0, overflow: "hidden" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 14px", cursor: "pointer" }}>
                <span style={SUB_LABEL}>Debt service — {money0(draft.debt.interest)} interest · {money0(draft.debt.principal)} principal · {draft.debt.loans.length} loan{draft.debt.loans.length === 1 ? "" : "s"}{draft.debt.loans.some((l) => l.refinanceAssumed) ? " · refinance assumed" : ""}</span>
                <a href="/debt" className="muted small" style={{ fontWeight: 700 }} onClick={(e) => e.stopPropagation()}>Debt Tracker →</a>
              </summary>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={{ ...tdL, ...thS }}>Loan</th>
                      <th style={{ ...tdR, ...thS }}>Rate</th>
                      <th style={{ ...tdR, ...thS }}>Balance Jan 1</th>
                      <th style={{ ...tdR, ...thS }}>Interest</th>
                      <th style={{ ...tdR, ...thS }}>Principal</th>
                      <th style={{ ...tdR, ...thS }}>Balance Dec 31</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.debt.loans.map((l) => (
                      <tr key={l.id}>
                        <td style={{ ...tdL, whiteSpace: "normal" }}>
                          <span style={{ fontWeight: 700 }}>{l.lender || "Loan"}</span>
                          {l.interestOnly && <span style={{ marginLeft: 6 }}><Pill tone={TONE_NEUTRAL}>interest-only</Pill></span>}
                          {l.refinanceAssumed && (
                            <div style={{ fontSize: 11.5, color: "#b45309", marginTop: 2 }}>
                              Matures {l.maturityDate} — assumed refinanced on the same terms
                            </div>
                          )}
                        </td>
                        <td style={tdR}>{l.ratePct.toFixed(2)}%</td>
                        <td style={tdR}>{money0(l.balanceStart)}</td>
                        <td style={tdR}>{money0(l.interest)}</td>
                        <td style={tdR}>{money0(l.principal)}</td>
                        <td style={tdR}>{money0(l.balanceEnd)}</td>
                      </tr>
                    ))}
                    {draft.debt.loans.length > 1 && (
                      <tr style={{ borderTop: "2px solid var(--border)" }}>
                        <td style={{ ...tdL, fontWeight: 800 }} colSpan={3}>Total debt service</td>
                        <td style={{ ...tdR, fontWeight: 800 }}>{money0(draft.debt.interest)}</td>
                        <td style={{ ...tdR, fontWeight: 800 }}>{money0(draft.debt.principal)}</td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          )}


        </>
      )}
      {/* REVENUES — the rent schedule import, the leasing calls and every
          suite's rent and recoveries — sit BELOW the budget, the order the
          owner's own budget workbooks use: the statement first, then the
          tenants behind its revenue lines. */}
      <InPlaceRevenueCard
        year={year}
        category={category}
        propertyCode={label?.propertyCode ?? null}
        editorLabel={typeof document !== "undefined" ? (document.cookie.match(/kcp_user=([^;]+)/)?.[1] ?? "Unknown") : "Unknown"}
      >
        {/* The rest of the Rent step: the leasing decisions for the suites
            that expire or sit vacant, then every suite's rent — contracted vs
            assumed — which reads those decisions as soon as they are saved. */}
        {draft?.leasing && (
          <RevenueByTenantCard embedded rows={draft.tenantRevenue ?? []} year={draft.budgetYear} fromSchedule={draft.leasing.fromSchedule}
            est={draft.reimbursementEstimate} tie={draft.recoveryTie ?? []} rentLine={draft.rentLineLabel}
            leasing={{
              calls: leasingCalls(draft.leasing),
              owner: draft.leasing.owner,
              dealCapital: draft.leasing.dealCapital,
              onSave: saveAssumption,
              error: saveError,
              headerExtra: <ReviewStatus year={draft.budgetYear} propertyCode={draft.propertyCode} calls={leasingCalls(draft.leasing)} refreshTick={refreshTick} />,
            }} />
        )}
      </InPlaceRevenueCard>

      {/* Always visible while you work the budget — the question "what is
          holding this up" is asked continuously in a room with four people in
          it, not once when the page loads. */}
      {breakdown && draft && (
        <PropertyBreakdownModal label={breakdown.label} section={breakdown.section} year={draft.budgetYear} rows={breakdown.rows} onClose={() => setBreakdown(null)} />
      )}
      {noteLine && draft && (
        <NoteDialog label={noteLine.label} section={noteLine.section}
          note={draft.notes?.[`${noteLine.section}::${noteLine.label}`]}
          onSave={(t) => saveNote(noteLine.section, noteLine.label, t)}
          onClose={() => setNoteLine(null)} />
      )}
      {histLine && label && (() => {
        // The line as it stands NOW — the popup edits it, and the draft
        // re-projects after every save, so the snapshot taken on click would go stale.
        const hSec = draft?.sections.find((x) => x.name === histLine.section);
        const hLine = hSec?.lines.find((x) => x.label === histLine.label);
        const hLocked = !hLine || hLine.source === "cam-estimate" || hLine.source === "leases" || hLine.source === "pool" || hLine.source === "fee" || hLine.source === "fee-rollup" || !!hLine.subLines?.some((x) => x.typeable);
        const hCanType = !!draft?.lineEditScope && !hLocked && scopeAllowsLine(draft.lineEditScope ?? null, histLine.section, histLine.label);
        return (
        <LineHistoryModal
          viewKey={key}
          propertyCode={label.propertyCode}
          label={histLine.label}
          mask={histLine.mask}
          sign={histLine.sign}
          year={year}
          forecast={histLine.forecast ?? null}
          budget={histLine.budget ?? null}
          budgetMonths={hLine?.months ?? histLine.months ?? null}
          budgetTyped={hLine?.inputKind && hLine.source === "entered" ? new Array(12).fill(true) : hLine?.typed}
          badge={hLine && !growthOnNothing(hLine.source, hLine.months) ? sourceBadge(hLine.source, GROWTH, hLine.feePct) : null}
          onEdit={hCanType && hSec && hLine ? (m, v) => editLine(hSec, hLine, m, v) : undefined}
          extra={histLine.poolKeys?.length && draft ? (
            <PayrollPoolsCard year={draft.budgetYear} bookId={bookId} bookName={book.name} propertyCode={draft.propertyCode}
              onlyKeys={histLine.poolKeys} queued={queued} onSaved={() => setRefreshTick((n) => n + 1)} />
          ) : null}
          onClose={() => setHistLine(null)}
          onUseSuggestion={draft?.canEditLines && !histLine.locked ? (amount) => { applySuggestion(histLine.section, histLine.label, amount); setHistLine(null); } : undefined}
        />
        );
      })()}

      </div>

    </main>
  );
}

/** When a call was made, as it is quoted back in a meeting. */

/** The leasing owner's sign-off on this property (from the Rent Roll Review
 *  page), and the way there — the page Harry / Nancy are sent. */
function ReviewStatus({ year, propertyCode, calls, refreshTick }: { year: number; propertyCode: string; calls: LeasingCall[]; refreshTick: number }) {
  const [review, setReview] = useState<{ by: string; at: string } | null | undefined>(undefined);
  useEffect(() => {
    fetch(`/api/financials/budgets/rent-review?year=${year}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => setReview(j.reviews?.[propertyCode.toUpperCase()] ?? null)).catch(() => setReview(null));
  }, [year, propertyCode, refreshTick]);
  if (review === undefined) return null;
  const latest = calls.reduce((m, c) => ((c.assumption?.updatedAt ?? "") > m ? c.assumption!.updatedAt! : m), "");
  const group = PROPERTY_DEFS.find((d) => d.id === propertyCode.toUpperCase())?.allocGroup === "BP" ? "BP" : "SC";
  const href = `/financials/budgets/review?group=${group}&year=${year}`;
  const changed = !!review && latest > review.at;
  return (
    <a href={href} style={{ textDecoration: "none" }}>
      {review && !changed
        ? <Pill tone={TONE_GREEN}>✓ {review.by} · {new Date(review.at).toLocaleString("en-US", { month: "short", day: "numeric" }).toUpperCase()}</Pill>
        : <Pill tone={TONE_NEUTRAL}>{changed ? "CHANGED" : "NOT CONFIRMED"} →</Pill>}
    </a>
  );
}

/** Every suite needing a leasing call, in the shape the table's pill takes. */
function leasingCalls(leasing: NonNullable<BudgetDraft["leasing"]>): LeasingCall[] {
  return [
    ...leasing.expiring.map((e) => ({ unitRef: e.unitRef, mode: "inplace" as const, title: e.tenant, sqft: e.sqft, currentRent: e.monthlyRent, leaseTo: e.leaseTo, assumption: e.assumption })),
    ...leasing.vacant.map((v) => ({ unitRef: v.unitRef, mode: "vacant" as const, title: "Vacant", sqft: v.sqft, currentRent: 0, leaseTo: null, assumption: v.assumption })),
    // Leases in place — no call owed, but one can be backed out.
    ...(leasing.contracted ?? []).map((c) => ({ unitRef: c.unitRef, mode: "contracted" as const, title: c.tenant, sqft: c.sqft, currentRent: c.monthlyRent, leaseTo: null, assumption: c.assumption })),
  ];
}

const thS: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" };
const tdL: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
