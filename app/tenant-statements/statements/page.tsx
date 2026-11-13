"use client";
import { StatusBanner } from "@/app/components/StatusBanner";
import { useLaserStatementImport } from "../useLaserStatementImport";
import { pickInto } from "@/app/components/pickFiles";
import { X, Upload, CircleCheck } from "lucide-react";

// Monthly Statements — import Skyline's tenant Statement report, review every
// tenant's open balance, then publish the month to the tenant portal.
//
// The import is the whole point: Skyline already knows what each tenant owes,
// but that lives in a report nobody outside the office ever sees. Parsing it
// turns it into a statement the tenant can read, age, and pay from.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/app/components/UserProvider";
import { useImport } from "@/app/components/import/ImportProvider";
import { ImportInstructions } from "@/app/components/ImportInstructions";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { InfoPopover } from "@/app/components/InfoPopover";
import { PageHeader } from "@/app/components/PageHeader";
import { HeaderSelect } from "@/app/components/HeaderSelect";
import { DisplayMenu, ToggleRow, CheckRow, MenuSection } from "@/app/components/DisplayMenu";
import { MetaLine } from "@/app/components/LastImported";
import { HoverCard } from "@/app/components/HoverCard";
import { StatPill, Pill, TONE_AMBER, TONE_BLUE, TONE_GREEN, TONE_NEUTRAL, TONE_RED } from "@/app/components/Pill";
import { TenantShareLink } from "@/app/cam-recon/TenantShareLink";
import { OpenCreditsCard, type CreditNote, type CreditApplication } from "../OpenCreditsCard";
import { AgingScheduleCard } from "../AgingScheduleCard";
import { CorrespondencePanel, LastContactCell, needsFollowUp } from "../Correspondence";
import type { LastContact } from "@/lib/statements/correspondence";
import { READ_ONLY_USERS } from "@/lib/users";
import type { OpenCreditTracker, AgingSchedule } from "@/lib/statements/openCredits";
import { AGING_LABEL, AGING_ORDER, CATEGORY_LABEL, CATEGORY_ORDER, type AgingBucket, type ChargeCategory, type StatementCharge } from "@/lib/statements/types";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const money2 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const periodLabel = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${y}`;
};
const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${y}`;
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};
const th: React.CSSProperties = {
  textAlign: "right", padding: "6px 10px", fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { textAlign: "right", padding: "7px 10px", fontSize: "var(--fs-14)", whiteSpace: "nowrap" };
const thL: React.CSSProperties = { ...th, textAlign: "left" };
const tdL: React.CSSProperties = { ...td, textAlign: "left" };

type PeriodRow = {
  period: string; published: boolean; publishedAt: string | null; updatedAt: string;
  tenants: number; properties: number; openBalance: number; pastDue: number; tenantsOwing: number; untied: number;
  sources: { filename: string; importedAt: string; importedBy: string | null; tenantCount: number }[];
};
type Summary = {
  totalDue: number; currentCharges: number; priorBalance: number; credits: number;
  byCategory: { category: ChargeCategory; amount: number; count: number }[];
  byAging: { bucket: AgingBucket; amount: number }[];
  pastDue: boolean; pastDueAmount: number; oldestISO: string | null;
};
type Declared = {
  id: string; reference: string; submittedAt: string; method: "check" | "ach" | "other";
  amount: number; statementTotal: number; note: string;
  /** Set when this answered a payment we already held — the amount received. */
  receivedAmount?: number;
  paying: { dateISO: string | null; description: string; amount: number }[];
  holding: { dateISO: string | null; description: string; amount: number }[];
};
const METHOD_LABEL: Record<Declared["method"], string> = { check: "Check", ach: "ACH or wire", other: "Other" };

type PendingPayment = {
  id: string; amount: number; paymentRef: string; receivedOn: string | null;
  note: string; createdAt: string; createdBy: string | null; askedAt: string | null; askedTo: string[];
};

type TenantRow = {
  unitRef: string; propertyCode: string; suite: string; tenantName: string; address: string[];
  charges: StatementCharge[]; reportedBalance: number; chargeTotal: number; tiesOut: boolean; summary: Summary;
  importedAt?: string; sourceFile?: string; carriedOver?: boolean;
  declared?: Declared | null;
  pendingPayment?: PendingPayment | null;
};
type PaymentInstructions = {
  payableTo: string; remitTo: string[]; achNote: string;
  contactName: string; contactEmail: string; contactPhone: string; note: string;
};
type LinkInfo = {
  unitRef: string; year: number; kind: "retail" | "office";
  link: { id: string; url: string | null; createdAt: string; createdBy: string | null;
    viewCount: number; lastViewedAt: string | null; hasPin: boolean; expiresAt: string | null } | null;
};
type LinksPayload = { ok: true; configured: boolean; shared: number; viewed: number; tenants: LinkInfo[] };

type Detail = {
  ok: true; period: string; published: boolean; publishedAt: string | null; updatedAt: string;
  sources: PeriodRow["sources"];
  declaredCount: number;
  declaredAmount: number;
  pendingPaymentCount: number;
  pendingPaymentAmount: number;
  properties: { code: string; name: string }[];
  payment: Record<string, PaymentInstructions>;
  tenants: TenantRow[];
  credits?: OpenCreditTracker;
  creditNotes?: Record<string, CreditNote>;
  creditApplications?: Record<string, CreditApplication>;
  aging?: AgingSchedule;
};

export default function TenantStatementsPage() {
  const { user } = useUser();
  const { startImport } = useImport();
  const [periods, setPeriods] = useState<PeriodRow[] | null>(null);
  const [period, setPeriod] = useState<string>("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [property, setProperty] = useState("All");
  const [search, setSearch] = useState("");
  const [onlyOwing, setOnlyOwing] = useState(false);
  const [sort, setSort] = useState<"statement" | "balance">("statement");
  const [onlyReview, setOnlyReview] = useState(false);
  const [onlyUnshared, setOnlyUnshared] = useState(false);
  const [onlyFollowUp, setOnlyFollowUp] = useState(false);
  // When each suite was last emailed — every receipt email, payment request,
  // portal link and balance reminder (owner: "see … what our last
  // correspondence to them was").
  const [contacts, setContacts] = useState<Record<string, LastContact>>({});
  const [contactNonce, setContactNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/tenant-statements/correspondence", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.ok) setContacts(j.last); })
      .catch(() => { /* the column reads "—" */ });
    return () => { alive = false; };
  }, [contactNonce]);
  // A month where every tenant reconciles publishes itself on import — always
  // (owner: "i dont think id ever uncheck that"; the per-browser opt-out is gone).
  const [expanded, setExpanded] = useState<string | null>(null);
  const [links, setLinks] = useState<LinksPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadPeriods = useCallback(async () => {
    try {
      const j = await fetch("/api/tenant-statements", { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "Could not load statements.");
      setPeriods(j.periods);
      setPeriod((p) => p || j.periods[0]?.period || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load statements.");
      setPeriods([]);
    }
  }, []);
  useEffect(() => { void loadPeriods(); }, [loadPeriods]);

  // Bumping this re-pulls link status after a share popover mints or revokes.
  const [linksNonce, setLinksNonce] = useState(0);
  useEffect(() => {
    if (!period) { setLinks(null); return; }
    let alive = true;
    fetch(`/api/tenant-statements/links?period=${period}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setLinks(j?.ok ? j : null); })
      .catch(() => { if (alive) setLinks(null); });
    return () => { alive = false; };
  }, [period, linksNonce]);

  useEffect(() => {
    if (!period) { setDetail(null); return; }
    let alive = true;
    setDetail(null);
    fetch(`/api/tenant-statements/${period}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive && j.ok) setDetail(j); })
      .catch(() => { /* the header still renders from the period row */ });
    return () => { alive = false; };
  }, [period]);

  const row = periods?.find((p) => p.period === period) ?? null;

  const importLaser = useLaserStatementImport(async () => { await loadPeriods(); setPeriod(""); });
  async function processFiles(files: File[]) {
    if (!files.length) return;
    setError(null);
    await importLaser(files);
  }

  const reloadDetail = useCallback(() => {
    if (!period) return;
    fetch(`/api/tenant-statements/${period}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (j.ok) setDetail(j); }).catch(() => {});
  }, [period]);

  const closeRequest = useCallback(async (id: string) => {
    await fetch("/api/tenant-statements/allocation-request", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "close" }),
    }).catch(() => {});
    reloadDetail();
  }, [reloadDetail]);

  async function togglePublish() {
    if (!row) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/tenant-statements/${row.period}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !row.published, by: user.label }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not update.");
      await loadPeriods();
      setDetail((d) => (d ? { ...d, published: j.published, publishedAt: j.publishedAt } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
    } finally { setBusy(false); }
  }

  const linkByUnit = useMemo(
    () => new Map((links?.tenants ?? []).map((l) => [l.unitRef, l])),
    [links],
  );

  const tenants = useMemo(() => {
    let list = detail?.tenants ?? [];
    if (property !== "All") list = list.filter((t) => t.propertyCode === property);
    if (onlyOwing) list = list.filter((t) => t.summary.totalDue > 0.005);
    if (onlyReview) list = list.filter((t) => !t.tiesOut);
    if (onlyUnshared) list = list.filter((t) => !linkByUnit.get(t.unitRef)?.link);
    if (onlyFollowUp) list = list.filter((t) => needsFollowUp(t.summary.totalDue, contacts[t.unitRef.toUpperCase()]));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.tenantName.toLowerCase().includes(q) || t.unitRef.toLowerCase().includes(q));
    // "Statement order" is the sequence Skyline printed, so the roster can be
    // read down alongside the paper laser statements; balance is the chase list.
    return sort === "balance" ? [...list].sort((a, b) => b.summary.totalDue - a.summary.totalDue) : list;
  }, [detail, property, onlyOwing, onlyReview, onlyUnshared, onlyFollowUp, contacts, linkByUnit, search, sort]);

  const filteredTotals = useMemo(() => {
    const aging = new Map<AgingBucket, number>();
    let open = 0;
    for (const t of tenants) {
      open += t.summary.totalDue;
      for (const b of t.summary.byAging) aging.set(b.bucket, (aging.get(b.bucket) ?? 0) + b.amount);
    }
    return { open, aging };
  }, [tenants]);

  // Open A/R per property, over the WHOLE month (not the current filter) — this
  // is the portfolio view, and it's what the strip filters down from. Property
  // order follows the statement, so it reads like the report's sections.
  const byProperty = useMemo(() => {
    const map = new Map<string, { code: string; tenants: number; owing: number; open: number; pastDue: number }>();
    for (const t of detail?.tenants ?? []) {
      const g = map.get(t.propertyCode) ?? { code: t.propertyCode, tenants: 0, owing: 0, open: 0, pastDue: 0 };
      g.tenants += 1;
      if (t.summary.totalDue > 0.005) g.owing += 1;
      g.open += t.summary.totalDue;
      g.pastDue += t.summary.pastDueAmount;
      map.set(t.propertyCode, g);
    }
    return [...map.values()];
  }, [detail]);

  // Subtotals for the property bands inside the table, over the filtered rows.
  const propertySubtotal = useMemo(() => {
    const map = new Map<string, { tenants: number; current: number; prior: number; pastDue: number; total: number }>();
    for (const t of tenants) {
      const g = map.get(t.propertyCode) ?? { tenants: 0, current: 0, prior: 0, pastDue: 0, total: 0 };
      g.tenants += 1;
      g.current += t.summary.currentCharges;
      g.prior += t.summary.priorBalance;
      g.pastDue += t.summary.pastDueAmount;
      g.total += t.summary.totalDue;
      map.set(t.propertyCode, g);
    }
    return map;
  }, [tenants]);

  // Bands only make sense while rows are in statement (property) order — a
  // largest-balance chase list is deliberately flat.
  const grouped = sort === "statement";


  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <PageHeader title="Statements & Tenant Portal"
        info={<>Every tenant&rsquo;s monthly statement of account from the Laser Statement, with the A/R aging, portal links and the payment instructions printed on statements. The day-to-day work is on <a className="text-link" href="/tenant-statements">Receivables</a>.</>}
        pickers={periods && periods.length > 0 ? (
              <HeaderSelect value={period} onChange={setPeriod} ariaLabel="Statement month" displayLabel={period ? periodLabel(period) : "Month"}>
                {periods.map((p) => (
                  <option key={p.period} value={p.period}>{periodLabel(p.period)}{p.published ? "" : " (not published)"}</option>
                ))}
              </HeaderSelect>
          ) : undefined}
        actions={<>
            <button className="btn import" onClick={() => pickInto(fileRef.current, "laser-statement")}>
              <Upload size={16} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0 }} />Import Laser Statement
            </button>
            {row && (
              <button className={row.published ? "btn" : "btn primary"} disabled={busy} onClick={togglePublish}>
                {busy ? "Saving…" : row.published ? "Unpublish" : "Publish to Portal"}
              </button>
            )}
            <button className="btn" onClick={() => setShowPayment((v) => !v)}>Payment Instructions</button>
            {row && (
              <DownloadMenu
                label="Export"
                items={[
                  { label: "All statements (PDF)", description: `Every tenant on ${periodLabel(row.period)}, one page each`, href: `/api/tenant-statements/${row.period}/pdf` },
                  ...(property !== "All" ? [{ label: `${property} statements (PDF)`, description: "Just this property", href: `/api/tenant-statements/${row.period}/pdf?property=${property}` }] : []),
                ]}
              />
            )}
          </>}
        meta={row && (() => {
          const last = [...row.sources].sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0];
          return (
            <MetaLine at={last?.importedAt ?? row.updatedAt} by={last?.importedBy ?? null}>
              <span>· {row.tenants} tenants · {row.properties} propert{row.properties === 1 ? "y" : "ies"}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: row.published ? "var(--c-067647)" : undefined }}>
                {row.published ? <CircleCheck size={16} strokeWidth={1.75} aria-hidden /> : null}
                {row.published ? "Visible to tenants" : "Not published"}
              </span>
              <InfoPopover align="left"><ImportInstructions variant="statements" /></InfoPopover>
            </MetaLine>
          );
        })()}>
        <input ref={fileRef} type="file" accept=".pdf,.xls,.xlsx" multiple style={{ display: "none" }}
          onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void processFiles(f); }} />
      </PageHeader>

      {error && (
        <StatusBanner tone="danger" title="Something went wrong">{error}</StatusBanner>
      )}

      {showPayment && <PaymentCard properties={detail?.properties ?? []} onClose={() => setShowPayment(false)} by={user.label} />}

      {periods && periods.length === 0 ? (
        <div className="card">
          <div style={{ fontWeight: 800, fontSize: 17 }}>No statements imported yet</div>
          <div className="muted small" style={{ marginTop: 6, maxWidth: 620 }}>
            Import Skyline&rsquo;s Laser Statement and every tenant&rsquo;s open charges become a portal statement —
            aged, categorized, and downloadable as a branded PDF.
          </div>
          <ImportInstructions variant="statements" />
        </div>
      ) : !periods ? (
        <div className="card muted small">Loading statements…</div>
      ) : (
        <>
          {row && (
            <div className="card" style={{ display: "grid", gap: 14 }}>
              <div className="pills" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
                <StatPill label="Open balance" value={money0(row.openBalance)} />
                <StatPill label="Past due" value={money0(row.pastDue)} accent={row.pastDue > 0 ? "var(--c-b45309)" : undefined} />
                <StatPill label="Tenants owing" value={row.tenantsOwing} sub={`of ${row.tenants}`} />
                <StatPill label="To review" value={row.untied} accent={row.untied > 0 ? "var(--c-b91c1c)" : undefined}
                  sub={row.untied ? "don't tie to Skyline" : "all tie out"} />
                {links && (
                  <StatPill label="Portal links shared" value={links.shared} sub={`${links.viewed} opened · of ${row.tenants}`}
                    accent={links.shared === 0 ? "var(--c-b45309)" : undefined} />
                )}
                {!!detail?.pendingPaymentCount && (
                  <StatPill label="Unapplied payments" value={money0(detail.pendingPaymentAmount)}
                    sub={`${detail.pendingPaymentCount} waiting on the tenant`} accent="var(--c-b45309)" />
                )}
                {!!detail?.declaredCount && (
                  <StatPill label="Payments declared" value={money0(detail.declaredAmount)}
                    sub={`${detail.declaredCount} ${detail.declaredCount === 1 ? "tenant" : "tenants"} told us`} accent="var(--c-15803d)" />
                )}
              </div>

              {row.untied > 0 && (
                <StatusBanner compact tone="danger" title={<>{row.untied} tenant{row.untied === 1 ? "'s charges don't" : "s' charges don't"} tie to Skyline</>}
                  actions={<button className="btn sm" onClick={() => { setOnlyReview((v) => !v); setProperty("All"); }}>
                    {onlyReview ? "Show all tenants" : `Show the ${row.untied}`}
                  </button>}>
                  They don&rsquo;t sum to the balance Skyline printed, so those statements are flagged &ldquo;under review&rdquo; on the portal — fix the export and re-import before publishing.
                </StatusBanner>
              )}

              <div>
                <div style={SECTION_LABEL}>Files imported</div>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {row.sources.map((s, i) => (
                    <div key={`${s.filename}-${i}`} className="muted" style={{ fontSize: "var(--fs-12-5)" }}>
                      <code style={{ fontSize: "var(--fs-12)" }}>{s.filename}</code> · {s.tenantCount} tenants ·
                      {" "}{new Date(s.importedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {s.importedBy ? ` · ${s.importedBy}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {detail && (
            <>
              {detail.credits && (
                <OpenCreditsCard tracker={detail.credits} notes={detail.creditNotes ?? {}} applications={detail.creditApplications ?? {}}
                  period={detail.period} readOnly={READ_ONLY_USERS.has(user.id)} onChanged={reloadDetail} />
              )}

              {detail.aging && detail.aging.rows.length > 0 && (
                <AgingScheduleCard schedule={detail.aging} active={property} onPick={setProperty}
                  nameOf={(c) => detail.properties.find((x) => x.code === c)?.name ?? ""} />
              )}

              {byProperty.length > 1 && !detail.aging && (
                <div className="card">
                  <div style={SECTION_LABEL}>Open A/R by property</div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(146px, 1fr))", marginTop: 10 }}>
                    {byProperty.map((g) => {
                      const on = property === g.code;
                      const name = detail.properties.find((x) => x.code === g.code)?.name ?? g.code;
                      return (
                        <button key={g.code} type="button" onClick={() => setProperty(on ? "All" : g.code)}
                          title={on ? "Show all properties" : `Filter to ${g.code} — ${name}`}
                          style={{ cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: "11px 13px", borderRadius: 10,
                            border: `1.5px solid ${on ? "var(--tint-brand-line, rgba(11,74,125,0.5))" : "var(--border)"}`,
                            background: on ? "var(--tint-brand-bg, rgba(11,74,125,0.06))" : "var(--card)" }}>
                          <div style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: on ? "var(--c-0b4a7d)" : "var(--text)" }}>{money0(g.open)}</div>
                          <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.code}</div>
                          <div className="muted" style={{ fontSize: "var(--fs-11)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                          <div style={{ fontSize: "var(--fs-11)", marginTop: 3, color: g.pastDue > 0.005 ? "var(--c-b45309)" : "var(--muted)", fontWeight: g.pastDue > 0.005 ? 700 : 500 }}>
                            {g.pastDue > 0.005 ? `${money0(g.pastDue)} past due` : "nothing past due"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <select value={property} onChange={(e) => setProperty(e.target.value)}>
                  <option value="All">All properties</option>
                  {detail.properties.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
                </select>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tenant or unit…"
                  style={{ minWidth: 220, flex: "1 1 220px" }} />
                <DisplayMenu>
                  <MenuSection label="Show only">
                    <CheckRow label="Tenants with a balance" checked={onlyOwing} onChange={setOnlyOwing} />
                    <CheckRow label="Not shared yet" checked={onlyUnshared} onChange={setOnlyUnshared} />
                    <CheckRow label="Needs follow-up" hint="Owes, and nothing emailed in the last 30 days" checked={onlyFollowUp} onChange={setOnlyFollowUp} />
                  </MenuSection>
                  <ToggleRow label="Order" left="Statement" right="Balance" active={sort === "balance" ? "right" : "left"} onLeft={() => setSort("statement")} onRight={() => setSort("balance")} />
                </DisplayMenu>
                {onlyReview && (
                  <button type="button" onClick={() => setOnlyReview(false)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit", fontSize: "var(--fs-12-5)", fontWeight: 700,
                      padding: "5px 10px", borderRadius: 999, border: "1px solid var(--tint-red-line, rgba(220,38,38,0.3))", background: "var(--tint-red-bg, rgba(220,38,38,0.08))", color: "var(--c-b91c1c)" }}>
                    Only tenants to review <span aria-hidden style={{ opacity: 0.7 }}><X size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px", flexShrink: 0 }} /></span>
                  </button>
                )}
                <div className="muted small" style={{ marginLeft: "auto" }}>
                  {tenants.length} shown · {money0(filteredTotals.open)} open
                </div>
              </div>

              <div className="card" style={{ padding: 0, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={thL}>Unit</th>
                      <th style={thL}>Tenant</th>
                      <th style={th}>This month</th>
                      <th style={th}>Prior</th>
                      <th style={th}>Past due</th>
                      <th style={th}>Total due</th>
                      <th style={th}>Statement</th>
                      <th style={thL}>Last contact</th>
                      <th style={{ ...th, textAlign: "left" }}>Portal link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t, i) => {
                      // Statement order already groups by property, so a band
                      // opens each block and carries that property's subtotals.
                      const band = grouped && (i === 0 || tenants[i - 1].propertyCode !== t.propertyCode);
                      const g = propertySubtotal.get(t.propertyCode);
                      return (
                        <Fragment key={t.unitRef}>
                          {band && g && (
                            <tr style={{ background: "var(--tint-brand-bg, rgba(11,74,125,0.07))", borderTop: i ? "2px solid var(--border)" : "none" }}>
                              {/* wraps rather than nowrap — a long centre name
                                  must not widen the table into a scroll */}
                              <td style={{ ...tdL, paddingTop: 10, paddingBottom: 10, whiteSpace: "normal" }} colSpan={2}>
                                <div style={{ fontWeight: 800 }}>
                                  {t.propertyCode} — {detail.properties.find((x) => x.code === t.propertyCode)?.name ?? t.propertyCode}
                                </div>
                                <div className="muted" style={{ fontSize: "var(--fs-11-5)" }}>{g.tenants} {g.tenants === 1 ? "tenant" : "tenants"}</div>
                              </td>
                              <td style={{ ...td, fontWeight: 700 }}>{money0(g.current)}</td>
                              <td style={{ ...td, fontWeight: 700 }}>{money0(g.prior)}</td>
                              <td style={{ ...td, fontWeight: 700, color: g.pastDue > 0.005 ? "var(--c-b45309)" : "var(--muted)" }}>{g.pastDue > 0.005 ? money0(g.pastDue) : "—"}</td>
                              <td style={{ ...td, fontWeight: 800 }}>{money0(g.total)}</td>
                              <td colSpan={3} />
                            </tr>
                          )}
                          <TenantRows t={t} period={detail.period}
                            linkInfo={linkByUnit.get(t.unitRef) ?? null}
                            contact={contacts[t.unitRef.toUpperCase()] ?? null}
                            contactNonce={contactNonce} onContactChange={() => setContactNonce((n) => n + 1)}
                            onLinkChange={() => { setLinksNonce((n) => n + 1); reloadDetail(); setContactNonce((n) => n + 1); }}
                            onCloseRequest={closeRequest}
                            open={expanded === t.unitRef} onToggle={() => setExpanded((x) => (x === t.unitRef ? null : t.unitRef))} />
                        </Fragment>
                      );
                    })}
                    {tenants.length === 0 && (
                      <tr><td colSpan={9} style={{ ...tdL, padding: "22px 12px", color: "var(--muted)" }}>No tenants match those filters.</td></tr>
                    )}
                  </tbody>
                  {tenants.length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
                        <td style={tdL} colSpan={5}>
                          Total — {tenants.length} tenants
                          {grouped && propertySubtotal.size > 1 ? ` · ${propertySubtotal.size} properties` : ""}
                        </td>
                        <td style={td}>{money2(filteredTotals.open)}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

            </>
          )}

          <div className="card">
            <ImportInstructions variant="statements" />
          </div>
        </>
      )}
    </main>
  );
}

/** Period switcher — newest first, publish state visible at a glance. */
/** Sort state for a tenant's expanded charge list. `null` = the order Skyline
 *  printed, which is what the tenant's own statement shows. */
type ChargeSortKey = "date" | "charge" | "type" | "amount";
type ChargeSort = { key: ChargeSortKey; dir: "asc" | "desc" } | null;

/** Undated rows (the aggregate "Open Credits" line) have nothing to sort on, so
 *  they stay pinned to the end whatever the sort — same as the statement. */
function sortCharges(charges: StatementCharge[], sort: ChargeSort): StatementCharge[] {
  if (!sort) return charges;
  const sign = sort.dir === "asc" ? 1 : -1;
  const dated = charges.filter((c) => c.dateISO);
  const undated = charges.filter((c) => !c.dateISO);
  const cmp = (a: StatementCharge, b: StatementCharge): number => {
    switch (sort.key) {
      case "date": return sign * (a.dateISO ?? "").localeCompare(b.dateISO ?? "");
      case "charge": return sign * a.description.localeCompare(b.description);
      case "amount": return sign * (a.amount - b.amount);
      case "type": {
        // Group by the statement's own category order, then oldest first inside
        // each type so a type block still reads like a ledger.
        const d = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
        return d !== 0 ? sign * d : (a.dateISO ?? "").localeCompare(b.dateISO ?? "");
      }
    }
  };
  return [...dated].sort(cmp).concat(undated);
}


/** Portal-link status for one tenant, plus the share control itself.
 *
 * Status is read from the bulk endpoint so 67 rows don't fire 67 requests; the
 * popover does its own per-tenant fetch when opened, which is where mint /
 * copy / email / PIN / revoke live. `onChange` re-pulls the bulk status after
 * an action so the row reflects it without a page refresh. */
function PortalLinkCell({ info }: { info: LinkInfo | null }) {
  const link = info?.link ?? null;
  const viewed = link?.viewCount ?? 0;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {link ? (
        <HoverCard title="Portal link" width={262}
          rows={[
            { label: "Shared", value: new Date(link.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
            ...(link.createdBy ? [{ label: "By", value: link.createdBy }] : []),
            { label: "Access PIN", value: link.hasPin ? "Required" : "None" },
          ]}
          footer={{ label: "Last opened", value: link.lastViewedAt ? new Date(link.lastViewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—" }}>
          <Pill tone={viewed ? TONE_GREEN : TONE_BLUE}>{viewed ? `OPENED ${viewed}×` : "SHARED"}</Pill>
        </HoverCard>
      ) : (
        <Pill tone={TONE_NEUTRAL}>NOT SHARED</Pill>
      )}
    </div>
  );
}


/** Record a payment we've received but can't apply, and ask the tenant where it
 *  goes. The email carries their portal link; they answer on the same statement
 *  they'd otherwise pay from, which is the only place the charges are legible. */
function RecordPayment({ t, period, onDone }: { t: TenantRow; period: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(send: boolean) {
    const amt = Number(amount.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) { setMsg("Enter the amount you received."); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/tenant-statements/allocation-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, unitRef: t.unitRef, amount: amt, paymentRef, receivedOn, note, send }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not record that.");
      if (j.mailError) { setMsg(j.mailError); onDone(); return; }
      setOpen(false); onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not record that.");
    } finally { setBusy(false); }
  }

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, width: number) => (
    <label style={{ display: "block", width }}>
      <div style={SECTION_LABEL}>{label}</div>
      <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", marginTop: 4, boxSizing: "border-box" }} />
    </label>
  );

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button className="btn" onClick={() => setOpen((o) => !o)} style={{ fontSize: "var(--fs-13)", padding: "8px 14px", fontWeight: 700 }}>
        Record a payment
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50, width: 430, maxWidth: "90vw",
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 40px rgba(15,23,42,0.22)", padding: 16 }}>
          <div style={{ fontSize: "var(--fs-12)", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-0b4a7d)" }}>Payment we can&rsquo;t apply</div>
          <p className="muted small" style={{ marginTop: 4, marginBottom: 12 }}>
            Record what came in from <b>{t.tenantName}</b> and ask them which of their {t.charges.length} open charges it covers.
            They answer on their statement; you&rsquo;ll see the application here.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {field("Amount", amount, setAmount, "6,200.00", 130)}
            {field("Check / ref", paymentRef, setPaymentRef, "Check 10482", 150)}
            {field("Received", receivedOn, setReceivedOn, "2026-09-12", 120)}
          </div>
          <label style={{ display: "block", marginTop: 10 }}>
            <div style={SECTION_LABEL}>Note to the tenant (optional)</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              style={{ width: "100%", marginTop: 4, boxSizing: "border-box", resize: "vertical" }} />
          </label>
          {msg && <div style={{ color: "var(--c-b45309)", fontSize: "var(--fs-12-5)", fontWeight: 600, marginTop: 10 }}>{msg}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn primary" disabled={busy} onClick={() => submit(true)} style={{ fontSize: "var(--fs-13)", padding: "7px 14px", fontWeight: 700 }}>
              {busy ? "Sending…" : "Record and ask the tenant"}
            </button>
            <button className="btn" disabled={busy} onClick={() => submit(false)} style={{ fontSize: "var(--fs-13)", padding: "7px 14px" }}>
              Record only
            </button>
            <button className="btn" onClick={() => setOpen(false)} style={{ fontSize: "var(--fs-13)", padding: "7px 14px", marginLeft: "auto" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One tenant row, expanding to their line-by-line charges. */
function TenantRows({ t, period, open, onToggle, linkInfo, onLinkChange, onCloseRequest, contact, contactNonce, onContactChange }: {
  t: TenantRow; period: string; open: boolean; onToggle: () => void;
  linkInfo: LinkInfo | null; onLinkChange: () => void; onCloseRequest: (id: string) => void;
  contact: LastContact | null; contactNonce: number; onContactChange: () => void;
}) {
  const s = t.summary;
  // Defaults to the printed statement order; a third click on the active column
  // returns to it, so staff can always get back to the paper statement's order.
  const [sort, setSort] = useState<ChargeSort>(null);
  const charges = useMemo(() => sortCharges(t.charges, sort), [t.charges, sort]);
  const cycle = (key: ChargeSortKey) =>
    setSort((cur) => (cur?.key !== key ? { key, dir: key === "amount" ? "desc" : "asc" }
      : cur.dir === (key === "amount" ? "desc" : "asc") ? { key, dir: key === "amount" ? "asc" : "desc" }
      : null));
  const SortHead = ({ label, k, style }: { label: string; k: ChargeSortKey; style: React.CSSProperties }) => {
    const active = sort?.key === k;
    return (
      <th style={{ ...style, cursor: "pointer", userSelect: "none" }} onClick={(e) => { e.stopPropagation(); cycle(k); }}
        title={active ? "Sort the other way, then back to statement order" : `Sort by ${label.toLowerCase()}`}
        aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
        {label}
        <span aria-hidden style={{ marginLeft: 4, opacity: active ? 0.85 : 0.25, fontSize: "var(--fs-9)" }}>
          {active ? (sort!.dir === "asc" ? "\u25b2" : "\u25bc") : "\u25b4\u25be"}
        </span>
      </th>
    );
  };
  return (
    <>
      <tr onClick={onToggle} style={{ borderTop: "1px solid var(--border)", cursor: "pointer", background: open ? "var(--tint-brand-bg, rgba(11,74,125,0.04))" : undefined }}>
        <td style={tdL}><code style={{ fontSize: "var(--fs-12)" }}>{t.unitRef}</code></td>
        <td style={{ ...tdL, whiteSpace: "normal" }}>
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {t.tenantName}
            {/* Tying out is the norm, so it isn't worth a column — only the
                exception is called out, on the row it applies to. */}
            {!t.tiesOut && (
              <HoverCard title="Doesn't reconcile to Skyline" width={250}
                rows={[{ label: "Charges parsed", value: money2(t.chargeTotal) }, { label: "Skyline balance", value: money2(t.reportedBalance) }]}
                footer={{ label: "Difference", value: money2(t.chargeTotal - t.reportedBalance) }}>
                <Pill tone={TONE_RED}>REVIEW</Pill>
              </HoverCard>
            )}
            {/* Kept from an earlier upload because the newest export didn't
                mention them — never dropped, but worth being able to see. */}
            {t.pendingPayment && (
              <HoverCard title={`Unapplied ${money2(t.pendingPayment.amount)}`} width={280}
                rows={[
                  ...(t.pendingPayment.paymentRef ? [{ label: "Reference", value: t.pendingPayment.paymentRef }] : []),
                  ...(t.pendingPayment.receivedOn ? [{ label: "Received", value: t.pendingPayment.receivedOn }] : []),
                  { label: "Tenant asked", value: t.pendingPayment.askedAt
                    ? `${new Date(t.pendingPayment.askedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · waiting`
                    : "Not yet", color: t.pendingPayment.askedAt ? undefined : "var(--c-b45309)" },
                ]}>
                <Pill tone={TONE_AMBER}>{`UNAPPLIED ${money0(t.pendingPayment.amount)}`}</Pill>
              </HoverCard>
            )}
            {t.declared && (
              <HoverCard title={t.declared.receivedAmount != null ? `Allocated ${money2(t.declared.amount)}` : `Paying ${money2(t.declared.amount)}`} width={290}
                rows={[
                  ...(t.declared.receivedAmount != null
                    ? [{ label: "Received", value: money2(t.declared.receivedAmount), color: "var(--c-b45309)" }]
                    : [{ label: "Reference", value: t.declared.reference }]),
                  { label: "Method", value: METHOD_LABEL[t.declared.method] },
                  { label: "Told us", value: new Date(t.declared.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) },
                  { label: "Applying to", value: `${t.declared.paying.length} of ${t.declared.paying.length + t.declared.holding.length} charges` },
                ]}
                footer={t.declared.receivedAmount != null
                  ? { label: "Still unapplied", value: money2(t.declared.receivedAmount - t.declared.amount) }
                  : { label: "Leaving open", value: money2(t.declared.statementTotal - t.declared.amount) }}>
                <Pill tone={TONE_GREEN}>{`${t.declared.receivedAmount != null ? "APPLIED" : "PAYING"} ${money0(t.declared.amount)}`}</Pill>
              </HoverCard>
            )}
            {t.carriedOver && (
              <HoverCard title="Carried over" width={272}
                rows={[
                  { label: "From", value: t.sourceFile ?? "an earlier import" },
                  { label: "Imported", value: t.importedAt ? new Date(t.importedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—" },
                ]}
                footer={{ label: "Kept", value: "not in the latest export" }}>
                <Pill tone={TONE_NEUTRAL}>CARRIED OVER</Pill>
              </HoverCard>
            )}
          </div>
          <div className="muted" style={{ fontSize: "var(--fs-11-5)" }}>{t.charges.length} open {t.charges.length === 1 ? "charge" : "charges"}</div>
        </td>
        <td style={td}>{money2(s.currentCharges)}</td>
        <td style={td}>{money2(s.priorBalance)}</td>
        <td style={{ ...td, color: s.pastDueAmount > 0.005 ? "var(--c-b45309)" : "var(--muted)", fontWeight: s.pastDueAmount > 0.005 ? 700 : 400 }}>
          {s.pastDueAmount > 0.005 ? (
            <HoverCard title="Past due" width={240}
              rows={s.byAging.filter((b) => b.bucket !== "current").map((b) => ({ label: AGING_LABEL[b.bucket], value: money2(b.amount), color: "var(--c-b45309)" }))}
              footer={{ label: "Oldest charge", value: dateLabel(s.oldestISO) }}>
              {money2(s.pastDueAmount)}
            </HoverCard>
          ) : "—"}
        </td>
        <td style={{ ...td, fontWeight: 800, color: s.totalDue > 0.005 ? "var(--c-b45309)" : s.totalDue < -0.005 ? "var(--c-15803d)" : "var(--text)" }}>
          <HoverCard title={t.tenantName} width={270}
            rows={s.byCategory.map((c) => ({ label: `${CATEGORY_LABEL[c.category]} (${c.count})`, value: money2(c.amount) }))}
            footer={{ label: "Total due", value: money2(s.totalDue) }}>
            {money2(s.totalDue)}
          </HoverCard>
        </td>
        <td style={td}>
          <a href={`/api/tenant-statements/${period}/pdf?unitRef=${encodeURIComponent(t.unitRef)}`} onClick={(e) => e.stopPropagation()}
            className="btn" style={{ fontSize: "var(--fs-12)", padding: "4px 10px", textDecoration: "none" }}>PDF</a>
        </td>
        <td style={{ ...tdL, whiteSpace: "nowrap" }}><LastContactCell contact={contact} owed={s.totalDue} /></td>
        {/* Minting, copying, emailing and revoking a tenant's portal link — the
            same control as the recon page, so there is one share flow, not two. */}
        <td style={{ ...tdL, whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
          <PortalLinkCell info={linkInfo} />
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9} style={{ padding: "0 10px 14px", background: "var(--tint-brand-faint, rgba(11,74,125,0.03))", maxWidth: 0 }}>
            {linkInfo && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 10px 6px", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={SECTION_LABEL}>Tenant portal</div>
                  <div className="muted" style={{ fontSize: "var(--fs-12-5)", marginTop: 3 }}>
                    {linkInfo.link
                      ? <>Shared {new Date(linkInfo.link.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {linkInfo.link.createdBy ? ` by ${linkInfo.link.createdBy}` : ""} ·{" "}
                          {linkInfo.link.viewCount ? `opened ${linkInfo.link.viewCount}×` : "not opened yet"}
                          {linkInfo.link.hasPin ? " · PIN required" : ""}</>
                      : <>No link yet — {t.tenantName} can&rsquo;t see their statement until you share one.</>}
                  </div>
                </div>
                <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
                  {!t.pendingPayment && !t.declared && (
                    <RecordPayment t={t} period={period} onDone={onLinkChange} />
                  )}
                  <span onClick={onLinkChange}>
                    <TenantShareLink property={t.propertyCode} unitRef={t.unitRef} year={linkInfo.year} kind={linkInfo.kind} tenantName={t.tenantName} />
                  </span>
                </div>
              </div>
            )}
            <CorrespondencePanel unitRef={t.unitRef} period={period} tenantName={t.tenantName} owed={s.totalDue}
              nonce={contactNonce} onSent={onContactChange} />
            <div className="muted" style={{ fontSize: "var(--fs-11-5)", padding: "8px 10px 0" }}>
              {sort
                ? <>Sorted by {sort.key === "charge" ? "description" : sort.key} — <button type="button" onClick={(e) => { e.stopPropagation(); setSort(null); }}
                    style={{ padding: 0, border: "none", background: "none", font: "inherit", color: "var(--c-0b4a7d)", fontWeight: 700, cursor: "pointer" }}>back to statement order</button></>
                : "In the order Skyline's statement prints them. Click a column to sort."}
            </div>
            {t.pendingPayment && (
              <HoverCard title={`Unapplied ${money2(t.pendingPayment.amount)}`} width={280}
                rows={[
                  ...(t.pendingPayment.paymentRef ? [{ label: "Reference", value: t.pendingPayment.paymentRef }] : []),
                  ...(t.pendingPayment.receivedOn ? [{ label: "Received", value: t.pendingPayment.receivedOn }] : []),
                  { label: "Tenant asked", value: t.pendingPayment.askedAt
                    ? `${new Date(t.pendingPayment.askedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · waiting`
                    : "Not yet", color: t.pendingPayment.askedAt ? undefined : "var(--c-b45309)" },
                ]}>
                <Pill tone={TONE_AMBER}>{`UNAPPLIED ${money0(t.pendingPayment.amount)}`}</Pill>
              </HoverCard>
            )}
            {t.pendingPayment ? (
              <StatusBanner compact tone="warning" style={{ margin: "10px 10px 14px" }}
                title={<>Payment we can&rsquo;t apply · {money2(t.pendingPayment.amount)}</>}
                actions={<button className="btn sm" onClick={() => onCloseRequest(t.pendingPayment!.id)}>Close it</button>}>
                {t.pendingPayment.paymentRef ? `${t.pendingPayment.paymentRef} · ` : ""}
                {t.pendingPayment.receivedOn ? `received ${t.pendingPayment.receivedOn} · ` : ""}
                {t.pendingPayment.askedAt
                  ? `asked ${t.pendingPayment.askedTo.join(", ")}`
                  : "not sent to the tenant yet"}
              </StatusBanner>
            ) : null}
            {t.declared && (
              <div style={{ margin: "10px 10px 14px", border: "1.5px solid var(--tint-green-line, rgba(22,163,74,0.4))", borderRadius: 10, background: "var(--tint-green-bg, rgba(22,163,74,0.05))", padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "var(--fs-12)", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-15803d)" }}>
                    {t.declared.receivedAmount != null ? "Tenant allocated their payment" : "Tenant says they\u2019re paying"}
                  </span>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>{money2(t.declared.amount)}</span>
                  <span className="muted" style={{ fontSize: "var(--fs-12-5)" }}>
                    by {METHOD_LABEL[t.declared.method]} · ref <code style={{ fontSize: "var(--fs-12)", fontWeight: 700 }}>{t.declared.reference}</code> ·
                    {" "}{new Date(t.declared.submittedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  {t.declared.receivedAmount != null && Math.abs(t.declared.receivedAmount - t.declared.amount) >= 0.011 && (
                    <span style={{ fontSize: "var(--fs-12-5)", fontWeight: 800, color: "var(--c-b45309)", padding: "2px 8px", borderRadius: 999,
                      background: "var(--tint-amber-bg, rgba(217,119,6,0.12))", border: "1px solid var(--tint-amber-line, rgba(217,119,6,0.35))" }}>
                      {money2(t.declared.receivedAmount - t.declared.amount)} of the {money2(t.declared.receivedAmount)} received is still unapplied
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", marginTop: 10 }}>
                  <div>
                    <div style={SECTION_LABEL}>Apply to</div>
                    {t.declared.paying.map((l, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, fontSize: "var(--fs-13)", padding: "3px 0" }}>
                        <span className="muted" style={{ width: 92, flexShrink: 0 }}>{dateLabel(l.dateISO)}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>{l.description}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{money2(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                  {t.declared.holding.length > 0 && (
                    <div>
                      <div style={SECTION_LABEL}>Not paying — {money2(t.declared.statementTotal - t.declared.amount)} left open</div>
                      {t.declared.holding.map((l, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, fontSize: "var(--fs-13)", padding: "3px 0", color: "var(--muted)" }}>
                          <span style={{ width: 92, flexShrink: 0 }}>{dateLabel(l.dateISO)}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>{l.description}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{money2(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {t.declared.note && (
                  <div style={{ marginTop: 10, fontSize: "var(--fs-13)", fontStyle: "italic", color: "var(--muted)" }}>&ldquo;{t.declared.note}&rdquo;</div>
                )}
              </div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <SortHead label="Date" k="date" style={{ ...thL, width: 120 }} />
                  <SortHead label="Charge" k="charge" style={thL} />
                  <SortHead label="Type" k="type" style={{ ...thL, width: 140 }} />
                  <SortHead label="Amount" k="amount" style={{ ...th, width: 130 }} />
                </tr>
              </thead>
              <tbody>
                {charges.map((c, i) => (
                  <tr key={`${c.dateISO}-${c.description}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...tdL, color: "var(--muted)", fontSize: "var(--fs-12-5)" }}>{dateLabel(c.dateISO)}</td>
                    <td style={{ ...tdL, whiteSpace: "normal" }}>{c.description}</td>
                    <td style={{ ...tdL, fontSize: "var(--fs-12-5)", color: "var(--muted)" }}>{CATEGORY_LABEL[c.category]}</td>
                    <td style={{ ...td, color: c.amount < 0 ? "var(--c-15803d)" : "var(--text)" }}>{money2(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

/** Remit-to / contact details the portal's "How to pay" card reads from. */
function PaymentCard({ properties, onClose, by }: { properties: { code: string; name: string }[]; onClose: () => void; by: string }) {
  const [key, setKey] = useState("default");
  const [defaults, setDefaults] = useState<PaymentInstructions | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Partial<PaymentInstructions>>>({});
  const [draft, setDraft] = useState<PaymentInstructions | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/tenant-statements/payment", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.ok) { setDefaults(j.defaults); setOverrides(j.overrides ?? {}); }
    }).catch(() => {});
  }, []);

  // Effective value for the selected scope: defaults < global < property.
  useEffect(() => {
    if (!defaults) return;
    const layer = (base: PaymentInstructions, patch?: Partial<PaymentInstructions>) => {
      if (!patch) return base;
      const out = { ...base };
      for (const [k, v] of Object.entries(patch)) {
        if (Array.isArray(v) ? v.length : String(v ?? "").trim()) (out as Record<string, unknown>)[k] = v;
      }
      return out;
    };
    const base = key === "default" ? defaults : layer(defaults, overrides["default"]);
    setDraft(layer(base, overrides[key]));
  }, [key, defaults, overrides]);

  async function save(value: Partial<PaymentInstructions> | null) {
    setBusy(true); setSaved(null);
    try {
      const res = await fetch("/api/tenant-statements/payment", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, by }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not save.");
      setOverrides((o) => {
        const next = { ...o };
        if (value === null) delete next[key]; else next[key] = j.value;
        return next;
      });
      setSaved(value === null ? "Reset to the defaults." : "Saved.");
    } catch (e) {
      setSaved(e instanceof Error ? e.message : "Could not save.");
    } finally { setBusy(false); }
  }

  const Field = ({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) => (
    <label style={{ display: "block" }}>
      <div style={SECTION_LABEL}>{label}</div>
      {rows ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
          style={{ width: "100%", marginTop: 5, boxSizing: "border-box", resize: "vertical" }} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", marginTop: 5, boxSizing: "border-box" }} />
      )}
    </label>
  );

  return (
    <div className="card" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Payment instructions</div>
          <div className="muted small" style={{ marginTop: 3 }}>
            What every tenant sees under &ldquo;How to pay&rdquo; on their statement — on the portal and in the PDF.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="default">All properties</option>
            {properties.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
          </select>
          <button className="btn" onClick={onClose} style={{ fontSize: "var(--fs-13)", padding: "6px 12px" }}>Close</button>
        </div>
      </div>

      {!draft ? <div className="muted small">Loading…</div> : (
        <>
          {key !== "default" && !overrides[key] && (
            <div className="muted small" style={{ fontStyle: "italic" }}>
              {properties.find((p) => p.code === key)?.name ?? key} currently uses the shared instructions. Edit and save to override just this property.
            </div>
          )}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <Field label="Checks payable to" value={draft.payableTo} onChange={(v) => setDraft({ ...draft, payableTo: v })} />
            <Field label="Remit-to address" value={draft.remitTo.join("\n")} onChange={(v) => setDraft({ ...draft, remitTo: v.split("\n") })} rows={3} />
            <Field label="ACH / wire note" value={draft.achNote} onChange={(v) => setDraft({ ...draft, achNote: v })} rows={3} />
            <Field label="Contact name" value={draft.contactName} onChange={(v) => setDraft({ ...draft, contactName: v })} />
            <Field label="Contact email" value={draft.contactEmail} onChange={(v) => setDraft({ ...draft, contactEmail: v })} />
            <Field label="Contact phone" value={draft.contactPhone} onChange={(v) => setDraft({ ...draft, contactPhone: v })} />
            <Field label="Footnote" value={draft.note} onChange={(v) => setDraft({ ...draft, note: v })} rows={2} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary" disabled={busy} onClick={() => void save({ ...draft, remitTo: draft.remitTo.filter((l) => l.trim()) })}
              style={{ fontSize: "var(--fs-13)", padding: "7px 14px", fontWeight: 700 }}>{busy ? "Saving…" : "Save"}</button>
            {overrides[key] && (
              <button className="btn" disabled={busy} onClick={() => void save(null)} style={{ fontSize: "var(--fs-13)", padding: "7px 14px" }}>
                Reset {key === "default" ? "to built-in defaults" : "to the shared instructions"}
              </button>
            )}
            {saved && <span className="muted small">{saved}</span>}
          </div>
        </>
      )}
    </div>
  );
}
