"use client";
// "How Money Moves Between Entities" as a click-through lesson (owner: "an
// interactive click through module where the goal is to actually get him to
// understand … visual and graphical and engaging"). Seven scenes, each a short
// explanation beside a stage he plays with: pay a shared bill from 2000, pick
// the allocation suffix and watch the buildings light up, slide the amount and
// watch it split by the REAL allocation percentages (ALLOC_PCT — the same table
// the Allocated Invoicer sends with), open a building's invoice, then pay 2000
// back to zero. The last scenes walk the other intercompany flows.

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, CircleCheck, CreditCard, FileText, Landmark, Receipt, Scale, Users, Wallet } from "lucide-react";
import { ALLOC_PCT, PROPERTY_DEFS } from "@/lib/properties/data";
import { LessonShell, Node, Recap, SECTION, Toggle, money, soft, type LessonProps, type Scene } from "./kit";

type Suffix = "9301" | "9302" | "9303";
const SUFFIX: Record<Suffix, { label: string; who: string }> = {
  "9301": { label: "Business parks", who: "the ten Neshaminy Interplex buildings" },
  "9302": { label: "Shopping centers", who: "the shopping centers" },
  "9303": { label: "All properties", who: "every property — about 75% centers, 25% parks" },
};
const HOLD = 100;
const nameOf = (id: string) => PROPERTY_DEFS.find((p) => p.id === id)?.name ?? id;
const PROPS = Object.keys(ALLOC_PCT).filter((id) => Object.values(ALLOC_PCT[id]).some((v) => v > 0));
const isBP = (id: string) => ALLOC_PCT[id]["9301"] > 0;

function Chip({ id, lit, amount, held }: { id: string; lit: boolean; amount?: number; held?: boolean }) {
  return (
    <div style={{ border: `1px solid ${lit ? (held ? "var(--c-b54708)" : "var(--brand)") : "var(--hairline)"}`, borderRadius: 8, padding: "6px 8px",
      background: lit ? (held ? "transparent" : soft(8)) : "transparent", opacity: lit ? 1 : 0.45, transition: "all .35s", minWidth: 0 }}>
      <code style={{ fontWeight: 700 }}>{id}</code>
      <div style={{ fontSize: "var(--fs-12)", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(id)}</div>
      {amount != null && <div style={{ fontWeight: 800, fontSize: "var(--fs-14)", color: held ? "var(--c-b54708)" : "var(--text)" }}>{money(amount)}{held ? " held" : ""}</div>}
    </div>
  );
}

function PropertyGrid({ suffix, amount }: { suffix: Suffix | null; amount?: number }) {
  const groups = [{ label: "Business parks", ids: PROPS.filter(isBP) }, { label: "Shopping centers", ids: PROPS.filter((id) => !isBP(id)) }];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {groups.map((g) => (
        <div key={g.label}>
          <div style={{ ...SECTION, marginBottom: 6 }}>{g.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 6 }}>
            {g.ids.map((id) => {
              const pct = suffix ? ALLOC_PCT[id][suffix] : 0;
              const share = amount != null ? Math.round(amount * pct) : undefined;
              return <Chip key={id} id={id} lit={pct > 0} amount={pct > 0 ? share : undefined} held={share != null && pct > 0 && share < HOLD} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MoneyMoves({ onFinish, done }: LessonProps) {
  const [paid, setPaid] = useState(false);
  const [suffix, setSuffix] = useState<Suffix | null>(null);
  const [amount, setAmount] = useState(12000);
  const [pick, setPick] = useState<string>("4500");
  const [month, setMonth] = useState(9);
  const [repaid, setRepaid] = useState(false);
  const [flow, setFlow] = useState<"payroll" | "cc" | "fees" | "comm">("payroll");
  const [feeMiss, setFeeMiss] = useState(false);

  const s3: Suffix = suffix ?? "9302";
  const split = useMemo(() => PROPS.map((id) => ({ id, share: Math.round(amount * ALLOC_PCT[id][s3]) })).filter((r) => r.share > 0).sort((a, b) => b.share - a.share), [amount, s3]);
  const billed = split.filter((r) => r.share >= HOLD).reduce((t, r) => t + r.share, 0);
  const held = split.filter((r) => r.share < HOLD).reduce((t, r) => t + r.share, 0);
  const max = Math.max(...split.map((r) => r.share), 1);
  const pickShare = Math.round(amount * (ALLOC_PCT[pick]?.[s3] ?? 0));
  useEffect(() => { if (!ALLOC_PCT[pick] || ALLOC_PCT[pick][s3] === 0) setPick(split[0]?.id ?? "4500"); }, [s3]); // eslint-disable-line react-hooks/exhaustive-deps

  const balance = !paid ? 0 : repaid ? -held : -amount;
  const scenes: Scene[] = [
    {
      kicker: "The idea", title: "One bill, paid once",
      body: <>Plenty of costs are shared — the accounting firm, software, insurance on the office. Instead of twenty properties each paying a slice, <strong>LIK Clearing (<code>2000</code>) pays the whole bill once</strong>, then bills every property its share. Every intercompany charge leaves an invoice and a payment, just like a vendor bill.</>,
      doThis: paid ? undefined : "Pay the bill from 2000",
      stage: (
        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 14, alignItems: "center" }}>
            <div style={{ transform: paid ? "scale(.94)" : "none", opacity: paid ? 0.4 : 1, transition: "all .6s" }}>
              <Node big icon={<Receipt size={24} strokeWidth={1.75} />} title={money(amount)} sub="EisnerAmper · monthly accounting" lit={!paid} />
            </div>
            <ArrowRight size={24} strokeWidth={1.75} style={{ color: paid ? "var(--brand)" : "var(--c-98a2b3)" }} />
            <Node big icon={<Landmark size={24} strokeWidth={1.75} />} title="2000 · LIK Clearing" lit={paid}
              sub={<>Balance <strong style={{ color: balance < 0 ? "var(--c-b42318)" : "var(--text)" }}>{money(balance)}</strong></>} />
          </div>
          <button type="button" className="btn primary" disabled={paid} onClick={() => setPaid(true)} style={{ justifySelf: "start" }}>
            <Wallet size={16} strokeWidth={1.75} /> {paid ? "Paid from 2000" : `Pay ${money(amount)} from 2000`}
          </button>
          {paid && <div style={{ color: "var(--muted)" }}>2000 is now out {money(amount)}. Next: decide who shares it.</div>}
        </div>
      ),
    },
    {
      kicker: "Step 2", title: "The suffix says who shares it",
      body: <>When the bill is coded in <code>2000</code>, its account carries an <strong>allocation suffix</strong>. That suffix is the whole instruction: <code>-9301</code> business parks, <code>-9302</code> shopping centers, <code>-9303</code> everybody. Lafayette Hill (<code>9510</code>) takes none.</>,
      doThis: suffix ? undefined : "Pick a suffix to see who shares the bill",
      stage: (
        <div style={{ display: "grid", gap: 16 }}>
          <Toggle<Suffix> value={suffix} onChange={setSuffix} options={(Object.keys(SUFFIX) as Suffix[]).map((k) => ({ id: k, label: <><code>8310-{k}</code>&nbsp;{SUFFIX[k].label}</> }))} />
          {suffix && <div style={{ color: "var(--muted)" }}>Coded <code>8310-{suffix}</code>: shared by {SUFFIX[suffix].who}.</div>}
          <PropertyGrid suffix={suffix} />
        </div>
      ),
    },
    {
      kicker: "Step 3", title: "The split",
      body: <>Each property's share is a fixed percentage kept in the portal (<code>ALLOC_PCT</code>) — Building 8 carries 23.8% of a <code>-9301</code> bill, Gray's Ferry 29.9% of a <code>-9302</code> one. <strong>A share under $100 isn't invoiced</strong>; it's held and rides along with next month's, so nobody gets a $14 invoice. In December every held balance bills.</>,
      doThis: "Drag the amount and switch suffixes",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <Toggle<Suffix> value={s3} onChange={setSuffix} options={(Object.keys(SUFFIX) as Suffix[]).map((k) => ({ id: k, label: <code>-{k}</code> }))} />
            <label style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 220px" }}>
              <input type="range" style={{ flex: 1, accentColor: "var(--brand)" }} min={500} max={30000} step={250} value={amount} onChange={(e) => { setAmount(+e.target.value); setRepaid(false); }} />
              <strong style={{ fontSize: 20, minWidth: 90, textAlign: "right" }}>{money(amount)}</strong>
            </label>
          </div>
          <div style={{ display: "grid", gap: 5 }}>
            {split.map((r) => {
              const isHeld = r.share < HOLD;
              return (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr) 92px", gap: 10, alignItems: "center", fontSize: "var(--fs-14)" }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><code>{r.id}</code> {nameOf(r.id)}</span>
                  <div style={{ height: 14, borderRadius: 4, background: "var(--hairline)" }}>
                    <div style={{ width: `${(r.share / max) * 100}%`, height: "100%", borderRadius: 4, transition: "width .3s", background: isHeld ? "var(--c-b54708)" : "var(--brand)" }} />
                  </div>
                  <span style={{ textAlign: "right", fontWeight: 700, color: isHeld ? "var(--c-b54708)" : "var(--text)" }}>{money(r.share)}{isHeld ? " held" : ""}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", borderTop: "1px solid var(--hairline)", paddingTop: 10 }}>
            <span><strong>{money(billed)}</strong> <span style={{ color: "var(--muted)" }}>invoiced now · {split.filter((r) => r.share >= HOLD).length} invoices</span></span>
            <span><strong style={{ color: held ? "var(--c-b54708)" : "var(--text)" }}>{money(held)}</strong> <span style={{ color: "var(--muted)" }}>held for next month</span></span>
          </div>
        </div>
      ),
    },
    {
      kicker: "Step 4", title: "One invoice per building",
      body: <>Every share becomes its own PDF invoice, emailed to AvidXchange <strong>one invoice per email</strong> (Avid can't read a bundle). The number tells you what it is at a glance: <code>AE</code> for allocated expenses, then the property code, then the month billed. A late charge on a month already billed comes through as a <code>TU</code> true-up.</>,
      doThis: "Pick a building and a month",
      stage: (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 6, maxHeight: 340, overflowY: "auto" }}>
            {split.filter((r) => r.share >= HOLD).map((r) => (
              <button key={r.id} type="button" onClick={() => setPick(r.id)} className="task-row"
                style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                  border: `1px solid ${pick === r.id ? "var(--brand)" : "var(--hairline)"}`, background: pick === r.id ? soft(7) : "transparent", color: "var(--text)" }}>
                <span><code>{r.id}</code> {nameOf(r.id)}</span><strong>{money(r.share)}</strong>
              </button>
            ))}
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18, display: "grid", gap: 12, background: "var(--card)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div><div style={SECTION}>Invoice</div><div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-mono, monospace)", color: "var(--brand)" }}>AE{pick}{String(month).padStart(2, "0")}26</div></div>
              <FileText size={24} strokeWidth={1.75} style={{ color: "var(--muted)" }} />
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, k) => (
                <button key={m} type="button" className={month === k + 1 ? "btn sm primary" : "btn sm"} onClick={() => setMonth(k + 1)}>{m}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: "var(--fs-14)" }}>
              <span style={{ color: "var(--muted)" }}>Bill to</span><span><strong>{nameOf(pick)}</strong> (<code>{pick}</code>)</span>
              <span style={{ color: "var(--muted)" }}>Account</span><span><code>8310-{s3}</code> · {SUFFIX[s3].label}</span>
              <span style={{ color: "var(--muted)" }}>Share</span><span>{((ALLOC_PCT[pick]?.[s3] ?? 0) * 100).toFixed(2)}% of {money(amount)}</span>
              <span style={{ color: "var(--muted)" }}>Payable to</span><span><strong>LIKM4</strong> · LIK Management Clearing</span>
            </div>
            <div style={{ borderTop: "2px solid var(--text)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 20 }}>
              <span>Total</span><span>{money(pickShare)}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      kicker: "Step 5", title: "The loop closes",
      body: <>Each building pays its invoice through AP like any vendor bill, and the money lands back in <code>2000</code>. <strong>2000 should net back to zero</strong> — anything left there is exactly the held balances waiting for next month. If 2000 isn't near zero, something wasn't billed.</>,
      doThis: repaid ? undefined : "Have the buildings pay their invoices",
      stage: (
        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 14, alignItems: "center" }}>
            <Node big icon={<Building2 size={24} strokeWidth={1.75} />} title={`${split.filter((r) => r.share >= HOLD).length} buildings`} sub={`${money(billed)} invoiced`} lit={!repaid} />
            <ArrowRight size={24} strokeWidth={1.75} style={{ color: repaid ? "var(--brand)" : "var(--c-98a2b3)" }} />
            <Node big icon={<Landmark size={24} strokeWidth={1.75} />} title="2000 · LIK Clearing" lit={repaid} sub="Paid the bill, gets paid back" />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={SECTION}>2000's balance</span><strong style={{ fontSize: 22, color: (repaid ? -held : -amount) < 0 ? "var(--c-b42318)" : "var(--c-067647)" }}>{money(repaid ? -held : -amount)}</strong></div>
            <div style={{ height: 18, borderRadius: 6, background: "var(--hairline)", overflow: "hidden" }}>
              <div style={{ width: `${((repaid ? held : amount) / amount) * 100}%`, height: "100%", background: repaid ? "var(--c-b54708)" : "var(--c-b42318)", transition: "width .9s" }} />
            </div>
            <div style={{ color: "var(--muted)", marginTop: 6 }}>{repaid ? (held ? `${money(held)} still out — the held shares, which bill next month.` : "Back to zero. Every dollar 2000 paid came back.") : `Out ${money(amount)} until the buildings pay.`}</div>
          </div>
          <button type="button" className="btn primary" disabled={repaid} onClick={() => { setPaid(true); setRepaid(true); }} style={{ justifySelf: "start" }}>
            {repaid ? <><CircleCheck size={16} strokeWidth={1.75} /> Paid back</> : "Buildings pay their invoices"}
          </button>
        </div>
      ),
    },
    {
      kicker: "Same pattern", title: "The other intercompany flows",
      body: <>Allocated expenses aren't the only loop. Payroll, credit cards and commissions work the same way — LIK pays, the property is invoiced through Avid. Management fees are the exception: a journal entry, with one rule that must hold every month.</>,
      doThis: "Click through each flow",
      stage: (
        <div style={{ display: "grid", gap: 16 }}>
          <Toggle value={flow} onChange={(v) => { setFlow(v); setFeeMiss(false); }} options={[
            { id: "payroll", label: <><Users size={16} strokeWidth={1.75} /> Payroll</> },
            { id: "cc", label: <><CreditCard size={16} strokeWidth={1.75} /> Credit card</> },
            { id: "fees", label: <><Scale size={16} strokeWidth={1.75} /> Management fees</> },
            { id: "comm", label: <><Receipt size={16} strokeWidth={1.75} /> Commissions</> },
          ]} />
          {flow !== "fees" ? (
            (() => {
              const f = {
                payroll: { from: "2000 pays everyone", how: "Each biweekly payroll is split by every employee's allocation. Maintenance staff land on 6030-8502 (recoverable from tenants); everyone else on 6010-8501.", num: "PR361005261", vendor: "LIKM4", who: "Harry saves the payroll report, then the Payroll Invoicer sends" },
                cc: { from: "Card statement paid", how: "Harry codes every charge to a property — or All BP / All SC by the allocation %, or a fund split by square feet. One invoice per property.", num: "CC23000826", vendor: "LIKM1", who: "Harry codes; Greg and Drew code their own charges on their dashboards" },
                comm: { from: "Leasing commission earned", how: "Internal broker commissions are billed to the property at the commission plus 20%, one invoice per deal, dated the last day of the quarter.", num: "Q326ICom-5-113", vendor: "LIKM4", who: "Nancy (business parks) and Harry (centers) enter them; they go to Avid automatically" },
              }[flow];
              return (
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", gap: 10, alignItems: "center" }}>
                    <Node icon={<Landmark size={20} strokeWidth={1.75} />} title={f.from} lit />
                    <ArrowRight size={20} strokeWidth={1.75} style={{ color: "var(--brand)" }} />
                    <Node icon={<FileText size={20} strokeWidth={1.75} />} title={<code>{f.num}</code>} sub={`Payable to ${f.vendor}`} lit />
                    <ArrowRight size={20} strokeWidth={1.75} style={{ color: "var(--brand)" }} />
                    <Node icon={<Building2 size={20} strokeWidth={1.75} />} title="Property pays" sub="through AP" lit />
                  </div>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{f.how}</p>
                  <p style={{ margin: 0, color: "var(--muted)" }}>{f.who}.</p>
                </div>
              );
            })()
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <p style={{ margin: 0, lineHeight: 1.6 }}>Each building books its fee as an expense on <code>6610</code>. LIK (2010) books the same dollars as revenue on <code>4510</code> — by two hand-keyed journal entries. <strong>They're two sides of one transaction, so they must match every month.</strong></p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 14, alignItems: "center" }}>
                <Node big icon={<Building2 size={24} strokeWidth={1.75} />} title="$59,868" sub={<>Buildings' <code>6610</code> · February</>} lit />
                <Scale size={28} strokeWidth={1.75} style={{ color: feeMiss ? "var(--c-b42318)" : "var(--c-067647)", transform: feeMiss ? "rotate(-12deg)" : "none", transition: "all .4s" }} />
                <Node big icon={<Landmark size={24} strokeWidth={1.75} />} title={feeMiss ? "$0" : "$59,868"} sub={<>2010's <code>4510</code> · February</>} lit={!feeMiss} />
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={() => setFeeMiss((v) => !v)}>{feeMiss ? "Post the 4510 entry" : "Forget February's entry"}</button>
                <span style={{ color: feeMiss ? "var(--c-b42318)" : "var(--c-067647)", fontWeight: 700 }}>{feeMiss ? "Off by $59,868 — this really happened in 2026" : "Ties"}</span>
              </div>
              <p style={{ margin: 0, color: "var(--muted)" }}>When they disagree, the buildings' <code>6610</code> is the evidence and <code>4510</code> is corrected to it. The Management Fees report checks this month by month.</p>
            </div>
          )}
        </div>
      ),
    },
    {
      kicker: "Recap", title: "What to carry with you",
      body: <>That's the whole loop. When you reconcile <code>2000</code> or an intercompany balance, these three facts are what you're checking.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Paid once, billed back", "2000 pays shared costs and payroll; every property gets an invoice and pays it through AvidXchange."],
        ["The suffix decides who shares", "-9301 business parks, -9302 centers, -9303 everyone — split by fixed percentages, under $100 held."],
        ["Everything should tie", "2000 nets to zero apart from held balances, and 6610 at the buildings equals 4510 at 2010 every month."],
      ]} />,
    },
  ];

  return <LessonShell scenes={scenes} />;
}
