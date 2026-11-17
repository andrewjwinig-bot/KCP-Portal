"use client";
// Quarterly Workpapers — every balance-sheet account PROVEN, quarter by quarter.
//
// The accountants' year-end workpapers are one support schedule per account:
// opening, every entry, total, per trial balance, difference, TRUE — cash
// against the bank rec, the mortgage against the lender, and so on. This is
// that package built by the portal from the GL it already holds, every
// quarter, so a balance that can't be proven (a Suspense plug, a bill booked
// twice, an unbilled CAM credit) is found while it is still easy to trace —
// the balance sheet's Flags to Investigate. The Excel is their layout,
// cleaned up (lib/financials/workpapers/export.ts).

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { HeaderSelect } from "@/app/components/HeaderSelect";
import { MetaLine } from "@/app/components/LastImported";
import { StatusBanner } from "@/app/components/StatusBanner";
import { StatPill } from "@/app/components/Pill";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import LoadingState from "@/app/components/LoadingState";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import { groupStatementOptions } from "@/lib/financials/operating-statements/propertyGroups";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { Workpapers, WpSchedule, WpFlag } from "@/lib/financials/workpapers/compute";
import { KIND_INFO, SECTION_ORDER } from "@/lib/financials/workpapers/compute";

type Prop = { key: string; name: string; years: number[] };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const money = (n: number) => (n < 0 ? "(" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (n < 0 ? ")" : "");
const money0 = (n: number) => Math.abs(n) < 0.5 ? "—" : (n < 0 ? "(" : "") + Math.round(Math.abs(n)).toLocaleString("en-US") + (n < 0 ? ")" : "");
const dateLabel = (iso: string | null) => { const m = iso && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${Number(m[2])}/${Number(m[3])}/${m[1].slice(2)}` : (iso ?? ""); };
const STATUS: Record<WpSchedule["status"], { word: string; color: string; Icon: typeof CircleCheck }> = {
  ok: { word: "Ties", color: "var(--c-067647)", Icon: CircleCheck },
  review: { word: "Review", color: "var(--c-b54708)", Icon: TriangleAlert },
  fix: { word: "Fix", color: "var(--c-b42318)", Icon: CircleX },
};
const FLAG_COLOR: Record<WpFlag["level"], string> = { red: "var(--c-b42318)", amber: "var(--c-b54708)", info: "var(--muted)" };
const FLAG_ICON: Record<WpFlag["level"], typeof CircleCheck> = { red: CircleX, amber: TriangleAlert, info: Info };

export default function WorkpapersPage() {
  const [props, setProps] = useState<Prop[] | null>(null);
  const [key, setKey] = useState("");
  const [period, setPeriod] = useState(""); // "YYYY-MM" quarter end
  const [wp, setWp] = useState<Workpapers | null>(null);
  const [coverageEnd, setCoverageEnd] = useState(12);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [onlyAttention, setOnlyAttention] = useState(true);

  useEffect(() => {
    fetch("/api/financials/workpapers").then((r) => r.json()).then((j) => {
      const list: Prop[] = j.properties ?? [];
      setProps(list);
      let saved = ""; try { saved = localStorage.getItem("kcp.workpapers.key") ?? ""; } catch {}
      const first = list.find((p) => p.key === saved) ?? list.find((p) => p.key === "4500") ?? list[0];
      if (first) { setKey(first.key); setPeriod(`${first.years[0]}-12`); }
    }).catch(() => setError("Couldn't load the list of properties."));
  }, []);

  const prop = props?.find((p) => p.key === key);
  const periods = useMemo(() => (prop?.years ?? []).flatMap((y) => [12, 9, 6, 3].map((m) => `${y}-${String(m).padStart(2, "0")}`)), [prop]);

  useEffect(() => {
    if (!key || !period) return;
    try { localStorage.setItem("kcp.workpapers.key", key); } catch {}
    const [y, m] = period.split("-").map(Number);
    setLoading(true); setError(null); setOpen(new Set());
    fetch(`/api/financials/workpapers?key=${encodeURIComponent(key)}&year=${y}&month=${m}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setWp(j.wp ?? null); setReason(j.reason ?? null); setCoverageEnd(j.coverageEnd ?? 12);
      })
      .catch((e) => setError(e?.message ?? "Couldn't build the workpapers."))
      .finally(() => setLoading(false));
  }, [key, period]);

  const pickProperty = (k: string) => {
    setKey(k);
    const p = props?.find((x) => x.key === k);
    if (p && !p.years.includes(Number(period.slice(0, 4)))) setPeriod(`${p.years[0]}-12`);
  };
  const toggle = (code: string) => setOpen((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const [y, m] = period ? period.split("-").map(Number) : [0, 0];
  const quarterLabel = (p: string) => { const [yy, mm] = p.split("-").map(Number); return `Q${mm / 3} ${yy} · ${MONTHS[mm - 1].slice(0, 3)} ${new Date(Date.UTC(yy, mm, 0)).getUTCDate()}`; };
  const shown = (wp?.schedules ?? []).filter((s) => !onlyAttention || s.status !== "ok");
  const propOptions = groupStatementOptions((props ?? []).map((p) => ({ ...p, propertyCode: PROPERTY_DEFS.find((d) => d.id === p.key)?.id ?? p.key })));
  const beyondGl = !!wp && m > coverageEnd;

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <PageHeader
        title="Workpapers"
        info={<>
          <p style={{ marginTop: 0 }}>Every balance-sheet account, proven: its opening balance, every entry through the quarter end, and the total checked against the trial balance and against something independent — the bank rec for cash, the lender&rsquo;s schedule for the mortgage, the deposit register for security deposits.</p>
          <p style={{ marginBottom: 0 }}>It is the accountants&rsquo; year-end workpaper package, built every quarter from the General Ledger already in the portal. Anything that can&rsquo;t be proven is listed to fix — a Suspense balance, a bill booked twice, a credit where tenants should owe. The Excel is laid out as the firm reads it.</p>
        </>}
        pickers={props && props.length > 0 && <>
          <HeaderSelect value={key} onChange={pickProperty} ariaLabel="Property" displayLabel={prop ? `${prop.key} ${prop.name}` : "Property"} maxWidth={420}>
            {propOptions.map((g) => <optgroup key={g.label} label={g.label}>{g.items.map((p) => <option key={p.key} value={p.key}>{p.key} {p.name}</option>)}</optgroup>)}
          </HeaderSelect>
          <HeaderSelect value={period} onChange={setPeriod} ariaLabel="Quarter" displayLabel={period ? quarterLabel(period) : "Quarter"} muted>
            {periods.map((p) => <option key={p} value={p}>{quarterLabel(p)}</option>)}
          </HeaderSelect>
        </>}
        actions={wp && <DownloadMenu label="Export" items={[{ label: "Excel workbook", description: "Summary, trial balance and a schedule per account", href: `/api/financials/workpapers?key=${encodeURIComponent(key)}&year=${y}&month=${m}&format=xlsx` }]} />}
        meta={wp && <MetaLine>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: wp.trialBalance.balances ? "var(--c-067647)" : "var(--c-b42318)" }}>
            {wp.trialBalance.balances ? <CircleCheck size={16} strokeWidth={1.75} aria-hidden /> : <CircleX size={16} strokeWidth={1.75} aria-hidden />}
            {wp.trialBalance.balances ? "Trial balance proves" : "Trial balance is out"}
          </span>
          <span>General Ledger through {MONTHS[coverageEnd - 1]} {y}</span>
          {!wp.detailAvailable && <span>Monthly totals only</span>}
        </MetaLine>}
      />

      {error && <StatusBanner tone="danger" title="Something went wrong">{error}</StatusBanner>}
      {props && props.length === 0 && <StatusBanner tone="info" title="No General Ledgers imported yet">Import a property&rsquo;s General Ledger on Operating Statements and its workpapers build here.</StatusBanner>}
      {loading && <LoadingState status="Building the workpapers…" />}
      {!loading && reason && <StatusBanner tone="info" title={reason} />}

      {!loading && wp && <>
        {beyondGl && <StatusBanner tone="warning" icon="clock" title={`The General Ledger only runs through ${MONTHS[coverageEnd - 1]}`}>Import the General Ledger through {MONTHS[m - 1]} for a full quarter; until then these are the balances through {MONTHS[coverageEnd - 1]}.</StatusBanner>}
        {wp.warnings.map((w) => <StatusBanner key={w} tone="warning" compact title={w} />)}
        {wp.counts.fix > 0
          ? <StatusBanner tone="danger" title={`${wp.counts.fix} account${wp.counts.fix === 1 ? "" : "s"} can't be proven`}>Fix these before the quarter closes{wp.counts.review ? ` · ${wp.counts.review} more to review` : ""}.</StatusBanner>
          : wp.counts.review > 0
            ? <StatusBanner tone="warning" title={`${wp.counts.review} account${wp.counts.review === 1 ? "" : "s"} to review`}>Every balance ties; these read oddly and are worth a look.</StatusBanner>
            : <StatusBanner tone="success" title={`Every balance is proven for Q${wp.quarter} ${y}`}>{wp.counts.accounts} accounts tie to the trial balance.</StatusBanner>}

        <div className="pills" style={{ justifyContent: "flex-start", marginTop: 0 }}>
          <StatPill label="Accounts" value={String(wp.counts.accounts)} total />
          <StatPill label="Tie" value={String(wp.counts.ok)} />
          <StatPill label="To review" value={String(wp.counts.review)} />
          <StatPill label="To fix" value={String(wp.counts.fix)} />
        </div>

        <div className="card" style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Balance Sheet Accounts</div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "var(--fs-14)" }}>
              <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} /> Only accounts needing attention
            </label>
          </div>
          {shown.length === 0
            ? <div className="muted" style={{ padding: "12px 2px" }}>Nothing needs attention. Untick the box to see every account.</div>
            : <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead><tr>
                  <th style={thL}>Account</th>
                  <th style={th}>Opening</th>
                  <th style={th}>Activity</th>
                  <th style={th}>Ending</th>
                  <th style={thL}>Proven by</th>
                  <th style={thL}>Status</th>
                </tr></thead>
                <tbody>
                  {SECTION_ORDER.map((section) => {
                    const rows = shown.filter((s) => s.section === section);
                    if (!rows.length) return null;
                    return <Fragment key={section}>
                      <tr><td colSpan={6} style={{ ...tdL, background: "var(--tint-brand-bg)", fontWeight: 700, fontSize: "var(--fs-13)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)" }}>{section}</td></tr>
                      {rows.map((s) => {
                        const st = STATUS[s.status];
                        const isOpen = open.has(s.code);
                        return <Fragment key={s.code}>
                          <tr className="task-row" onClick={() => toggle(s.code)} style={{ cursor: "pointer" }}>
                            <td style={tdL}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                {isOpen ? <ChevronDown size={16} strokeWidth={1.75} aria-hidden /> : <ChevronRight size={16} strokeWidth={1.75} aria-hidden />}
                                <code>{s.code}</code> <span style={{ fontWeight: 600 }}>{s.name || KIND_INFO[s.kind].label}</span>
                              </span>
                            </td>
                            <td style={td}>{money0(s.opening)}</td>
                            <td style={td}>{money0(s.activity)}</td>
                            <td style={{ ...td, fontWeight: 600 }}>{money0(s.ending)}</td>
                            <td style={{ ...tdL, color: "var(--muted)" }}>{s.support?.label ?? KIND_INFO[s.kind].support}</td>
                            <td style={tdL}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: st.color, fontWeight: 600 }}><st.Icon size={16} strokeWidth={1.75} aria-hidden />{st.word}</span></td>
                          </tr>
                          {isOpen && <tr><td colSpan={6} style={{ ...tdL, maxWidth: 0, padding: "4px 12px 18px 34px" }}><Schedule s={s} /></td></tr>}
                        </Fragment>;
                      })}
                    </Fragment>;
                  })}
                </tbody>
              </table>
            </div>}
        </div>
      </>}
    </main>
  );
}

function Schedule({ s }: { s: WpSchedule }) {
  const total = s.opening + (s.detail === "none" ? s.activity : s.lines.reduce((a, l) => a + l.amount, 0));
  const diff = Math.round((total - s.ending) * 100) / 100;
  const sub: React.CSSProperties = { fontSize: "var(--fs-14)", color: "var(--muted)" };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {s.flags.map((f, i) => {
        const Icon = FLAG_ICON[f.level];
        return <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: FLAG_COLOR[f.level], fontSize: "var(--fs-14)" }}>
          <Icon size={16} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} /><span>{f.text}</span>
        </div>;
      })}
      {s.support?.note && <div style={sub}>{s.support.label}: {s.support.note}</div>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead><tr><th style={thL}>Date</th><th style={thL}>Description</th><th style={thL}>Ref</th><th style={th}>Amount</th></tr></thead>
          <tbody>
            <tr><td style={tdL} /><td style={{ ...tdL, fontWeight: 600 }}>Beginning balance</td><td style={tdL} /><td style={{ ...td, fontWeight: 600 }}>{money(s.opening)}</td></tr>
            {s.detail === "none" && <tr><td style={tdL} /><td style={{ ...tdL, fontStyle: "italic" }}>Activity — monthly totals only, no entries imported</td><td style={tdL} /><td style={td}>{money(s.activity)}</td></tr>}
            {s.lines.map((l, i) => <tr key={i}>
              <td style={tdL}>{dateLabel(l.date)}</td><td style={tdL}>{l.description}</td><td style={{ ...tdL, color: "var(--muted)" }}>{l.ref}</td><td style={td}>{money(l.amount)}</td>
            </tr>)}
            <tr><td style={tdL} /><td style={{ ...tdL, fontWeight: 700, borderTop: "2px solid var(--border)" }}>Total</td><td style={{ ...tdL, borderTop: "2px solid var(--border)" }} /><td style={{ ...td, fontWeight: 700, borderTop: "2px solid var(--border)" }}>{money(total)}</td></tr>
            <tr><td style={tdL} /><td style={tdL}>Per trial balance</td><td style={tdL} /><td style={td}>{money(s.ending)}</td></tr>
            <tr><td style={tdL} /><td style={{ ...tdL, fontWeight: 600 }}>Difference</td><td style={tdL} />
              <td style={{ ...td, fontWeight: 600, color: Math.abs(diff) < 0.5 ? "var(--c-067647)" : "var(--c-b42318)" }}>{Math.abs(diff) < 0.5 ? "—" : money(diff)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
