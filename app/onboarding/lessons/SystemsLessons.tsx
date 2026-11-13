"use client";
// Part 2 · Systems — three click-through lessons: the three core systems and
// what moves between them, working in the portal, and reading an account
// number. Example figures are labelled as examples.

import { useMemo, useState } from "react";
import { Banknote, CalendarDays, Database, FileSpreadsheet, LayoutGrid, MousePointerClick } from "lucide-react";
import { AMBER, Arrow, BIG_ICON, GREEN, LessonShell, Node, Note, Panel, Pick, RED, Recap, SECTION, Toggle, money, soft, type LessonProps, type Scene } from "./kit";

// ─────────────────────────────────────────────────────────────────────────────
// Skyline, the Portal and AvidXchange
// ─────────────────────────────────────────────────────────────────────────────

type Sys = "skyline" | "portal" | "avid";
type Leg = "s2p" | "p2a" | "a2s";
const LEGS: Record<Leg, { from: Sys; to: Sys; title: string; what: string[] }> = {
  s2p: { from: "skyline", to: "portal", title: "Skyline to Portal", what: ["The Detailed GL each month — including the 2000 GL for allocations", "The rent roll", "Tenant statements (the Laser Statement)", "Together they build statements, recs and reports"] },
  p2a: { from: "portal", to: "avid", title: "Portal to AvidXchange", what: ["Intercompany invoices: payroll, credit cards, allocated expenses, commissions", "One PDF per building, each in its own email", "The AP Outbox on Drew's dashboard lists every batch sent"] },
  a2s: { from: "avid", to: "skyline", title: "AvidXchange to Skyline", what: ["Every approved bill, vendor and intercompany", "Imported into Skyline to print and pay", "Vendor invoices reach Avid at kormancommercial@avidbill.com"] },
};
const SYS: Record<Sys, { name: string; does: string; icon: React.ReactNode }> = {
  skyline: { name: "Skyline", does: "Holds the books", icon: <Database {...BIG_ICON} /> },
  portal: { name: "KCP Portal", does: "Where the work happens", icon: <LayoutGrid {...BIG_ICON} /> },
  avid: { name: "AvidXchange", does: "Pays the bills", icon: <Banknote {...BIG_ICON} /> },
};

const ROUTES: { q: string; path: string[]; note: string }[] = [
  { q: "A vendor emails us an invoice", path: ["Vendor", "AvidXchange", "Approved", "Skyline"], note: "Forwarded to kormancommercial@avidbill.com, approved in Avid, then imported into Skyline. Paid on Wednesday." },
  { q: "The month closes and statements are needed", path: ["Skyline", "Detailed GL", "Portal"], note: "Export the Detailed GL from Skyline and import it — one import builds every monthly report." },
  { q: "A building owes its share of payroll", path: ["Portal", "PR invoice", "AvidXchange"], note: "The Payroll Invoicer sends one invoice per building to Avid; the building pays it like any bill." },
  { q: "You need a bank statement for a rec", path: ["Bank website", "Bank Recs"], note: "Chase, Liberty and M&T online banking; the statements go into the month's bank rec folder." },
  { q: "Paychecks need to go out", path: ["Harry", "ADP"], note: "Harry runs payroll in ADP. You won't use it directly — you'll book what it produces." },
  { q: "EisnerAmper needs support for a workpaper", path: ["SharePoint", "EisnerAmper portal"], note: "Support lives in SharePoint; it goes to them through their shared portal and comes back the same way." },
  { q: "January: file the 1099s", path: ["Portal 1099 Register", "track1099.com"], note: "Build the vendor list in the 1099 Register, then file through track1099.com." },
];

export function Systems({ onFinish, done }: LessonProps) {
  const [leg, setLeg] = useState<Leg | null>(null);
  const [route, setRoute] = useState(0);
  const lit = (s: Sys) => !leg || LEGS[leg].from === s || LEGS[leg].to === s;
  const r = ROUTES[route];

  const scenes: Scene[] = [
    {
      kicker: "Systems", title: "Three systems, one loop",
      body: <><strong>Skyline</strong> holds the books. <strong>The KCP Portal</strong> is where the work happens. <strong>AvidXchange</strong> pays the bills. Almost everything you touch is one leg of this loop.</>,
      doThis: "Click each leg of the loop",
      stage: (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", gap: 8, alignItems: "center" }}>
            {(["skyline", "portal", "avid"] as Sys[]).map((s, k) => (
              <span key={s} style={{ display: "contents" }}>
                <Node big lit={lit(s)} icon={SYS[s].icon} title={SYS[s].name} sub={SYS[s].does} />
                {k < 2 && <Arrow on={leg === (k === 0 ? "s2p" : "p2a")} />}
              </span>
            ))}
          </div>
          <Toggle value={leg} onChange={setLeg} options={(Object.keys(LEGS) as Leg[]).map((k) => ({ id: k, label: LEGS[k].title }))} />
          {leg ? (
            <Panel title={LEGS[leg].title}>
              <div>{LEGS[leg].what.map((w) => <div key={w} className="task-row" style={{ padding: "9px 2px", borderBottom: "1px solid var(--hairline)" }}>{w}</div>)}</div>
            </Panel>
          ) : <Note>The third leg runs back underneath: what Avid approves goes into Skyline.</Note>}
          <Note tone="var(--brand)"><CalendarDays size={16} strokeWidth={1.75} style={{ verticalAlign: "-3px" }} /> All AP runs through AvidXchange, and bills are paid on Wednesdays.</Note>
        </div>
      ),
    },
    {
      kicker: "Practice", title: "Where does this go?",
      body: <>Beyond the big three there's ADP for payroll, the banks' sites for statements, SharePoint for support, EisnerAmper's portal, and track1099.com. Pick a situation and follow the path.</>,
      doThis: "Pick a situation",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 6 }}>
            {ROUTES.map((x, k) => <Pick key={x.q} on={k === route} onClick={() => setRoute(k)}><span>{x.q}</span></Pick>)}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {r.path.map((p, k) => (
              <span key={p + k} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <span style={{ border: "1px solid var(--brand)", background: soft(8), borderRadius: 8, padding: "8px 12px", fontWeight: 700 }}>{p}</span>
                {k < r.path.length - 1 && <Arrow />}
              </span>
            ))}
          </div>
          <Note>{r.note}</Note>
        </div>
      ),
    },
    {
      kicker: "Recap", title: "What to carry with you",
      body: <>The systems in three lines.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Skyline is the books", "The GL, rent roll and tenant statements come out of it and into the portal."],
        ["The portal does the work", "Statements, recs, invoices and budgets are built there from Skyline's data."],
        ["Avid pays, on Wednesdays", "Every bill — vendor or intercompany — goes through AvidXchange, then into Skyline."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Working in the Portal
// ─────────────────────────────────────────────────────────────────────────────

type Section = "home" | "directory" | "tenancy" | "cam" | "invoicing" | "banking" | "financials" | "reports";
const SECTIONS: Record<Section, { label: string; has: string[] }> = {
  home: { label: "Home", has: ["Your dashboard", "Task Tracker — every recurring task, with step-by-step instructions", "Filing Tracker"] },
  directory: { label: "Directory", has: ["Property Info — facts, ownership, tax parcels", "Unit Info — each suite's lease and CAM setup"] },
  tenancy: { label: "Tenancy", has: ["Rent Roll", "Occupancy and leasing history"] },
  cam: { label: "CAM", has: ["CAM / RET reconciliations", "Estimates", "Operating expense history"] },
  invoicing: { label: "Invoicing", has: ["Receivables", "The intercompany invoicers that send to Avid"] },
  banking: { label: "Banking", has: ["Bank Balances", "Debt Tracker", "Security Deposits", "Bank Recs"] },
  financials: { label: "Financials", has: ["Operating Statements", "Flags to Investigate", "Reprojections", "Budgets"] },
  reports: { label: "Reports", has: ["The Report Center: Balance Sheet, T-12, 1099 Register, Management Fees and more"] },
};

const LINES: { label: string; actual: number; budget: number; tx: [string, string, number][] }[] = [
  { label: "Electric", actual: 4_120, budget: 3_900, tx: [["09/04", "PECO · common area", 2_880], ["09/18", "PECO · parking lot lights", 1_240]] },
  { label: "Landscaping", actual: 2_600, budget: 2_600, tx: [["09/01", "Monthly contract", 2_600]] },
  { label: "Parking Lot Maint.", actual: 21_750, budget: 590, tx: [["09/12", "Repave and restripe — north lot", 21_750]] },
  { label: "Snow Removal", actual: 0, budget: 0, tx: [] },
];

export function PortalTour({ onFinish, done }: LessonProps) {
  const [sec, setSec] = useState<Section>("financials");
  const [line, setLine] = useState<number | null>(2);
  const [cells, setCells] = useState([1_200, 850, 2_300]);
  const total = cells.reduce((a, b) => a + b, 0);

  const scenes: Scene[] = [
    {
      kicker: "The portal", title: "Our own platform, on top of Skyline",
      body: <>The KCP Portal reads Skyline's imports and the banks' exports, then builds the reports, invoices, recs and budgets — organized by property, built to <strong>surface errors and variances</strong>. You see the pages your role allows, and access widens as you take things on.</>,
      doThis: "Walk the sidebar's sections",
      stage: (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 0.6fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 4 }}>
            {(Object.keys(SECTIONS) as Section[]).map((k) => <Pick key={k} on={k === sec} onClick={() => setSec(k)}><span style={{ fontWeight: 700 }}>{SECTIONS[k].label}</span></Pick>)}
          </div>
          <Panel title={SECTIONS[sec].label}>
            <div>{SECTIONS[sec].has.map((h) => <div key={h} className="task-row" style={{ padding: "10px 2px", borderBottom: "1px solid var(--hairline)" }}>{h}</div>)}</div>
          </Panel>
        </div>
      ),
    },
    {
      kicker: "Habit 1", title: "Every figure opens",
      body: <>A number on a statement is never the end of the trail. <strong>Click a line to see the GL transactions behind it</strong>, and hover a figure for its breakdown. When something looks off, that's the first move.</>,
      doThis: "Click a line on this example statement",
      stage: (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={SECTION}>Example · September</div>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 100px 100px", padding: "0 2px 6px", color: "var(--muted)", fontSize: "var(--fs-13)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <span>Line</span><span style={{ textAlign: "right" }}>Actual</span><span style={{ textAlign: "right" }}>Budget</span>
            </div>
            {LINES.map((l, k) => {
              const off = l.actual - l.budget > 500;
              return (
                <button key={l.label} type="button" onClick={() => setLine(k)} className="task-row"
                  style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 100px 100px", width: "100%", padding: "11px 2px", border: 0, borderBottom: "1px solid var(--hairline)",
                    background: line === k ? soft(7) : "transparent", cursor: "pointer", font: "inherit", color: "var(--text)", textAlign: "left" }}>
                  <span style={{ fontWeight: 600 }}>{l.label}{off && <span style={{ color: AMBER, fontWeight: 800, marginLeft: 8 }}>?</span>}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.actual ? l.actual.toLocaleString() : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{l.budget ? l.budget.toLocaleString() : "—"}</span>
                </button>
              );
            })}
          </div>
          {line != null && (
            <Panel title={`${LINES[line].label} · GL detail`}>
              {LINES[line].tx.length ? LINES[line].tx.map(([d, desc, amt]) => (
                <div key={desc} style={{ display: "grid", gridTemplateColumns: "60px minmax(0,1fr) auto", gap: 10 }}><span style={{ color: "var(--muted)" }}>{d}</span><span>{desc}</span><strong>{money(amt)}</strong></div>
              )) : <Note>Nothing posted — and nothing budgeted, so nothing's missing.</Note>}
              {line === 2 && <Note tone={AMBER}>The amber ? marks a line off budget by $500+ that's unusual for it. A repave is capital — this one belongs in 14xx, not a repair line.</Note>}
            </Panel>
          )}
        </div>
      ),
    },
    {
      kicker: "Habit 2", title: "Exports stay live",
      body: <>Most pages have one <strong>Export</strong> menu, for Excel or PDF. In Excel, every total is a <strong>live formula</strong>, so if you adjust a line the totals still tie.</>,
      doThis: "Change a line and watch the total",
      stage: (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--muted)" }}><FileSpreadsheet size={18} strokeWidth={1.75} /> Example workbook</div>
          <div style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr) 140px", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", fontSize: "var(--fs-14)" }}>
            {["Repairs", "Supplies", "Contract"].map((label, k) => (
              <span key={label} style={{ display: "contents" }}>
                <span style={{ padding: "8px", color: "var(--muted)", borderBottom: "1px solid var(--hairline)", textAlign: "center" }}>{k + 2}</span>
                <span style={{ padding: "8px", borderBottom: "1px solid var(--hairline)" }}>{label}</span>
                <input aria-label={label} inputMode="numeric" value={cells[k]} onChange={(e) => { const v = +e.target.value.replace(/\D/g, "") || 0; setCells((c) => c.map((x, n) => (n === k ? v : x))); }}
                  style={{ border: 0, borderBottom: "1px solid var(--hairline)", borderRadius: 0, textAlign: "right", background: "var(--input-cell)", height: "auto", padding: "8px" }} />
              </span>
            ))}
            <span style={{ padding: "8px", color: "var(--muted)", textAlign: "center" }}>5</span>
            <span style={{ padding: "8px", fontWeight: 800 }}>Total <code style={{ marginLeft: 6 }}>=SUM(C2:C4)</code></span>
            <span style={{ padding: "8px", textAlign: "right", fontWeight: 800 }}>{total.toLocaleString()}</span>
          </div>
          <Note>Blue cells are inputs; white cells are calculated — the same convention the budget uses.</Note>
        </div>
      ),
    },
    {
      kicker: "Habit 3", title: "Ask it, and tell Drew",
      body: <>The search box finds a tenant, unit, property or vendor — and <strong>answers questions about the data</strong> (“occupancy by property type”, “who's most past due”). And if something is missing or wrong, or a feature would help: <strong>tell Drew.</strong> The portal is built for how we work and changes with the team.</>,
      stage: (
        <div style={{ display: "grid", gap: 10 }}>
          {["What's Gray's Ferry's NOI this year vs budget?", "Which tenants are more than 90 days past due?", "Rent per square foot by property type", "Where is suite 4080-401?"].map((q) => (
            <div key={q} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
              <MousePointerClick size={18} strokeWidth={1.75} style={{ color: "var(--brand)" }} /> {q}
            </div>
          ))}
          <Note>Try these in the search box at the top of any page once you're done here.</Note>
        </div>
      ),
    },
    {
      kicker: "Recap", title: "What to carry with you",
      body: <>The portal in three habits.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Click through to the GL", "Every statement line opens its transactions; hover for breakdowns."],
        ["Export once, from the menu", "Excel totals are live formulas, so your edits still tie."],
        ["It changes with the team", "Ask it questions — and tell Drew what's missing."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading an Account Number
// ─────────────────────────────────────────────────────────────────────────────

const MAJOR_NAMES: Record<string, string> = {
  "4230": "Base rent", "4510": "Management fee revenue", "4910": "CAM recovery", "4920": "Real estate tax recovery", "4930": "Insurance recovery",
  "6010": "Salaries & wages", "6030": "Maintenance salaries", "6220": "Building maintenance", "6510": "Insurance", "6610": "Management fee",
  "8110": "Office rent", "8310": "Legal & accounting", "8000": "Payroll & benefits", "1440": "Tenant improvements", "1940": "Leasing commissions", "9210": "Interest",
};
type Rung = "rev" | "opex" | "cap" | "debt" | "bs";
function readMajor(m: number): { what: string; rung: Rung } {
  if (m >= 110 && m < 250) return { what: "Cash", rung: "bs" };
  if (m >= 250 && m < 300) return { what: "Security deposits (restricted cash)", rung: "bs" };
  if (m >= 1400 && m < 1500) return { what: "Capital improvements", rung: "cap" };
  if (m === 1940) return { what: "Capitalized leasing commissions", rung: "cap" };
  if (m >= 2500 && m < 2800) return { what: "Mortgage", rung: "debt" };
  if (m >= 3200 && m < 3800) return { what: "Partners' capital", rung: "bs" };
  if (m < 3800) return { what: "Balance sheet", rung: "bs" };
  if (m >= 4000 && m < 5000) {
    if (m >= 4200 && m < 4300) return { what: "Rent", rung: "rev" };
    if (m >= 4900) return { what: "Recoveries from tenants", rung: "rev" };
    return { what: "Revenue", rung: "rev" };
  }
  if (m === 9210) return { what: "Interest", rung: "debt" };
  if (m >= 6000 && m < 7000) return { what: "Property operations", rung: "opex" };
  if (m >= 7000 && m < 8000) return { what: "Marketing", rung: "opex" };
  if (m >= 8000 && m < 9000) return { what: "General & administrative", rung: "opex" };
  return { what: "Operating expense", rung: "opex" };
}
const SUFFIXES: Record<string, string> = {
  "8502": "Reimbursable — in the CAM pool, billed back to tenants",
  "8501": "Not reimbursable — the owner's cost",
  "8503": "The office part of a mixed building (Parkwood's upstairs office center)",
  "8599": "Extraordinary, one-time — sits below NOI",
  "0000": "The base account, no split",
  "9301": "Allocated in 2000 to the business parks",
  "9302": "Allocated in 2000 to the shopping centers",
  "9303": "Allocated in 2000 to every property",
};
const LADDER: { id: Rung | "noi" | "cf"; label: string }[] = [
  { id: "rev", label: "Revenue" }, { id: "opex", label: "Operating expenses" }, { id: "noi", label: "Net operating income" },
  { id: "cap", label: "Capital" }, { id: "debt", label: "Debt service" }, { id: "cf", label: "Cash flow" },
];

type Coding = "8502" | "8501" | "14xx";
export function Accounts({ onFinish, done }: LessonProps) {
  const [acct, setAcct] = useState("6220-8502");
  const [coding, setCoding] = useState<Coding>("8502");
  const parsed = useMemo(() => {
    const m = acct.trim().match(/^(\d{4})(?:-(\d{4}))?$/);
    if (!m) return null;
    const major = m[1], suffix = m[2];
    return { major, suffix, ...readMajor(+major), name: MAJOR_NAMES[major], sfx: suffix ? SUFFIXES[suffix] : undefined };
  }, [acct]);
  const rung = parsed?.suffix === "8599" ? "cap" : parsed?.rung;

  const cost = 20_000, share = 0.85;
  const effect = {
    "8502": { noi: -cost + cost * share, tenants: cost * share, verdict: "Wrong — tenants are billed for a capital item at year-end CAM.", tone: RED },
    "8501": { noi: -cost, tenants: 0, verdict: "Not quite — it's the owner's cost, but a repave is capital, not a repair. NOI is understated.", tone: AMBER },
    "14xx": { noi: 0, tenants: 0, verdict: "Right — capital sits below NOI, and tenants aren't billed for it.", tone: GREEN },
  }[coding];

  const scenes: Scene[] = [
    {
      kicker: "Accounts", title: "Major, then suffix",
      body: <>An account reads <strong>MAJOR-SUFFIX</strong>, like <code>6220-8502</code>. The major says <strong>what it is</strong>; the suffix says <strong>who pays</strong>. <code>6220-8502</code> reads as “building maintenance that tenants pay for through CAM.”</>,
      doThis: "Decode a few — or type your own",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <input value={acct} onChange={(e) => setAcct(e.target.value)} aria-label="Account number" placeholder="6220-8502"
            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 24, fontWeight: 800, height: 54, color: "var(--brand)", maxWidth: 260 }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["6220-8502", "6220-8501", "4910-0000", "1440-0000", "8310-9302", "6610-8501", "9210-0000", "0250-0000"].map((a) => (
              <button key={a} type="button" className={a === acct ? "btn sm primary lesson-toggle" : "btn sm lesson-toggle"} onClick={() => setAcct(a)}><code>{a}</code></button>
            ))}
          </div>
          {parsed ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Panel title={<>Major <code>{parsed.major}</code></>}><div style={{ fontWeight: 800, fontSize: 18 }}>{parsed.name ?? parsed.what}</div>{parsed.name && <Note>{parsed.what}</Note>}</Panel>
              <Panel title={<>Suffix <code>{parsed.suffix ?? "—"}</code></>}><div style={{ fontWeight: 700 }}>{parsed.sfx ?? (parsed.suffix ? "A sub-account" : "Add a suffix")}</div></Panel>
            </div>
          ) : <Note>Four digits, a dash, four digits — like 6220-8502.</Note>}
        </div>
      ),
    },
    {
      kicker: "The statement", title: "The major decides where it lands",
      body: <>Ranges map to the statement: <code>4xxx</code> revenue, <code>5xxx</code>–<code>8xxx</code> operating expenses, then NOI. Capital (<code>14xx</code>, <code>1940</code>) and debt (<code>9210</code>, <code>27xx</code>) sit <strong>below NOI</strong>. <code>0110</code>–<code>3799</code> is the balance sheet.</>,
      doThis: "Pick an account and watch the ladder",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["4230-0000", "4910-0000", "6220-8502", "8310-8501", "1440-0000", "9210-0000", "6990-8599", "0250-0000"].map((a) => (
              <button key={a} type="button" className={a === acct ? "btn sm primary lesson-toggle" : "btn sm lesson-toggle"} onClick={() => setAcct(a)}><code>{a}</code></button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {LADDER.map((r) => {
              const on = r.id === rung;
              const total = r.id === "noi" || r.id === "cf";
              return (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 8,
                  border: `1px solid ${on ? "var(--brand)" : "var(--hairline)"}`, background: on ? soft(9) : "transparent", fontWeight: total ? 800 : 600,
                  borderTop: total ? "2px solid var(--text)" : undefined, transition: "all .3s" }}>
                  <span>{r.label}</span>{on && <code>{acct}</code>}
                </div>
              );
            })}
          </div>
          {rung === "bs" && <Note tone="var(--brand)">Not on the operating statement at all — it's a balance sheet account.</Note>}
          {parsed?.suffix === "8599" && <Note>The <code>-8599</code> suffix moves an expense below NOI as extraordinary.</Note>}
        </div>
      ),
    },
    {
      kicker: "The call that matters", title: "Coding decides who pays",
      body: <>A <code>-8502</code> coded where <code>-8501</code> belongs overbills tenants at year-end CAM; the reverse leaves money on the table. And <strong>capital work — repaving, roofs, HVAC replacement — goes in <code>14xx</code></strong>, never a repair line.</>,
      doThis: "Code this example repave three ways",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <Panel title="Example invoice"><div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18 }}><span>Repave the north lot</span><span>{money(cost)}</span></div><Note>Tenants pay 85% of this building's CAM pool.</Note></Panel>
          <Toggle value={coding} onChange={setCoding} options={[
            { id: "8502", label: <><code>6220-8502</code>&nbsp;Repair, reimbursable</> },
            { id: "8501", label: <><code>6220-8501</code>&nbsp;Repair, owner's cost</> },
            { id: "14xx", label: <><code>14xx</code>&nbsp;Capital</> },
          ]} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Panel title="Billed to tenants"><strong style={{ fontSize: 22, color: effect.tenants ? RED : "var(--text)" }}>{money(effect.tenants)}</strong></Panel>
            <Panel title="Effect on NOI"><strong style={{ fontSize: 22 }}>{effect.noi ? money(effect.noi) : "None"}</strong></Panel>
          </div>
          <Note tone={effect.tone}>{effect.verdict}</Note>
        </div>
      ),
    },
    {
      kicker: "Recap", title: "What to carry with you",
      body: <>At 2010 you'll also see <code>4510</code> (management fee revenue), <code>8000-9900</code> (payroll and benefits) and <code>8110</code> (office rent).</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Major is what, suffix is who pays", "-8502 tenants through CAM, -8501 the owner, -930x an allocation from 2000."],
        ["Capital and debt sit below NOI", "14xx, 1940, 9210 and 27xx never touch NOI; 0110–3799 is the balance sheet."],
        ["Coding is a billing decision", "A wrong suffix over- or under-bills tenants at year end. Repaving is capital."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

