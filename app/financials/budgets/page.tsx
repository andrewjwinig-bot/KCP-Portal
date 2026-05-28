"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/app/components/UserProvider";
import { Pill, StatPill, type PillTone } from "@/app/components/Pill";
import type { BudgetWorkbook, OccupancyDetailRow } from "@/lib/financials/budgets/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const CAN_UPLOAD = new Set(["admin", "drew", "harry", "nancy"]);

type WorkbookSummary = {
  id: string;
  label: string;
  kind: "imported" | "live";
  category: "Shopping Centers" | "Office" | "Residential" | "Other";
  year: number;
  uploadedAt: string;
  propertyCount: number;
  properties: { propertyCode: string; propertyName: string }[];
};

function money(n: number): string {
  if (n === 0) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

function pct(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  return `${n.toFixed(1)}%`;
}

export default function BudgetsPage() {
  const { user } = useUser();
  const canUpload = CAN_UPLOAD.has(user.id);

  const [summaries, setSummaries] = useState<WorkbookSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<BudgetWorkbook | null>(null);
  const [propertyCode, setPropertyCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload + Create dialog state lives at the page level now that the
  // actions render inside the consolidated property card.
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/financials/budgets", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      const list: WorkbookSummary[] = body.workbooks ?? [];
      setSummaries(list);
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);
  useEffect(() => { reload(); }, [reload]);

  // Fetch the selected workbook in full.
  useEffect(() => {
    if (!selectedId) { setWorkbook(null); return; }
    let alive = true;
    fetch(`/api/financials/budgets/${encodeURIComponent(selectedId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const wb: BudgetWorkbook | null = j.workbook ?? null;
        setWorkbook(wb);
        if (wb && wb.properties.length > 0) {
          setPropertyCode((cur) => {
            if (cur && wb.properties.some((p) => p.propertyCode === cur)) return cur;
            return wb.properties[0].propertyCode;
          });
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed to load workbook"));
    return () => { alive = false; };
  }, [selectedId]);

  const property = useMemo(() => {
    if (!workbook || !propertyCode) return null;
    return workbook.properties.find((p) => p.propertyCode === propertyCode) ?? null;
  }, [workbook, propertyCode]);

  const handleUploaded = useCallback(async (newId: string) => {
    await reload();
    setSelectedId(newId);
  }, [reload]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/financials/budgets/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      await handleUploaded(body.id);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Operating Budgets</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </header>

      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c" }}>Error</div>
          <div className="muted small">{error}</div>
        </div>
      )}

      {uploadError && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div className="small" style={{ fontWeight: 700, color: "#b91c1c" }}>{uploadError}</div>
        </div>
      )}

      {loading && !workbook && (
        <div className="card"><div className="muted small">Loading…</div></div>
      )}

      {!loading && summaries && summaries.length === 0 && (
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontWeight: 700, marginBottom: 6 }}>No budget uploaded yet.</p>
            <p className="muted small">
              {canUpload
                ? "Click Upload Budget to import the operating-budget workbook (e.g. Shopping Centers 2026)."
                : "Once a budget is uploaded by Drew, Harry, or Nancy, it'll appear here."}
            </p>
          </div>
          {canUpload && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn primary"
              style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}
            >
              {uploading ? "Uploading…" : "Upload Budget"}
            </button>
          )}
        </div>
      )}

      {workbook && property && (
        <BudgetTable
          workbook={workbook}
          property={property}
          summaries={summaries ?? []}
          selectedId={selectedId}
          onSelectBudget={setSelectedId}
          onSelectProperty={setPropertyCode}
          canUpload={canUpload}
          onCreateClick={() => setCreateOpen(true)}
        />
      )}

      {/* Hidden file input — wired to the empty-state Upload Budget
          button so staff can seed the first workbook from this page.
          Subsequent budgets are created in-app via + Create Live Budget. */}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {createOpen && (
        <CreateBudgetDialog
          summaries={summaries ?? []}
          onClose={() => setCreateOpen(false)}
          onCreated={async (id) => {
            setCreateOpen(false);
            await handleUploaded(id);
          }}
        />
      )}
    </main>
  );
}

const OCCUPANCY_TONES: Record<OccupancyDetailRow["category"], PillTone> = {
  "in-place": { bg: "rgba(11,74,125,0.10)",  fg: "#0b4a7d", border: "rgba(11,74,125,0.30)" },
  "renewal":  { bg: "rgba(202,138,4,0.12)",  fg: "#854d0e", border: "rgba(202,138,4,0.35)" },
  "new":      { bg: "rgba(22,163,74,0.10)",  fg: "#15803d", border: "rgba(22,163,74,0.30)" },
  "vacant":   { bg: "rgba(15,23,42,0.06)",   fg: "#475569", border: "rgba(15,23,42,0.15)" },
};

const OCCUPANCY_LABELS: Record<OccupancyDetailRow["category"], string> = {
  "in-place": "In-Place",
  "renewal":  "Renewal Pending",
  "new":      "New Lease (Signed)",
  "vacant":   "Vacant",
};

/** Order rows render in: in-place tenants first, then renewals, then new
 *  leases, then vacant suites — same grouping the source workbook uses
 *  with its Rental Summary / In Place / New & Renewal blocks. */
const OCCUPANCY_ORDER: OccupancyDetailRow["category"][] = ["in-place", "renewal", "new", "vacant"];

function OccupancyPanel({ property }: { property: BudgetWorkbook["properties"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const detail = property.occupancyDetail ?? [];
  const canExpand = detail.length > 0;

  // Group rows by category for the expanded view, preserving suite-sort
  // within each group.
  const grouped = useMemo(() => {
    const by: Record<OccupancyDetailRow["category"], OccupancyDetailRow[]> = {
      "in-place": [], "renewal": [], "new": [], "vacant": [],
    };
    for (const r of detail) by[r.category].push(r);
    return by;
  }, [detail]);

  // Per-category monthly totals for the summary rows inside the expand.
  const categoryTotals = useMemo(() => {
    const out: Record<OccupancyDetailRow["category"], number[]> = {
      "in-place": Array(12).fill(0),
      "renewal":  Array(12).fill(0),
      "new":      Array(12).fill(0),
      "vacant":   Array(12).fill(0),
    };
    for (const r of detail) {
      for (let i = 0; i < 12; i++) out[r.category][i] += r.monthlySqft[i];
    }
    return out;
  }, [detail]);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>
                {canExpand && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="btn"
                    style={{
                      padding: "3px 8px", fontSize: 11, fontWeight: 700,
                      letterSpacing: "0.04em", textTransform: "uppercase",
                    }}
                    aria-expanded={expanded}
                  >
                    {expanded ? "▾ Hide tenant breakdown" : "▸ Show tenant breakdown"}
                  </button>
                )}
              </th>
              {MONTHS.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
              <th style={{ textAlign: "right" }}>Avg</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 700, color: "var(--muted)" }}>Occupancy %</td>
              {property.occupancyPct.map((p, i) => (
                <td key={i} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct(p)}</td>
              ))}
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                {pct(property.occupancyPct.reduce((s, v) => s + v, 0) / 12)}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, color: "var(--muted)" }}>Occupancy SF</td>
              {property.occupancySqft.map((s, i) => (
                <td key={i} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {s > 0 ? s.toLocaleString() : "—"}
                </td>
              ))}
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                {Math.round(property.occupancySqft.reduce((s, v) => s + v, 0) / 12).toLocaleString()}
              </td>
            </tr>

            {expanded && OCCUPANCY_ORDER.flatMap((cat) => {
              const rows = grouped[cat];
              if (rows.length === 0) return [];
              return [
                <tr key={`hdr-${cat}`} style={{ background: "rgba(15,23,42,0.04)" }}>
                  <td colSpan={14} style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: "var(--muted)",
                    padding: "8px 12px",
                  }}>
                    {OCCUPANCY_LABELS[cat]} · {rows.length} {rows.length === 1 ? "suite" : "suites"}
                  </td>
                </tr>,
                ...rows.map((r) => {
                  const avgSf = r.monthlySqft.reduce((s, v) => s + v, 0) / 12;
                  return (
                    <tr key={`${cat}-${r.unitRef}`}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Pill tone={OCCUPANCY_TONES[cat]}>{OCCUPANCY_LABELS[cat]}</Pill>
                          <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)", fontSize: 12 }}>
                            {r.unitRef}
                          </span>
                          <span style={{ fontWeight: 600 }}>{r.tenantName}</span>
                          {r.unitSqft > 0 && (
                            <span className="muted small">· {r.unitSqft.toLocaleString()} sf</span>
                          )}
                          {r.leaseTo && (
                            <span className="muted small">· thru {r.leaseTo}</span>
                          )}
                        </div>
                      </td>
                      {r.monthlySqft.map((s, i) => (
                        <td key={i} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {s > 0 ? s.toLocaleString() : "—"}
                        </td>
                      ))}
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                        {avgSf > 0 ? Math.round(avgSf).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                }),
                <tr key={`sub-${cat}`} style={{ fontWeight: 700, background: "rgba(15,23,42,0.02)" }}>
                  <td style={{ color: "var(--muted)" }}>Subtotal — {OCCUPANCY_LABELS[cat]}</td>
                  {categoryTotals[cat].map((s, i) => (
                    <td key={i} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {s > 0 ? s.toLocaleString() : "—"}
                    </td>
                  ))}
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {(() => {
                      const a = categoryTotals[cat].reduce((s, v) => s + v, 0) / 12;
                      return a > 0 ? Math.round(a).toLocaleString() : "—";
                    })()}
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {!canExpand && (
        <div className="muted small" style={{ padding: "8px 14px", borderTop: "1px solid var(--border)" }}>
          Per-tenant breakdown is only available on Live budgets (built from the current rent roll).
        </div>
      )}
    </div>
  );
}

function BudgetTable({
  workbook,
  property,
  summaries,
  selectedId,
  onSelectBudget,
  onSelectProperty,
  canUpload,
  onCreateClick,
}: {
  workbook: BudgetWorkbook;
  property: BudgetWorkbook["properties"][number];
  summaries: WorkbookSummary[];
  selectedId: string | null;
  onSelectBudget: (id: string) => void;
  onSelectProperty: (code: string) => void;
  canUpload: boolean;
  onCreateClick: () => void;
}) {
  const skylineHref = `/api/financials/budgets/${encodeURIComponent(workbook.id)}/skyline?property=${encodeURIComponent(property.propertyCode)}`;
  const downloadHref = `/api/financials/budgets/${encodeURIComponent(workbook.id)}/download?property=${encodeURIComponent(property.propertyCode)}`;
  const [psf, setPsf] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [showGL, setShowGL] = useState(false);
  const sqft = property.rentableSqft || 0;

  // Build the lookup of cross-section subtotals (TOTAL REVENUES, NOI,
  // etc.) by section name so we can inject them between section cards.
  const rollupByName = useMemo(() => {
    const m = new Map<string, { name: string; total: number; months: number[] }>();
    for (const r of property.rollups) m.set(r.name.toUpperCase().trim(), r);
    return m;
  }, [property.rollups]);

  // Does this property carry any debt? Drives whether the Debt Service
  // section, its group header, and the before/after-debt cash flow
  // subtotals render at all — for unlevered properties (and the
  // residential book where debt sits at the portfolio level) the section
  // is just noise.
  const hasDebt = useMemo(() => {
    const debt = property.sections.find((s) => /debt service/i.test(s.name));
    return !!debt && debt.lines.some((l) => !l.isSubtotal && l.total !== 0);
  }, [property.sections]);

  // Sections to actually render. Skip Debt Service when there's no debt
  // — the empty subtotal + the surrounding "before/after debt" framing
  // adds nothing useful.
  const visibleSections = useMemo(
    () => property.sections.filter((s) => hasDebt || !/debt service/i.test(s.name)),
    [property.sections, hasDebt],
  );

  // Some workbooks (JV III's office sheets) don't have a Capital
  // Improvements section at all — the CASH FLOW BEFORE DEBT SERVICE
  // subtotal still belongs in the document, but it has to slide up to
  // sit after Non-Reimbursable Expenses since there's nothing else
  // between NOI and Debt Service.
  const hasCapital = useMemo(
    () => property.sections.some((s) => /^capital/i.test(s.name)),
    [property.sections],
  );

  const subtotalsAfter = useCallback((sectionName: string): { name: string; total: number; months: number[] }[] => {
    const norm = sectionName.toLowerCase();
    const wants: { key: string; relabelTo?: string }[] = [];
    if (/reimburs/.test(norm) && !/expense/.test(norm) && !/non/.test(norm)) wants.push({ key: "TOTAL REVENUES" });
    if (/non-reimbursable/.test(norm)) {
      wants.push({ key: "TOTAL OPERATING EXPENSES" }, { key: "NET OPERATING INCOME" });
      // No Capital section in this workbook? Emit CASH FLOW BEFORE DEBT
      // SERVICE here (or just CASH FLOW when there's no debt either).
      if (!hasCapital) {
        wants.push(hasDebt
          ? { key: "CASH FLOW BEFORE DEBT SERVICE" }
          : { key: "CASH FLOW BEFORE DEBT SERVICE", relabelTo: "CASH FLOW" });
      }
    }
    if (/capital/.test(norm)) {
      wants.push(hasDebt
        ? { key: "CASH FLOW BEFORE DEBT SERVICE" }
        : { key: "CASH FLOW BEFORE DEBT SERVICE", relabelTo: "CASH FLOW" });
    }
    if (/debt service/.test(norm)) wants.push({ key: "CASH FLOW AFTER DEBT SERVICE" });
    return wants
      .map((w) => {
        const r = rollupByName.get(w.key);
        return r ? { ...r, name: w.relabelTo ?? r.name } : null;
      })
      .filter((r): r is { name: string; total: number; months: number[] } => Boolean(r));
  }, [rollupByName, hasDebt, hasCapital]);

  // Headline pills. Always 5 across the row:
  //   1. TOTAL REVENUES, 2. TOTAL OPERATING EXPENSES, 3. NET OPERATING INCOME
  //   4. If debt service > 0 → CASH FLOW AFTER DEBT SERVICE
  //      Else                → CASH FLOW (was "before debt service",
  //                            renamed when there's nothing being deducted)
  //   5. EST. NNN'S PSF (annual CAM + RET reimbursements ÷ rentable SF) —
  //      always shown in $/SF regardless of the Total | $/SF toggle.
  // The first four pills respect the Total | $/SF toggle so they stay
  // in sync with the table below.
  const headlinePills = useMemo(() => {
    const get = (n: string) => rollupByName.get(n);
    const totalRev = get("TOTAL REVENUES");
    const totalOpex = get("TOTAL OPERATING EXPENSES");
    const noi = get("NET OPERATING INCOME");
    const cfAfter = get("CASH FLOW AFTER DEBT SERVICE");
    const cfBefore = get("CASH FLOW BEFORE DEBT SERVICE");

    // Estimated NNN PSF — sum the annual totals of the two big reimbursement
    // lines and divide by rentable SF. Look up by GL first (more durable
    // than the label across upload variations), fall back to label match.
    const reimb = property.sections.find((s) => /^reimburs/i.test(s.name));
    const findLineTotal = (gl: string, labelRe: RegExp) => {
      if (!reimb) return 0;
      const line = reimb.lines.find((l) => !l.isSubtotal && (l.glAccount === gl || labelRe.test(l.label)));
      return line?.total ?? 0;
    };
    const camTotal = findLineTotal("4910-8502", /common area maintenance/i);
    const retTotal = findLineTotal("4920-8502", /real estate tax/i);
    const nnnsAnnual = camTotal + retTotal;
    const nnnsPsf = sqft > 0 ? nnnsAnnual / sqft : 0;

    const fmt = (v: number) => fmtAmount(v, sqft, psf);

    type Pill = { key: string; label: string; value: string; accent?: string };
    const pills: Pill[] = [];
    if (totalRev)  pills.push({ key: totalRev.name,  label: totalRev.name,  value: fmt(totalRev.total),  accent: totalRev.total  < 0 ? "#b91c1c" : undefined });
    if (totalOpex) pills.push({ key: totalOpex.name, label: totalOpex.name, value: fmt(totalOpex.total), accent: totalOpex.total < 0 ? "#b91c1c" : undefined });
    if (noi)       pills.push({ key: noi.name,       label: noi.name,       value: fmt(noi.total),       accent: noi.total       < 0 ? "#b91c1c" : undefined });
    if (hasDebt && cfAfter) {
      pills.push({ key: cfAfter.name, label: cfAfter.name, value: fmt(cfAfter.total), accent: cfAfter.total < 0 ? "#b91c1c" : undefined });
    } else if (cfBefore) {
      pills.push({ key: "CASH FLOW", label: "CASH FLOW", value: fmt(cfBefore.total), accent: cfBefore.total < 0 ? "#b91c1c" : undefined });
    }
    pills.push({
      key: "EST_NNN_PSF",
      label: "EST. NNN'S PSF (CAM + RET)",
      value: nnnsPsf > 0 ? `$${nnnsPsf.toFixed(2)}` : "—",
    });
    return pills;
  }, [rollupByName, property.sections, sqft, psf, hasDebt]);

  // Year dropdown lists every distinct budget year across all
  // workbooks — staff can toggle between any year/property/category
  // without first navigating to the "right" workbook.
  const allYears = useMemo(() => {
    const ys = new Set<number>();
    for (const s of summaries) ys.add(s.year);
    return Array.from(ys).sort((a, b) => b - a);
  }, [summaries]);

  // Combined property dropdown — every property across every workbook
  // for the selected year, grouped by workbook label as <optgroup>s.
  // Selecting a property automatically resolves to the workbook that
  // owns it (so 1100 → SC 2026, 3610 → JV III 2026, etc.).
  const propertyOptionsByWorkbook = useMemo(() => {
    return summaries
      .filter((s) => s.year === workbook.year)
      .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label))
      .map((s) => ({
        budgetId: s.id,
        label: s.label,
        properties: s.properties,
      }));
  }, [summaries, workbook.year]);

  const handleYearChange = useCallback((y: number) => {
    // Prefer same-category continuity (so a user on Office 2026 stays
    // on Office when switching to 2027), then live > imported, then
    // first alphabetical.
    const candidates = summaries.filter((s) => s.year === y);
    const sameCategory = candidates.filter((s) => s.category === workbook.category);
    const pool = sameCategory.length > 0 ? sameCategory : candidates;
    const pick = pool.find((s) => s.kind === "live") ?? pool[0];
    if (pick) onSelectBudget(pick.id);
  }, [summaries, workbook.category, onSelectBudget]);

  const handlePropertyChange = useCallback((value: string) => {
    // The combined dropdown encodes selections as "budgetId|propertyCode"
    // so we can route to the right workbook without an extra round-trip.
    const [budgetId, code] = value.split("|");
    if (!code) return;
    if (budgetId && budgetId !== workbook.id) onSelectBudget(budgetId);
    onSelectProperty(code);
  }, [workbook.id, onSelectBudget, onSelectProperty]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Property summary tile */}
      <div className="card">
        {/* Header row — large property + year dropdowns styled as the
            section title, with the three actions right-aligned on the
            same line. Old meta row (Budget chip + Imported badge) was
            replaced by the year selector. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
            <select
              value={workbook.year}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              style={yearHeaderSelectStyle}
              aria-label="Year"
            >
              {allYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={`${workbook.id}|${property.propertyCode}`}
              onChange={(e) => handlePropertyChange(e.target.value)}
              style={propertyHeaderSelectStyle}
              aria-label="Property"
            >
              {propertyOptionsByWorkbook.map((grp) => (
                <optgroup key={grp.budgetId} label={grp.label}>
                  {grp.properties.map((p) => (
                    <option key={`${grp.budgetId}|${p.propertyCode}`} value={`${grp.budgetId}|${p.propertyCode}`}>
                      {p.propertyCode === "CONSOLIDATED" ? p.propertyName : `${p.propertyCode} — ${p.propertyName}`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <a
              href={downloadHref}
              className="btn primary"
              style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, textDecoration: "none" }}
            >
              ⬇ Download
            </a>
            <a
              href={skylineHref}
              className="btn"
              style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, textDecoration: "none" }}
            >
              ⬇ Skyline Import
            </a>
            {canUpload && (
              <button
                onClick={onCreateClick}
                className="btn primary"
                style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}
              >
                + Create Live Budget
              </button>
            )}
          </div>
        </div>

        <div style={{
          marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap",
        }}>
          <div className="muted small">
            Rentable SF: {property.rentableSqft.toLocaleString()} ·
            {" "}{workbook.kind === "live" ? "Built" : "Uploaded"} {new Date(workbook.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {workbook.kind === "live" && workbook.source?.opExGrowthPct != null && (
              <> · OpEx defaulted at {workbook.source.opExGrowthPct}% over prior</>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <ViewToggle psf={psf} onChange={setPsf} disabled={sqft <= 0} />
            <EmptyRowsToggle hide={hideEmpty} onChange={setHideEmpty} />
            <GLToggle show={showGL} onChange={setShowGL} />
          </div>
        </div>

        <div className="pills">
          {headlinePills.map((p) => (
            <StatPill
              key={p.key}
              label={p.label}
              value={p.value}
              accent={p.accent}
            />
          ))}
        </div>
      </div>

      {/* Occupancy strip + expandable per-tenant breakdown */}
      {property.occupancyPct.some((p) => p > 0) && (
        <OccupancyPanel property={property} />
      )}

      {/* Sections with cross-section subtotal cards (TOTAL REVENUES,
          NOI, CASH FLOW, etc.) injected between them. Group headers
          ("REVENUES", "OPERATING EXPENSES") sit above the first section
          in each group. */}
      {visibleSections.map((sec) => (
        <Fragment key={sec.name}>
          {groupHeaderFor(sec.name) && (
            <GroupHeader label={groupHeaderFor(sec.name)!} />
          )}
          <div className="card" style={{ padding: 0 }}>
            <div style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              background: "rgba(15,23,42,0.03)",
              fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              {sec.name}
            </div>
            <div className="tableWrap">
              <table style={{ tableLayout: "fixed", width: "100%" }}>
                <BudgetTableColgroup />
                <thead>
                  <tr>
                    <th>Line</th>
                    {MONTHS.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.lines.map((l, i) => {
                    // Empty = no value anywhere on the row. Subtotals are
                    // never considered empty so we don't orphan a header.
                    const isEmpty = !l.isSubtotal && l.total === 0 && l.months.every((m) => m === 0);
                    if (hideEmpty && isEmpty) return null;
                    return (
                      <BudgetLineRow
                        key={`${sec.name}-${i}`}
                        line={l}
                        sectionName={sec.name}
                        index={i}
                        sqft={sqft}
                        psf={psf}
                        isEmpty={isEmpty}
                        propertyCode={property.propertyCode}
                        showGL={showGL}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {subtotalsAfter(sec.name).map((r) => (
            <SubtotalCard key={r.name} rollup={r} sqft={sqft} psf={psf} />
          ))}
        </Fragment>
      ))}

      {/* Master footnote for the standard-escalation marker (*). Only
          renders when at least one line on this property carries the
          shared "grown 3%" / "Defaulted to N% over prior year" note. */}
      {propertyHasStandardEscalation(property) && (
        <div className="muted small" style={{
          padding: "8px 4px 0", borderTop: "1px dashed var(--border)",
          display: "flex", alignItems: "baseline", gap: 6,
        }}>
          <sup style={{ color: "#0b4a7d", fontWeight: 800, fontSize: 11 }}>*</sup>
          <span>
            Standard escalation — prior-year business plan grown by 3%.
          </span>
        </div>
      )}
    </div>
  );
}

/** Returns the group header label to render before a given section, or
 *  null if no header should appear. Headers sit above the first section
 *  in each top-level grouping (Revenues, Operating Expenses, Capital,
 *  Debt) to make the budget's structure obvious at a glance. */
function groupHeaderFor(sectionName: string): string | null {
  const n = sectionName.toLowerCase();
  if (/^revenues?$/.test(n)) return "Revenues";
  if (/^reimbursable expenses?$/.test(n)) return "Operating Expenses";
  if (/^capital/.test(n)) return "Capital Improvements";
  if (/^debt service$/.test(n)) return "Debt Service";
  return null;
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div style={{
      marginTop: 4,
      paddingBottom: 6,
      borderBottom: "2px solid #0b4a7d",
      fontSize: 18,
      fontWeight: 900,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#0b4a7d",
    }}>
      {label}
    </div>
  );
}

function GLToggle({ show, onChange }: {
  show: boolean;
  onChange: (v: boolean) => void;
}) {
  const baseBtn: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: "4px 10px",
    border: "1px solid var(--border)", background: "var(--card)",
    color: "var(--text)", cursor: "pointer",
    letterSpacing: "0.04em", textTransform: "uppercase",
  };
  const active: React.CSSProperties = {
    background: "#0b4a7d", color: "#fff", borderColor: "#0b4a7d",
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="muted small" style={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>GL</span>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => onChange(false)}
          style={{ ...baseBtn, borderRadius: "6px 0 0 6px", ...(show ? {} : active) }}
        >
          Hide
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          style={{ ...baseBtn, borderLeft: "none", borderRadius: "0 6px 6px 0", ...(show ? active : {}) }}
        >
          Show
        </button>
      </div>
    </div>
  );
}

function EmptyRowsToggle({ hide, onChange }: {
  hide: boolean;
  onChange: (v: boolean) => void;
}) {
  const baseBtn: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: "4px 10px",
    border: "1px solid var(--border)", background: "var(--card)",
    color: "var(--text)", cursor: "pointer",
    letterSpacing: "0.04em", textTransform: "uppercase",
  };
  const active: React.CSSProperties = {
    background: "#0b4a7d", color: "#fff", borderColor: "#0b4a7d",
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="muted small" style={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Empty rows</span>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => onChange(true)}
          style={{ ...baseBtn, borderRadius: "6px 0 0 6px", ...(hide ? active : {}) }}
        >
          Hide
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          style={{ ...baseBtn, borderLeft: "none", borderRadius: "0 6px 6px 0", ...(hide ? {} : active) }}
        >
          Show
        </button>
      </div>
    </div>
  );
}

function ViewToggle({ psf, onChange, disabled }: {
  psf: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  const baseBtn: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: "4px 10px",
    border: "1px solid var(--border)", background: "var(--card)",
    color: "var(--text)", cursor: disabled ? "not-allowed" : "pointer",
    letterSpacing: "0.04em", textTransform: "uppercase",
  };
  const active: React.CSSProperties = {
    background: "#0b4a7d", color: "#fff", borderColor: "#0b4a7d",
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="muted small" style={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>View</span>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", opacity: disabled ? 0.5 : 1 }}>
        <button
          type="button"
          onClick={() => !disabled && onChange(false)}
          disabled={disabled}
          style={{ ...baseBtn, borderRadius: "6px 0 0 6px", ...(psf ? {} : active) }}
        >
          Total
        </button>
        <button
          type="button"
          onClick={() => !disabled && onChange(true)}
          disabled={disabled}
          style={{ ...baseBtn, borderLeft: "none", borderRadius: "0 6px 6px 0", ...(psf ? active : {}) }}
        >
          $/SF
        </button>
      </div>
    </div>
  );
}

/** Big cross-section subtotal row (TOTAL REVENUES, NET OPERATING INCOME,
 *  CASH FLOW…). Sits between section cards with heavier styling than the
 *  in-section subtotals. */
/** Single row in the section table. When the line carries sub-line
 *  detail (e.g. Insurance → Gen Liab + Umbrella + Property + D&O) the
 *  label cell shows a chevron toggle; clicking expands a set of indented
 *  rows underneath plus a "ties to $X" tag confirming the sum matches. */
/** Match the "everyone-uses-this" escalation comment ("2025 Business
 *  Plan grown 3%") and the live builder's equivalent ("Defaulted to 3%
 *  over prior year"). These don't deserve a per-row info chip — they
 *  point to one shared convention that's better surfaced as a master
 *  footnote at the bottom of the property card. */
function isStandardEscalationNote(text: string): boolean {
  return /business plan\s+grown\s+\d+\s*%/i.test(text) ||
         /defaulted to\s+\d+\s*%.*prior year/i.test(text);
}

/** Shortens a standard-escalation note to the form "YYYY grown N%" for
 *  the asterisk tooltip. Matches both the workbook's literal phrasing
 *  ("2025 Business Plan grown 3%") and the live builder's ("Defaulted
 *  to 3% over prior year"). Falls back to the raw text if neither
 *  pattern matches. */
function shortEscalationTooltip(text: string): string {
  const bp = text.match(/(\d{4})\s+Business Plan\s+grown\s+(\d+)\s*%/i);
  if (bp) return `${bp[1]} grown ${bp[2]}%`;
  const def = text.match(/Defaulted to\s+(\d+)\s*%/i);
  if (def) return `prior year grown ${def[1]}%`;
  return text;
}

/** Inline note marker. Standard-escalation notes render as a small
 *  superscript asterisk that ties back to the master footnote at the
 *  bottom of the table. Anything else renders as an ⓘ chip with the
 *  full text in a hover tooltip — those are bespoke per-line comments
 *  that don't share a single explanation. */
/** Small "A" chip rendered after the label on any allocated expense
 *  line. Click → opens AllocationModal showing the full per-property
 *  breakdown of every block contributing to this line, with the
 *  current property highlighted. Quietly aggregates when a line takes
 *  more than one allocation (e.g. Marketing = Marketing Salaries +
 *  Marketing direct → shows "A 2"). */
/** Maps a Reimbursements section line to the rent-roll field that
 *  carries the per-tenant contribution. Returns null when the line
 *  isn't a known recovery (or when we're looking at a Reimbursable
 *  Expenses line, which has the same Insurance label but is the cost
 *  side, not the recovery side). */
function recoveryFieldFor(
  glAccount: string | null | undefined,
  sectionName: string,
): { key: "opexMonth" | "reTaxMonth" | "otherMonth"; label: string } | null {
  if (!/^reimburs/i.test(sectionName) || /expense/i.test(sectionName)) return null;
  switch (glAccount) {
    case "4910-8502": return { key: "opexMonth",  label: "CAM" };
    case "4920-8502": return { key: "reTaxMonth", label: "RET" };
    case "4930-8502": return { key: "otherMonth", label: "INS" };
    default: return null;
  }
}

type RentRollUnit = {
  unitRef?: string;
  occupantName?: string;
  isVacant?: boolean;
  amenity?: unknown;
  sqft?: number;
  opexMonth?: number;
  reTaxMonth?: number;
  otherMonth?: number;
};
type RentRollProperty = { propertyCode?: string; units?: RentRollUnit[] };

function TenantRecoveryChip({
  glAccount,
  sectionName,
  propertyCode,
}: {
  glAccount: string | null;
  sectionName: string;
  propertyCode: string;
}) {
  const recovery = recoveryFieldFor(glAccount, sectionName);
  const [open, setOpen] = useState(false);
  if (!recovery) return null;
  if (propertyCode.toUpperCase() === "CONSOLIDATED") return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={`Tenants contributing to this ${recovery.label} recovery on ${propertyCode}`}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 18, height: 18, padding: "0 5px", marginLeft: 4,
          fontSize: 10, fontWeight: 800, lineHeight: 1,
          background: "rgba(22,163,74,0.10)",
          color: "#15803d",
          border: "1px solid rgba(22,163,74,0.30)",
          borderRadius: 4,
          cursor: "pointer",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        T
      </button>
      {open && (
        <TenantRecoveryModal
          propertyCode={propertyCode}
          recoveryKey={recovery.key}
          recoveryLabel={recovery.label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TenantRecoveryModal({
  propertyCode,
  recoveryKey,
  recoveryLabel,
  onClose,
}: {
  propertyCode: string;
  recoveryKey: "opexMonth" | "reTaxMonth" | "otherMonth";
  recoveryLabel: string;
  onClose: () => void;
}) {
  const [units, setUnits] = useState<RentRollUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    fetch("/api/rentroll", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const rentroll = j.rentroll as { properties?: RentRollProperty[] } | null;
        const here = (rentroll?.properties ?? []).find(
          (p) => (p.propertyCode ?? "").toUpperCase() === propertyCode.toUpperCase(),
        );
        setUnits(here?.units ?? []);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed to load"));
    return () => { alive = false; };
  }, [propertyCode]);

  const contributing = useMemo(() => {
    return (units ?? [])
      .filter((u) => !u.isVacant && !u.amenity)
      .map((u) => {
        const monthly = Number(u[recoveryKey] ?? 0);
        return {
          unitRef: u.unitRef ?? "",
          tenantName: (u.occupantName ?? "").trim() || "—",
          sqft: u.sqft ?? 0,
          monthly,
          annual: monthly * 12,
        };
      })
      .filter((r) => r.annual > 0)
      .sort((a, b) => b.annual - a.annual);
  }, [units, recoveryKey]);

  const fmt = (n: number) => n === 0 ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
  const totalMonthly = contributing.reduce((s, r) => s + r.monthly, 0);
  const totalAnnual = contributing.reduce((s, r) => s + r.annual, 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "60px 20px", overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)", borderRadius: 12,
          maxWidth: 820, width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column", gap: 14, padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {propertyCode} · {recoveryLabel} Recoveries
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
              Per-tenant contribution
            </div>
            <div className="muted small" style={{ marginTop: 2, fontStyle: "italic" }}>
              Sourced from the current rent roll snapshot. {contributing.length} contributing {contributing.length === 1 ? "tenant" : "tenants"}.
            </div>
          </div>
          <button onClick={onClose} className="btn" style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>
            Close
          </button>
        </div>

        {error && (
          <div className="muted small" style={{ color: "#b91c1c" }}>{error}</div>
        )}
        {!units && !error && (
          <div className="muted small">Loading rent roll…</div>
        )}
        {units && (
          <div className="card" style={{ padding: 0 }}>
            <div className="tableWrap" style={{ marginTop: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Suite</th>
                    <th>Tenant</th>
                    <th style={{ textAlign: "right", width: 90 }}>SF</th>
                    <th style={{ textAlign: "right", width: 110 }}>Monthly</th>
                    <th style={{ textAlign: "right", width: 130 }}>Annual</th>
                  </tr>
                </thead>
                <tbody>
                  {contributing.map((r) => (
                    <tr key={r.unitRef}>
                      <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{r.unitRef}</td>
                      <td style={{ fontWeight: 600 }}>{r.tenantName}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {r.sqft > 0 ? r.sqft.toLocaleString() : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(r.monthly)}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                        {fmt(r.annual)}
                      </td>
                    </tr>
                  ))}
                  {contributing.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted small" style={{ padding: "12px 14px", fontStyle: "italic" }}>
                        No tenants on this property carry a {recoveryLabel} reimbursement in the current rent roll.
                      </td>
                    </tr>
                  )}
                  {contributing.length > 0 && (
                    <tr style={{ background: "rgba(15,23,42,0.04)", fontWeight: 800 }}>
                      <td colSpan={2}>TOTAL</td>
                      <td></td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(totalMonthly)}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(totalAnnual)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AllocationIcon({ allocations, currentPropertyCode }: {
  allocations: NonNullable<import("@/lib/financials/budgets/types").BudgetLine["allocations"]>;
  currentPropertyCode: string;
}) {
  const [open, setOpen] = useState(false);
  const blocks = allocations.length;
  const myShare = allocations.reduce((s, a) => s + a.propertyAmount, 0);
  const myShareLabel = `$${Math.round(myShare).toLocaleString("en-US")}`;
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={`Allocated expense — ${myShareLabel} from ${blocks} ${blocks === 1 ? "block" : "blocks"} (click for detail)`}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 18, height: 18, padding: "0 5px", marginLeft: 4,
          fontSize: 10, fontWeight: 800, lineHeight: 1,
          background: "rgba(11,74,125,0.10)",
          color: "#0b4a7d",
          border: "1px solid rgba(11,74,125,0.30)",
          borderRadius: 4,
          cursor: "pointer",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        A{blocks > 1 ? ` ${blocks}` : ""}
      </button>
      {open && (
        <AllocationModal
          allocations={allocations}
          currentPropertyCode={currentPropertyCode}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Click-out backdrop + dialog showing the workbook-style allocation
 *  table for one (or more) blocks. The current property's row is
 *  highlighted brand-blue and rendered at full opacity; the rest of
 *  the portfolio reads at reduced opacity so the eye lands on "where
 *  am I in this allocation" immediately. */
function AllocationModal({ allocations, currentPropertyCode, onClose }: {
  allocations: NonNullable<import("@/lib/financials/budgets/types").BudgetLine["allocations"]>;
  currentPropertyCode: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fmt = (n: number) => n === 0 ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
  const here = currentPropertyCode.toUpperCase();
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "60px 20px", overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)", borderRadius: 12,
          maxWidth: 1180, width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column", gap: 14, padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Allocated Expense Detail
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
              {allocations.length === 1 ? allocations[0].blockLabel : `${allocations.length} contributing blocks`}
            </div>
          </div>
          <button onClick={onClose} className="btn" style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>
            Close
          </button>
        </div>

        {allocations.map((a, idx) => (
          <div key={idx} className="card" style={{ padding: 0 }}>
            <div style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              background: "rgba(15,23,42,0.03)",
              display: "flex", alignItems: "baseline", justifyContent: "space-between",
              gap: 12, flexWrap: "wrap",
            }}>
              <div>
                <span className="muted small" style={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {a.glAccount} · {a.basis === "sqft" ? "Sqft share" : a.basis === "annual" ? "Annual amount" : "Allocation"}
                </span>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>
                  {a.blockLabel}
                </div>
                {a.sourceNote && (
                  <div className="muted small" style={{ marginTop: 2, fontStyle: "italic" }}>{a.sourceNote}</div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Portfolio total
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(a.portfolioTotal)}
                </div>
              </div>
            </div>
            {/* Core data only — drops the Property / SF / Share columns
                and the Jan..Dec header row. The card header above carries
                GL, label, source note, and portfolio total; the
                highlighted row IDs the current property. Footer TOTAL
                row sums each month + the annual so staff can spot-check
                that the allocation ties out. */}
            <div className="tableWrap" style={{ marginTop: 0 }}>
              <table style={{ tableLayout: "fixed", width: "100%" }}>
                <tbody>
                  {(a.rows ?? []).map((row) => {
                    const isMe = row.propertyCode.toUpperCase() === here;
                    return (
                      <tr key={row.propertyCode} style={{
                        background: isMe ? "rgba(11,74,125,0.06)" : undefined,
                        opacity: isMe ? 1 : 0.55,
                        fontWeight: isMe ? 700 : 400,
                      }}>
                        {row.months.map((m, j) => (
                          <td key={j} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                            {fmt(m)}
                          </td>
                        ))}
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: isMe ? 800 : 600 }}>
                          {fmt(row.total)}
                        </td>
                      </tr>
                    );
                  })}
                  {(a.rows?.length ?? 0) > 0 && (() => {
                    const monthlyTotals = Array.from({ length: 12 }, (_, m) =>
                      a.rows!.reduce((s, r) => s + (r.months[m] ?? 0), 0),
                    );
                    const annualTotal = a.rows!.reduce((s, r) => s + r.total, 0);
                    return (
                      <tr style={{
                        background: "rgba(11,74,125,0.10)",
                        borderTop: "2px solid rgba(11,74,125,0.40)",
                        fontWeight: 800, color: "#0b4a7d",
                      }}>
                        {monthlyTotals.map((m, j) => (
                          <td key={j} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                            {fmt(m)}
                          </td>
                        ))}
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                          {fmt(annualTotal)}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineNoteMarker({ text }: { text: string }) {
  if (isStandardEscalationNote(text)) {
    return (
      <sup
        title={shortEscalationTooltip(text)}
        style={{
          color: "#0b4a7d", fontWeight: 800, marginLeft: 3,
          fontSize: 11, cursor: "help",
        }}
      >
        *
      </sup>
    );
  }
  return (
    <span
      title={text}
      role="img"
      aria-label={`Note: ${text}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, marginLeft: 6,
        fontSize: 10, fontWeight: 800, fontStyle: "italic", lineHeight: 1,
        fontFamily: "Georgia, serif",
        borderRadius: "50%",
        background: "rgba(11,74,125,0.10)",
        color: "#0b4a7d",
        border: "1px solid rgba(11,74,125,0.30)",
        cursor: "help",
        verticalAlign: "middle",
      }}
    >
      i
    </span>
  );
}

/** True when any line in any section (or its sub-lines, recursively)
 *  uses the standard escalation note — gates the master footnote. */
function propertyHasStandardEscalation(property: BudgetWorkbook["properties"][number]): boolean {
  const hit = (line: import("@/lib/financials/budgets/types").BudgetLine): boolean => {
    if (line.notes && isStandardEscalationNote(line.notes)) return true;
    return !!line.subLines && line.subLines.some(hit);
  };
  for (const sec of property.sections) {
    if (sec.lines.some(hit)) return true;
  }
  return false;
}

function BudgetLineRow({
  line,
  sectionName,
  index,
  sqft,
  psf,
  isEmpty,
  propertyCode,
  showGL,
}: {
  line: import("@/lib/financials/budgets/types").BudgetLine;
  sectionName: string;
  index: number;
  sqft: number;
  psf: boolean;
  isEmpty: boolean;
  propertyCode: string;
  showGL: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSubLines = !!line.subLines && line.subLines.length > 0;
  const subTotal = hasSubLines ? line.subLines!.filter((s) => !s.isSubtotal).reduce((s, x) => s + x.total, 0) : 0;
  // Allow $1 of rounding drift between sub-lines and the parent rollup.
  const sumTies = hasSubLines && Math.abs(subTotal - line.total) <= 1;

  const rowStyle: React.CSSProperties = {
    background: line.isSubtotal ? "rgba(11,74,125,0.06)" : undefined,
    fontWeight: line.isSubtotal ? 800 : 400,
    color: isEmpty ? "var(--muted)" : line.isSubtotal ? "#0b4a7d" : undefined,
    opacity: isEmpty ? 0.55 : 1,
    cursor: hasSubLines ? "pointer" : undefined,
    borderTop: line.isSubtotal ? "2px solid rgba(11,74,125,0.30)" : undefined,
    textTransform: line.isSubtotal ? "uppercase" : undefined,
    letterSpacing: line.isSubtotal ? "0.04em" : undefined,
    fontSize: line.isSubtotal ? 13.5 : undefined,
  };

  return (
    <>
      <tr
        style={rowStyle}
        onClick={hasSubLines ? () => setExpanded((v) => !v) : undefined}
      >
        <td>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {hasSubLines && (
              <span
                aria-hidden
                style={{
                  display: "inline-block", width: 12, fontWeight: 800,
                  color: "var(--muted)", fontSize: 11,
                  transform: expanded ? "rotate(90deg)" : "none",
                  transition: "transform 0.12s ease",
                }}
              >
                ▸
              </span>
            )}
            {showGL && line.glAccount && (
              <span className="muted small" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {line.glAccount}
              </span>
            )}
            {line.subCategory && <span style={{ color: "var(--muted)", marginRight: 2, fontSize: 11 }}>{line.subCategory}</span>}
            <span>{line.label}</span>
            {hasSubLines && (
              <span
                title={sumTies
                  ? `${line.subLines!.filter((s) => !s.isSubtotal).length} sub-lines (click to expand)`
                  : `Δ ${money(subTotal - line.total)} between sub-lines and parent`}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 18, height: 18, padding: "0 5px",
                  fontSize: 10, fontWeight: 800, lineHeight: 1,
                  background: sumTies ? "rgba(22,163,74,0.12)" : "rgba(202,138,4,0.14)",
                  color: sumTies ? "#15803d" : "#854d0e",
                  border: `1px solid ${sumTies ? "rgba(22,163,74,0.35)" : "rgba(202,138,4,0.40)"}`,
                  borderRadius: 4,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {line.subLines!.filter((s) => !s.isSubtotal).length}
              </span>
            )}
            {line.notes && <LineNoteMarker text={line.notes} />}
            {line.allocations && line.allocations.length > 0 && (
              <AllocationIcon allocations={line.allocations} currentPropertyCode={propertyCode} />
            )}
            <TenantRecoveryChip
              glAccount={line.glAccount}
              sectionName={sectionName}
              propertyCode={propertyCode}
            />
          </div>
        </td>
        {line.months.map((m, j) => (
          <td key={j} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: line.isSubtotal ? 13.5 : 12 }}>
            {fmtAmount(m, sqft, psf)}
          </td>
        ))}
        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: line.isSubtotal ? 800 : 600, fontSize: line.isSubtotal ? 14 : undefined }}>
          {fmtAmount(line.total, sqft, psf)}
        </td>
      </tr>
      {expanded && hasSubLines && line.subLines!.map((sub, j) => (
        <SubLineRow
          key={`${sectionName}-${index}-sub-${j}`}
          line={sub}
          parentKey={`${sectionName}-${index}-sub-${j}`}
          depth={1}
          sqft={sqft}
          psf={psf}
          propertyCode={propertyCode}
          showGL={showGL}
        />
      ))}
    </>
  );
}

/** Recursive sub-line renderer. Each level deeper nests further to the
 *  right via the brand-blue left rail on the label cell. Sub-lines that
 *  themselves carry sub-lines (e.g. "Building Maint.-Contractual" with
 *  the level-2 contract items) are clickable to expand the next level. */
function SubLineRow({
  line,
  parentKey,
  depth,
  sqft,
  psf,
  propertyCode,
  showGL,
}: {
  line: import("@/lib/financials/budgets/types").BudgetLine;
  parentKey: string;
  depth: number;
  sqft: number;
  psf: boolean;
  propertyCode: string;
  showGL: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasNested = !!line.subLines && line.subLines.length > 0;
  // Each depth level steps the brand-blue rail 18px further to the right
  // so nested children visually sit "inside" their parent sub-line.
  const indent = depth * 18;
  const fontSize = depth === 1 ? 12 : 11;

  return (
    <>
      <tr
        onClick={hasNested ? () => setExpanded((v) => !v) : undefined}
        style={{
          background: line.isSubtotal ? "rgba(11,74,125,0.07)" : "rgba(11,74,125,0.035)",
          fontWeight: line.isSubtotal ? 700 : 400,
          color: "var(--text)",
          fontSize,
          cursor: hasNested ? "pointer" : undefined,
        }}
      >
        <td style={{
          paddingLeft: indent,
          borderLeft: "3px solid #0b4a7d",
          color: line.isSubtotal ? "#0b4a7d" : undefined,
        }}>
          {hasNested && (
            <span
              aria-hidden
              style={{
                display: "inline-block", width: 12, fontWeight: 800,
                color: "var(--muted)", fontSize: 10, marginRight: 4,
                transform: expanded ? "rotate(90deg)" : "none",
                transition: "transform 0.12s ease",
              }}
            >
              ▸
            </span>
          )}
          {showGL && line.glAccount && (
            <span className="muted small" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", marginRight: 6 }}>
              {line.glAccount}
            </span>
          )}
          {line.label}
          {line.subCategory && !line.isSubtotal && (
            <span className="muted small" style={{ marginLeft: 6 }}>· {line.subCategory}</span>
          )}
          {line.notes && <LineNoteMarker text={line.notes} />}
          {line.allocations && line.allocations.length > 0 && <AllocationIcon allocations={line.allocations} currentPropertyCode={propertyCode} />}
        </td>
        {line.months.map((m, k) => (
          <td key={k} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {fmtAmount(m, sqft, psf)}
          </td>
        ))}
        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: line.isSubtotal ? 800 : 600 }}>
          {fmtAmount(line.total, sqft, psf)}
        </td>
      </tr>
      {expanded && hasNested && line.subLines!.map((nested, k) => (
        <SubLineRow
          key={`${parentKey}-${k}`}
          line={nested}
          parentKey={`${parentKey}-${k}`}
          depth={depth + 1}
          sqft={sqft}
          psf={psf}
          propertyCode={propertyCode}
          showGL={showGL}
        />
      ))}
    </>
  );
}

/** Shared column widths for the section tables + SubtotalCard so the
 *  cross-section subtotal rows (TOTAL REVENUES, NOI, …) align vertically
 *  with the section's monthly columns. Percentages (not pixels) so every
 *  table fills its container's width — no per-section horizontal
 *  scrollbar — while still snapping every Jan/Feb/…/Dec/Total cell into
 *  the same horizontal position with `table-layout: fixed`. */
const BUDGET_COL_PCT = {
  line: 22,     // bumped from 16 since the GL column is gone — GL now
                // renders as a small muted prefix inline with the label
  month: 5.5,   // × 12 = 66%
  total: 12,    // sum = 100%
};

function BudgetTableColgroup() {
  return (
    <colgroup>
      <col style={{ width: `${BUDGET_COL_PCT.line}%` }} />
      {MONTHS.map((m) => <col key={m} style={{ width: `${BUDGET_COL_PCT.month}%` }} />)}
      <col style={{ width: `${BUDGET_COL_PCT.total}%` }} />
    </colgroup>
  );
}

function SubtotalCard({ rollup, sqft, psf }: {
  rollup: { name: string; total: number; months: number[] };
  sqft: number;
  psf: boolean;
}) {
  const negative = rollup.total < 0;
  return (
    <div className="card" style={{
      padding: 0,
      borderColor: "#0b4a7d",
      background: "rgba(11,74,125,0.04)",
    }}>
      {/* margin-top: 0 overrides the default .tableWrap margin so the
          single subtotal row sits at the optical center of the card
          instead of getting pushed down by the wrapper's top margin. */}
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table style={{ tableLayout: "fixed", width: "100%" }}>
          <BudgetTableColgroup />
          <tbody>
            <tr style={{ fontWeight: 800 }}>
              <td style={{
                fontSize: 13, fontWeight: 900, letterSpacing: "0.04em",
                textTransform: "uppercase", color: "#0b4a7d",
                verticalAlign: "middle", borderBottom: "none",
              }}>
                {rollup.name}
              </td>
              {rollup.months.map((m, j) => (
                <td key={j} style={{
                  textAlign: "right", fontVariantNumeric: "tabular-nums",
                  fontSize: 13, fontWeight: 800,
                  color: m < 0 ? "#b91c1c" : undefined,
                  verticalAlign: "middle", borderBottom: "none",
                }}>
                  {fmtAmount(m, sqft, psf)}
                </td>
              ))}
              <td style={{
                textAlign: "right", fontVariantNumeric: "tabular-nums",
                fontSize: 14, fontWeight: 900,
                color: negative ? "#b91c1c" : "#0b4a7d",
                verticalAlign: "middle", borderBottom: "none",
              }}>
                {fmtAmount(rollup.total, sqft, psf)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Format a dollar amount in the current view mode. In total mode it's
 *  the standard money() format; in PSF mode it's $/SF (amount/sqft) with
 *  two decimals. Zero stays as the dash everywhere. */
function fmtAmount(amount: number, sqft: number, psf: boolean): string {
  if (amount === 0) return "—";
  if (!psf || sqft <= 0) return money(amount);
  const v = amount / sqft;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  return `${sign}$${abs.toFixed(2)}`;
}

/** Large header-style property selector. Sits where the property name
 *  used to live and acts as the section title. */
const propertyHeaderSelectStyle: React.CSSProperties = {
  padding: "4px 28px 4px 6px",
  border: "1px solid transparent",
  borderRadius: 8,
  background: "transparent",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 22,
  fontWeight: 800,
  cursor: "pointer",
  outline: "none",
  appearance: "auto",
  maxWidth: "100%",
};

/** Year selector — same header weight as the property selector, slightly
 *  muted so it reads as a secondary qualifier on the property name. */
const yearHeaderSelectStyle: React.CSSProperties = {
  padding: "4px 22px 4px 6px",
  border: "1px solid transparent",
  borderRadius: 8,
  background: "transparent",
  color: "var(--muted)",
  fontFamily: "inherit",
  fontSize: 22,
  fontWeight: 800,
  cursor: "pointer",
  outline: "none",
  appearance: "auto",
};

function CreateBudgetDialog({
  summaries,
  onClose,
  onCreated,
}: {
  summaries: WorkbookSummary[];
  onClose: () => void;
  onCreated: (id: string) => void | Promise<void>;
}) {
  const today = new Date();
  const [category, setCategory] = useState<"Shopping Centers" | "Office" | "Residential">("Shopping Centers");
  const [priorBudgetId, setPriorBudgetId] = useState<string>("");
  const [growth, setGrowth] = useState<number>(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggest a prior budget that matches the chosen category, sorted newest first.
  const priorOptions = useMemo(
    () => summaries.filter((s) => s.category === category).sort((a, b) => b.year - a.year),
    [summaries, category],
  );
  // Default the new budget's year to one past the chosen prior (or
  // today's year + 1 when there's no prior in this category).
  const [year, setYear] = useState<number>(today.getFullYear() + 1);
  useEffect(() => {
    setPriorBudgetId((prev) => {
      if (prev && priorOptions.some((o) => o.id === prev)) return prev;
      return priorOptions[0]?.id ?? "";
    });
  }, [priorOptions]);
  useEffect(() => {
    const prior = priorOptions.find((o) => o.id === priorBudgetId);
    if (prior) setYear(prior.year + 1);
  }, [priorBudgetId, priorOptions]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/financials/budgets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          category,
          priorBudgetId: priorBudgetId || undefined,
          opExGrowthPct: growth,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Create failed");
      await onCreated(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)", color: "var(--text)",
          borderRadius: 12, border: "1px solid var(--border)",
          maxWidth: 520, width: "100%",
          padding: 22,
          boxShadow: "0 12px 40px rgba(15,23,42,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Create Live Budget</h2>
          <button onClick={onClose} className="btn" style={{ fontSize: 13, padding: "4px 10px" }}>✕</button>
        </div>

        <p className="muted small" style={{ marginBottom: 14 }}>
          Generates a new budget for the selected year by pulling in-place revenue
          and reimbursements from the current rent roll, debt service from the
          Debt Tracker, and OpEx lifted at the growth % below from a prior
          uploaded budget (optional). Editing of cells comes in Phase 2b.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Year">
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || today.getFullYear() + 1)}
                style={selectStyleLocal}
              />
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} style={selectStyleLocal}>
                <option value="Shopping Centers">Shopping Centers</option>
                <option value="Office">Office</option>
                <option value="Residential">Residential</option>
              </select>
            </Field>
          </div>
          <Field label="OpEx baseline (prior budget — optional)">
            <select value={priorBudgetId} onChange={(e) => setPriorBudgetId(e.target.value)} style={selectStyleLocal}>
              <option value="">None (OpEx lines blank, fill in manually)</option>
              {priorOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.label} · {s.year}</option>
              ))}
            </select>
          </Field>
          <Field label="OpEx growth %">
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={growth}
              onChange={(e) => setGrowth(Number(e.target.value))}
              style={selectStyleLocal}
            />
          </Field>
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} disabled={busy} className="btn" style={{ fontSize: 13, padding: "8px 14px" }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="btn primary" style={{ fontSize: 13, padding: "8px 18px", fontWeight: 700 }}>
            {busy ? "Building…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

const selectStyleLocal: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
