"use client";

// Philadelphia U&O — the month's returns, built by the portal (owner, 11/2026:
// "integrate as much as possible and be as autonomous as possible"). Every
// figure comes off the City's assessed values and the rent roll; Greg, Harry
// and Nancy mark who is delinquent; Drew keys the UO1 on the City's site from
// the table, marks each property filed, and imports the payment JE.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { HeaderSelect, propertyLabel } from "@/app/components/HeaderSelect";
import { MetaLine } from "@/app/components/LastImported";
import { StatusBanner } from "@/app/components/StatusBanner";
import { StatPill } from "@/app/components/Pill";
import { RoundCheck } from "@/app/components/RoundCheck";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { HoverCard } from "@/app/components/HoverCard";
import LoadingState from "@/app/components/LoadingState";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import type { UoCandidate, UoPropertyView } from "@/lib/uo/load";
import type { UoLines, UoRow } from "@/lib/uo/compute";
import type { UoMonth } from "@/lib/uo/store";

type Data = {
  month: string; record: UoMonth; properties: UoPropertyView[]; candidates: UoCandidate[];
  rollMonth: string | null; statementPeriod: string | null; statementAsOf: string | null; agingAsOf: string | null;
  cityCheckedAt: string | null; cityError: string | null;
  stage: "not-open" | "review" | "ready" | "filed" | "overdue";
  dates: { reviewOpens: string; fileBy: string; due: string };
  canReview: boolean; canFile: boolean;
};

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
const n0 = (n: number) => (Math.round(n) === 0 ? "—" : Math.round(n) < 0 ? `(${Math.abs(Math.round(n)).toLocaleString("en-US")})` : Math.round(n).toLocaleString("en-US"));
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const etMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);
const addMonths = (ym: string, k: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + k, 15));
  return d.toISOString().slice(0, 7);
};
const STATUS_WORD: Record<UoRow["status"], string> = { taxable: "Taxable", vacant: "Vacant", exempt: "Exempt", delinquent: "Delinquent", common: "Common area" };

/** The UO1, line by line, as the City's form numbers it. */
const FORM_LINES: [string, string, keyof UoLines][] = [
  ["A", "Assessed value", "assessed"],
  ["1", "Maximum tax for period", "maxTax"],
  ["2", "Vacant amount", "vacant"],
  ["3", "Non-taxable exempt amount", "exempt"],
  ["6", "Total of lines 2–5", "totalOff"],
  ["7", "Tax due", "taxDue"],
  ["8", "Delinquent tenant amount", "delinquent"],
  ["9", "Amount due prior to discount", "beforeDiscount"],
  ["10", "Discount (1%)", "discount"],
  ["11", "Net tax due", "net"],
];

export default function UoTaxPage() {
  const [month, setMonth] = useState(etMonth());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetch(`/api/uo?month=${month}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not load the U&O returns.");
      setData(j); setPicked(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [month]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("month");
    if (q && /^\d{4}-\d{2}$/.test(q)) setMonth(q);
  }, []);
  useEffect(() => { setData(null); load(); }, [load]);

  const post = async (body: Record<string, unknown>, label: string) => {
    setBusy(label); setError("");
    try {
      const r = await fetch("/api/uo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not save.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const delinquent = useMemo(() => picked ?? new Set((data?.record.delinquents ?? []).map((s) => s.toUpperCase())), [picked, data]);
  // Changed after it was confirmed → it needs confirming again.
  const changedSince = !!data?.record.confirmedAt && !!data.record.updatedAt && data.record.updatedAt > data.record.confirmedAt;
  // A tick saves at once (Greg, Harry, Nancy — and Drew); Confirm says the
  // list is final for the month.
  const toggleDelinquent = (ref: string) => {
    const s = new Set(delinquent);
    if (s.has(ref)) s.delete(ref); else s.add(ref);
    setPicked(s);
    post({ action: "delinquents", units: [...s] }, "delinquents");
  };

  const months = useMemo(() => Array.from({ length: 14 }, (_, i) => addMonths(etMonth(), 1 - i)), []);
  const ZERO: UoLines = { assessed: 0, maxTax: 0, vacant: 0, exempt: 0, totalOff: 0, taxDue: 0, delinquent: 0, beforeDiscount: 0, discount: 0, net: 0 };
  // A property no rent roll covers claims nothing until one does.
  const linesOf = (p: UoPropertyView) => p.filed?.lines ?? (p.noTenancy ? ZERO : p.lines);
  const total = (k: keyof UoLines) => (data?.properties ?? []).reduce((s, p) => s + linesOf(p)[k], 0);
  const filedCount = (data?.properties ?? []).filter((p) => p.filed).length;

  const header = (
    <PageHeader
      title="Philadelphia U&O"
      info={<>The month&apos;s Use &amp; Occupancy returns for the Philadelphia properties, built from the City&apos;s assessed values and the rent roll. Greg, Harry and Nancy mark who is delinquent; Drew files each return on the City&apos;s site by the 21st (due the 25th), marks it filed here, and imports the payment JE.</>}
      pickers={
        <HeaderSelect value={month} onChange={setMonth} displayLabel={monthName(month)} ariaLabel="Month">
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </HeaderSelect>
      }
      actions={
        <DownloadMenu label="Export" items={[
          { label: "Payment JE (Skyline import)", description: "0110 / 2430 / 9190 per property", href: `/api/uo?month=${month}&export=je` },
          { label: "U&O by tenant (Excel)", description: "Each suite's monthly U&O vs billed", href: `/api/uo?month=${month}&export=charges` },
          ...(data?.canFile && month.endsWith("-01") ? [{ label: `Email ${month.slice(0, 4)} charges to Tanya`, description: "Each tenant's new UO charge, effective 1/1 (sent on its own in December)", onClick: () => post({ action: "january-reset", year: Number(month.slice(0, 4)) }, "reset") }] : []),
        ]} />
      }
      meta={data && (
        <MetaLine>
          <span>Due {day(data.dates.due)} · file by {day(data.dates.fileBy)}</span>
          {data.rollMonth && <span>· Tenancy from the {monthName(data.rollMonth)} rent roll</span>}
          {data.agingAsOf
            ? <span>· Open U&amp;O from the Aging Report run {day(data.agingAsOf)}{data.statementAsOf ? `, else the ${monthName(data.statementPeriod ?? month)} Laser Statement` : ""}</span>
            : data.statementPeriod && <span>· Open U&amp;O from the {monthName(data.statementPeriod)} Laser Statement</span>}
          {data.cityError
            ? <span style={{ color: "var(--amber-text)" }}>· The City&apos;s assessments could not be read: {data.cityError}</span>
            : data.cityCheckedAt && <span>· City assessments checked {day(data.cityCheckedAt.slice(0, 10))}</span>}
          {data.canFile && <button className="text-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }} onClick={() => post({ action: "refresh-assessments" }, "assessed")}>Check now</button>}
        </MetaLine>
      )}
    />
  );

  if (!data) return <main className="page">{header}{error ? <StatusBanner tone="danger" title="Something went wrong">{error}</StatusBanner> : <LoadingState status="Loading U&O returns…" context={monthName(month)} columns={6} rows={8} />}</main>;

  const rec = data.record;
  const stageBanner = (() => {
    if (data.stage === "filed") return <StatusBanner tone="success" title={`${monthName(month)} U&O is filed`}>All {data.properties.length} returns marked filed · {usd(total("net"))} paid to the City</StatusBanner>;
    if (data.stage === "overdue") return <StatusBanner tone="danger" title={`${monthName(month)} U&O is past due`}>Due {day(data.dates.due)}. {data.properties.length - filedCount} of {data.properties.length} returns not marked filed — interest and penalty run, and the 1% discount is lost.</StatusBanner>;
    if (data.stage === "ready") return <StatusBanner tone="warning" icon="clock" title={`Time to file ${monthName(month)} U&O`}>{rec.confirmedAt ? `Delinquents confirmed by ${rec.confirmedBy} ${when(rec.confirmedAt)}.` : "Delinquents not confirmed — the list below is used as it stands."} File by {day(data.dates.fileBy)}; due {day(data.dates.due)}. {filedCount ? `${filedCount} of ${data.properties.length} filed.` : ""}</StatusBanner>;
    if (data.stage === "review") return <StatusBanner tone="warning" title={`Confirm ${monthName(month)}'s delinquents`}>Tick anyone to report delinquent to the City, then confirm — Drew is sent the returns to file. Needed by {day(data.dates.fileBy)}.</StatusBanner>;
    return <StatusBanner tone="info" title={`${monthName(month)} opens for review on ${day(data.dates.reviewOpens)}`}>Greg and Harry are emailed the tenants with U&amp;O still open on the laser statement that morning.</StatusBanner>;
  })();

  const candidateRefs = new Set(data.candidates.map((c) => c.unitRef.toUpperCase()));
  const extraDelinquent = [...delinquent].filter((r) => !candidateRefs.has(r));
  const tenantOf = (ref: string) => {
    for (const p of data.properties) for (const r of p.returns) for (const row of r.rows) if (row.unitRef?.toUpperCase() === ref) return { tenant: row.tenant, share: row.share, code: p.code };
    return null;
  };

  return (
    <main className="page">
      {header}
      {error && <StatusBanner tone="danger" title="Something went wrong" style={{ marginBottom: 12 }}>{error}</StatusBanner>}
      <div style={{ marginBottom: 14 }}>{stageBanner}</div>

      <div className="pills" style={{ marginBottom: 14 }}>
        <StatPill label="Maximum tax · Line 1" value={usd(total("maxTax"))} sub={`${data.properties.reduce((s, p) => s + p.returns.length, 0)} returns`} />
        <StatPill label="Vacant & exempt · Lines 2–3" value={usd(total("totalOff"))} sub="Not collected" />
        <StatPill label="Delinquent · Line 8" value={usd(total("delinquent"))} sub={`${delinquent.size} tenant${delinquent.size === 1 ? "" : "s"}`} />
        <StatPill label="Pay the City · Line 11" value={usd(total("net"))} sub={`after ${usd(total("discount"))} discount`} total />
      </div>

      {/* The delinquent review — Greg, Harry, Nancy. */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Delinquent Tenants</div>
            <div className="muted" style={{ fontSize: "var(--fs-14)", marginTop: 2 }}>
              {rec.confirmedAt ? `Confirmed by ${rec.confirmedBy} ${when(rec.confirmedAt)}${changedSince ? ` · changed since by ${rec.updatedBy}` : ""}` : "Tenants with U&O still open on the newest Aging Report or Laser Statement. Tick to report delinquent (UO3); their U&O is then reversed in Skyline."}
            </div>
          </div>
          {data.canReview && (
            <button className="btn primary" disabled={!!busy || (!!rec.confirmedAt && !changedSince)} onClick={() => post({ action: "confirm", units: [...delinquent] }, "confirm")}>
              {busy === "confirm" ? "Confirming…" : rec.confirmedAt && !changedSince ? "Confirmed" : delinquent.size ? `Confirm ${delinquent.size} Delinquent${delinquent.size === 1 ? "" : "s"}` : "Confirm None Delinquent"}
            </button>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          {data.candidates.length === 0 && extraDelinquent.length === 0 && <div className="muted" style={{ padding: "11px 2px" }}>No tenant shows U&amp;O open on the laser statement.</div>}
          {data.candidates.map((c) => {
            const ref = c.unitRef.toUpperCase();
            return (
              <div key={ref} className="task-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 2px", borderBottom: "1px solid var(--hairline)" }}>
                <RoundCheck done={delinquent.has(ref)} onToggle={data.canReview ? () => toggleDelinquent(ref) : () => {}} label={`Report ${c.tenant} delinquent`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.tenant}</div>
                  <div className="muted" style={{ fontSize: "var(--fs-13)" }}><code>{c.unitRef}</code> · {propertyLabel(c.property, data.properties.find((p) => p.code === c.property)?.name)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{usd(c.openUo)} open</div>
                  <div className="muted" style={{ fontSize: "var(--fs-13)" }}>{c.oldest ? `since ${day(c.oldest)}` : ""}{c.lastMonth ? " · reported last month" : ""}</div>
                </div>
              </div>
            );
          })}
          {extraDelinquent.map((ref) => {
            const t = tenantOf(ref);
            return (
              <div key={ref} className="task-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 2px", borderBottom: "1px solid var(--hairline)" }}>
                <RoundCheck done onToggle={data.canReview ? () => toggleDelinquent(ref) : () => {}} label="Remove" />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{t?.tenant ?? ref}</div><div className="muted" style={{ fontSize: "var(--fs-13)" }}><code>{ref}</code> · added by hand</div></div>
                {t && <div style={{ fontWeight: 700 }}>{usd(t.share)}</div>}
              </div>
            );
          })}
        </div>
        {data.canReview && <div className="muted" style={{ fontSize: "var(--fs-13)", marginTop: 8 }}>Someone not listed? Open their property below and tick Delinquent on their row.</div>}
      </div>

      {/* The returns. */}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={thL}>Property</th>
              <th style={th}>Line 1</th>
              <th style={th}>Vacant &amp; exempt</th>
              <th style={th}>Delinquent</th>
              <th style={th}>Discount</th>
              <th style={th}>Pay</th>
              <th style={thL}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.properties.map((p) => {
              const l = linesOf(p);
              const isOpen = open === p.code;
              return (
                <Fragment key={p.code}>
                  <tr onClick={() => setOpen(isOpen ? null : p.code)} style={{ cursor: "pointer", borderTop: "1px solid var(--hairline)" }}>
                    <td style={{ ...tdL, fontWeight: 600 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {isOpen ? <ChevronDown {...ICON} /> : <ChevronRight {...ICON} />}
                        {propertyLabel(p.code, p.name)}
                        {p.warnings.length > 0 && <HoverCard title="Check" rows={p.warnings.map((w, i) => ({ label: `${i + 1}`, value: w }))} width={340}><span style={{ color: "var(--c-b45309)", fontWeight: 700 }}>Check</span></HoverCard>}
                      </span>
                    </td>
                    {p.noTenancy && !p.filed ? (
                      <td colSpan={5} style={{ ...tdL, color: "var(--c-b54708)" }}>No rent roll for the month — import one to build this return</td>
                    ) : (<>
                    <td style={td}>{n0(l.maxTax)}</td>
                    <td style={td}>{n0(l.totalOff)}</td>
                    <td style={td}>{n0(l.delinquent)}</td>
                    <td style={td}>{n0(l.discount)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{n0(l.net)}</td>
                    </>)}
                    <td style={tdL} onClick={(e) => e.stopPropagation()}>
                      {p.filed ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "var(--c-067647)", fontWeight: 600 }}>Filed {when(p.filed.at)} · {p.filed.by}</span>
                          {data.canFile && <button className="btn sm" disabled={!!busy} onClick={() => post({ action: "unfile", code: p.code }, `unfile-${p.code}`)}>Undo</button>}
                        </span>
                      ) : data.canFile && !p.noTenancy ? (
                        <button className="btn sm" disabled={!!busy} onClick={() => post({ action: "filed", code: p.code }, `filed-${p.code}`)}>{busy === `filed-${p.code}` ? "Saving…" : "Mark Filed"}</button>
                      ) : <span className="muted">Not filed</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} style={{ padding: "4px 16px 18px", maxWidth: 0 }}>
                        <PropertyDetail p={p} month={month} data={data} delinquent={delinquent} onDelinquent={toggleDelinquent} post={post} busy={busy} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--text)" }}>
              <td style={{ ...tdL, fontWeight: 800 }}>Total</td>
              <td style={{ ...td, fontWeight: 800 }}>{usd(total("maxTax"))}</td>
              <td style={{ ...td, fontWeight: 800 }}>{usd(total("totalOff"))}</td>
              <td style={{ ...td, fontWeight: 800 }}>{usd(total("delinquent"))}</td>
              <td style={{ ...td, fontWeight: 800 }}>{usd(total("discount"))}</td>
              <td style={{ ...td, fontWeight: 800 }}>{usd(total("net"))}</td>
              <td style={tdL} className="muted">{filedCount} of {data.properties.length} filed</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}

function PropertyDetail({ p, month, data, delinquent, onDelinquent, post, busy }: {
  p: UoPropertyView; month: string; data: Data; delinquent: Set<string>;
  onDelinquent: (ref: string) => void;
  post: (b: Record<string, unknown>, label: string) => Promise<void>;
  busy: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const year = Number(month.slice(0, 4));
  const billed = new Map(p.billed.map((b) => [b.unitRef, b]));
  const frozen = !!p.filed;
  const many = p.returns.length > 1;
  const sumOf = (k: keyof UoLines) => p.returns.reduce((s, r) => s + r.lines[k], 0);
  const rows = p.returns.flatMap((r) => r.rows);
  const off = rows.filter((r) => r.unitRef && (r.status === "taxable" || r.status === "delinquent")).filter((r) => {
    const b = billed.get(r.unitRef!);
    return b && b.billed != null && Math.abs(b.billed - r.share) >= 1;
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14, paddingTop: 10 }}>
      {frozen && <StatusBanner compact tone="success" title="Filed — these are the figures as filed">Undo to see this month&apos;s figures recomputed from the rent roll.</StatusBanner>}
      {p.warnings.map((w) => <StatusBanner key={w} compact tone="warning" title="Check">{w}</StatusBanner>)}
      {off.length > 0 && !frozen && (
        <StatusBanner compact tone="warning" title={`${off.length} tenant${off.length === 1 ? " is" : "s are"} billed a different U&O than their share`}>
          Update their recurring U&amp;O charge in Skyline — see Billed below{month.slice(5, 7) === "01" ? " (January's new assessment moves every charge)" : ""}.
        </StatusBanner>
      )}

      {/* The UO1 as the City's form numbers it. */}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thL}>Line</th>
              <th style={thL}>UO1</th>
              {p.returns.map((r) => <th key={r.account.parcel} style={th}>{r.account.label}<div className="muted" style={{ fontWeight: 500, textTransform: "none" }}>OPA <code>{r.account.parcel}</code></div></th>)}
              {many && <th style={th}>Total</th>}
            </tr>
          </thead>
          <tbody>
            {FORM_LINES.map(([ln, label, k]) => (
              <tr key={k} style={{ borderTop: "1px solid var(--hairline)" }}>
                <td style={{ ...tdL, fontWeight: 700, width: 54 }}>{ln}</td>
                <td style={{ ...tdL, fontWeight: k === "net" ? 800 : 500 }}>{label}</td>
                {p.returns.map((r) => {
                  const v = (p.filed && !many ? p.filed.lines : r.lines)[k];
                  if (k === "assessed") {
                    const key = r.account.parcel;
                    return (
                      <td key={key} style={td}>
                        {editing === key ? (
                          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 130, textAlign: "right" }}
                            onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            onBlur={() => { setEditing(null); post({ action: "assessed", parcel: key, year, value: Number(value.replace(/[^0-9.]/g, "")) || null }, "assessed"); }} />
                        ) : (
                          <HoverCard title="Assessed value" rows={[{ label: "Source", value: r.assessedSource }, { label: "Line 1", value: "1.21% a year, ÷ 12" }]}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              {usd(v)}
                              {data.canFile && !frozen && <button className="btn sm" aria-label="Type the value on the City's form" onClick={() => { setEditing(key); setValue(String(r.lines.assessed)); }} style={{ padding: "0 6px", minHeight: 0, height: 26 }}><Pencil {...ICON} size={14} /></button>}
                            </span>
                          </HoverCard>
                        )}
                      </td>
                    );
                  }
                  return <td key={r.account.parcel} style={{ ...td, fontWeight: k === "net" ? 800 : 500 }}>{usd(v)}</td>;
                })}
                {many && <td style={{ ...td, fontWeight: 700 }}>{usd(p.filed ? p.filed.lines[k] : sumOf(k))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {data.canFile && !frozen && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: "1px solid var(--hairline)" }}>
            <RoundCheck done={p.discount} onToggle={() => post({ action: "discount", code: p.code, take: !p.discount }, "discount")} label="Take the 1% discount" />
            <span>Take the 1% discount (filed and paid by the 25th)</span>
          </div>
        )}
      </div>

      {/* Tenants. */}
      {rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={thL}>Suite</th>
                <th style={thL}>Tenant</th>
                <th style={th}>SF</th>
                <th style={th}>Monthly U&amp;O</th>
                <th style={th}>Billed</th>
                <th style={thL}>Status</th>
                {data.canReview && !frozen && <th style={th}>Delinquent</th>}
                {data.canFile && !frozen && <th style={th}>Exempt</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const ref = r.unitRef?.toUpperCase() ?? "";
                const b = r.unitRef ? billed.get(r.unitRef) : undefined;
                const owes = r.status === "taxable" || r.status === "delinquent";
                const differs = owes && b?.billed != null && Math.abs(b.billed - r.share) >= 1;
                const status = !frozen && ref && delinquent.has(ref) && r.status === "taxable" ? "delinquent" : r.status;
                return (
                  <tr key={`${ref}-${i}`} style={{ borderTop: "1px solid var(--hairline)", color: owes ? undefined : "var(--muted)" }}>
                    <td style={tdL}>{r.unitRef ? <code>{r.unitRef}</code> : "—"}</td>
                    <td style={{ ...tdL, fontWeight: 600 }}>{r.tenant}</td>
                    <td style={td}>{r.sqft.toLocaleString("en-US")}</td>
                    <td style={td}>{n0(r.share)}</td>
                    <td style={{ ...td, color: differs ? "var(--c-b45309)" : undefined, fontWeight: differs ? 700 : undefined }}>
                      {!owes ? "" : b?.billed == null ? <span className="muted">—</span> : differs ? (
                        <HoverCard title="Billed vs share" rows={[{ label: "Billed", value: usd(b.billed) }, { label: "Share", value: usd(r.share) }, { label: "Change", value: usd(r.share - b.billed) }]}><span>{n0(b.billed)}</span></HoverCard>
                      ) : n0(b.billed)}
                    </td>
                    <td style={tdL}>{STATUS_WORD[status]}{r.reason && status !== "common" ? <span className="muted"> · {r.reason}</span> : ""}</td>
                    {data.canReview && !frozen && (
                      <td style={td}>{r.unitRef && (r.status === "taxable" || r.status === "delinquent") ? <RoundCheck done={delinquent.has(ref)} onToggle={() => onDelinquent(ref)} label={`Report ${r.tenant} delinquent`} /> : null}</td>
                    )}
                    {data.canFile && !frozen && (
                      <td style={td}>{r.unitRef && r.status !== "vacant" && r.status !== "common" ? (
                        <RoundCheck done={r.status === "exempt"} label={`${r.tenant} exempt`} onToggle={() => {
                          if (r.status === "exempt") post({ action: "exempt", unitRef: r.unitRef, exempt: false }, "exempt");
                          else post({ action: "exempt", unitRef: r.unitRef, exempt: true, reason: "Marked exempt" }, "exempt");
                        }} />
                      ) : null}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: "var(--fs-13)", padding: "10px 16px", borderTop: "1px solid var(--hairline)" }}>
            Each suite&apos;s share of Line 1 by square feet, over {p.returns[0].basisSf.toLocaleString("en-US")} SF{many ? ` (the ${p.returns[0].account.label.toLowerCase()} parcel)` : ""}. Billed is the U&amp;O line on the tenant&apos;s newest laser statement.
          </div>
        </div>
      )}
    </div>
  );
}
