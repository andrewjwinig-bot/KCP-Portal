"use client";

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/app/components/UserProvider";
import { Pill, StatPill, type PillTone } from "@/app/components/Pill";
import type { BudgetWorkbook, OccupancyDetailRow } from "@/lib/financials/budgets/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const CAN_UPLOAD = new Set(["admin", "drew", "alison"]);

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
          onWorkbookUpdate={setWorkbook}
          editor={user.label}
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

  // Pull the rentDetail off the "Total Rental and Other" subtotal so
  // the Occupancy SF row can offer a per-tenant breakdown modal even
  // on imported budgets (the legacy occupancyDetail field above only
  // gets populated for live builds). Each rent-roster entry already
  // carries monthCategories + per-month rent; the rent-roll snapshot
  // stamps `sqft` on the entry at GET time so we can derive monthly
  // occupied SF as `sqft when months[i] > 0 else 0`.
  const rentDetail = useMemo(() => {
    for (const sec of property.sections) {
      for (const line of sec.lines) {
        if (!line.isSubtotal) continue;
        if (!/^total\s+rental\s+(and|&)\s+other$/i.test(line.label.trim())) continue;
        if (line.rentDetail && line.rentDetail.entries.some((e) => (e.sqft ?? 0) > 0)) {
          return line.rentDetail;
        }
      }
    }
    return null;
  }, [property.sections]);

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
              <td style={{ fontWeight: 700, color: "var(--muted)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Occupancy SF
                  {rentDetail && <OccupancyDetailIcon detail={rentDetail} property={property} />}
                </span>
              </td>
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
  onWorkbookUpdate,
  editor,
}: {
  workbook: BudgetWorkbook;
  property: BudgetWorkbook["properties"][number];
  summaries: WorkbookSummary[];
  selectedId: string | null;
  onSelectBudget: (id: string) => void;
  onSelectProperty: (code: string) => void;
  canUpload: boolean;
  onCreateClick: () => void;
  /** Replace the cached workbook in the parent after an API edit
   *  returns the new state. */
  onWorkbookUpdate: (wb: BudgetWorkbook) => void;
  /** Display label for the current user — stamped onto edited lines
   *  as `lastEditedBy`. */
  editor: string;
}) {
  // Reforecast toggle — flips wb.reforecasting on the server. While
  // on, monthly cells + notes become editable + autosave per blur.
  const [togglingReforecast, setTogglingReforecast] = useState(false);
  const reforecasting = !!workbook.reforecasting;
  const canEdit = reforecasting && canUpload;
  const patchReforecast = useCallback(async (body: Record<string, unknown>) => {
    setTogglingReforecast(true);
    try {
      const res = await fetch(`/api/financials/budgets/${encodeURIComponent(workbook.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, user: editor }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data?.error ?? "Failed to toggle reforecast"); return; }
      if (data.workbook) onWorkbookUpdate(data.workbook);
    } finally {
      setTogglingReforecast(false);
    }
  }, [workbook.id, editor, onWorkbookUpdate]);
  const handleStartReforecast = useCallback(() => {
    patchReforecast({ reforecasting: true });
  }, [patchReforecast]);
  const handleSaveReforecast = useCallback(() => {
    patchReforecast({ reforecasting: false });
  }, [patchReforecast]);
  const handleDiscardReforecast = useCallback(() => {
    if (!confirm("Discard all edits made during this reforecast?")) return;
    patchReforecast({ reforecasting: false, discard: true });
  }, [patchReforecast]);

  // Single-cell edit handler — PATCHes the line endpoint and updates
  // the cached workbook with whatever the server returns (so
  // recomputed parent / subtotal / rollup values land too).
  const handleLineEdit = useCallback(async (
    sectionName: string,
    parentLineLabel: string | null,
    lineLabel: string,
    patch: { monthIdx?: number; value?: number; notes?: string },
  ) => {
    if (!canEdit) return;
    const res = await fetch(`/api/financials/budgets/${encodeURIComponent(workbook.id)}/line`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        propertyCode: property.propertyCode,
        sectionName,
        parentLineLabel,
        lineLabel,
        patch,
        user: editor,
      }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data?.error ?? "Edit failed"); return; }
    if (data.workbook) onWorkbookUpdate(data.workbook);
  }, [canEdit, workbook.id, property.propertyCode, editor, onWorkbookUpdate]);

  const skylineHref = `/api/financials/budgets/${encodeURIComponent(workbook.id)}/skyline?property=${encodeURIComponent(property.propertyCode)}`;
  const downloadHref = `/api/financials/budgets/${encodeURIComponent(workbook.id)}/download?property=${encodeURIComponent(property.propertyCode)}`;
  const downloadPdfHref = `/api/financials/budgets/${encodeURIComponent(workbook.id)}/download/pdf?property=${encodeURIComponent(property.propertyCode)}`;
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

  // Does the workbook carry a Reimbursements section? Property books
  // do; the management-company books (2010, 4900) only have a single
  // Revenue section so the TOTAL REVENUES card injects right after it
  // instead of waiting for Reimbursements.
  const hasReimbursements = useMemo(
    () => property.sections.some((s) => /^reimburs/i.test(s.name.trim()) && !/expense/i.test(s.name)),
    [property.sections],
  );

  const subtotalsAfter = useCallback((sectionName: string): { name: string; total: number; months: number[] }[] => {
    const norm = sectionName.toLowerCase();
    const wants: { key: string; relabelTo?: string }[] = [];
    if (/reimburs/.test(norm) && !/expense/.test(norm) && !/non/.test(norm)) wants.push({ key: "TOTAL REVENUES" });
    // Books without a separate Reimbursements section (LIK 2010, TOW
    // 4900) — drop the TOTAL REVENUES card right after Revenue / Revenues
    // so it still anchors the top of the page.
    if (!hasReimbursements && /^revenues?$/.test(norm)) wants.push({ key: "TOTAL REVENUES" });
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
    // Management-company books — Operating Expenses is the single
    // expense section, so TOTAL OPERATING EXPENSES + NET OPERATING
    // INCOME + CASH FLOW all land after it.
    if (/^operating\s+expenses?$/.test(norm) || /^operation\s+expenses?$/.test(norm)) {
      wants.push({ key: "TOTAL OPERATING EXPENSES" }, { key: "NET OPERATING INCOME" });
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
  }, [rollupByName, hasDebt, hasCapital, hasReimbursements]);

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
    // Property workbooks first (Shopping Centers / Office / Residential
    // in their natural alphabetical order), then the "Other" books
    // (LIK Management, The Office Works) pinned to the bottom so the
    // dropdown lands on the operating portfolio when staff open it.
    const categoryRank = (c: string) => (c === "Other" ? 1 : 0);
    return summaries
      .filter((s) => s.year === workbook.year)
      .sort((a, b) => {
        const ra = categoryRank(a.category);
        const rb = categoryRank(b.category);
        if (ra !== rb) return ra - rb;
        return a.category.localeCompare(b.category) || a.label.localeCompare(b.label);
      })
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
            <HeaderSelect
              value={String(workbook.year)}
              onChange={(v) => handleYearChange(Number(v))}
              displayLabel={String(workbook.year)}
              ariaLabel="Year"
              muted
            >
              {allYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </HeaderSelect>
            <HeaderSelect
              value={`${workbook.id}|${property.propertyCode}`}
              onChange={handlePropertyChange}
              displayLabel={property.propertyCode === "CONSOLIDATED" ? property.propertyName : `${property.propertyCode} — ${property.propertyName}`}
              ariaLabel="Property"
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
            </HeaderSelect>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <ButtonMenu
              label="Download"
              variant="primary"
              items={[
                { label: "Excel (.xlsx)", description: "Full budget + rent roll, allocations, CIP detail tabs", href: downloadHref },
                { label: "PDF",           description: "Presentation-ready single-property summary",           href: downloadPdfHref },
                { label: "Skyline Import",description: "GL-ready .xlsx for the bookkeeping system",            href: skylineHref },
              ]}
            />
            {canUpload && reforecasting ? (
              <>
                <button
                  onClick={handleSaveReforecast}
                  disabled={togglingReforecast}
                  className="btn primary"
                  style={{
                    fontSize: 13, padding: "8px 14px", fontWeight: 700,
                    background: "#b45309", borderColor: "#b45309", color: "white",
                  }}
                  title="Lock the budget — keeps every edit made during this reforecast"
                >
                  ● Save Reforecast
                </button>
                <button
                  onClick={handleDiscardReforecast}
                  disabled={togglingReforecast}
                  className="btn"
                  style={{
                    fontSize: 13, padding: "8px 14px", fontWeight: 700,
                    background: "var(--card)",
                    borderColor: "rgba(180,35,24,0.45)",
                    color: "#b42318",
                  }}
                  title="Roll the budget back to the state it was in when Reforecast was clicked"
                >
                  Discard
                </button>
              </>
            ) : canUpload ? (
              <ButtonMenu
                label="Actions"
                items={[
                  { label: "New Budget",        description: "Build a fresh live budget for this property",         onClick: onCreateClick },
                  { label: "Reforecast Budget", description: "Open the current budget for inline editing across staff", onClick: handleStartReforecast, disabled: togglingReforecast },
                ]}
              />
            ) : null}
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
                        hideEmpty={hideEmpty}
                        canEdit={canEdit}
                        onLineEdit={handleLineEdit}
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
        <div style={{
          padding: "8px 12px",
          background: "rgba(202,138,4,0.14)",
          color: "#854d0e",
          border: "1px solid rgba(202,138,4,0.40)",
          borderRadius: 6,
          fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
          textTransform: "uppercase",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            minWidth: 50, padding: "2px 8px",
            fontSize: 11, fontWeight: 800,
            background: "#ca8a04", color: "#fff",
            borderRadius: 4, letterSpacing: "0.06em",
          }}>DRAFT</span>
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, fontSize: 12 }}>
            Per-tenant recovery breakdown isn&apos;t finalized yet — numbers are sourced from the rent roll for now, not the budget file. We&apos;ll come back to wire this up correctly.
          </span>
        </div>

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
          maxWidth: 1440, width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column", gap: 14, padding: 18,
        }}
      >
        {/* Single block (the common case) — promote the label + GL +
            portfolio total to the modal header so the block card itself
            doesn't repeat them. Multi-block keeps a generic header up
            top and each block retains its own identifier card. */}
        {allocations.length === 1 ? (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Allocated Expense Detail
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span>{allocations[0].blockLabel}</span>
                <span className="muted small" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  {allocations[0].glAccount}
                </span>
              </div>
              {allocations[0].sourceNote && (
                <div className="muted small" style={{ marginTop: 4, fontStyle: "italic" }}>{allocations[0].sourceNote}</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ textAlign: "right" }}>
                <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Portfolio total
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(allocations[0].portfolioTotal)}
                </div>
              </div>
              <button onClick={onClose} className="btn" style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Allocated Expense Detail
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
                {`${allocations.length} contributing blocks`}
              </div>
            </div>
            <button onClick={onClose} className="btn" style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>
              Close
            </button>
          </div>
        )}

        {allocations.map((a, idx) => (
          <div key={idx} className="card" style={{ padding: 0 }}>
            {/* Per-block identifier card only renders when there's
                more than one block — the single-block info already
                lives in the modal header above. */}
            {allocations.length > 1 && (
              <div style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
                background: "rgba(15,23,42,0.03)",
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
                gap: 12, flexWrap: "wrap",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span>{a.blockLabel}</span>
                    <span className="muted small" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{a.glAccount}</span>
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
            )}
            {/* Property + Share columns on the left + month headers up
                top so it's obvious which building gets what across the
                year. Current property's row stays highlighted brand-
                blue. Footer TOTAL row sums each month and the annual
                for the tie-out check. */}
            <div className="tableWrap" style={{ marginTop: 0 }}>
              <table style={{ tableLayout: "fixed", width: "100%" }}>
                <colgroup>
                  <col style={{ width: 90 }} />
                  <col style={{ width: 64 }} />
                  {MONTHS.map((m, i) => <col key={m} style={i % 2 === 0 ? { background: MONTH_TINT } : undefined} />)}
                  <col style={{ width: 100 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Property</th>
                    <th style={{ textAlign: "right" }}>Share</th>
                    {MONTHS.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(a.rows ?? []).map((row) => {
                    const isMe = row.propertyCode.toUpperCase() === here;
                    return (
                      <tr key={row.propertyCode} style={{
                        background: isMe ? "rgba(11,74,125,0.06)" : undefined,
                        opacity: isMe ? 1 : 0.55,
                        fontWeight: isMe ? 700 : 400,
                      }}>
                        <td style={{
                          fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                          color: isMe ? "#0b4a7d" : undefined,
                        }}>
                          {row.propertyCode}
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                          {row.sharePct > 0 ? `${row.sharePct.toFixed(2)}%` : "—"}
                        </td>
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
                        <td>TOTAL</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>100%</td>
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

/** CIP roster chip — click opens the per-tenant breakdown modal sourced
 *  from The Office Works' "Monthly Rent Roll & CIP" tab. Same visual
 *  weight as AllocationIcon so they sit alongside each other cleanly,
 *  but tinted purple to distinguish "tenant detail on this property"
 *  from "share of a portfolio expense". */
function CipIcon({ detail }: { detail: NonNullable<import("@/lib/financials/budgets/types").BudgetLine["cipDetail"]> }) {
  const [open, setOpen] = useState(false);
  const count = detail.tenants.length;
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={`CIP roster — ${count} member${count === 1 ? "" : "s"} (click for detail)`}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 18, height: 18, padding: "0 5px", marginLeft: 4,
          fontSize: 10, fontWeight: 800, lineHeight: 1,
          background: "rgba(76,29,149,0.10)",
          color: "#4c1d95",
          border: "1px solid rgba(76,29,149,0.30)",
          borderRadius: 4,
          cursor: "pointer",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {count}
      </button>
      {open && <CipModal detail={detail} onClose={() => setOpen(false)} />}
    </>
  );
}

function CipModal({ detail, onClose }: {
  detail: NonNullable<import("@/lib/financials/budgets/types").BudgetLine["cipDetail"]>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const fmt = (n: number) => n === 0 ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
  const monthlyTotals = Array.from({ length: 12 }, (_, m) =>
    detail.tenants.reduce((s, t) => s + (t.months[m] ?? 0), 0),
  );
  const annual = detail.tenants.reduce((s, t) => s + t.total, 0);
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
          maxWidth: 1440, width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column", gap: 14, padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              CIP Membership Roster
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
              {detail.tenants.length} members · {fmt(annual)} annual
            </div>
          </div>
          <button onClick={onClose} className="btn" style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>Close</button>
        </div>
        <div className="tableWrap" style={{ marginTop: 0 }}>
          <table style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: 220 }} />
              {MONTHS.map((m, i) => <col key={m} style={i % 2 === 0 ? { background: MONTH_TINT } : undefined} />)}
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Member</th>
                {MONTHS.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {detail.tenants.map((t, idx) => (
                <tr key={idx}>
                  <td style={{ whiteSpace: "nowrap" }}>{t.name}</td>
                  {t.months.map((m, j) => (
                    <td key={j} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{fmt(m)}</td>
                  ))}
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmt(t.total)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
                <td style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 11 }}>Total</td>
                {monthlyTotals.map((m, j) => (
                  <td key={j} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(m)}</td>
                ))}
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(annual)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Three-stop green scale chosen for enough contrast that the eye can
 *  pick out the certainty bucket at a glance. Shifts hue + alpha
 *  together (not just alpha) so the steps stay legible against the
 *  card background on either theme.
 *    in-place → deep forest green   (guaranteed income)
 *    renewal  → mid bright lime     (lease expires, assumed to renew)
 *    new      → pale yellow-green   (suite vacant, new-lease assumption)
 *    vacant   → no tint             (em-dash render) */
const RENT_CATEGORY_TINT: Record<import("@/lib/financials/budgets/types").RentRosterEntry["category"], string> = {
  "in-place": "rgba(21,128,61,0.55)",
  "renewal":  "rgba(132,204,22,0.45)",
  "new":      "rgba(217,249,157,0.65)",
  "vacant":   "transparent",
};
const RENT_CATEGORY_LABEL: Record<import("@/lib/financials/budgets/types").RentRosterEntry["category"], string> = {
  "in-place": "In-Place",
  "renewal":  "Renewal",
  "new":      "New Lease",
  "vacant":   "Vacant",
};
const RENT_CATEGORY_ORDER: import("@/lib/financials/budgets/types").RentRosterEntry["category"][] = ["in-place", "renewal", "new", "vacant"];

/** Click-target chip on the Total Rental and Other subtotal — opens
 *  the per-tenant modal so staff can verify who's paying what. Same
 *  visual footprint as AllocationIcon / CipIcon; green to match the
 *  rent theme. */
function RentIcon({ detail }: { detail: NonNullable<import("@/lib/financials/budgets/types").BudgetLine["rentDetail"]> }) {
  const [open, setOpen] = useState(false);
  const count = detail.entries.filter((e) => e.category !== "vacant").length;
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={`Rent roster — ${count} paying tenant${count === 1 ? "" : "s"} (click for detail)`}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 18, height: 18, padding: "0 5px", marginLeft: 4,
          fontSize: 10, fontWeight: 800, lineHeight: 1,
          background: "rgba(22,163,74,0.12)",
          color: "#15803d",
          border: "1px solid rgba(22,163,74,0.35)",
          borderRadius: 4,
          cursor: "pointer",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {count}
      </button>
      {open && <RentModal detail={detail} onClose={() => setOpen(false)} />}
    </>
  );
}

function RentModal({ detail, onClose }: {
  detail: NonNullable<import("@/lib/financials/budgets/types").BudgetLine["rentDetail"]>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const fmt = (n: number) => n === 0 ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
  // Suite-order top to bottom so the modal lines up with the
  // workbook view staff are used to seeing.
  const ordered = [...detail.entries].sort((a, b) =>
    a.unitRef.localeCompare(b.unitRef, undefined, { numeric: true }),
  );
  const monthlyTotals = Array.from({ length: 12 }, (_, m) =>
    detail.entries.reduce((s, e) => s + (e.months[m] ?? 0), 0),
  );
  const annual = detail.entries.reduce((s, e) => s + e.total, 0);
  // Legend sums the dollar amount in each certainty bucket across
  // every cell — so a single row that's in-place Jan-Mar and a new
  // assumption Jul-Dec contributes to both totals (rather than just
  // its headline bucket).
  const totalByCategory = (cat: import("@/lib/financials/budgets/types").RentRosterEntry["category"]) =>
    detail.entries.reduce((s, e) => {
      let dollars = 0;
      for (let j = 0; j < 12; j++) {
        if ((e.monthCategories?.[j] ?? e.category) === cat) dollars += e.months[j] ?? 0;
      }
      return s + dollars;
    }, 0);
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
          maxWidth: 1440, width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column", gap: 14, padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Rental Summary by Month
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
              {ordered.length} suite{ordered.length === 1 ? "" : "s"} · {fmt(annual)} annual
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              {RENT_CATEGORY_ORDER.map((cat) => {
                if (cat === "vacant") return null;
                const dollars = totalByCategory(cat);
                if (dollars === 0) return null;
                // % of total annual revenue lets staff see at a glance
                // how much rent is contractual (in-place) vs. pending
                // (renewal) vs. speculative (new).
                const pct = annual > 0 ? (dollars / annual) * 100 : 0;
                const pctLabel = pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
                return (
                  <span key={cat} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                    <span style={{
                      display: "inline-block", width: 12, height: 12,
                      background: RENT_CATEGORY_TINT[cat],
                      border: "1px solid rgba(22,163,74,0.35)",
                      borderRadius: 2,
                    }} />
                    <span className="muted small">{RENT_CATEGORY_LABEL[cat]}: {fmt(dollars)} ({pctLabel})</span>
                  </span>
                );
              })}
            </div>
          </div>
          <button onClick={onClose} className="btn" style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>Close</button>
        </div>
        <div className="tableWrap" style={{ marginTop: 0 }}>
          <table style={{ tableLayout: "fixed", width: "100%" }}>
            {/* No MONTH_TINT here — the alternating column shading
                muddies the certainty greens. The tinted cells on each
                row carry the visual rhythm instead. */}
            <colgroup>
              <col style={{ width: 80 }} />
              <col style={{ width: 280 }} />
              {MONTHS.map((m) => <col key={m} />)}
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Suite</th>
                <th style={{ textAlign: "left" }}>Tenant</th>
                {MONTHS.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((e, idx) => {
                const tint = RENT_CATEGORY_TINT[e.category];
                const isVacant = e.category === "vacant";
                // Build the hover tooltip — tenant + lease window
                // when we have it. Renewals show "Expires" (the
                // workbook's date is when the current lease ends);
                // new-lease assumptions show "Lease" (start → end).
                const tooltipLines = [e.tenantName];
                if (e.leaseFrom && e.leaseTo) {
                  tooltipLines.push(`Lease: ${e.leaseFrom} – ${e.leaseTo}`);
                } else if (e.leaseTo) {
                  tooltipLines.push(`Expires: ${e.leaseTo}`);
                } else if (e.leaseFrom) {
                  tooltipLines.push(`Starts: ${e.leaseFrom}`);
                }
                const rowTooltip = tooltipLines.join("\n");
                // Rent bump = a month with a strictly higher value
                // than the previous month, and both values positive.
                // A first-month start (0 → X) doesn't count as a bump
                // because it's just lease commencement, not a rate
                // change.
                const isBump = (j: number) => j > 0 && (e.months[j] ?? 0) > (e.months[j - 1] ?? 0) && (e.months[j - 1] ?? 0) > 0;
                return (
                  <tr key={idx}>
                    <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontSize: 12 }} title={rowTooltip}>{e.unitRef}</td>
                    <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 12, fontWeight: 400, color: isVacant ? "var(--muted)" : undefined, fontStyle: isVacant ? "italic" : undefined }} title={rowTooltip}>
                      {e.tenantName}
                    </td>
                    {e.months.map((m, j) => {
                      const bump = isBump(j);
                      // Per-month tint — same row can shift in-place
                      // → vacant → new across the year (lease ends
                      // mid-year, suite goes dark, new lease assumed).
                      const cellCat = e.monthCategories?.[j] ?? e.category;
                      const cellTint = RENT_CATEGORY_TINT[cellCat];
                      return (
                        <td key={j} style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 12,
                          background: m > 0 ? cellTint : undefined,
                          color: cellCat === "vacant" ? "var(--muted)" : undefined,
                          // Solid underline marks the month a rent
                          // step-up kicks in — quicker to spot than
                          // comparing adjacent numbers. Bold dropped
                          // since staff want totals to be the only
                          // bolded cells.
                          boxShadow: bump ? "inset 0 -2px 0 rgba(15,23,42,0.55)" : undefined,
                        }}
                        title={bump
                          ? (() => {
                              const prev = e.months[j - 1] ?? 0;
                              const pct = prev > 0 ? ((m - prev) / prev) * 100 : 0;
                              // Show one decimal when the bump is
                              // sub-10%, otherwise whole-number — keeps
                              // the tooltip readable for both the
                              // common 3% escalator and the bigger
                              // mid-lease step-ups.
                              const pctLabel = pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
                              return `Rent bump: $${Math.round(prev).toLocaleString()} → $${Math.round(m).toLocaleString()} (+${pctLabel})`;
                            })()
                          : undefined}>
                          {fmt(m)}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 12, color: isVacant ? "var(--muted)" : undefined }}>
                      {fmt(e.total)}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
                <td colSpan={2} style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 11 }}>Total</td>
                {monthlyTotals.map((m, j) => (
                  <td key={j} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(m)}</td>
                ))}
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(annual)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Click-chip that opens the per-suite occupancy modal. Same visual
 *  weight as RentIcon, sits next to the Occupancy SF row label on the
 *  occupancy strip. Hides itself when no entry on the rent roster
 *  carries unit SF (rent roll snapshot hasn't been uploaded, etc.). */
function OccupancyDetailIcon({ detail, property }: {
  detail: NonNullable<import("@/lib/financials/budgets/types").BudgetLine["rentDetail"]>;
  property: BudgetWorkbook["properties"][number];
}) {
  const [open, setOpen] = useState(false);
  const occupied = detail.entries.filter((e) => (e.sqft ?? 0) > 0 && e.months.some((m) => m > 0));
  if (occupied.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={`Occupancy by suite — ${occupied.length} occupied (click for monthly breakdown)`}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 18, height: 18, padding: "0 5px",
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
        {occupied.length}
      </button>
      {open && <OccupancyDetailModal detail={detail} property={property} onClose={() => setOpen(false)} />}
    </>
  );
}

function OccupancyDetailModal({ detail, property, onClose }: {
  detail: NonNullable<import("@/lib/financials/budgets/types").BudgetLine["rentDetail"]>;
  property: BudgetWorkbook["properties"][number];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Each entry's monthly occupied SF = unit SF when that month has
  // rent + the entry isn't a vacant row; em-dash otherwise. This
  // gives us a tenant-level breakdown of the same numbers the
  // Occupancy SF row at the top of the page already shows.
  const sqftFmt = (n: number) => n === 0 ? "—" : n.toLocaleString("en-US");
  const ordered = [...detail.entries].sort((a, b) =>
    a.unitRef.localeCompare(b.unitRef, undefined, { numeric: true }),
  );
  const occupiedSqftByMonth = (e: typeof detail.entries[number]): number[] => {
    const sqft = e.sqft ?? 0;
    if (sqft === 0) return Array(12).fill(0);
    return e.months.map((m, i) => {
      // Genuinely-vacant rows never contribute; everything else uses
      // unit SF for months that carry rent.
      const cat = e.monthCategories?.[i] ?? e.category;
      if (cat === "vacant") return 0;
      return m > 0 ? sqft : 0;
    });
  };
  const rows = ordered.map((e) => ({ entry: e, monthlySqft: occupiedSqftByMonth(e) }));
  const monthlyTotals = Array.from({ length: 12 }, (_, m) =>
    rows.reduce((s, r) => s + r.monthlySqft[m], 0),
  );
  const annualAvg = Math.round(monthlyTotals.reduce((s, v) => s + v, 0) / 12);
  const rentable = property.rentableSqft || 0;
  const annualAvgPct = rentable > 0 ? (annualAvg / rentable) * 100 : 0;

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
          maxWidth: 1440, width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column", gap: 14, padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Occupancy by Suite
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
              {rows.length} suite{rows.length === 1 ? "" : "s"} · Avg {sqftFmt(annualAvg)} SF
              {rentable > 0 && (
                <span className="muted small" style={{ marginLeft: 8, fontWeight: 600 }}>
                  ({annualAvgPct.toFixed(1)}% of {sqftFmt(rentable)})
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn" style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>Close</button>
        </div>
        <div className="tableWrap" style={{ marginTop: 0 }}>
          <table style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: 80 }} />
              <col style={{ width: 280 }} />
              <col style={{ width: 70 }} />
              {MONTHS.map((m) => <col key={m} />)}
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Suite</th>
                <th style={{ textAlign: "left" }}>Tenant</th>
                <th style={{ textAlign: "right" }}>Unit SF</th>
                {MONTHS.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
                <th style={{ textAlign: "right" }}>Avg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry: e, monthlySqft }, idx) => {
                const isVacant = e.category === "vacant";
                const avg = Math.round(monthlySqft.reduce((s, v) => s + v, 0) / 12);
                const tooltipLines = [e.tenantName];
                if (e.leaseFrom && e.leaseTo) tooltipLines.push(`Lease: ${e.leaseFrom} – ${e.leaseTo}`);
                else if (e.leaseTo) tooltipLines.push(`Expires: ${e.leaseTo}`);
                else if (e.leaseFrom) tooltipLines.push(`Starts: ${e.leaseFrom}`);
                const rowTooltip = tooltipLines.join("\n");
                return (
                  <tr key={idx}>
                    <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontSize: 12 }} title={rowTooltip}>{e.unitRef}</td>
                    <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 12, fontWeight: 400, color: isVacant ? "var(--muted)" : undefined, fontStyle: isVacant ? "italic" : undefined }} title={rowTooltip}>
                      {e.tenantName}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12, color: "var(--muted)" }}>
                      {e.sqft ? e.sqft.toLocaleString() : "—"}
                    </td>
                    {monthlySqft.map((sf, j) => {
                      // Per-month cell tint matches the rent modal so
                      // staff can see at a glance whether the
                      // occupied SF is in-place / renewal / new.
                      const cat = e.monthCategories?.[j] ?? e.category;
                      const tint = RENT_CATEGORY_TINT[cat];
                      return (
                        <td key={j} style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 12,
                          background: sf > 0 ? tint : undefined,
                          color: sf === 0 ? "var(--muted)" : undefined,
                        }}>
                          {sqftFmt(sf)}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 12, color: isVacant ? "var(--muted)" : undefined }}>
                      {sqftFmt(avg)}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
                <td colSpan={3} style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 11 }}>Total Occupied SF</td>
                {monthlyTotals.map((m, j) => (
                  <td key={j} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{sqftFmt(m)}</td>
                ))}
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{sqftFmt(annualAvg)}</td>
              </tr>
            </tbody>
          </table>
        </div>
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

type LineEditHandler = (
  sectionName: string,
  parentLineLabel: string | null,
  lineLabel: string,
  patch: { monthIdx?: number; value?: number; notes?: string },
) => void | Promise<void>;

/** Monthly amount cell with an opt-in click-to-edit affordance.
 *  Read-only when `canEdit` is false (the normal viewing case) —
 *  becomes a number input on click during a reforecast, saves on
 *  blur or Enter, and reverts on Escape. We use a controlled local
 *  string state so staff can type intermediate values like "12,5"
 *  without the formatter mangling them mid-edit. */
function EditableMonthCell({
  value,
  monthIdx,
  sqft,
  psf,
  isSubtotal,
  canEdit,
  onSave,
}: {
  value: number;
  monthIdx: number;
  sqft: number;
  psf: boolean;
  isSubtotal: boolean;
  canEdit: boolean;
  onSave: (next: number) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(Math.round(value)));
  const baseStyle: React.CSSProperties = {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontSize: isSubtotal ? 13.5 : 12,
  };
  if (!canEdit) {
    return <td style={baseStyle}>{fmtAmount(value, sqft, psf)}</td>;
  }
  if (!editing) {
    return (
      <td
        style={{ ...baseStyle, cursor: "text", outline: "1px dashed rgba(180,83,9,0.35)", outlineOffset: -1 }}
        onClick={() => { setDraft(String(Math.round(value))); setEditing(true); }}
        title="Click to edit"
      >
        {fmtAmount(value, sqft, psf)}
      </td>
    );
  }
  const commit = async () => {
    const clean = draft.replace(/[,$\s]/g, "");
    const next = Number(clean);
    setEditing(false);
    if (!Number.isFinite(next) || next === Math.round(value)) return;
    await onSave(next);
  };
  return (
    <td style={{ ...baseStyle, padding: 0 }}>
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          else if (e.key === "Escape") { setEditing(false); setDraft(String(Math.round(value))); }
        }}
        style={{
          width: "100%", padding: "2px 4px",
          textAlign: "right", fontVariantNumeric: "tabular-nums",
          fontSize: isSubtotal ? 13.5 : 12,
          border: "1px solid #b45309", borderRadius: 2,
          background: "rgba(245,158,11,0.06)",
        }}
      />
    </td>
  );
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
  hideEmpty,
  canEdit,
  onLineEdit,
}: {
  line: import("@/lib/financials/budgets/types").BudgetLine;
  sectionName: string;
  index: number;
  sqft: number;
  psf: boolean;
  isEmpty: boolean;
  propertyCode: string;
  showGL: boolean;
  hideEmpty: boolean;
  canEdit: boolean;
  onLineEdit: LineEditHandler;
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
            {/* The green sub-line count chip on the right is the only
                expand affordance — the leading chevron was visual
                clutter that pushed expandable rows out of column
                alignment with their plain-row siblings. */}
            {showGL && line.glAccount && (
              <span className="muted small" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {line.glAccount}
              </span>
            )}
            {line.subCategory && <span style={{ color: "var(--muted)", marginRight: 2, fontSize: 11 }}>{line.subCategory}</span>}
            <span>
              {line.label}
              {line.feePercent != null && (
                <span className="muted small" style={{ marginLeft: 6 }}>({line.feePercent}%)</span>
              )}
              {line.feePercent == null && line.feePercentRange && (
                <span className="muted small" style={{ marginLeft: 6 }}>
                  ({line.feePercentRange[0]}–{line.feePercentRange[1]}%)
                </span>
              )}
            </span>
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
            {line.cipDetail && <CipIcon detail={line.cipDetail} />}
            {line.rentDetail && <RentIcon detail={line.rentDetail} />}
            <TenantRecoveryChip
              glAccount={line.glAccount}
              sectionName={sectionName}
              propertyCode={propertyCode}
            />
          </div>
        </td>
        {line.months.map((m, j) => (
          <EditableMonthCell
            key={j}
            value={m}
            monthIdx={j}
            sqft={sqft}
            psf={psf}
            isSubtotal={line.isSubtotal}
            canEdit={canEdit && !line.isSubtotal && !hasSubLines}
            onSave={(v) => onLineEdit(sectionName, null, line.label, { monthIdx: j, value: v })}
          />
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
          hideEmpty={hideEmpty}
          canEdit={canEdit}
          onLineEdit={onLineEdit}
          sectionName={sectionName}
          parentLineLabel={line.label}
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
  hideEmpty,
  canEdit,
  onLineEdit,
  sectionName,
  parentLineLabel,
}: {
  line: import("@/lib/financials/budgets/types").BudgetLine;
  parentKey: string;
  depth: number;
  sqft: number;
  psf: boolean;
  propertyCode: string;
  showGL: boolean;
  hideEmpty: boolean;
  canEdit: boolean;
  onLineEdit: LineEditHandler;
  sectionName: string;
  /** Label of the immediate parent line — sent to the API so the
   *  server resolves the sub-line by `(section, parent, label)`. */
  parentLineLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasNested = !!line.subLines && line.subLines.length > 0;
  // Honor the page-level "Hide empty rows" toggle on sub-lines too —
  // a sub-line is empty when its total and every month are 0 and it
  // isn't a subtotal row that we always want to render.
  const isEmpty = !line.isSubtotal && line.total === 0 && line.months.every((m) => m === 0);
  if (hideEmpty && isEmpty && !hasNested) return null;
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
          {line.cipDetail && <CipIcon detail={line.cipDetail} />}
          {line.rentDetail && <RentIcon detail={line.rentDetail} />}
        </td>
        {line.months.map((m, k) => (
          <EditableMonthCell
            key={k}
            value={m}
            monthIdx={k}
            sqft={sqft}
            psf={psf}
            isSubtotal={line.isSubtotal}
            canEdit={canEdit && !line.isSubtotal && !hasNested}
            onSave={(v) => onLineEdit(sectionName, parentLineLabel, line.label, { monthIdx: k, value: v })}
          />
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
          hideEmpty={hideEmpty}
          canEdit={canEdit}
          onLineEdit={onLineEdit}
          sectionName={sectionName}
          parentLineLabel={line.label}
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

// Subtle alternating tint on month columns to keep the eye tracking
// horizontally across a 12-month grid. Even-indexed months (Jan, Mar,
// May, Jul, Sep, Nov) get a faint background so consecutive values
// don't blur into each other. Low alpha works on both light and dark
// themes without competing with the subtotal-row + brand-blue tints.
const MONTH_TINT = "rgba(15,23,42,0.035)";
const monthColStyle = (i: number, width: string) => i % 2 === 0
  ? { width, background: MONTH_TINT }
  : { width };

function BudgetTableColgroup() {
  return (
    <colgroup>
      <col style={{ width: `${BUDGET_COL_PCT.line}%` }} />
      {MONTHS.map((m, i) => <col key={m} style={monthColStyle(i, `${BUDGET_COL_PCT.month}%`)} />)}
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
/** Pill-shaped button that opens a small menu of choices. Used in the
 *  budgets header to collapse the Download/Skyline/PDF buttons into a
 *  single Download menu and the New/Reforecast buttons into a single
 *  Actions menu. Items render with an optional one-line description
 *  beneath the label so staff don't have to remember which Download
 *  flavour does what. Closes on outside click or Escape. */
type ButtonMenuItem = {
  label: string;
  description?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

function ButtonMenu({
  label,
  items,
  variant = "default",
}: {
  label: string;
  items: ButtonMenuItem[];
  variant?: "default" | "primary";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={variant === "primary" ? "btn primary" : "btn"}
        style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <span aria-hidden style={{ fontSize: 10, opacity: 0.75, lineHeight: 1 }}>▾</span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 40,
            minWidth: 260,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
            padding: 4,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {items.map((item, i) => {
            const content = (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{item.label}</div>
                {item.description && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, lineHeight: 1.35 }}>
                    {item.description}
                  </div>
                )}
              </>
            );
            const style: React.CSSProperties = {
              display: "block",
              textAlign: "left",
              textDecoration: "none",
              background: "transparent",
              border: 0,
              borderRadius: 6,
              padding: "8px 10px",
              cursor: item.disabled ? "not-allowed" : "pointer",
              opacity: item.disabled ? 0.5 : 1,
              width: "100%",
            };
            const onHover = (e: React.MouseEvent<HTMLElement>) => {
              if (!item.disabled) (e.currentTarget as HTMLElement).style.background = "var(--surface-2, rgba(15,23,42,0.05))";
            };
            const onLeave = (e: React.MouseEvent<HTMLElement>) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            };
            if (item.href && !item.disabled) {
              return (
                <a
                  key={i}
                  href={item.href}
                  style={style}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  onMouseEnter={onHover}
                  onMouseLeave={onLeave}
                >
                  {content}
                </a>
              );
            }
            return (
              <button
                key={i}
                type="button"
                style={style}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { if (!item.disabled) { setOpen(false); item.onClick?.(); } }}
                onMouseEnter={onHover}
                onMouseLeave={onLeave}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Header-styled dropdown that sizes its chrome to the *currently
 *  selected* label rather than to the widest option in the list — which
 *  is what native `<select>` does, and what was leaving a big blank
 *  gap between the property name and the chevron on workbooks that
 *  carry long consolidated rollup entries. We render the visible label
 *  + chevron in a content-sized span, then overlay an invisible native
 *  select on top so the platform's dropdown UI still drives selection. */
function HeaderSelect({
  value,
  onChange,
  displayLabel,
  ariaLabel,
  muted = false,
  children,
}: {
  value: string;
  onChange: (next: string) => void;
  displayLabel: string;
  ariaLabel: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 6px",
        borderRadius: 8,
        cursor: "pointer",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: muted ? "var(--muted)" : "var(--text)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {displayLabel}
      </span>
      <span
        aria-hidden
        style={{
          fontSize: 11,
          lineHeight: 1,
          color: muted ? "var(--muted)" : "var(--text)",
          opacity: 0.6,
          flexShrink: 0,
        }}
      >
        ▾
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "pointer",
          border: 0,
          padding: 0,
          margin: 0,
          appearance: "auto",
          background: "transparent",
        }}
      >
        {children}
      </select>
    </span>
  );
}

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
