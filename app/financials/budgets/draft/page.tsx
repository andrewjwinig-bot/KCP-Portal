"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StatPill, Pill, TONE_BLUE, TONE_NEUTRAL, TONE_GREEN, TONE_TEAL, TONE_AMBER, TONE_RED, contributorTone, type PillTone } from "../../../components/Pill";
import { BudgetStatementTable } from "./BudgetStatementTable";
import { RevenueByTenantCard } from "./RevenueByTenantCard";
import { STEP_LABEL, SUB_LABEL } from "./stepStyles";
import { ExpenseInputsPanel } from "@/app/budget-inputs/ExpenseInputsPanel";
import { scaleToTotal } from "@/lib/financials/budgets/lineOverrides";
import type { BudgetDraft, BudgetDraftSection, DraftSource } from "../../../../lib/financials/budgets/draft";
import type { LeaseAssumption } from "../../../../lib/financials/budgets/leasingAssumptions";
import { SELECT_BRAND } from "@/app/components/YearSelect";
import { InPlaceRevenueCard } from "./InPlaceRevenueCard";
import { BudgetSteps } from "./BudgetSteps";
import { BookMasthead } from "./BookMasthead";
import { useUser } from "@/app/components/UserProvider";
import { bookById, bookForProperty } from "@/lib/financials/budgets/books";
import { LineHistoryModal } from "./LineHistoryModal";

const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type SavePayload = { unitRef: string; kind: string | null; monthlyRent?: number; rentPsf?: number; tiPsf?: number; lcPct?: number; startMonth?: number; termYears?: number };

// Every expense line carries its own basis (entered, tax +3%, a lease, the
// recovery estimate); what is left grows by this. Not a knob on the page — a
// per-line figure is where a line gets argued, not a master percentage.
const GROWTH = 3;

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

function sourceBadge(source: DraftSource, growthPct: number): { tone: PillTone; text: string } {
  switch (source) {
    case "reproj-growth": return { tone: TONE_BLUE, text: `${growthPct >= 0 ? "+" : ""}${growthPct}%` };
    case "reproj-flat": return { tone: TONE_NEUTRAL, text: "Flat" };
    case "leases": return { tone: TONE_GREEN, text: "Leases" };
    case "cam-estimate": return { tone: TONE_TEAL, text: "Recoveries" };
    case "ret-default": return { tone: TONE_BLUE, text: "Tax +3%" };
    case "entered": return { tone: TONE_GREEN, text: "Entered" };
    case "loans": return { tone: TONE_TEAL, text: "Loans" };
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
  const [histLine, setHistLine] = useState<{ label: string; mask: string; sign: 1 | -1; section: string; locked?: boolean; forecast?: number } | null>(null);
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
      fetch(`/api/financials/budgets/draft?key=${encodeURIComponent(key)}&year=${year}&growth=${GROWTH}`, { cache: "no-store" })
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
  async function applySuggestion(section: string, label: string, amount: number) {
    const sec = draft?.sections.find((x) => x.name === section);
    const line = sec?.lines.find((l) => l.label === label);
    if (!draft || !sec || !line || line.inputKind) return;
    const post = (months: number[], account?: string) => fetch("/api/financials/budgets/line-overrides", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: draft.budgetYear, propertyCode: draft.propertyCode, section, label, account, months }),
    });
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
  async function editLine(sec: BudgetDraftSection, line: BudgetDraftSection["lines"][number], month: number | "all", value: number | null, account?: string) {
    if (!draft) return;
    setEditError(null);
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
    const r = await fetch("/api/financials/budgets/line-overrides", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: draft.budgetYear, propertyCode: draft.propertyCode, section: sec.name, label: line.label, account, month, value }),
    }).catch(() => null);
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
    <main style={{ maxWidth: 1360, width: "100%" }}>
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
          if (!code) return;
          const match = props.find((p) => p.propertyCode === code);
          if (match) setKey(match.key);
        }}
      />

      {/* Where the budget stands and who owes what — one strip, pinned while
          you scroll, so the grid below keeps the full width. */}
      <BudgetSteps year={year} category={category} refreshTick={refreshTick} />

      {/* STEP 1, above everything, because the rest depends on it. The
          contracted-rent schedule is the input the vacancy and renewal list is
          DERIVED from — and while Harry and Nancy work that list, Greg and
          Drew work the expenses on the same draft. The parts are independent
          by design; only the order of this one is fixed. */}
      <InPlaceRevenueCard
        year={year}
        category={category}
        counts={draft?.leasing ? {
          fullYear: draft.leasing.rentRows.filter((r) => r.status === "contracted").length,
          expiring: draft.leasing.rentRows.filter((r) => r.status === "expiring" || r.status === "holdover").length,
          vacant: draft.leasing.rentRows.filter((r) => r.status === "vacant" || r.status === "lease-up").length,
        } : null}
        propertyCode={label?.propertyCode ?? null}
        editorLabel={typeof document !== "undefined" ? (document.cookie.match(/kcp_user=([^;]+)/)?.[1] ?? "Unknown") : "Unknown"}
      >
        {/* The rest of the Rent step: the leasing decisions for the suites
            that expire or sit vacant, then every suite's rent — contracted vs
            assumed — which reads those decisions as soon as they are saved. */}
        {draft?.leasing && (draft.leasing.expiring.length > 0 || draft.leasing.vacant.length > 0) && (
          <LeasingCard leasing={draft.leasing} budgetYear={draft.budgetYear} error={saveError} onSave={saveAssumption} />
        )}
        {draft?.leasing && (
          <RevenueByTenantCard embedded rows={draft.tenantRevenue ?? []} year={draft.budgetYear} fromSchedule={draft.leasing.fromSchedule}
            est={draft.reimbursementEstimate} tie={draft.recoveryTie ?? []} rentLine={draft.rentLineLabel} />
        )}
      </InPlaceRevenueCard>

      {loading && !draft && <div className="card muted">Building draft…</div>}

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
          {/* STEP 3 — taxes, insurance and building maintenance, keyed right
              here by their owners (the same table Greg uses on his page). */}
          <div id="step-expenses" className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
              <div style={STEP_LABEL}>Step 2 · Expenses — {draft.budgetYear}</div>
              <Pill tone={contributorTone("drew")}>DREW · TAXES &amp; INSURANCE</Pill>
              <Pill tone={contributorTone("greg")}>GREG · MAINTENANCE</Pill>
            </div>
            <ExpenseInputsPanel embedded year={draft.budgetYear} bookId={bookId} only={draft.propertyCode}
              onSaved={() => setRefreshTick((n) => n + 1)} />
          </div>


          {/* STEP 5 — the budget itself, every month in its own column. */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <div style={STEP_LABEL}>Step 3 · Review &amp; finalize — the {draft.budgetYear} budget</div>
          </div>
          <div className="pills">
            <StatPill label="Total Revenue" value={money0(draft.rollups.totalRevenues.total)} sub={draft.leasing ? `${draft.leasing.inPlaceUnits} in-place leases` : "reproj placeholder"} />
            <StatPill label="Total Operating Expenses" value={money0(draft.rollups.totalOperatingExpenses.total)} sub="by line — entered, else +3%" />
            <StatPill label="NOI" value={money0(draft.rollups.netOperatingIncome.total)} accent={draft.rollups.netOperatingIncome.total >= 0 ? "#15803d" : "#b91c1c"} />
          </div>
          {editError && <div className="card" style={{ color: "#b91c1c", borderColor: "rgba(185,28,28,0.4)" }}>{editError}</div>}
          <BudgetStatementTable
            draft={draft}
            onEdit={draft.canEditLines ? editLine : undefined}
            badgeFor={(src) => sourceBadge(src, GROWTH)}
            onLine={(sec, l) => setHistLine({ label: l.label, mask: l.mask, section: sec.name, sign: sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1, locked: !!l.inputKind || l.source === "cam-estimate" || l.source === "leases", forecast: l.basisTotal })}
          />

          {/* The loans behind the debt-service lines — so "why is interest
              $X" is answered on the page, and a maturity inside the year is
              called out rather than silently refinanced. */}
          {draft.debt && draft.debt.loans.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                <div style={STEP_LABEL}>Debt service — {draft.budgetYear}, from the Debt Tracker</div>
                <a href="/debt" className="muted small" style={{ fontWeight: 700 }}>Debt Tracker →</a>
              </div>
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
            </div>
          )}


        </>
      )}
      {/* Always visible while you work the budget — the question "what is
          holding this up" is asked continuously in a room with four people in
          it, not once when the page loads. */}
      {histLine && label && (
        <LineHistoryModal
          viewKey={key}
          propertyCode={label.propertyCode}
          label={histLine.label}
          mask={histLine.mask}
          sign={histLine.sign}
          year={year}
          forecast={histLine.forecast ?? null}
          onClose={() => setHistLine(null)}
          onUseSuggestion={draft?.canEditLines && !histLine.locked ? (amount) => { applySuggestion(histLine.section, histLine.label, amount); setHistLine(null); } : undefined}
        />
      )}

      </div>

    </main>
  );
}

/** When a call was made, as it is quoted back in a meeting. */
function stamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * The leasing assumptions, marked as the OWNER'S work — Harry's on a shopping
 * centre, Nancy's on an office park — in that person's colour, with how many
 * calls are made and, once every one is, who finished it and when.
 *
 * ONE table, banded by kind (expiring leases, then vacant space), in the
 * portal's roster shape: every row reads left to right as suite → lease end →
 * the decision → rent → term → TI → commission → what it does to next year.
 * Compact on purpose (suite and tenant on one line, a plain dropdown for the
 * decision) so the whole row fits without scrolling, and the effect is written out ("New rent all of 2027", "Paid through 3/31/27") so
 * nobody has to work out what a choice means for the budget.
 */
function LeasingCard({ leasing, budgetYear, error, onSave }: {
  leasing: NonNullable<BudgetDraft["leasing"]>;
  budgetYear: number;
  error: string | null;
  onSave: (p: SavePayload) => void;
}) {
  const owner = leasing.owner;
  const tone = contributorTone(owner.id);
  const all = [...leasing.expiring.map((e) => e.assumption), ...leasing.vacant.map((v) => v.assumption)];
  const decided = all.filter(Boolean) as LeaseAssumption[];
  const done = decided.length === all.length;
  const last = decided.reduce<LeaseAssumption | null>((m, a) => (!m || (a.updatedAt ?? "") > (m.updatedAt ?? "") ? a : m), null);
  const band = (label: string, n: number) => (
    <tr style={{ background: "rgba(11,74,125,0.06)" }}>
      <td colSpan={9} style={{ ...tdLL, padding: "8px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
        {label} <span style={{ fontWeight: 700 }}>· {n}</span>
      </td>
    </tr>
  );
  return (
    // A section of the Rent step's card (Step 1), in the owner's colour.
    <div style={{ borderTop: `2px solid ${tone.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "12px 14px", borderBottom: "1px solid var(--border)", background: tone.bg }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ ...SUB_LABEL, color: tone.fg }}>Vacancies &amp; renewals</div>
          <Pill tone={tone}>{owner.label.toUpperCase()}&rsquo;S CALL</Pill>
        </div>
        {done ? (
          <Pill tone={TONE_GREEN}>✓ COMPLETED{last?.updatedBy ? ` BY ${last.updatedBy.toUpperCase()}` : ""}{last?.updatedAt ? ` · ${stamp(last.updatedAt)}` : ""}</Pill>
        ) : (
          <Pill tone={TONE_AMBER}>{decided.length} OF {all.length} DECIDED</Pill>
        )}
      </div>
      {error && <div style={{ color: "#b91c1c", fontSize: 13, padding: "8px 14px" }}>{error}</div>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
          <thead>
            <tr>
              <th style={thLL}>Suite</th>
              <th style={thRR}>SF</th>
              <th style={thRR}>Expiring rent</th>
              <th style={thRR}>Expires</th>
              <th style={thLL}>Decision</th>
              <th style={thRR}>Rent $/SF/yr</th>
              <th style={thLL}>Term</th>
              <th style={thRR}>TI $/SF</th>
              <th style={thRR}>LC %</th>
            </tr>
          </thead>
          <tbody>
            {leasing.expiring.length > 0 && band("Expiring or holdover leases", leasing.expiring.length)}
            {leasing.expiring.map((e) => (
              <LeasingRow key={e.unitRef} mode="inplace" budgetYear={budgetYear} fromSchedule={leasing.fromSchedule}
                unitRef={e.unitRef} title={e.tenant} sqft={e.sqft}
                currentRent={e.monthlyRent} leaseTo={e.leaseTo}
                assumption={e.assumption} onSave={onSave} />
            ))}
            {leasing.vacant.length > 0 && band("Vacant space", leasing.vacant.length)}
            {leasing.vacant.map((v) => (
              <LeasingRow key={v.unitRef} mode="vacant" budgetYear={budgetYear}
                unitRef={v.unitRef} title="Vacant" sqft={v.sqft}
                currentRent={0} leaseTo={null}
                assumption={v.assumption} onSave={onSave} />
            ))}
          </tbody>
        </table>
      </div>
      {(leasing.dealCapital.ti > 0 || leasing.dealCapital.lc > 0) && (
        <div className="muted small" style={{ padding: "9px 14px", borderTop: "1px solid var(--border)" }}>
          These deals carry <b style={{ color: "var(--text)" }}>{money0(leasing.dealCapital.ti)}</b> of TI and <b style={{ color: "var(--text)" }}>{money0(leasing.dealCapital.lc)}</b> of leasing commissions, on the Capital lines below in the month each new rent starts.
        </div>
      )}
    </div>
  );
}

function LeasingRow({ mode, budgetYear, unitRef, title, sqft, currentRent, leaseTo, assumption, onSave, fromSchedule = false }: {
  mode: "inplace" | "vacant";
  /** Off the rent schedule, an undecided lease carries NO rent after its term. */
  fromSchedule?: boolean;
  budgetYear: number;
  unitRef: string; title: string; sqft: number;
  currentRent: number; leaseTo: string | null;
  assumption?: LeaseAssumption;
  onSave: (p: SavePayload) => void;
}) {
  // A saved "hold" on a vacancy is "leave vacant". Nothing saved is no
  // decision, so an untouched row can never pass for one.
  const saved = assumption?.kind === "hold" && mode === "vacant" ? "none" : assumption?.kind;
  // Rent is keyed as ANNUAL $/SF — how a deal is quoted. An existing tenant's
  // box starts at what they pay today, so a flat renewal is no typing at all.
  const curPsf = sqft > 0 && currentRent ? round2((currentRent * 12) / sqft) : null;
  const savedPsf = assumption?.rentPsf ?? (assumption?.monthlyRent != null && sqft > 0 ? round2((assumption.monthlyRent * 12) / sqft) : null);
  const [kind, setKind] = useState<string>(saved ?? "");
  const f2 = (n: number | null | undefined) => (n != null ? n.toFixed(2) : "");
  const [rent, setRent] = useState<string>(f2(savedPsf ?? curPsf));
  const [ti, setTi] = useState<string>(f2(assumption?.tiPsf));
  const [lc, setLc] = useState<string>(assumption?.lcPct != null ? String(assumption.lcPct) : "");
  const [month, setMonth] = useState<number>(assumption?.startMonth ?? 1);
  const [term, setTerm] = useState<string>(assumption?.termYears != null ? String(assumption.termYears) : "");
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(over: Partial<{ k: string; r: string; ti: string; lc: string; mo: number; t: string }> = {}) {
    const k = over.k ?? kind, r = over.r ?? rent, mo = over.mo ?? month, t = over.t ?? term;
    const tiV = over.ti ?? ti, lcV = over.lc ?? lc;
    const apiKind = k === "" ? null : k === "none" ? "hold" : k;
    const psf = r !== "" ? Number(r) : null;
    // A renewal left at today's $/SF holds today's rent exactly, rather than a
    // figure rounded back through $/SF.
    const same = psf != null && curPsf != null && Math.abs(psf - curPsf) < 0.005;
    const monthlyRent = psf == null || same || !(sqft > 0) ? undefined : Math.round((psf * sqft) / 12);
    onSave({
      unitRef, kind: apiKind, monthlyRent,
      rentPsf: k === "renew" || k === "leaseup" ? psf ?? undefined : undefined,
      tiPsf: tiV !== "" ? Number(tiV) : undefined,
      lcPct: lcV !== "" ? Number(lcV) : undefined,
      startMonth: mo, termYears: t !== "" ? Number(t) : undefined,
    });
  }

  const end = parseMDY(leaseTo);
  // A holdover is a lease that has ALREADY ended — not one that merely ends
  // before the budget year (11/30/26 is still a live lease in September).
  const holdover = !!end && end.getTime() < Date.now();
  const deal = kind === "renew" || kind === "leaseup";
  // A tenant HELD at today's rent is still a deal for a new term: TI, a
  // commission and the term apply; only the rent is fixed at today's.
  const costs = deal || (kind === "hold" && mode === "inplace");
  // The commission as it will be budgeted: % of the new annual rent × term.
  const newMonthly = deal && rent !== "" && sqft > 0 ? (Number(rent) * sqft) / 12 : currentRent;
  const commission = lc !== "" && term !== "" ? (Number(lc) / 100) * newMonthly * 12 * Number(term) : 0;
  const effect = kind === "" && mode === "vacant" ? "Vacant until decided"
    : kind === "" && fromSchedule ? "No rent after the term until decided"
    : effectText(kind, end, budgetYear, month);
  const dash = <span className="muted">—</span>;
  // LIVE: a figure saves a moment after typing stops, and the draft — Rent by
  // tenant, the grid, the recoveries — re-projects without leaving the box.
  // Leaving the box (or Enter) saves at once and tidies the number.
  const psfInput = (v: string, set: (x: string) => void, field: "r" | "ti" | "lc", label: string, pct = false) => (
    <input value={v} inputMode="decimal" placeholder={pct ? "0%" : "$0.00"} aria-label={label}
      onChange={(e) => {
        const next = e.target.value.replace(/[^0-9.]/g, "");
        set(next);
        if (liveTimer.current) clearTimeout(liveTimer.current);
        if (next === "" || Number.isFinite(Number(next))) {
          liveTimer.current = setTimeout(() => push({ [field]: next } as Partial<{ r: string; ti: string; lc: string }>), 700);
        }
      }}
      onBlur={() => {
        if (liveTimer.current) { clearTimeout(liveTimer.current); liveTimer.current = null; }
        const f = v === "" || !Number.isFinite(Number(v)) ? "" : pct ? String(Number(v)) : Number(v).toFixed(2);
        set(f);
        push({ [field]: f } as Partial<{ r: string; ti: string; lc: string }>);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ width: 76, textAlign: "right" }} />
  );

  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ ...tdLL, whiteSpace: "normal", minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
          <code style={{ fontSize: 12 }}>{unitRef}</code>
          <span style={{ fontWeight: 600 }}>{title}</span>
        </div>
      </td>
      <td style={{ ...tdRR, fontVariantNumeric: "tabular-nums" }}>{sqft > 0 ? sqft.toLocaleString() : <span className="muted">—</span>}</td>
      {/* The rent the lease carries as it ends — what a renewal is priced against. */}
      <td style={{ ...tdRR, fontVariantNumeric: "tabular-nums" }}>
        {mode === "inplace" && currentRent > 0 ? (
          <>
            <div style={{ fontWeight: 600 }}>{money0(currentRent)}/mo</div>
            {curPsf != null && <div className="muted" style={{ fontSize: 11.5 }}>${curPsf.toFixed(2)}/SF/yr</div>}
          </>
        ) : <span className="muted">—</span>}
      </td>
      {/* MM-YY; amber once the term has already run out (a holdover). */}
      <td style={{ ...tdRR, fontVariantNumeric: "tabular-nums", color: holdover ? "#b45309" : undefined, fontWeight: holdover ? 700 : undefined }}>
        {end ? `${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getFullYear()).slice(-2)}` : <span className="muted">—</span>}
      </td>
      <td style={{ ...tdLL, whiteSpace: "normal", maxWidth: 230 }}>
        <select value={kind} className="select-sm" aria-label="Decision"
          onChange={(e) => { if (e.target.value) { setKind(e.target.value); push({ k: e.target.value }); } }}>
          {kind === "" && <option value="">Choose…</option>}
          {(mode === "inplace" ? INPLACE_CHOICES : VACANT_CHOICES).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {kind === "leaseup" && (
          <select value={month} className="select-sm" aria-label="Starts paying" style={{ marginLeft: 6 }}
            onChange={(e) => { setMonth(Number(e.target.value)); push({ mo: Number(e.target.value) }); }}>
            {MONTHS_ABBR.map((mo, i) => <option key={mo} value={i + 1}>from {mo}</option>)}
          </select>
        )}
        {/* ONE small line: what it does in the budget year, then who made the
            call and when — the stamp the owner's card is about. */}
        <div style={{ fontSize: 11, marginTop: 4, paddingLeft: 4, color: "var(--muted)" }}>
          {effect}
          {assumption?.updatedAt && (
            <> · <span style={{ color: "#15803d", fontWeight: 700 }}>✓ {assumption.updatedBy ? `${assumption.updatedBy.charAt(0)}${assumption.updatedBy.slice(1).toLowerCase()}` : "Saved"}</span> {shortStamp(assumption.updatedAt)}</>
          )}
        </div>
      </td>
      <td style={tdRR}>
        {deal ? psfInput(rent, setRent, "r", "Rent, annual $ per SF")
          : costs && curPsf != null ? <span className="muted" style={{ paddingRight: 10 }}>${curPsf.toFixed(2)}</span> : dash}
      </td>
      <td style={tdLL}>
        {costs ? (
          <select value={term} className="select-sm" aria-label="Lease term"
            onChange={(e) => { setTerm(e.target.value); push({ t: e.target.value }); }}>
            <option value="">Term…</option>
            {[1, 2, 3, 5, 7, 10, 15].map((y) => <option key={y} value={y}>{y} yr{y === 1 ? "" : "s"}</option>)}
          </select>
        ) : dash}
      </td>
      <td style={tdRR}>{costs ? psfInput(ti, setTi, "ti", "Tenant improvements, $ per SF") : dash}</td>
      <td style={tdRR}>
        {costs ? (
          <>
            {psfInput(lc, setLc, "lc", "Leasing commission, percent of the rent over the term", true)}
            {/* The dollars it comes to — % × annual rent × term — or why none. */}
            {lc !== "" && Number(lc) > 0 && (
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                {term === "" ? "set a term" : commission > 0 ? `= ${money0(commission)}` : "set a rent"}
              </div>
            )}
          </>
        ) : dash}
      </td>
    </tr>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const shortStamp = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

function parseMDY(s: string | null): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s ?? "");
  if (!m) return null;
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(y, Number(m[1]) - 1, Number(m[2]));
}
const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;

/** What the decision does to the budget year, in words — the same rules the
 *  projection applies (leaseRevenue.ts): a renewal's rent starts the day after
 *  the term, a vacate is paid through it, a lease-up from its month. */
function effectText(kind: string, end: Date | null, year: number, month: number): string {
  switch (kind) {
    case "": return "Today's rent until decided";
    case "hold": return "Today's rent";
    case "none": return "Vacant all year";
    case "leaseup": return `Rent from ${MONTHS_ABBR[month - 1]} ${year}`;
    case "renew": {
      if (!end) return "New rent all year";
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
      return start.getFullYear() < year ? "New rent all year" : start.getFullYear() > year ? `No change in ${year}` : `New rent from ${fmtDate(start)}`;
    }
    case "vacate": {
      if (!end || end.getFullYear() < year) return `No rent in ${year}`;
      if (end.getFullYear() > year) return "Paid all year";
      return `Paid through ${fmtDate(end)}`;
    }
    default: return "";
  }
}

const thLL: React.CSSProperties = { textAlign: "left", padding: "7px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const thRR: React.CSSProperties = { textAlign: "right", padding: "7px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const tdRR: React.CSSProperties = { textAlign: "right", padding: "10px 10px", fontSize: 14, verticalAlign: "middle", whiteSpace: "nowrap" };
const tdLL: React.CSSProperties = { textAlign: "left", padding: "10px 10px", fontSize: 14, verticalAlign: "middle", whiteSpace: "nowrap" };

const INPLACE_CHOICES = [
  { value: "hold", label: "Hold" },
  { value: "renew", label: "Renew" },
  { value: "vacate", label: "Vacate" },
];
const VACANT_CHOICES = [
  { value: "none", label: "Hold (vacant)" },
  { value: "leaseup", label: "Lease up" },
];

const thS: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" };
const tdL: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
