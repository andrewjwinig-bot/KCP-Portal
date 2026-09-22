"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StatPill, Pill, TONE_BLUE, TONE_NEUTRAL, TONE_GREEN, TONE_TEAL, TONE_AMBER, TONE_RED, contributorTone, type PillTone } from "../../../components/Pill";
import { BudgetStatementTable } from "./BudgetStatementTable";
import type { BudgetDraft, BudgetDraftSection, DraftSource } from "../../../../lib/financials/budgets/draft";
import type { LeaseAssumption } from "../../../../lib/financials/budgets/leasingAssumptions";
import { SELECT_BRAND } from "@/app/components/YearSelect";
import { InPlaceRevenueCard } from "./InPlaceRevenueCard";
import { BudgetSteps } from "./BudgetSteps";
import { BookMasthead } from "./BookMasthead";
import { bookById, bookForProperty } from "@/lib/financials/budgets/books";
import { LineHistoryModal } from "./LineHistoryModal";

const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type SavePayload = { unitRef: string; kind: string | null; monthlyRent?: number; rentPsf?: number; tiPsf?: number; lcPsf?: number; startMonth?: number; termYears?: number };

// Every expense line carries its own basis (entered, tax +3%, a lease, the
// recovery estimate); what is left grows by this. Not a knob on the page — a
// per-line figure is where a line gets argued, not a master percentage.
const GROWTH = 3;

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

function sourceBadge(source: DraftSource, growthPct: number): { tone: PillTone; text: string } {
  switch (source) {
    case "reproj-growth": return { tone: TONE_BLUE, text: `Reproj ${growthPct >= 0 ? "+" : ""}${growthPct}%` };
    case "reproj-flat": return { tone: TONE_NEUTRAL, text: "Reproj (flat)" };
    case "leases": return { tone: TONE_GREEN, text: "Leases" };
    case "cam-estimate": return { tone: TONE_TEAL, text: "CAM est." };
    case "ret-default": return { tone: TONE_BLUE, text: "Tax +3%" };
    case "entered": return { tone: TONE_GREEN, text: "Entered" };
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
      .then((r) => r.json()).then((j) => { setProps(j.properties ?? []); if (j.properties?.[0]) setKey(j.properties[0].key); }).catch(() => {});
  }, []);

  const [refreshTick, setRefreshTick] = useState(0);
  // The line whose history is open. Clicking a line is how you argue its
  // number from its own five years rather than from last year plus a percent.
  const [histLine, setHistLine] = useState<{ label: string; mask: string; sign: 1 | -1 } | null>(null);
  // Which BOOK is open. A property's budget is a sheet inside its book, so the
  // book leads and the property follows — picking a property inside a book
  // never changes which book you are in.
  const [bookId, setBookId] = useState<string>("shopping-centers");
  const book = bookById(bookId) ?? bookById("shopping-centers")!;

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

  // Type one month (or spread an annual, or clear the line). The cell shows the
  // figure at once; the re-projected draft — subtotals, NOI, recoveries on a
  // CAM line — follows from the server.
  const [editError, setEditError] = useState<string | null>(null);
  async function editLine(sec: BudgetDraftSection, line: BudgetDraftSection["lines"][number], month: number | "all", value: number | null) {
    if (!draft) return;
    setEditError(null);
    if (typeof month === "number" && value != null) {
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
      body: JSON.stringify({ year: draft.budgetYear, propertyCode: draft.propertyCode, section: sec.name, label: line.label, month, value }),
    }).catch(() => null);
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {};
      setEditError(j?.error ?? "Couldn't save that figure.");
    }
    setRefreshTick((n) => n + 1);
  }

  // Save one unit's leasing assumption, then re-project the draft.
  const [saveError, setSaveError] = useState<string | null>(null);
  async function saveAssumption(payload: SavePayload) {
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
    <main style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 250px", gap: 18, maxWidth: 1360, width: "100%", alignItems: "start" }}>
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

      {/* STEP 1, above everything, because the rest depends on it. The
          contracted-rent schedule is the input the vacancy and renewal list is
          DERIVED from — and while Harry and Nancy work that list, Greg and
          Drew work the expenses on the same draft. The parts are independent
          by design; only the order of this one is fixed. */}
      <InPlaceRevenueCard
        year={year}
        category="Shopping Centers"
        propertyCode={label?.propertyCode ?? null}
        editorLabel={typeof document !== "undefined" ? (document.cookie.match(/kcp_user=([^;]+)/)?.[1] ?? "Unknown") : "Unknown"}
      />

      {loading && !draft && <div className="card muted">Building draft…</div>}

      {missingBasis && !loading && (
        <div className="card" style={{ borderColor: "rgba(217,119,6,0.5)", background: "rgba(217,119,6,0.07)", color: "#b45309" }}>
          No {year - 1} reprojection is available for {label?.propertyCode ?? key} yet — import its {year - 1} GL so the draft has an expense baseline to grow from.
        </div>
      )}

      {draft && (
        <>

          {draft.leasing && (draft.leasing.expiring.length > 0 || draft.leasing.vacant.length > 0) && (
            <LeasingCard leasing={draft.leasing} budgetYear={draft.budgetYear} error={saveError} onSave={saveAssumption} />
          )}

          {/* The budget reads like the full-year operating statement it will
              be measured against: every month in its own column, revenue
              filled month by month from the leases and the recovery estimate. */}
          {/* STEP 3 — the three lines their owners key on Budget Inputs. */}
          <ExpensesStepCard draft={draft} />

          {draft.reimbursementEstimate && draft.reimbursementEstimate.tenants.length > 0 && (() => {
            const est = draft.reimbursementEstimate!;
            return (
              <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: "rgba(13,148,136,0.4)" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ ...secLabel, color: "#0d9488" }}>Step 4 · Recoveries — CAM / INS / RET, {est.budgetYear}</div>
                  <Pill tone={TONE_TEAL}>{est.fromBudgetPools ? "IN THE BUDGET" : "PREVIEW"}</Pill>
                </div>
                <div style={{ padding: "8px 14px" }} className="muted small">
                  Each tenant keeps their share from the <b>{est.reconYear} reconciliation</b> (PRS, admin fee, exclusions, gross leases and the insurance-pool rules all carried over), applied to <b>this budget&rsquo;s own pools</b> — CAM ×{est.ratios.cam}, insurance ×{est.ratios.ins}, taxes ×{est.ratios.ret} against {est.reconYear}, so the taxes and premium entered on Budget Inputs flow straight through.
                  {est.kind === "office" ? " Office tenants pay their share of the increase over their base year, recomputed on the budget pool." : " A capped tenant grows no faster than its cap."}
                  {" "}The leasing assumptions set who pays and when: a vacate stops after its term, a lease-up starts at its pro-rata share. These totals <b>are</b> the recovery income lines in the budget below (marked <i>CAM est.</i>).
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th style={{ ...tdL, ...thS }}>Tenant</th>
                        <th style={{ ...tdR, ...thS }}>CAM/yr</th>
                        {est.kind === "retail" && <th style={{ ...tdR, ...thS }}>INS/yr</th>}
                        <th style={{ ...tdR, ...thS }}>RET/yr</th>
                        <th style={{ ...tdR, ...thS }}>Months</th>
                        <th style={{ ...tdR, ...thS }}>Escrow/mo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {est.tenants.map((t) => (
                        <tr key={t.unitRef}>
                          <td style={{ ...tdL, whiteSpace: "normal" }}><code style={{ fontSize: 12 }}>{t.unitRef}</code> {t.name}
                            {t.note && <div className="muted" style={{ fontSize: 11.5 }}>{t.note}</div>}</td>
                          <td style={tdR}>{money0(t.camAnnual)}</td>
                          {est.kind === "retail" && <td style={tdR}>{money0(t.insAnnual)}</td>}
                          <td style={tdR}>{money0(t.retAnnual)}</td>
                          <td style={{ ...tdR, color: t.monthsActive < 12 ? "#b45309" : "var(--muted)" }}>{t.monthsActive}</td>
                          <td style={{ ...tdR, fontWeight: 700 }}>{t.monthsActive ? money0(t.camMonthly + t.insMonthly + t.retMonthly) : "—"}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "2px solid var(--border)" }}>
                        <td style={{ ...tdL, fontWeight: 800 }}>Total reimbursements</td>
                        <td style={{ ...tdR, fontWeight: 800 }}>{money0(est.totals.camAnnual)}</td>
                        {est.kind === "retail" && <td style={{ ...tdR, fontWeight: 800 }}>{money0(est.totals.insAnnual)}</td>}
                        <td style={{ ...tdR, fontWeight: 800 }}>{money0(est.totals.retAnnual)}</td>
                        <td />
                        <td style={{ ...tdR, fontWeight: 800 }}>{money0((est.totals.camAnnual + est.totals.insAnnual + est.totals.retAnnual) / 12)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* STEP 5 — the budget itself, every month in its own column. */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <div style={secLabel}>Step 5 · Review &amp; finalize — the {draft.budgetYear} budget</div>
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
            onLine={(sec, l) => setHistLine({ label: l.label, mask: l.mask, sign: sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1 })}
          />


          <p className="muted small">
            <b>Leases</b> = rent month by month from the rent roll&rsquo;s in-place leases and the leasing assumptions. <b>CAM est.</b> = the recoveries above. <b>Entered</b> = a figure keyed on Budget Inputs; <b>Tax +3%</b> = this year&rsquo;s taxes +3% until one is. <b>Reproj +3%</b> = this year&rsquo;s forecast grown month by month, so its seasonality carries over; <b>Reproj (flat)</b> = carried unchanged.
          </p>
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
          onClose={() => setHistLine(null)}
        />
      )}

      </div>

      {/* The rail, not a bar along the bottom. "How much is left" is the
          smaller question; the one asked in the room is "where are we" — and
          that has a SHAPE. The schedule has to land before the vacancy list
          means anything, while the expenses run in parallel and wait for
          neither. A rail can show that; a percentage cannot. */}
      <BudgetSteps year={year} category="Shopping Centers" refreshTick={refreshTick} />
    </main>
  );
}

/**
 * Step 3 on the page, so every step on the rail has its card. The figures are
 * KEYED on Budget Inputs (Greg can reach nothing else), so this only says where
 * each one stands and links there — never a second place to type them.
 */
function ExpensesStepCard({ draft }: { draft: BudgetDraft }) {
  const kinds: { kind: string; label: string; owner: string }[] = [
    { kind: "ret", label: "Real estate taxes", owner: "drew" },
    { kind: "insurance", label: "Insurance", owner: "drew" },
    { kind: "building-maintenance", label: "Building maintenance", owner: "greg" },
  ];
  const lines = draft.sections.flatMap((sec) => sec.lines.filter((l) => l.inputKind));
  const status = (kind: string) => {
    const ls = lines.filter((l) => l.inputKind === kind);
    if (!ls.length) return null;
    const total = ls.reduce((a, l) => a + l.total, 0);
    const entered = ls.every((l) => l.source === "entered");
    const text = entered ? "Entered" : kind === "ret" ? "Default · +3%" : "Not entered · +3%";
    return { total, entered, text };
  };
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={secLabel}>Step 3 · Expenses — {draft.budgetYear}</div>
        <a href="/budget-inputs" className="btn" style={{ fontSize: 12, padding: "5px 12px", fontWeight: 700, textDecoration: "none" }}>Open Budget Inputs →</a>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {kinds.map((k) => {
            const st = status(k.kind);
            return (
              <tr key={k.kind} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ ...tdLL, fontWeight: 600 }}>{k.label}</td>
                <td style={tdLL}><Pill tone={contributorTone(k.owner)}>{k.owner.toUpperCase()}</Pill></td>
                <td style={tdLL}>{st ? <Pill tone={st.entered ? TONE_GREEN : TONE_AMBER}>{st.text}</Pill> : <span className="muted small">No line on this statement</span>}</td>
                <td style={{ ...tdRR, fontWeight: 700 }}>{st ? money0(st.total) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
 * the decision → its terms → what it does to next year → who made it. The
 * decision is a one-click segmented choice rather than a dropdown, and the
 * effect is written out ("New rent all of 2027", "Paid through 3/31/27") so
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
      <td colSpan={7} style={{ ...tdLL, padding: "8px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
        {label} <span style={{ fontWeight: 700 }}>· {n}</span>
      </td>
    </tr>
  );
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: tone.border }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ ...secLabel, color: tone.fg }}>Step 2 · Vacancies &amp; renewals — {budgetYear}</div>
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
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
          <thead>
            <tr>
              <th style={thLL}>Suite</th>
              <th style={thLL}>Decision</th>
              <th style={thRR}>Rent $/SF/yr</th>
              <th style={thRR}>TI $/SF</th>
              <th style={thRR}>LC $/SF</th>
              <th style={thLL}>Term</th>
              <th style={thLL}>In {budgetYear}</th>
            </tr>
          </thead>
          <tbody>
            {leasing.expiring.length > 0 && band("Expiring or holdover leases", leasing.expiring.length)}
            {leasing.expiring.map((e) => (
              <LeasingRow key={e.unitRef} mode="inplace" budgetYear={budgetYear}
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

function LeasingRow({ mode, budgetYear, unitRef, title, sqft, currentRent, leaseTo, assumption, onSave }: {
  mode: "inplace" | "vacant";
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
  const [lc, setLc] = useState<string>(f2(assumption?.lcPsf));
  const [month, setMonth] = useState<number>(assumption?.startMonth ?? 1);
  const [term, setTerm] = useState<string>(assumption?.termYears != null ? String(assumption.termYears) : "");

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
      rentPsf: psf ?? undefined,
      tiPsf: tiV !== "" ? Number(tiV) : undefined,
      lcPsf: lcV !== "" ? Number(lcV) : undefined,
      startMonth: mo, termYears: t !== "" ? Number(t) : undefined,
    });
  }

  const end = parseMDY(leaseTo);
  // A holdover is a lease that has ALREADY ended — not one that merely ends
  // before the budget year (11/30/26 is still a live lease in September).
  const holdover = !!end && end.getTime() < Date.now();
  const deal = kind === "renew" || kind === "leaseup";
  const effect = kind === "" && mode === "vacant" ? "Vacant, until decided" : effectText(kind, end, budgetYear, month, rent);
  const dash = <span className="muted">—</span>;
  const psfInput = (v: string, set: (x: string) => void, field: "r" | "ti" | "lc", label: string) => (
    <input value={v} inputMode="decimal" placeholder="$0.00" aria-label={label}
      onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ""))}
      onBlur={() => {
        const f = v === "" || !Number.isFinite(Number(v)) ? "" : Number(v).toFixed(2);
        set(f);
        push({ [field]: f } as Partial<{ r: string; ti: string; lc: string }>);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ width: 76, textAlign: "right" }} />
  );

  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ ...tdLL, whiteSpace: "normal", minWidth: 220 }}>
        <code style={{ fontSize: 12 }}>{unitRef}</code>
        <div style={{ fontWeight: 600, marginTop: 3 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {[sqft > 0 ? `${sqft.toLocaleString()} sf` : null,
            curPsf != null ? `$${curPsf.toFixed(2)}/sf today` : null,
            end ? `${holdover ? "ended" : "ends"} ${fmtDate(end)}` : null].filter(Boolean).join(" · ")}
          {holdover && <> <Pill tone={TONE_AMBER}>holdover</Pill></>}
        </div>
      </td>
      <td style={tdLL}>
        <DecisionChoice value={kind} options={mode === "inplace" ? INPLACE_CHOICES : VACANT_CHOICES}
          onPick={(k) => { setKind(k); push({ k }); }} />
        {/* Who made the call and when — the stamp the owner's card is about. */}
        {assumption?.updatedAt && (
          <div style={{ fontSize: 11, marginTop: 4, paddingLeft: 6, color: "var(--muted)" }}>
            <span style={{ color: "#15803d", fontWeight: 700 }}>✓ {assumption.updatedBy ? `${assumption.updatedBy.charAt(0)}${assumption.updatedBy.slice(1).toLowerCase()}` : "Saved"}</span> · {shortStamp(assumption.updatedAt)}
          </div>
        )}
      </td>
      <td style={tdRR}>{deal ? psfInput(rent, setRent, "r", "Rent, annual $ per SF") : dash}</td>
      <td style={tdRR}>{deal ? psfInput(ti, setTi, "ti", "Tenant improvements, $ per SF") : dash}</td>
      <td style={tdRR}>{deal ? psfInput(lc, setLc, "lc", "Leasing commission, $ per SF") : dash}</td>
      <td style={tdLL}>
        {deal ? (
          <select value={term} className="select-sm" aria-label="Lease term"
            onChange={(e) => { setTerm(e.target.value); push({ t: e.target.value }); }}>
            <option value="">Term…</option>
            {[1, 2, 3, 5, 7, 10, 15].map((y) => <option key={y} value={y}>{y} yr{y === 1 ? "" : "s"}</option>)}
          </select>
        ) : dash}
      </td>
      <td style={{ ...tdLL, whiteSpace: "normal", fontSize: 12.5, color: kind ? "var(--text)" : "var(--muted)", minWidth: 120 }}>
        {kind === "leaseup" ? (
          <select value={month} className="select-sm" aria-label="Starts paying"
            onChange={(e) => { setMonth(Number(e.target.value)); push({ mo: Number(e.target.value) }); }}>
            {MONTHS_ABBR.map((mo, i) => <option key={mo} value={i + 1}>from {mo}</option>)}
          </select>
        ) : effect}
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
function effectText(kind: string, end: Date | null, year: number, month: number, rent: string): string {
  const psf = rent !== "" ? `$${Number(rent).toFixed(2)}/sf` : "new rent";
  switch (kind) {
    case "": return "Today's rent, until decided";
    case "hold": return `Today's rent all year`;
    case "none": return `Vacant all year`;
    case "leaseup": return `${psf} from ${MONTHS_ABBR[month - 1]} ${year}`;
    case "renew": {
      if (!end) return `${psf} all year`;
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
      return start.getFullYear() < year ? `${psf} all year` : start.getFullYear() > year ? `No change in ${year}` : `${psf} from ${fmtDate(start)}`;
    }
    case "vacate": {
      if (!end || end.getFullYear() < year) return `No rent in ${year}`;
      if (end.getFullYear() > year) return `Paid all year`;
      return `Paid through ${fmtDate(end)}`;
    }
    default: return "";
  }
}

const thLL: React.CSSProperties = { textAlign: "left", padding: "7px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const thRR: React.CSSProperties = { textAlign: "right", padding: "7px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const tdRR: React.CSSProperties = { textAlign: "right", padding: "10px 10px", fontSize: 14, verticalAlign: "middle", whiteSpace: "nowrap" };
const tdLL: React.CSSProperties = { textAlign: "left", padding: "10px 10px", fontSize: 14, verticalAlign: "middle", whiteSpace: "nowrap" };

type Choice = { value: string; label: string; glyph: string; tone: PillTone };
const INPLACE_CHOICES: Choice[] = [
  { value: "hold", label: "Hold", glyph: "=", tone: TONE_NEUTRAL },
  { value: "renew", label: "Renew", glyph: "↻", tone: TONE_BLUE },
  { value: "vacate", label: "Vacate", glyph: "→", tone: TONE_RED },
];
const VACANT_CHOICES: Choice[] = [
  { value: "none", label: "Leave vacant", glyph: "○", tone: TONE_NEUTRAL },
  { value: "leaseup", label: "Lease up", glyph: "+", tone: TONE_GREEN },
];

/**
 * The leasing decision as ONE CLICK, every option in view — a segmented pill
 * in the tab controls' shape, the picked option filled in its own tone (renew
 * blue, vacate red, lease up green). A dropdown hid the choices behind a click
 * and, reading "Choose…", looked like every other filter on the page rather
 * than the decision the row is waiting on.
 */
function DecisionChoice({ value, options, onPick }: { value: string; options: Choice[]; onPick: (v: string) => void }) {
  return (
    <div role="radiogroup" style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: 999, border: `1px solid ${value ? "var(--border)" : "rgba(217,119,6,0.45)"}`, background: "var(--card)" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => { if (!on) onPick(o.value); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: on ? "default" : "pointer",
              border: `1px solid ${on ? o.tone.border : "transparent"}`,
              background: on ? o.tone.bg : "transparent",
              color: on ? o.tone.fg : "var(--muted)",
              transition: "background 120ms, color 120ms",
            }}>
            <span aria-hidden style={{ fontSize: 13, lineHeight: 1, opacity: on ? 1 : 0.7 }}>{o.glyph}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const thS: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" };
const tdL: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
