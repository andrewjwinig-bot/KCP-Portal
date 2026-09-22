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
type SavePayload = { unitRef: string; kind: string | null; monthlyRent?: number; startMonth?: number; termYears?: number };

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
          <div className="pills">
            <StatPill label="Total Revenue" value={money0(draft.rollups.totalRevenues.total)} sub={draft.leasing ? `${draft.leasing.inPlaceUnits} in-place leases` : "reproj placeholder"} />
            <StatPill label="Total Operating Expenses" value={money0(draft.rollups.totalOperatingExpenses.total)} sub="by line — entered, else +3%" />
            <StatPill label="NOI" value={money0(draft.rollups.netOperatingIncome.total)} accent={draft.rollups.netOperatingIncome.total >= 0 ? "#15803d" : "#b91c1c"} />
          </div>

          {draft.leasing && (draft.leasing.expiring.length > 0 || draft.leasing.vacant.length > 0) && (
            <LeasingCard leasing={draft.leasing} budgetYear={draft.budgetYear} error={saveError} onSave={saveAssumption} />
          )}

          {/* The budget reads like the full-year operating statement it will
              be measured against: every month in its own column, revenue
              filled month by month from the leases and the recovery estimate. */}
          {editError && <div className="card" style={{ color: "#b91c1c", borderColor: "rgba(185,28,28,0.4)" }}>{editError}</div>}
          <BudgetStatementTable
            draft={draft}
            onEdit={draft.canEditLines ? editLine : undefined}
            badgeFor={(src) => sourceBadge(src, GROWTH)}
            onLine={(sec, l) => setHistLine({ label: l.label, mask: l.mask, sign: sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1 })}
          />

          {draft.reimbursementEstimate && draft.reimbursementEstimate.tenants.length > 0 && (() => {
            const est = draft.reimbursementEstimate!;
            return (
              <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: "rgba(13,148,136,0.4)" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ ...secLabel, color: "#0d9488" }}>Recoveries — CAM / INS / RET, {est.budgetYear}</div>
                  <Pill tone={TONE_TEAL}>{est.fromBudgetPools ? "IN THE BUDGET" : "PREVIEW"}</Pill>
                </div>
                <div style={{ padding: "8px 14px" }} className="muted small">
                  Each tenant keeps their share from the <b>{est.reconYear} reconciliation</b> (PRS, admin fee, exclusions, gross leases and the insurance-pool rules all carried over), applied to <b>this budget&rsquo;s own pools</b> — CAM ×{est.ratios.cam}, insurance ×{est.ratios.ins}, taxes ×{est.ratios.ret} against {est.reconYear}, so the taxes and premium entered on Budget Inputs flow straight through.
                  {est.kind === "office" ? " Office tenants pay their share of the increase over their base year, recomputed on the budget pool." : " A capped tenant grows no faster than its cap."}
                  {" "}The leasing assumptions set who pays and when: a vacate stops after its term, a lease-up starts at its pro-rata share. These totals <b>are</b> the recovery income lines above (marked <i>CAM est.</i>).
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

/** When a call was made, as it is quoted back in a meeting. */
function stamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * The leasing assumptions, marked as the OWNER'S work — Harry's on a shopping
 * centre, Nancy's on an office park — in that person's colour, with how many of
 * the calls are made and, once every one is, who finished it and when. "Hold
 * current" and "Leave vacant" are saved as decisions too, so a space someone
 * looked at and a space nobody touched never read the same.
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
  return (
    <div className="card" style={{ borderLeft: `4px solid ${tone.fg}`, borderColor: tone.border }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ ...secLabel, color: tone.fg }}>Leasing assumptions — {budgetYear}</div>
          <Pill tone={tone}>{owner.label.toUpperCase()}&rsquo;S CALL</Pill>
        </div>
        {done ? (
          <Pill tone={TONE_GREEN}>✓ COMPLETED{last?.updatedBy ? ` BY ${last.updatedBy.toUpperCase()}` : ""}{last?.updatedAt ? ` · ${stamp(last.updatedAt)}` : ""}</Pill>
        ) : (
          <Pill tone={TONE_AMBER}>{decided.length} OF {all.length} DECIDED</Pill>
        )}
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        {owner.label} owns these. For each expiring or holdover lease choose <b>hold</b>, <b>renew</b> (a new rent from the day after the term ends) or <b>vacate</b>; for vacant space, <b>leave vacant</b> or <b>lease up</b> from a month. Every row needs a decision — rental income and the recoveries re-project on save.
      </p>
      {error && <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {leasing.expiring.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Expiring / holdover ({leasing.expiring.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {leasing.expiring.map((e) => (
                <LeasingRow key={e.unitRef} mode="inplace"
                  unitRef={e.unitRef} title={`${e.tenant}`} sub={`${money0(e.monthlyRent)}/mo · ends ${e.leaseTo ?? "—"}`}
                  holdover={e.holdover} currentRent={e.monthlyRent} leaseTo={e.leaseTo}
                  assumption={e.assumption} onSave={onSave} />
              ))}
            </div>
          </div>
        )}
        {leasing.vacant.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Vacant spaces ({leasing.vacant.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {leasing.vacant.map((v) => (
                <LeasingRow key={v.unitRef} mode="vacant"
                  unitRef={v.unitRef} title={v.unitRef} sub={`${v.sqft.toLocaleString()} sf vacant`}
                  currentRent={0} leaseTo={null}
                  assumption={v.assumption} onSave={onSave} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LeasingRow({ mode, unitRef, title, sub, holdover, currentRent, leaseTo, assumption, onSave }: {
  mode: "inplace" | "vacant";
  unitRef: string; title: string; sub: string; holdover?: boolean;
  currentRent: number; leaseTo: string | null;
  assumption?: LeaseAssumption;
  onSave: (p: SavePayload) => void;
}) {
  // A saved "hold" on a vacancy is "leave vacant". Nothing saved reads as
  // "choose…", so an untouched row can never pass for a decision.
  const saved = assumption?.kind === "hold" && mode === "vacant" ? "none" : assumption?.kind;
  const [kind, setKind] = useState<string>(saved ?? "");
  const [rent, setRent] = useState<string>(assumption?.monthlyRent != null ? String(assumption.monthlyRent) : "");
  const [month, setMonth] = useState<number>(assumption?.startMonth ?? 1);
  const [term, setTerm] = useState<string>(assumption?.termYears != null ? String(assumption.termYears) : "");

  function push(k = kind, r = rent, mo = month, t = term) {
    const apiKind = k === "" ? null : k === "none" ? "hold" : k;
    onSave({ unitRef, kind: apiKind, monthlyRent: r !== "" ? Number(r) : undefined, startMonth: mo, termYears: t !== "" ? Number(t) : undefined });
  }

  const showRent = kind === "renew" || kind === "leaseup";
  // Only a VACANT space needs an assumed start. An existing tenant's dates come
  // from the lease: a renewal starts the day after the term expires, a vacate
  // is paid through it. Said in words rather than picked.
  const showMonth = kind === "leaseup";
  const leaseDate = leaseTermDates(leaseTo, holdover);
  const tone = kind === "vacate" ? TONE_RED : kind === "leaseup" ? TONE_GREEN : kind === "renew" ? TONE_BLUE : TONE_NEUTRAL;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 10px", borderRadius: 8, background: "var(--card)", border: "1px solid var(--border)" }}>
      <div style={{ minWidth: 190, flex: "1 1 190px" }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}><code style={{ fontSize: 12 }}>{unitRef}</code> {title} {holdover && <Pill tone={TONE_AMBER}>holdover</Pill>}</div>
        <div className="muted small">{sub}</div>
      </div>
      <select value={kind} onChange={(e) => { setKind(e.target.value); push(e.target.value); }} style={rowSel}>
        {kind === "" && <option value="">Choose…</option>}
        {mode === "inplace" ? (
          <>
            <option value="hold">Hold current</option>
            <option value="renew">Renew</option>
            <option value="vacate">Vacate</option>
          </>
        ) : (
          <>
            <option value="none">Leave vacant</option>
            <option value="leaseup">Lease up</option>
          </>
        )}
      </select>
      {showRent && (
        <input type="number" value={rent} placeholder={currentRent ? String(currentRent) : "rent/mo"} step={50}
          onChange={(e) => { setRent(e.target.value); }} onBlur={() => push()}
          style={{ ...rowSel, width: 110 }} title="New monthly rent" />
      )}
      {showMonth && (
        <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); push(kind, rent, Number(e.target.value)); }} style={rowSel}
          title="The month this space starts paying">
          {MONTHS_ABBR.map((mo, i) => <option key={mo} value={i + 1}>{`from ${mo}`}</option>)}
        </select>
      )}
      {/* The assumed TERM — the renewal's new term, or the new lease's on a
          vacancy. A vacate has no term to assume. */}
      {(kind === "renew" || kind === "leaseup") && (
        <select value={term} onChange={(e) => { setTerm(e.target.value); push(kind, rent, month, e.target.value); }} style={rowSel} title="Assumed lease term">
          <option value="">term…</option>
          {[1, 2, 3, 5, 7, 10, 15].map((y) => <option key={y} value={y}>{y} yr{y === 1 ? "" : "s"}</option>)}
        </select>
      )}
      {kind === "renew" && <span className="muted small">new rent from {leaseDate.renewFrom}</span>}
      {kind === "vacate" && <span className="muted small">paid through {leaseDate.paidThrough}</span>}
      {kind === "" ? <Pill tone={TONE_AMBER}>undecided</Pill> : <Pill tone={tone}>{kind === "hold" ? "flat" : kind === "none" ? "vacant" : kind}</Pill>}
      {assumption?.updatedAt && (
        <span className="muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>
          ✓ {assumption.updatedBy ? `${assumption.updatedBy.charAt(0)}${assumption.updatedBy.slice(1).toLowerCase()} · ` : ""}{stamp(assumption.updatedAt)}
        </span>
      )}
    </div>
  );
}

/** The dates an existing tenant's lease sets: the renewal starts the day after
 *  the term expires (11/30/26 → 12/1/26); a vacate is paid through the term. */
function leaseTermDates(leaseTo: string | null, holdover?: boolean): { renewFrom: string; paidThrough: string } {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(leaseTo ?? "");
  if (!m || holdover) return { renewFrom: "January", paidThrough: holdover ? "nothing more (holdover)" : "the term's end" };
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  const next = new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2]) + 1));
  const fmt = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(-2)}`;
  return { renewFrom: fmt(next), paidThrough: `${Number(m[1])}/${Number(m[2])}/${String(y).slice(-2)}` };
}

const rowSel: React.CSSProperties = { borderRadius: 6, padding: "5px 8px", fontSize: 12.5, fontWeight: 600, border: "1px solid rgba(11,74,125,0.3)", background: "var(--card)", color: "#0b4a7d", cursor: "pointer" };

const thS: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" };
const tdL: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" };
const tdR: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
