"use client";
import { ChevronRight } from "lucide-react";
import LoadingState from "@/app/components/LoadingState";

// Reprojections — the blended full-year forecast: actuals for the months we
// have, budget for the rest. Mirrors the Operating Budgets page chrome (header
// card + title selectors, the same toggles, KPI pills, group headers, section
// + subtotal cards) so it reads as the budget with the elapsed months replaced
// by real GL actuals (shaded green) and the rest projected from budget.

import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { StatPill } from "@/app/components/Pill";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { DisplayMenu, ToggleRow } from "@/app/components/DisplayMenu";
import { InfoPopover } from "@/app/components/InfoPopover";
import { MetaLine } from "@/app/components/LastImported";
import { ReprojTable, HeaderSelect, SegToggle, MONTHS, ACTUAL_TINT, money, varColor, sum, type Mode, type ViewOpts, type Reprojection, type OnDrill, type OnEdit } from "./ReprojTable";
import { useUser } from "@/app/components/UserProvider";
import { isBudgetAuthor } from "@/lib/financials/budgets/contributors";
import type { UserId } from "@/lib/users";
import { LineDetailModal } from "../operating-statements/LineDetailModal";
import { groupStatementOptions, groupByRentRoll } from "@/lib/financials/operating-statements/propertyGroups";
import { PROPERTY_DEFS } from "@/lib/properties/data";

type Available = { key: string; propertyCode: string; entityName: string; name: string; years: number[] };

export default function ReprojectionsPage() {
  const [available, setAvailable] = useState<Available[]>([]);
  const [key, setKey] = useState("");
  const [year, setYear] = useState(0);
  const [data, setData] = useState<Reprojection | null>(null);
  const [budgetYear, setBudgetYear] = useState<number | null>(null);
  const [budgetFallback, setBudgetFallback] = useState(false);
  const [hasGl, setHasGl] = useState(true);
  const [bank, setBank] = useState<{ balance: number; asOf: string; cashFlowRest: number; distributionsRest: number; yearEnd: number } | null>(null);
  const [banksThrough, setBanksThrough] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteSources, setNoteSources] = useState<Record<string, "user" | "ai">>({});
  const [loading, setLoading] = useState(false);
  const [psf, setPsf] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [showGL, setShowGL] = useState(false);
  // "reproject" = actuals blended with budget for the rest of the year (+ Ann
  // Bud / Var columns). "actuals" = a clean full-year-actuals statement: every
  // month's real GL figure in its own column + a Full Year total, no budget.
  const [mode, setMode] = useState<Mode>("reproject");
  // A posted month (or the year to date) clicked open on its GL transactions —
  // the operating statements' own drill-down, so nobody has to leave the page.
  const [detail, setDetail] = useState<Parameters<OnDrill>[0] | null>(null);

  useEffect(() => {
    fetch("/api/financials/reprojections").then((r) => r.json()).then((j) => {
      const av: Available[] = j.available ?? [];
      setAvailable(av);
      // Deep link from the Statements/Budgets pages: ?key (or ?property) & year.
      const params = new URLSearchParams(window.location.search);
      const wantKey = params.get("key");
      const wantProp = params.get("property");
      const wantYear = params.get("year");
      // Deep-linked "Full Year" entry point from Operating Statements.
      if (params.get("mode") === "actuals") setMode("actuals");
      const match = wantKey ? av.find((a) => a.key === wantKey) : wantProp ? av.find((a) => a.propertyCode === wantProp) : null;
      if (match) {
        setKey(match.key);
        setYear(wantYear ? Number(wantYear) : match.years[0] ?? new Date().getFullYear());
        return;
      }
      const withGl = av.find((a) => a.years.length);
      if (withGl) { setKey(withGl.key); setYear(withGl.years[0]); }
      else if (av[0]) { setKey(av[0].key); setYear(new Date().getFullYear()); }
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!key || !year) return;
    setLoading(true);
    try {
      const j = await fetch(`/api/financials/reprojections?key=${encodeURIComponent(key)}&year=${year}`).then((r) => r.json());
      setData(j.reprojection ?? null);
      setBudgetYear(j.budgetYear ?? null);
      setBudgetFallback(!!j.budgetFallback);
      setHasGl(!!j.hasGl);
      setBank(j.bank ?? null);
      setBanksThrough(j.banksThrough ?? null);
      setNotes(j.notes ?? {});
      setNoteSources(j.noteSources ?? {});
    } finally {
      setLoading(false);
    }
  }, [key, year]);
  useEffect(() => { load(); }, [load]);

  // A PROJECTED month typed over (owner: 2010's $100K of LIK Management
  // Clearing Sep–Dec that won't happen has to be backed out). The cell shows
  // the figure at once; the totals follow when the reprojection reloads.
  const { user } = useUser();
  const canEdit = isBudgetAuthor(user.id as UserId);
  const [editError, setEditError] = useState<string | null>(null);
  const saveEdit: OnEdit = async ({ section, label, month, value }) => {
    setEditError(null);
    if (typeof month === "number" && value != null) {
      setData((d) => d && ({ ...d, sections: d.sections.map((sec) => sec.name !== section ? sec : {
        ...sec, lines: sec.lines.map((l) => {
          if (l.label !== label) return l;
          const blended = l.blended.slice(); blended[month] = value;
          const overridden = (l.overridden ?? new Array(12).fill(false)).slice(); overridden[month] = true;
          return { ...l, blended, overridden, reprojTotal: blended.reduce((a, b) => a + b, 0) };
        }),
      }) }));
    }
    const r = await fetch("/api/financials/reprojections/overrides", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, year, section, label, month, value }),
    }).catch(() => null);
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {};
      setEditError(j?.error ?? "Couldn't save that figure.");
    }
    const j = await fetch(`/api/financials/reprojections?key=${encodeURIComponent(key)}&year=${year}`).then((x) => x.json()).catch(() => null);
    if (j?.reprojection) setData(j.reprojection);
  };

  const cur = available.find((a) => a.key === key);

  /**
   * The portfolio groups worth downloading whole, in the order the rent roll
   * lists them, each with how many properties it would produce.
   *
   * Only groups that have something in them — a menu item promising "All NI
   * LLC" and yielding an error is worse than no item. "Other Properties" is
   * left out: it is the leftovers bucket, not a portfolio anyone reports on.
   */
  const groupDownloads = useMemo(() => {
    return groupByRentRoll(available)
      .filter((g) => g.label !== "Other Properties" && g.items.length > 0)
      .map((g) => ({ label: g.label, count: g.items.length }));
  }, [available]);
  const yearOptions = cur?.years.length ? cur.years : [year || new Date().getFullYear()];
  const sqft = PROPERTY_DEFS.find((p) => p.id === key)?.sqft ?? 0;
  const through = data?.actualThroughMonth ?? 0;
  const view: ViewOpts = { psf, sqft, hideEmpty, showGL, through, mode };
  const actuals = mode === "actuals";
  const osHref = key && year ? `/financials/operating-statements?key=${encodeURIComponent(key)}&year=${year}` : "#";
  const budgetHref = cur && year ? `/financials/budgets?property=${encodeURIComponent(cur.propertyCode)}&year=${year}` : "#";
  const noteFor = (lineKey: string) => (notes[lineKey] ? { note: notes[lineKey], ai: noteSources[lineKey] === "ai" } : null);
  const crossLink: React.CSSProperties = { fontSize: "var(--fs-12)", padding: "5px 11px", fontWeight: 700, textDecoration: "none" };

  const noiVar = data?.rollups.netOperatingIncome.variance ?? null;
  const pills = data ? (actuals ? [
    { key: "rev", label: "Actual Revenue", value: money(sum(data.rollups.totalRevenues.actual)) },
    { key: "noi", label: "Actual NOI", value: money(sum(data.rollups.netOperatingIncome.actual)) },
    { key: "cf", label: "Actual Cash Flow", value: money(sum(data.rollups.cashFlowAfterDebtService.actual)) },
  ] : [
    { key: "rev", label: "Reprojected Revenue", value: money(data.rollups.totalRevenues.reprojTotal) },
    // The comparison is said in words under the figure (header rule), not as
    // its own tile.
    { key: "noi", label: "Reprojected NOI", value: money(data.rollups.netOperatingIncome.reprojTotal),
      sub: noiVar == null || !budgetYear ? undefined : Math.round(noiVar) === 0 ? "On budget" : `${money(Math.abs(noiVar))} ${noiVar > 0 ? "better" : "worse"} than budget` },
    { key: "cf", label: "Reprojected Cash Flow", value: money(data.rollups.cashFlowAfterDebtService.reprojTotal) },
    // Today's bank balance rolled to Dec 31 on this reprojection's cash flow,
    // less the distributions still planned — the budget draft's own roll.
    ...(bank && year === Number(bank.asOf.slice(0, 4)) ? [{
      key: "bank", label: "Bank Balance · Dec 31", value: money(bank.yearEnd),
      sub: `${money(bank.balance)} on ${new Date(`${bank.asOf}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${bank.cashFlowRest ? ` ${bank.cashFlowRest >= 0 ? "+" : "−"} ${money(Math.abs(bank.cashFlowRest))} cash flow` : ""}${bank.distributionsRest ? ` − ${money(bank.distributionsRest)} distributions` : ""}`,
    }] : banksThrough ? [{ key: "bank", label: "Bank Balance · Dec 31", value: "—", sub: `Banks through ${banksThrough === "PJV3" ? "JV III" : "NI LLC"}` }] : []),
  ]) as { key: string; label: string; value: string; sub?: string }[] : [];
  const coverageText = actuals
    ? (through > 0 ? `Actuals Jan–${MONTHS[Math.min(through, 12) - 1]}${through < 12 ? ` · ${MONTHS[through]}–Dec not yet imported` : ""}` : "No actuals yet")
    : (through > 0 ? `Actuals Jan–${MONTHS[through - 1]}${through < 12 ? ` · budget ${MONTHS[Math.min(through, 11)]}–Dec` : ""}` : "Budget only, no actuals yet");

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h1>{actuals ? "Full-Year Actuals" : "Reprojections"}</h1>

      {/* Header: ONE row of controls and ONE meta line, like Operating Statements. */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
            <HeaderSelect ariaLabel="Property" maxWidth={420} value={key} onChange={setKey} displayLabel={cur ? `${cur.propertyCode} · ${cur.name}` : "Choose a property"}>
              {!cur && <option value="">Choose a property</option>}
              {groupStatementOptions(available).map((grp) => (
                <optgroup key={grp.label} label={grp.label}>
                  {grp.items.map((a) => <option key={a.key} value={a.key}>{a.propertyCode} · {a.name}{a.years.length ? "" : " (no GL)"}</option>)}
                </optgroup>
              ))}
            </HeaderSelect>
            <HeaderSelect ariaLabel="Year" muted value={String(year)} onChange={(v) => setYear(Number(v))} displayLabel={year ? String(year) : "Year"}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </HeaderSelect>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <DisplayMenu>
              <ToggleRow label="Show" left="Reproject" right="Actuals" active={actuals ? "right" : "left"} onLeft={() => setMode("reproject")} onRight={() => setMode("actuals")} />
              <ToggleRow label="Amounts" left="Total" right="$/SF" active={psf ? "right" : "left"} onLeft={() => setPsf(false)} onRight={() => setPsf(true)} disabled={sqft <= 0} />
              <ToggleRow label="Empty rows" left="Hide" right="Show" active={hideEmpty ? "left" : "right"} onLeft={() => setHideEmpty(true)} onRight={() => setHideEmpty(false)} />
              <ToggleRow label="GL accounts" left="Hide" right="Show" active={showGL ? "right" : "left"} onLeft={() => setShowGL(false)} onRight={() => setShowGL(true)} />
            </DisplayMenu>
            <DownloadMenu
              label="Export"
              variant="default"
              disabled={!data}
              items={[
                { label: "Excel (.xlsx)", description: "Full-year blended reprojection by month", href: `/api/financials/reprojections/download?key=${encodeURIComponent(key)}&year=${year}` },
                { label: "PDF", description: "Presentation-ready reprojection summary", href: `/api/financials/reprojections/download/pdf?key=${encodeURIComponent(key)}&year=${year}` },
                // A whole portfolio group in one workbook, a sheet per
                // property — same sheet writer as the single download above,
                // so the figures cannot differ.
                ...(groupDownloads.map((g) => ({
                  label: `All ${g.label} (.xlsx)`,
                  description: `${g.count} propert${g.count === 1 ? "y" : "ies"}, one sheet each`,
                  href: `/api/financials/reprojections/download/group?group=${encodeURIComponent(g.label)}&year=${year}`,
                }))),
              ]}
            />
          </div>
        </div>

        <MetaLine>
          {data && <span>{coverageText}</span>}
          {data && !actuals && <span>· {budgetYear ? <>Budget FY {budgetYear}{budgetFallback ? " (nearest)" : ""}</> : "No budget for this property"}</span>}
          {data && !hasGl && <span>· No GL imported{actuals ? "" : ", projecting from budget"}</span>}
          <InfoPopover label="How to read this page" align="left">
            <div style={{ paddingTop: 12, display: "grid", gap: 8, fontSize: "var(--fs-14)" }}>
              {!actuals && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 12, background: ACTUAL_TINT, border: "1px solid var(--tint-green-line, rgba(21,128,61,0.4))", borderRadius: 2, display: "inline-block" }} /> Actual
                  <span style={{ width: 12, height: 12, border: "1px solid var(--border)", borderRadius: 2, display: "inline-block", marginLeft: 10 }} /> Budget
                </div>
              )}
              <div>{actuals ? "Every month's actual GL figure, plus a Full Year total." : "Actuals for the months posted, the budget for the rest, totalled for the full year."}</div>
              {!actuals && canEdit && <div>Click a projected (blue) month to type over it.</div>}
              <div>Hover a line&apos;s note for its variance explanation; click it to open the Operating Statement.</div>
            </div>
          </InfoPopover>
        </MetaLine>

        {pills.length > 0 && (
          <div className="pills">
            {pills.map((p) => <StatPill key={p.key} label={p.label} value={p.value} sub={p.sub} />)}
          </div>
        )}
      </div>

      {loading && <LoadingState status="Loading full-year figures…" columns={4} rows={4} />}
      {!loading && !data && <div className="card"><div className="muted small">Select a property and year.</div></div>}
      {!loading && data && <ReprojTable data={data} view={view} noteFor={noteFor} osHref={osHref} onDrill={setDetail} onEdit={canEdit ? saveEdit : undefined} />}
      {editError && <div style={{ color: "var(--c-b91c1c)", fontSize: "var(--fs-13)", fontWeight: 600 }}>{editError}</div>}
      {detail && cur && (
        <LineDetailModal viewKey={key} property={cur.propertyCode} year={year} period={detail.period} monthLabel={detail.monthLabel}
          line={{ mask: detail.mask, label: detail.label, sign: detail.sign }} initialTab="gl" initialScope={detail.scope} onClose={() => setDetail(null)} />
      )}
    </main>
  );
}

