"use client";

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
import { HoverCard } from "@/app/components/HoverCard";
import { StatPill, Pill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL, TONE_RED } from "@/app/components/Pill";
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
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};
const th: React.CSSProperties = {
  textAlign: "right", padding: "6px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { textAlign: "right", padding: "7px 10px", fontSize: 14, whiteSpace: "nowrap" };
const thL: React.CSSProperties = { ...th, textAlign: "left" };
const tdL: React.CSSProperties = { ...td, textAlign: "left" };

type PeriodRow = {
  period: string; published: boolean; publishedAt: string | null; updatedAt: string;
  tenants: number; properties: number; openBalance: number; pastDue: number; tenantsOwing: number; untied: number;
  incompleteExport?: boolean;
  sources: { filename: string; importedAt: string; importedBy: string | null; tenantCount: number }[];
};
type Summary = {
  totalDue: number; currentCharges: number; priorBalance: number; credits: number;
  byCategory: { category: ChargeCategory; amount: number; count: number }[];
  byAging: { bucket: AgingBucket; amount: number }[];
  pastDue: boolean; pastDueAmount: number; oldestISO: string | null;
};
type TenantRow = {
  unitRef: string; propertyCode: string; suite: string; tenantName: string; address: string[];
  charges: StatementCharge[]; reportedBalance: number; chargeTotal: number; tiesOut: boolean; summary: Summary;
  importedAt?: string; sourceFile?: string; carriedOver?: boolean;
};
type PaymentInstructions = {
  payableTo: string; remitTo: string[]; achNote: string;
  contactName: string; contactEmail: string; contactPhone: string; note: string;
};
type Detail = {
  ok: true; period: string; published: boolean; publishedAt: string | null; updatedAt: string;
  sources: PeriodRow["sources"];
  properties: { code: string; name: string }[];
  payment: Record<string, PaymentInstructions>;
  tenants: TenantRow[];
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
  // Auto-publish is on by default: a month where every tenant reconciles needs
  // no ceremony. Remembered per browser so staff who prefer to stage keep it off.
  const [autoPublish, setAutoPublish] = useState(true);
  useEffect(() => {
    try { setAutoPublish(localStorage.getItem("kcp.stmt.autoPublish") !== "0"); } catch { /* private mode */ }
  }, []);
  const changeAutoPublish = (v: boolean) => {
    setAutoPublish(v);
    try { localStorage.setItem("kcp.stmt.autoPublish", v ? "1" : "0"); } catch { /* private mode */ }
  };
  const [expanded, setExpanded] = useState<string | null>(null);
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

  async function processFiles(files: File[]) {
    if (!files.length) return;
    setError(null);
    await startImport({
      kind: "tenant-statements",
      title: (n) => `Importing ${n} Skyline statement export${n === 1 ? "" : "s"}`,
      subtitle: "Skyline Statement report · .xls / .xlsx · you can keep working while this runs",
      files,
      by: user.label,
      concurrency: 1,
      upload: async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("uploadedBy", user.label);
        fd.append("autoPublish", autoPublish ? "1" : "0");
        const j = await fetch("/api/tenant-statements", { method: "POST", body: fd }).then((r) => r.json());
        if (!j.ok) return { status: "failed", error: j.error ?? "Import failed" };
        const untied: number = j.untied?.length ?? j.mismatched.length;
        const mg = j.merge as { replaced: number; added: number; carriedOver: number } | undefined;
        const merged = mg && mg.carriedOver > 0
          ? ` · ${mg.replaced} replaced, ${mg.carriedOver} kept`
          : mg && mg.replaced > 0 && mg.added === 0 ? ` · ${mg.replaced} replaced` : "";
        const note = untied
          ? `⚠ ${untied} tenant${untied === 1 ? "" : "s"} don't reconcile — held back from the portal`
          : j.autoPublished ? "every tenant ties out · published to the portal"
          : j.published ? "every tenant ties out · the month was already live"
          : "every tenant ties out · publish when you're ready";
        return {
          status: "done" as const,
          entity: `${periodLabel(j.period)} · ${j.properties.length} propert${j.properties.length === 1 ? "y" : "ies"}`,
          detail: `${money0(j.openBalance)} open${merged}`,
          count: j.tenants,
          countLabel: "tenants",
          note,
          noteTone: untied ? ("warn" as const) : ("ok" as const),
          raw: j,
        };
      },
      report: (rows) => {
        const ok = rows.filter((r) => r.status === "done")
          .map((r) => r.raw as { period: string; tenants: number; totalTenants: number; openBalance: number; mismatched: string[]; untied?: string[]; published: boolean; autoPublished: boolean;
            merge?: { replaced: number; added: number; carriedOver: number; changed: number; netChange: number } });
        const last = ok[ok.length - 1];
        const p = last?.period;
        const open = ok.reduce((a, r) => a + r.openBalance, 0);
        // The final import's view of the month is the authoritative one.
        const untied = last?.untied?.length ?? ok.reduce((a, r) => a + r.mismatched.length, 0);
        const live = !!last?.published;
        const m = last?.merge;
        return {
          stats: [
            { value: String(last?.totalTenants ?? 0), label: "tenants on the month" },
            ...(m && (m.replaced || m.carriedOver)
              // A re-import: what matters is what moved, not the gross total.
              ? [
                  { value: String(m.replaced), label: m.replaced === 1 ? "statement replaced" : "statements replaced" },
                  { value: String(m.carriedOver), label: "kept as they were" },
                  { value: m.changed ? `${m.netChange >= 0 ? "+" : "−"}${money0(Math.abs(m.netChange))}` : "no change",
                    label: m.changed ? `net across ${m.changed} ${m.changed === 1 ? "balance" : "balances"}` : "to any balance" },
                ]
              : [{ value: money0(open), label: "open balance imported" }]),
            { value: untied ? String(untied) : "All", label: untied ? (untied === 1 ? "tenant to review" : "tenants to review") : "tie out to Skyline" },
          ],
          unlocks: p ? [live
            ? {
                id: "live", title: `${periodLabel(p)} is live for tenants`,
                subtitle: untied
                  ? `Every statement is on the portal, but ${untied} are flagged "under review" — fix those and re-import.`
                  : "Every tenant reconciled, so the month published itself. Tenants can see and pay from it now.",
                href: "/tenant-statements", cta: "Open",
              }
            : {
                id: "publish", title: untied ? `${periodLabel(p)} is held back for review` : `Publish ${periodLabel(p)}`,
                subtitle: untied
                  ? `${untied} tenant${untied === 1 ? " doesn't" : "s don't"} reconcile to Skyline's balance. Fix the export and re-import — the month publishes itself once they all tie.`
                  : "Auto-publish is off, so the month stays hidden until you publish it.",
                href: "/tenant-statements", cta: "Review",
              }] : [],
        };
      },
    });
    await loadPeriods();
    setPeriod(""); // fall back to newest
  }

  async function togglePublish() {
    if (!row) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/tenant-statements/${row.period}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !row.published, by: user.label }),
      });
      const j = await res.json();
      if (!res.ok) {
        // The month came from an export missing its current charges — make the
        // person say so out loud before understated balances reach tenants.
        if (j.code === "incomplete-export" && window.confirm(`${j.error}\n\nPublish anyway?`)) {
          const forced = await fetch(`/api/tenant-statements/${row.period}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ published: true, force: true, by: user.label }),
          });
          const fj = await forced.json();
          if (!forced.ok) throw new Error(fj.error ?? "Could not update.");
          await loadPeriods();
          setDetail((d) => (d ? { ...d, published: fj.published, publishedAt: fj.publishedAt } : d));
          return;
        }
        throw new Error(j.error ?? "Could not update.");
      }
      await loadPeriods();
      setDetail((d) => (d ? { ...d, published: j.published, publishedAt: j.publishedAt } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
    } finally { setBusy(false); }
  }

  const tenants = useMemo(() => {
    let list = detail?.tenants ?? [];
    if (property !== "All") list = list.filter((t) => t.propertyCode === property);
    if (onlyOwing) list = list.filter((t) => t.summary.totalDue > 0.005);
    if (onlyReview) list = list.filter((t) => !t.tiesOut);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.tenantName.toLowerCase().includes(q) || t.unitRef.toLowerCase().includes(q));
    // "Statement order" is the sequence Skyline printed, so the roster can be
    // read down alongside the paper laser statements; balance is the chase list.
    return sort === "balance" ? [...list].sort((a, b) => b.summary.totalDue - a.summary.totalDue) : list;
  }, [detail, property, onlyOwing, onlyReview, search, sort]);

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
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Monthly Statements</h1>
          <div className="muted small" style={{ marginTop: 6 }}>
            Skyline&rsquo;s open charges, turned into a statement each tenant can read and pay from.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" multiple style={{ display: "none" }}
            onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void processFiles(f); }} />
          <button className="btn" onClick={() => setShowPayment((v) => !v)} style={{ fontSize: 13, padding: "6px 12px" }}>
            Payment Instructions
          </button>
          {row && (
            <DownloadMenu
              label="Download"
              items={[
                { label: "All statements (PDF)", description: `Every tenant on ${periodLabel(row.period)}, one page each`, href: `/api/tenant-statements/${row.period}/pdf` },
                ...(property !== "All" ? [{ label: `${property} statements (PDF)`, description: "Just this property", href: `/api/tenant-statements/${row.period}/pdf?property=${property}` }] : []),
              ]}
            />
          )}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer", color: "var(--muted)" }}
            title="A month where every tenant reconciles to Skyline's balance goes live on import. Anything that doesn't reconcile holds the whole month back.">
            <input type="checkbox" checked={autoPublish} onChange={(e) => changeAutoPublish(e.target.checked)} />
            Publish automatically when all tie out
          </label>
          <button className="btn primary" onClick={() => fileRef.current?.click()} style={{ fontSize: 13, padding: "6px 12px", fontWeight: 700 }}>
            Import Skyline Statements
          </button>
        </div>
      </header>

      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>Something went wrong</div>
          <div className="muted small">{error}</div>
        </div>
      )}

      {showPayment && <PaymentCard properties={detail?.properties ?? []} onClose={() => setShowPayment(false)} by={user.label} />}

      {periods && periods.length === 0 ? (
        <div className="card">
          <div style={{ fontWeight: 800, fontSize: 17 }}>No statements imported yet</div>
          <div className="muted small" style={{ marginTop: 6, maxWidth: 620 }}>
            Import Skyline&rsquo;s tenant Statement report and every tenant&rsquo;s open charges become a portal statement —
            aged, categorized, and downloadable as a branded PDF.
          </div>
          <ImportInstructions variant="statements" />
        </div>
      ) : !periods ? (
        <div className="card muted small">Loading statements…</div>
      ) : (
        <>
          <PeriodBar periods={periods} active={period} onPick={setPeriod} />

          {row && (
            <div className="card" style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{periodLabel(row.period)}</div>
                  <div className="muted small" style={{ marginTop: 3 }}>
                    {row.tenants} tenants · {row.properties} propert{row.properties === 1 ? "y" : "ies"} ·
                    {" "}last import {new Date(row.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Pill tone={row.published ? TONE_GREEN : TONE_NEUTRAL}>{row.published ? "VISIBLE TO TENANTS" : "NOT PUBLISHED"}</Pill>
                  <button className={row.published ? "btn" : "btn primary"} disabled={busy} onClick={togglePublish}
                    style={{ fontSize: 13, padding: "6px 12px", fontWeight: 700 }}>
                    {busy ? "Saving…" : row.published ? "Unpublish" : "Publish to portal"}
                  </button>
                </div>
              </div>

              <div className="pills" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
                <StatPill label="Open balance" value={money0(row.openBalance)} />
                <StatPill label="Past due" value={money0(row.pastDue)} accent={row.pastDue > 0 ? "#b45309" : undefined} />
                <StatPill label="Tenants owing" value={row.tenantsOwing} sub={`of ${row.tenants}`} />
                <StatPill label="To review" value={row.untied} accent={row.untied > 0 ? "#b91c1c" : undefined}
                  sub={row.untied ? "don't tie to Skyline" : "all tie out"} />
              </div>

              {row.incompleteExport && (
                <div style={{ borderRadius: 10, padding: "12px 14px", background: "rgba(220,38,38,0.08)", border: "1.5px solid rgba(220,38,38,0.45)" }}>
                  <div style={{ color: "#b91c1c", fontWeight: 800, fontSize: 13.5 }}>
                    ⚠ This month is missing its current charges — balances are understated
                  </div>
                  <div style={{ color: "#7f1d1d", fontSize: 12.5, marginTop: 4, lineHeight: 1.55 }}>
                    The Skyline export printed a CURRENT CHARGES section for every tenant but carried nothing under it,
                    so this month holds only what was already outstanding. Every tenant still reconciles — against the
                    prior-balance subtotal — which is exactly why the tie-out couldn&rsquo;t catch it. Compare one tenant
                    against their laser statement, then re-export from Skyline and re-import.
                  </div>
                </div>
              )}
              {row.untied > 0 && (
                <div style={{ borderRadius: 10, padding: "10px 13px", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.3)", fontSize: 13, color: "#b91c1c", fontWeight: 600, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 260 }}>
                    {row.untied} tenant{row.untied === 1 ? "'s charges don't" : "s' charges don't"} sum to the balance Skyline printed.
                    Those statements are flagged &ldquo;under review&rdquo; on the portal — fix the export and re-import before publishing.
                  </span>
                  <button className="btn" onClick={() => { setOnlyReview((v) => !v); setProperty("All"); }}
                    style={{ fontSize: 12.5, padding: "5px 11px", fontWeight: 700, flexShrink: 0 }}>
                    {onlyReview ? "Show all tenants" : `Show the ${row.untied}`}
                  </button>
                </div>
              )}

              <div>
                <div style={SECTION_LABEL}>Files imported</div>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {row.sources.map((s, i) => (
                    <div key={`${s.filename}-${i}`} className="muted" style={{ fontSize: 12.5 }}>
                      <code style={{ fontSize: 12 }}>{s.filename}</code> · {s.tenantCount} tenants ·
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
              {byProperty.length > 1 && (
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
                            border: `1.5px solid ${on ? "rgba(11,74,125,0.5)" : "var(--border)"}`,
                            background: on ? "rgba(11,74,125,0.06)" : "var(--card)" }}>
                          <div style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: on ? "#0b4a7d" : "var(--text)" }}>{money0(g.open)}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.code}</div>
                          <div className="muted" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                          <div style={{ fontSize: 11, marginTop: 3, color: g.pastDue > 0.005 ? "#b45309" : "var(--muted)", fontWeight: g.pastDue > 0.005 ? 700 : 500 }}>
                            {g.pastDue > 0.005 ? `${money0(g.pastDue)} past due` : "nothing past due"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <select value={property} onChange={(e) => setProperty(e.target.value)} style={{ fontSize: 13, padding: "6px 10px" }}>
                  <option value="All">All properties</option>
                  {detail.properties.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
                </select>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tenant or unit…"
                  style={{ fontSize: 13, padding: "6px 10px", minWidth: 220, flex: "1 1 220px" }} />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} />
                  Only tenants with a balance
                </label>
                <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort tenants"
                  style={{ fontSize: 13, padding: "6px 10px" }}>
                  <option value="statement">Statement order</option>
                  <option value="balance">Largest balance first</option>
                </select>
                {onlyReview && (
                  <button type="button" onClick={() => setOnlyReview(false)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
                      padding: "5px 10px", borderRadius: 999, border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.08)", color: "#b91c1c" }}>
                    Only tenants to review <span aria-hidden style={{ opacity: 0.7 }}>✕</span>
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
                            <tr style={{ background: "rgba(11,74,125,0.07)", borderTop: i ? "2px solid var(--border)" : "none" }}>
                              {/* wraps rather than nowrap — a long centre name
                                  must not widen the table into a scroll */}
                              <td style={{ ...tdL, paddingTop: 10, paddingBottom: 10, whiteSpace: "normal" }} colSpan={2}>
                                <div style={{ fontWeight: 800 }}>
                                  {t.propertyCode} — {detail.properties.find((x) => x.code === t.propertyCode)?.name ?? t.propertyCode}
                                </div>
                                <div className="muted" style={{ fontSize: 11.5 }}>{g.tenants} {g.tenants === 1 ? "tenant" : "tenants"}</div>
                              </td>
                              <td style={{ ...td, fontWeight: 700 }}>{money0(g.current)}</td>
                              <td style={{ ...td, fontWeight: 700 }}>{money0(g.prior)}</td>
                              <td style={{ ...td, fontWeight: 700, color: g.pastDue > 0.005 ? "#b45309" : "var(--muted)" }}>{g.pastDue > 0.005 ? money0(g.pastDue) : "—"}</td>
                              <td style={{ ...td, fontWeight: 800 }}>{money0(g.total)}</td>
                              <td />
                            </tr>
                          )}
                          <TenantRows t={t} period={detail.period}
                            open={expanded === t.unitRef} onToggle={() => setExpanded((x) => (x === t.unitRef ? null : t.unitRef))} />
                        </Fragment>
                      );
                    })}
                    {tenants.length === 0 && (
                      <tr><td colSpan={7} style={{ ...tdL, padding: "22px 12px", color: "var(--muted)" }}>No tenants match those filters.</td></tr>
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
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {filteredTotals.aging.size > 1 && (
                <div className="card">
                  <div style={SECTION_LABEL}>Aging — {property === "All" ? "all properties" : property}</div>
                  <div className="pills" style={{ flexWrap: "wrap", justifyContent: "flex-start", marginTop: 10 }}>
                    {AGING_ORDER.filter((b) => filteredTotals.aging.has(b)).map((b) => (
                      <StatPill key={b} label={AGING_LABEL[b]} value={money0(filteredTotals.aging.get(b) ?? 0)}
                        accent={b === "current" ? undefined : "#b45309"} />
                    ))}
                  </div>
                </div>
              )}
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
function PeriodBar({ periods, active, onPick }: { periods: PeriodRow[]; active: string; onPick: (p: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 2px 6px" }}>
      {periods.map((p) => {
        const on = p.period === active;
        return (
          <button key={p.period} type="button" onClick={() => onPick(p.period)}
            style={{ flexShrink: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: "9px 14px", borderRadius: 10,
              border: `1px solid ${on ? "rgba(11,74,125,0.45)" : "var(--border)"}`, background: on ? "rgba(11,74,125,0.07)" : "var(--card)" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: on ? "#0b4a7d" : "var(--text)" }}>{periodLabel(p.period)}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              {money0(p.openBalance)}
              <span style={{ width: 6, height: 6, borderRadius: 999, background: p.incompleteExport ? "#b91c1c" : p.published ? "#15803d" : "rgba(15,23,42,0.25)" }} />
              {p.incompleteExport ? "incomplete" : p.published ? "live" : "draft"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

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

/** One tenant row, expanding to their line-by-line charges. */
function TenantRows({ t, period, open, onToggle }: { t: TenantRow; period: string; open: boolean; onToggle: () => void }) {
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
        <span aria-hidden style={{ marginLeft: 4, opacity: active ? 0.85 : 0.25, fontSize: 9 }}>
          {active ? (sort!.dir === "asc" ? "\u25b2" : "\u25bc") : "\u25b4\u25be"}
        </span>
      </th>
    );
  };
  return (
    <>
      <tr onClick={onToggle} style={{ borderTop: "1px solid var(--border)", cursor: "pointer", background: open ? "rgba(11,74,125,0.04)" : undefined }}>
        <td style={tdL}><code style={{ fontSize: 12 }}>{t.unitRef}</code></td>
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
            {t.carriedOver && (
              <HoverCard title="Carried over" width={272}
                rows={[
                  { label: "From", value: t.sourceFile ?? "an earlier import" },
                  { label: "Imported", value: t.importedAt ? new Date(t.importedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—" },
                ]}
                footer={{ label: "Status", value: "Kept — the latest export didn't include them" }}>
                <Pill tone={TONE_NEUTRAL}>CARRIED OVER</Pill>
              </HoverCard>
            )}
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>{t.charges.length} open {t.charges.length === 1 ? "charge" : "charges"}</div>
        </td>
        <td style={td}>{money2(s.currentCharges)}</td>
        <td style={td}>{money2(s.priorBalance)}</td>
        <td style={{ ...td, color: s.pastDueAmount > 0.005 ? "#b45309" : "var(--muted)", fontWeight: s.pastDueAmount > 0.005 ? 700 : 400 }}>
          {s.pastDueAmount > 0.005 ? (
            <HoverCard title="Past due" width={240}
              rows={s.byAging.filter((b) => b.bucket !== "current").map((b) => ({ label: AGING_LABEL[b.bucket], value: money2(b.amount), color: "#b45309" }))}
              footer={{ label: "Oldest charge", value: dateLabel(s.oldestISO) }}>
              {money2(s.pastDueAmount)}
            </HoverCard>
          ) : "—"}
        </td>
        <td style={{ ...td, fontWeight: 800, color: s.totalDue > 0.005 ? "#b45309" : s.totalDue < -0.005 ? "#15803d" : "var(--text)" }}>
          <HoverCard title={t.tenantName} width={270}
            rows={s.byCategory.map((c) => ({ label: `${CATEGORY_LABEL[c.category]} (${c.count})`, value: money2(c.amount) }))}
            footer={{ label: "Total due", value: money2(s.totalDue) }}>
            {money2(s.totalDue)}
          </HoverCard>
        </td>
        <td style={td}>
          <a href={`/api/tenant-statements/${period}/pdf?unitRef=${encodeURIComponent(t.unitRef)}`} onClick={(e) => e.stopPropagation()}
            className="btn" style={{ fontSize: 12, padding: "4px 10px", textDecoration: "none" }}>PDF</a>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ padding: "0 10px 14px", background: "rgba(11,74,125,0.03)" }}>
            <div className="muted" style={{ fontSize: 11.5, padding: "8px 10px 0" }}>
              {sort
                ? <>Sorted by {sort.key === "charge" ? "description" : sort.key} — <button type="button" onClick={(e) => { e.stopPropagation(); setSort(null); }}
                    style={{ padding: 0, border: "none", background: "none", font: "inherit", color: "#0b4a7d", fontWeight: 700, cursor: "pointer" }}>back to statement order</button></>
                : "In the order Skyline's statement prints them. Click a column to sort."}
            </div>
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
                    <td style={{ ...tdL, color: "var(--muted)", fontSize: 12.5 }}>{dateLabel(c.dateISO)}</td>
                    <td style={{ ...tdL, whiteSpace: "normal" }}>{c.description}</td>
                    <td style={{ ...tdL, fontSize: 12.5, color: "var(--muted)" }}>{CATEGORY_LABEL[c.category]}</td>
                    <td style={{ ...td, color: c.amount < 0 ? "#15803d" : "var(--text)" }}>{money2(c.amount)}</td>
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
          style={{ width: "100%", marginTop: 5, fontSize: 13.5, padding: "7px 9px", fontFamily: "inherit", resize: "vertical" }} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", marginTop: 5, fontSize: 13.5, padding: "7px 9px", fontFamily: "inherit" }} />
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
          <select value={key} onChange={(e) => setKey(e.target.value)} style={{ fontSize: 13, padding: "6px 10px" }}>
            <option value="default">All properties</option>
            {properties.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
          </select>
          <button className="btn" onClick={onClose} style={{ fontSize: 13, padding: "6px 12px" }}>Close</button>
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
              style={{ fontSize: 13, padding: "7px 14px", fontWeight: 700 }}>{busy ? "Saving…" : "Save"}</button>
            {overrides[key] && (
              <button className="btn" disabled={busy} onClick={() => void save(null)} style={{ fontSize: 13, padding: "7px 14px" }}>
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
