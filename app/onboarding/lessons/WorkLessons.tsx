"use client";
// Parts 3 and 4 · Your Role and The Recurring Work — six click-through lessons:
// the role and the 90-day handover, the monthly rhythm, reporting and budgets,
// tenants and CAM, taxes / 1099s / insurance, and working with EisnerAmper.
// Example figures are labelled as examples.

import { useState } from "react";
import { Building2, CircleCheck, FileText, ShieldCheck, Upload } from "lucide-react";
import { AMBER, Arrow, Bar, Facts, GREEN, ICON, LessonShell, Node, Note, Panel, Pick, RED, Recap, SECTION, Toggle, money, soft, type LessonProps, type Scene } from "./kit";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const range = (label: string, value: number, set: (n: number) => void, min: number, max: number, step = 1, fmt: (n: number) => string = String) => (
  <label style={{ display: "grid", gap: 4 }}>
    <span>{label} <strong>{fmt(value)}</strong></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} style={{ accentColor: "var(--brand)" }} />
  </label>
);
const Total = ({ label, value, tone }: { label: React.ReactNode; value: React.ReactNode; tone?: string }) => (
  <div style={{ borderTop: "2px solid var(--text)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 20, color: tone }}><span>{label}</span><span>{value}</span></div>
);
const rows = (items: string[]) => <div>{items.map((h) => <div key={h} className="task-row" style={{ padding: "9px 2px", borderBottom: "1px solid var(--hairline)" }}>{h}</div>)}</div>;

// ─────────────────────────────────────────────────────────────────────────────
// Your Role and the First 90 Days
// ─────────────────────────────────────────────────────────────────────────────

const JOBS: { id: string; label: string; what: string }[] = [
  { id: "books", label: "Keep the books current", what: "Everything posted in Skyline; the month closes around the 20th, once every property is verified in balance." },
  { id: "ap", label: "Pay the bills", what: "Every bill approved in AvidXchange and paid on Wednesday." },
  { id: "report", label: "Report every month", what: "An operating statement for every property and fund, reviewed line by line." },
  { id: "bill", label: "Bill the tenants", what: "Rent and monthly estimates, trued up once a year in the CAM / RET reconciliation." },
  { id: "cash", label: "Manage cash and debt", what: "Weekly bank balances, distributions, and the mortgages." },
];
const HANDOVER: { task: string; owner: [string, string, string] }[] = [
  { task: "Bank reconciliations", owner: ["Shadow", "You prepare", "You own"] },
  { task: "Payroll and allocation entries", owner: ["Shadow", "You prepare", "You own"] },
  { task: "Balance sheet workpapers", owner: ["Watch one", "First group", "All of them"] },
  { task: "Draft adjusting entries", owner: ["—", "Walkthrough", "You draft"] },
  { task: "Year-end tax support", owner: ["—", "Tax walkthrough", "You support"] },
];
const PHASES = [
  { title: "Days 1–30 · Learn and shadow", note: "Entities, banks, loans, payroll and intercompany; Skyline and the JE templates; two recs and one workpaper. Ends with the Day 30 check." },
  { title: "Days 31–60 · Prepare, full review", note: "You prepare the monthly recs and entries; EisnerAmper reviews everything. Ends with the Day 60 check." },
  { title: "Days 61–90 · Own and sustain", note: "All the recurring prep is yours, and the procedures are updated. Ends with the Day 90 review." },
];

export function Role({ onFinish, done }: LessonProps) {
  const [job, setJob] = useState("books");
  const [day, setDay] = useState(10);
  const phase = day <= 30 ? 0 : day <= 60 ? 1 : 2;
  const prepPct = Math.min(100, Math.round((day / 90) * 100));

  const scenes: Scene[] = [
    {
      kicker: "The team", title: "Five jobs the accounting team does",
      body: <>Everything the team does fits into five jobs. <strong>You'll own the recurring accounting</strong> underneath them: reconciliations, payroll and allocation entries, workpapers, year-end support and the 1099s.</>,
      doThis: "Click each job",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 6 }}>{JOBS.map((j) => <Pick key={j.id} on={j.id === job} onClick={() => setJob(j.id)}><span style={{ fontWeight: 700 }}>{j.label}</span></Pick>)}</div>
          <Panel title={JOBS.find((j) => j.id === job)!.label}><div style={{ lineHeight: 1.55 }}>{JOBS.find((j) => j.id === job)!.what}</div></Panel>
        </div>
      ),
    },
    {
      kicker: "The handover", title: "From EisnerAmper to you, in 90 days",
      body: <>Today <strong>EisnerAmper</strong>, our outside accounting firm, prepares the recurring work. Over three phases it moves to you. <strong>By day 90 you prepare it and they review it.</strong> Phases can move faster, or run longer on specific entities — year-end close falls inside this window.</>,
      doThis: "Slide through the 90 days",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          {range("Day", day, setDay, 1, 90)}
          <div style={{ display: "flex", gap: 6 }}>
            {PHASES.map((p, k) => <div key={p.title} style={{ flex: 1, height: 8, borderRadius: 999, background: k <= phase ? "var(--brand)" : "var(--hairline)", transition: "background .3s" }} />)}
          </div>
          <Panel title={PHASES[phase].title}><div style={{ lineHeight: 1.55 }}>{PHASES[phase].note}</div></Panel>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={SECTION}>Who prepares the recurring work</span></div>
            <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden", fontSize: "var(--fs-13)", fontWeight: 700 }}>
              <div style={{ width: `${prepPct}%`, background: "var(--brand)", color: "var(--card)", display: "flex", alignItems: "center", paddingLeft: 8, transition: "width .3s", whiteSpace: "nowrap", overflow: "hidden" }}>You</div>
              <div style={{ flex: 1, background: soft(14), color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8, whiteSpace: "nowrap", overflow: "hidden" }}>EisnerAmper</div>
            </div>
          </div>
          <div>
            {HANDOVER.map((h) => (
              <div key={h.task} className="task-row" style={{ display: "flex", justifyContent: "space-between", padding: "9px 2px", borderBottom: "1px solid var(--hairline)" }}>
                <span>{h.task}</span><strong style={{ color: phase === 2 ? GREEN : "var(--text)" }}>{h.owner[phase]}</strong>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      kicker: "Summary", title: "Summary",
      body: <>The 90-Day Plan tab on this page is your checklist — tick items off with Drew as you go.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["You own the recurring accounting", "Recs, payroll and allocation entries, workpapers, year-end support and 1099s."],
        ["Shadow, prepare, then own", "Three 30-day phases, each ending in a check with Drew."],
        ["EisnerAmper keeps reviewing", "After day 90 they review your work instead of doing it."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Monthly Rhythm
// ─────────────────────────────────────────────────────────────────────────────

const DAYS: Record<number, { title: string; what: string[] }> = {
  1: { title: "Open the month", what: ["Import the rent roll", "Laser Statements run on the 1st–2nd"] },
  5: { title: "Statements out", what: ["Tenant monthly statements go out by the 5th"] },
  15: { title: "Lender reports", what: ["The Liberty Bank report", "The Lafayette Hill (9510) Cushman report"] },
  20: { title: "Close", what: ["Verify every property is in balance — that's yours", "Close the prior month in Skyline", "Import every property's GL", "Allocate expenses and credit card charges"] },
  27: { title: "Wrap up (last Friday)", what: ["Print management fee checks", "Tenant group setup"] },
};
type Freq = "monthly" | "weekly" | "quarterly" | "annual";
const MINE: Record<Freq, [string, string][]> = {
  monthly: [["Reconcile every bank statement", "Statements + Bank Recs"], ["Balance sheet recs: intercompany, A/R, A/P, loans", "Skyline TB / GL, Debt Tracker"], ["Payroll and allocation journal entries", "The payroll GL import file"], ["Post direct-pay mortgages; NI LLC principal and interest allocation", "Lender statements, Debt Tracker"], ["Before the 20th: verify every property is in balance", "Skyline TB; the portal's Balance Sheet"], ["After the 20th: review statements with Drew", "Operating Statements, Flags to Investigate"]],
  weekly: [["Lead the status meeting with EisnerAmper (from day 31)", "The open-items list"]],
  quarterly: [["Balance sheet workpapers", "TB, GL"], ["Draft adjusting entries", "EisnerAmper templates"]],
  annual: [["December: build the 1099 vendor list", "1099 Register"], ["January: file the 1099s", "track1099.com"], ["February: start year-end workpapers once January closes", "EisnerAmper workpaper index"]],
};
const YEAR: Record<number, string[]> = {
  0: ["1099s filed", "Year-end begins"],
  1: ["Year-end workpapers start", "Philadelphia RE tax paid for the 1% discount"],
  2: ["CAM / RET reconciliations"],
  3: ["Year-end adjustments posted by 4/30", "Distributions", "PA-65 / PA-40ES due 4/15", "Bucks county tax"],
  4: ["Quarter-end workpapers (Q1)"],
  5: ["Mid-year — reprojections get real"],
  6: ["Quarter-end workpapers (Q2)"],
  7: ["Insurance Statement of Values to the broker", "Bucks school tax"],
  8: ["Budgets start 9/1", "School taxes"],
  9: ["Distributions", "Quarter-end workpapers (Q3)"],
  10: ["Insurance renews"],
  11: ["1099 vendor list", "Every held allocation balance bills"],
};

export function Rhythm({ onFinish, done }: LessonProps) {
  const [d, setD] = useState(20);
  const [freq, setFreq] = useState<Freq>("monthly");
  const [m, setM] = useState(3);
  const marked = Object.keys(DAYS).map(Number);
  const nearest = marked.filter((x) => x <= d).pop() ?? 1;

  const scenes: Scene[] = [
    {
      kicker: "The month", title: "Five fixed points every month",
      body: <>The month runs on a few fixed days, and <strong>the 20th is the big one</strong>: every property verified in balance, the prior month closed, every GL imported. Your balance check comes right before it.</>,
      doThis: "Click days on the calendar",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 5 }}>
            {Array.from({ length: 31 }, (_, k) => k + 1).map((n) => {
              const key = marked.includes(n);
              const on = n === nearest;
              return (
                <button key={n} type="button" onClick={() => setD(n)}
                  style={{ height: 40, borderRadius: 8, font: "inherit", cursor: "pointer", fontWeight: key ? 800 : 400,
                    border: `1px solid ${on ? "var(--brand)" : key ? soft(40) : "var(--hairline)"}`, background: on ? "var(--brand)" : key ? soft(8) : "transparent",
                    color: on ? "var(--card)" : key ? "var(--brand)" : "var(--muted)" }}>{n}</button>
              );
            })}
          </div>
          <Panel title={`${nearest === 27 ? "Last Friday" : `The ${nearest}${nearest === 1 ? "st" : "th"}`} · ${DAYS[nearest].title}`}>{rows(DAYS[nearest].what)}</Panel>
        </div>
      ),
    },
    {
      kicker: "Your tasks", title: "What has your name on it",
      body: <>These are the recurring tasks that become yours. Every one is in the portal's <strong>Task Tracker</strong>, with step-by-step instructions. As needed, too: TI draw requests to Liberty (with Tanya) and default letters to delinquent tenants (with Greg).</>,
      doThis: "Switch between how often",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle value={freq} onChange={setFreq} options={[{ id: "monthly", label: "Monthly" }, { id: "weekly", label: "Weekly" }, { id: "quarterly", label: "Quarterly" }, { id: "annual", label: "Annual" }]} />
          <div>
            {MINE[freq].map(([t, w]) => (
              <div key={t} className="task-row" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,0.8fr)", gap: 12, padding: "11px 2px", borderBottom: "1px solid var(--hairline)" }}>
                <span style={{ fontWeight: 600 }}>{t}</span><span style={{ color: "var(--muted)" }}>{w}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      kicker: "The year", title: "And the year's fixed points",
      body: <>The year has its own rhythm: CAM recs in spring, distributions in April and October, budgets from September, insurance in November, 1099s in January. The full calendar is in the handbook (5.1).</>,
      doThis: "Click through the months",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0,1fr))", gap: 4 }}>
            {MONTHS.map((x, k) => (
              <button key={x} type="button" onClick={() => setM(k)}
                style={{ height: 54, borderRadius: 8, font: "inherit", cursor: "pointer", fontWeight: 700, border: `1px solid ${k === m ? "var(--brand)" : "var(--hairline)"}`,
                  background: k === m ? "var(--brand)" : soft(Math.min(4 + YEAR[k].length * 4, 18)), color: k === m ? "var(--card)" : "var(--text)" }}>{x}</button>
            ))}
          </div>
          <Panel title={MONTHS[m]}>{rows(YEAR[m])}</Panel>
        </div>
      ),
    },
    {
      kicker: "Summary", title: "Summary",
      body: <>The rhythm in three lines.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["The 20th is close", "Your in-balance check comes first, then the close and every GL import."],
        ["Recs and entries every month", "Bank recs, balance sheet recs, payroll and allocation entries, mortgages."],
        ["The year has anchors", "CAM recs by 4/30, distributions April and October, budgets from 9/1, 1099s in January."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Reporting and Budgets
// ─────────────────────────────────────────────────────────────────────────────

const REPORTS = ["Operating statement", "Flags to Investigate", "Reprojection", "T-12", "Balance sheet", "Management fees"];
type Mark = "flag" | "missing" | "ties";
const BUDGET_SOURCES: Record<string, { from: string; who: string }> = {
  "Base rent": { from: "The rent roll, plus the leasing calls for vacancies and expiring leases", who: "Harry (shopping centers), Nancy (business parks)" },
  "CAM recoveries": { from: "Each tenant's CAM methodology applied to the budget's own expense pools", who: "Calculated" },
  "Real estate taxes": { from: "Public assessments times each taxing body's millage", who: "Calculated; Drew can override" },
  "Insurance": { from: "The renewal premium, spread like this year", who: "Drew" },
  "Salaries": { from: "The payroll budget, split by each employee's allocation", who: "Drew and Alison" },
  "Mortgage interest": { from: "Each loan's amortization schedule", who: "The Debt Tracker" },
  "Everything else": { from: "The last twelve months of actuals, plus 3%", who: "Calculated; anyone can type over it" },
};

export function Reporting({ onFinish, done }: LessonProps) {
  const [mark, setMark] = useState<Mark>("flag");
  const [posted, setPosted] = useState(8);
  const [src, setSrc] = useState("Base rent");

  const BUD = 50_000, ACT = [48_200, 51_300, 49_800, 53_100, 47_600, 52_400, 50_900, 55_200, 49_400, 51_800, 50_600, 52_900];
  const actualToDate = ACT.slice(0, posted).reduce((a, b) => a + b, 0);
  const reproj = actualToDate + BUD * (12 - posted);
  const max = Math.max(...ACT, BUD);

  const scenes: Scene[] = [
    {
      kicker: "The import", title: "One GL import builds every report",
      body: <>After the close (around the 20th), each property's <strong>Detailed GL</strong> — January to the latest month — is exported from Skyline and imported into the portal. That single import builds everything else.</>,
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <Node lit icon={<Upload {...ICON} />} title="Detailed GL · January to the latest month" sub="Exported from Skyline after the close, imported once" />
          <Arrow down />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
            {REPORTS.map((r) => (
              <Node key={r} lit icon={<FileText {...ICON} />} title={r} />
            ))}
          </div>
          <Note>Six reports from one file; a re-import updates them together.</Note>
        </div>
      ),
    },
    {
      kicker: "Reading a statement", title: "Three marks to know",
      body: <>A statement shows the month and year to date, actual against budget. <strong>NOI excludes capital and debt</strong> — both sit below it. Three marks tell you where to look first.</>,
      doThis: "Click each mark",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className={mark === "flag" ? "btn primary lesson-toggle" : "btn lesson-toggle"} onClick={() => setMark("flag")}><span style={{ fontWeight: 900 }}>?</span> Flag</button>
            <button type="button" className={mark === "missing" ? "btn primary lesson-toggle" : "btn lesson-toggle"} onClick={() => setMark("missing")}>Not posted</button>
            <button type="button" className={mark === "ties" ? "btn primary lesson-toggle" : "btn lesson-toggle"} onClick={() => setMark("ties")}><CircleCheck size={16} strokeWidth={1.75} /> GL ties</button>
          </div>
          {mark === "flag" && <Panel title="The amber ?"><div style={{ lineHeight: 1.55 }}>A line off by <strong>$500 or more</strong> and unusual for it. Flags to Investigate collects them, and the goal each month is an <strong>empty list</strong> — explained, fixed or dismissed. Most carry an AI note that already says what it looks like.</div></Panel>}
          {mark === "missing" && <Panel title={<span style={{ color: AMBER }}>Not posted</span>}><div style={{ lineHeight: 1.55 }}>A known obligation — <strong>taxes, insurance, the management fee or a mortgage</strong> — reading $0. It's an omission, not a variance, so <strong>chase it first</strong>.</div></Panel>}
          {mark === "ties" && <Panel title={<span style={{ color: GREEN }}>GL ties</span>}><div style={{ lineHeight: 1.55 }}>Every uploaded file's monthly activity rolls to the ending balances it reports. If it doesn't, the import is incomplete — fix that before reading anything else.</div></Panel>}
          <Note>A fund portfolio (PJV3 / PNIPLX) is its buildings consolidated.</Note>
        </div>
      ),
    },
    {
      kicker: "Reprojection", title: "Actual to date, budget for the rest",
      body: <>A <strong>reprojection</strong> is where the year will land: the months posted so far, plus the budget for the months still to come. The <strong>T-12</strong> is the opposite view — the last twelve months of actuals only.</>,
      doThis: "Slide the months posted",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={SECTION}>Example line · budget {money(BUD)} a month</div>
          {range("Months posted", posted, setPosted, 0, 12, 1, (n) => (n ? `through ${MONTHS[n - 1]}` : "none"))}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0,1fr))", gap: 4, alignItems: "end", height: 130 }}>
            {MONTHS.map((x, k) => {
              const isAct = k < posted, v = isAct ? ACT[k] : BUD;
              return (
                <div key={x} style={{ display: "grid", gap: 4, justifyItems: "center" }}>
                  <div style={{ width: "100%", height: (v / max) * 100, borderRadius: 4, background: isAct ? "var(--brand)" : soft(18), border: isAct ? 0 : "1px dashed var(--brand)", transition: "all .3s" }} />
                  <span style={{ fontSize: "var(--fs-12)", color: "var(--muted)" }}>{x}</span>
                </div>
              );
            })}
          </div>
          <Panel>
            <Facts rows={[["Actual to date", money(actualToDate)], ["Budget for the rest", money(BUD * (12 - posted))], ["Full-year budget", money(BUD * 12)]]} />
            <Total label="Reprojection" value={money(reproj)} tone={reproj > BUD * 12 ? RED : GREEN} />
          </Panel>
        </div>
      ),
    },
    {
      kicker: "Budgets", title: "Every budget line comes from somewhere",
      body: <>Budgets are built September to December in the Budget Draft. Each line has a <strong>source</strong>, so a budget is mostly calculated and only partly typed. The published budget is what the statements compare against from January 1.</>,
      doThis: "Pick a line",
      stage: (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.8fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 5 }}>{Object.keys(BUDGET_SOURCES).map((k) => <Pick key={k} on={k === src} onClick={() => setSrc(k)}><span style={{ fontWeight: 600 }}>{k}</span></Pick>)}</div>
          <Panel title={src}><Facts rows={[["Comes from", BUDGET_SOURCES[src].from], ["Who", BUDGET_SOURCES[src].who]]} /></Panel>
        </div>
      ),
    },
    {
      kicker: "Summary", title: "Summary",
      body: <>Reporting in three lines.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Import the GL, everything follows", "Statement, flags, reprojection, T-12, balance sheet and management fees."],
        ["Not posted first, then the ?s", "A missing obligation outranks a variance; work Flags to Investigate to empty."],
        ["Reprojection = actual + budget", "And next year's budget is mostly calculated from sources."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenants, CAM and Deposits
// ─────────────────────────────────────────────────────────────────────────────

type Lease = "nnn" | "base" | "gross";
export function Tenants({ onFinish, done }: LessonProps) {
  const [lease, setLease] = useState<Lease>("nnn");
  const [exp, setExp] = useState(120_000);
  const [billed, setBilled] = useState(9_600);
  const [actual, setActual] = useState(11_200);
  const [unpaid, setUnpaid] = useState(3_200);
  const [deposit, setDeposit] = useState(6_000);
  const [recon, setRecon] = useState(1_400);

  const rent = 4_000, cam = 900, ret = 500, ins = 150;
  const parts = lease === "nnn" ? [["Base rent", rent], ["CAM estimate", cam], ["RET estimate", ret], ["INS estimate", ins]]
    : lease === "base" ? [["Base rent", rent], ["Over base year", 260]] : [["Rent (costs included)", rent + 300]];
  const monthTotal = parts.reduce((a, [, v]) => a + (v as number), 0);

  const share = 0.1, baseYear = 100_000;
  const nnnDue = exp * share;
  const baseDue = Math.max(0, (exp - baseYear) * share);
  const trueUp = actual - billed;
  const finalBal = recon + unpaid - deposit;

  const scenes: Scene[] = [
    {
      kicker: "What a tenant pays", title: "Rent plus estimates — depending on the lease",
      body: <>A tenant pays <strong>base rent</strong> plus monthly <strong>estimates</strong> of CAM, real estate tax (RET) and insurance (INS). How much of that applies depends on the lease type, and the lease type mostly follows the property type.</>,
      doThis: "Switch lease types",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle value={lease} onChange={setLease} options={[{ id: "nnn", label: "NNN · shopping centers" }, { id: "base", label: "Base year · business parks" }, { id: "gross", label: "Gross · Korman Homes" }]} />
          <div style={SECTION}>Example monthly bill</div>
          <div style={{ display: "flex", height: 34, borderRadius: 6, overflow: "hidden" }}>
            {parts.map(([l, v], k) => (
              <div key={l as string} style={{ width: `${((v as number) / monthTotal) * 100}%`, background: soft(90 - k * 22), transition: "width .4s" }} />
            ))}
          </div>
          <div>{parts.map(([l, v]) => <div key={l as string} className="task-row" style={{ display: "flex", justifyContent: "space-between", padding: "8px 2px", borderBottom: "1px solid var(--hairline)" }}><span>{l}</span><strong>{money(v as number)}</strong></div>)}</div>
          <Total label="Monthly bill" value={money(monthTotal)} />
          <Note>{lease === "nnn" ? "Nearly every retail tenant pays their share of all three, through estimates." : lease === "base" ? "Office tenants pay only the increase over their base year — for most, expense by expense." : "Rent covers the costs, though billbacks like lawn mowing can still apply."}</Note>
        </div>
      ),
    },
    {
      kicker: "Base year", title: "NNN pays the share; base year pays the increase",
      body: <>Same building, same share, two leases. An <strong>NNN</strong> tenant pays their share of the whole expense. A <strong>base-year</strong> tenant pays their share of the <strong>increase over their base year</strong> — and never less than zero.</>,
      doThis: "Move this year's expense",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={SECTION}>Example · 10% share · base year {money(baseYear)}</div>
          {range("This year's expense", exp, setExp, 70_000, 150_000, 1_000, money)}
          <Bar label="NNN tenant pays" value={nnnDue} max={15_000} note={money(nnnDue)} />
          <Bar label="Base-year tenant pays" value={baseDue} max={15_000} tone={baseDue ? "var(--brand)" : "var(--c-98a2b3)"} note={money(baseDue)} />
          <Note>{exp <= baseYear ? "Under the base year, the base-year tenant owes nothing — the owner keeps the savings and the risk." : `${money(exp - baseYear)} over base, times 10%.`}</Note>
        </div>
      ),
    },
    {
      kicker: "The true-up", title: "Once a year, estimates meet actual",
      body: <>Each March / April the <strong>CAM / RET reconciliation</strong> compares what a tenant was billed in estimates with their share of actual expenses. The difference is billed — or credited — as a <strong>year-end adjustment</strong>, posted 4/30.</>,
      doThis: "Move billed and actual",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={SECTION}>Example tenant · one year</div>
          {range("Estimates billed", billed, setBilled, 6_000, 14_000, 100, money)}
          {range("Share of actual", actual, setActual, 6_000, 14_000, 100, money)}
          <Total label={trueUp > 0 ? "Balance due from tenant" : trueUp < 0 ? "Credit to tenant" : "Even"} value={money(Math.abs(trueUp))} tone={trueUp > 0 ? AMBER : trueUp < 0 ? GREEN : undefined} />
          <Note>The share comes from the tenant's methodology on their unit page — PRS, admin fee, excluded lines, caps.</Note>
        </div>
      ),
    },
    {
      kicker: "Move-outs", title: "The final bill",
      body: <>When a tenant leaves, their <strong>final bill</strong> is the reconciliation through the move-out, plus any unpaid charges, less their security deposit. Nancy approves office move-outs, Harry retail; then Tanya posts the charges.</>,
      doThis: "Build a final bill",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={SECTION}>Example</div>
          {range("Reconciliation", recon, setRecon, -2_000, 4_000, 100, money)}
          {range("Unpaid charges", unpaid, setUnpaid, 0, 8_000, 100, money)}
          {range("Security deposit", deposit, setDeposit, 0, 10_000, 100, money)}
          <Panel>
            <Facts rows={[["Reconciliation", money(recon)], ["Unpaid charges", money(unpaid)], ["Less the deposit", `(${money(deposit)})`]]} />
            <Total label={finalBal >= 0 ? "Balance due" : "Refund to tenant"} value={money(Math.abs(finalBal))} tone={finalBal > 0 ? AMBER : GREEN} />
          </Panel>
        </div>
      ),
    },
    {
      kicker: "Summary", title: "Summary",
      body: <>Special cases to remember: Parkwood (<code>7010</code>) has two CAM pools, retail and the upstairs office; Wawa at Lafayette Hill (<code>9510</code>) is billed quarterly; Butler &amp; Main (<code>9000</code>) tenants are gross.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Rent plus estimates", "The rent roll is the one source for who is where, the SF and the charges."],
        ["The lease decides the share", "NNN pays a share of everything; base year pays the increase; gross pays rent."],
        ["Trued up every spring", "Year-end adjustments post 4/30; a move-out nets everything against the deposit."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Taxes, 1099s and Insurance
// ─────────────────────────────────────────────────────────────────────────────

type County = "phila" | "bucks" | "mont";
const TAX: Record<County, { label: string; bills: Record<number, string>; note: string }> = {
  phila: { label: "Philadelphia", bills: { 1: "Paid by the end of February for the 1% discount (due 3/31)" }, note: "One bill. Also U&O tax monthly (Tanya), and BIRT / NPT." },
  bucks: { label: "Bucks", bills: { 3: "County and township", 7: "School", 8: "School (some districts)" }, note: "Paid early for the 2% discount." },
  mont: { label: "Montgomery", bills: { 2: "County and municipal", 3: "County and municipal", 8: "School" }, note: "Paid early for the 2% discount." },
};
const VENDOR_PAYS = [{ id: "4050", amt: 250 }, { id: "4060", amt: 250 }, { id: "4070", amt: 250 }, { id: "4080", amt: 250 }];

export function Taxes({ onFinish, done }: LessonProps) {
  const [county, setCounty] = useState<County>("bucks");
  const [view, setView] = useState<"building" | "ein">("building");
  const [ins, setIns] = useState(0);
  const t = TAX[county];
  const INS_STEPS = [
    { m: "August", t: "Statement of Values out", d: "The broker's form, filled from each property's Building Facts and the rent roll." },
    { m: "Sept–Oct", t: "Quotes", d: "The broker markets the renewal." },
    { m: "November", t: "Renewal", d: "Policies renew; the premium goes into next year's budget." },
    { m: "Year end", t: "Into recoveries", d: "The property premium sits in the INS pool (retail) or CAM (office); liability is a CAM line." },
  ];

  const scenes: Scene[] = [
    {
      kicker: "Real estate taxes", title: "Each county bills on its own calendar",
      body: <>Real estate tax bills land at different times depending on the county, and each has an <strong>early-payment discount</strong> worth hitting. Business taxes come from EisnerAmper: Philadelphia BIRT and NPT, PA-65 / PA-40ES for Elbridge and Revere (April 15), and Bellmawr's Net Profits Tax quarterly.</>,
      doThis: "Pick a county",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle value={county} onChange={setCounty} options={(Object.keys(TAX) as County[]).map((k) => ({ id: k, label: TAX[k].label }))} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0,1fr))", gap: 4 }}>
            {MONTHS.map((x, k) => {
              const on = !!t.bills[k];
              return (
                <div key={x} style={{ height: 58, borderRadius: 8, border: `1px solid ${on ? "var(--brand)" : "var(--hairline)"}`, background: on ? soft(14) : "transparent",
                  display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6, fontWeight: on ? 800 : 400, color: on ? "var(--brand)" : "var(--muted)", transition: "all .3s" }}>{x}</div>
              );
            })}
          </div>
          <div>{Object.entries(t.bills).map(([k, v]) => <div key={k} className="task-row" style={{ display: "flex", gap: 14, padding: "9px 2px", borderBottom: "1px solid var(--hairline)" }}><strong style={{ minWidth: 40 }}>{MONTHS[+k]}</strong><span>{v}</span></div>)}</div>
          <Note>{t.note}</Note>
        </div>
      ),
    },
    {
      kicker: "1099s", title: "Count per filer, not per building",
      body: <>1099s are <strong>yours, start to finish</strong>. They're built from <strong>cash paid</strong> in the calendar year and totalled per <strong>filing entity (EIN)</strong>. The NI LLC buildings are one filer — so small payments from several of them add up.</>,
      doThis: "Look at it both ways",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={SECTION}>Example · one vendor, one year</div>
          <Toggle value={view} onChange={setView} options={[{ id: "building", label: "By building" }, { id: "ein", label: "By filer (EIN)" }]} />
          {view === "building" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
              {VENDOR_PAYS.map((v) => <Node key={v.id} icon={<Building2 {...ICON} />} title={money(v.amt)} sub={<><code>{v.id}</code> paid</>} />)}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
              <Node lit icon={<Building2 {...ICON} />} title="Four NI LLC buildings" sub="One EIN" />
              <Arrow />
              <Node lit big icon={<FileText {...ICON} />} title={money(1_000)} sub="To one filer — reportable" />
            </div>
          )}
          <Note tone={view === "building" ? AMBER : GREEN}>{view === "building" ? "Building by building, this vendor looks too small to matter." : "Per EIN it's $1,000 — and it needs a 1099."}</Note>
          <Note>The vendor list is built in December from the portal's 1099 Register and filed through track1099.com in January.</Note>
        </div>
      ),
    },
    {
      kicker: "Insurance", title: "The insurance cycle",
      body: <>Insurance renews in <strong>November</strong>. The work starts in August, when the broker's Statement of Values goes out — and the portal fills it from data you already keep.</>,
      doThis: "Step through the cycle",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
            {INS_STEPS.map((s, k) => <Node key={s.t} lit={k <= ins} onClick={() => setIns(k)} icon={k < ins ? <CircleCheck {...ICON} /> : <ShieldCheck {...ICON} />} title={s.m} sub={s.t} />)}
          </div>
          <Panel title={INS_STEPS[ins].t}><div style={{ lineHeight: 1.55 }}>{INS_STEPS[ins].d}</div></Panel>
          {ins < INS_STEPS.length - 1 && <button type="button" className="btn" style={{ justifySelf: "start" }} onClick={() => setIns(ins + 1)}>Next stage</button>}
        </div>
      ),
    },
    {
      kicker: "Summary", title: "Summary",
      body: <>Taxes and insurance in three lines.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Pay early, take the discount", "Philadelphia by end of February (1%); Bucks and Montgomery early (2%)."],
        ["1099s: cash, per EIN", "Totalled per filing entity — four buildings of one fund are one filer."],
        ["Insurance: August to November", "Statement of Values out in August, renewal in November."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Review, Workpapers and EisnerAmper
// ─────────────────────────────────────────────────────────────────────────────

const CYCLE = [
  { t: "Send and post", d: "Bank statements, payroll reports, loan and tax statements and insurance documents go to EisnerAmper; agreed entries are posted." },
  { t: "Workpapers prepared", d: "Workpapers and recs are prepared, and an open-items list goes out." },
  { t: "Resolve open items", d: "Both teams meet to resolve them." },
  { t: "Finalize", d: "Final adjusting entries post; the workpapers are finalized." },
];
const OUT_OF_SCOPE = ["Budgeting", "Lender and investor reporting", "Cash management", "Financial statements and tax returns", "Historical cleanup", "Audit support", "System changes and new entities"];

export function Eisner({ onFinish, done }: LessonProps) {

  const scenes: Scene[] = [
    {
      kicker: "The firm", title: "You prepare, they review",
      body: <><strong>EisnerAmper</strong> is our outside accounting firm. After the handover, they review your work with written comments, join the weekly status and the quarterly workpaper meetings, and coordinate with their tax team at year end.</>,
      stage: (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.7fr) minmax(0,1fr) minmax(0,1fr)", gap: 10, ...SECTION }}><span>Area</span><span>You</span><span>EisnerAmper</span></div>
          {[
            ["Preparation", "Recs, entries, workpapers, open items, draft adjusting entries", "Training and guidance"],
            ["Review", "Answer comments and correct items", "Full review, written comments"],
            ["Tax", "Trial balances, schedules, support", "Their tax team"],
            ["Meetings", "Lead the weekly status", "Weekly, and the quarterly review"],
          ].map(([a, y, e]) => (
            <div key={a} className="task-row" style={{ display: "grid", gridTemplateColumns: "minmax(0,0.7fr) minmax(0,1fr) minmax(0,1fr)", gap: 10, padding: "11px 2px", borderBottom: "1px solid var(--hairline)" }}>
              <strong>{a}</strong><span>{y}</span><span style={{ color: "var(--muted)" }}>{e}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      kicker: "The cycle", title: "Every quarter, four steps",
      body: <>The quarterly workpaper cycle is the backbone of working with them. You'll start it, and it ends with finalized workpapers.</>,
      stage: (
        <div>
          {CYCLE.map((c, k) => (
            <div key={c.t} className="task-row" style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr)", gap: 12, padding: "12px 2px", borderBottom: "1px solid var(--hairline)" }}>
              <span style={{ width: 32, height: 32, borderRadius: 999, border: "1px solid var(--brand)", color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{k + 1}</span>
              <div><div style={{ fontWeight: 800 }}>{c.t}</div><div style={{ color: "var(--muted)", lineHeight: 1.5 }}>{c.d}</div></div>
            </div>
          ))}
        </div>
      ),
    },
    {
      kicker: "Scope", title: "Late changes and scope",
      body: <>Two working rules. An entry that touches a period they have already worked means <strong>redoing workpapers</strong>, so tell EisnerAmper promptly. And work outside their engagement is <strong>billed hourly</strong> and needs <strong>Drew's written OK</strong> before it is requested.</>,
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={SECTION}>Outside the engagement</div>
          <div>{OUT_OF_SCOPE.map((o) => <div key={o} className="task-row" style={{ padding: "9px 2px", borderBottom: "1px solid var(--hairline)" }}>{o}</div>)}</div>
          <Note>Recs, entries, workpapers and year-end tax support are inside scope.</Note>
        </div>
      ),
    },
    {
      kicker: "Summary", title: "Summary",
      body: <>That's the last module. The handbook has everything in more depth.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["You prepare, they review", "Written comments, weekly status, the quarterly review."],
        ["A late change gets a heads-up", "Anything touching a worked period — tell them promptly."],
        ["Extra work needs Drew's OK", "Out-of-scope requests are billed hourly."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}
