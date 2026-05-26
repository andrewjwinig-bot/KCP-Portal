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
          uploading={uploading}
          onUploadClick={() => fileRef.current?.click()}
          onCreateClick={() => setCreateOpen(true)}
        />
      )}

      {/* Hidden file input — shared by the empty-state button and the
          Upload New button inside the property card. */}
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
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 700, color: "var(--muted)" }}>Occupancy %</td>
              {property.occupancyPct.map((p, i) => (
                <td key={i} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct(p)}</td>
              ))}
            </tr>
            <tr>
              <td style={{ fontWeight: 700, color: "var(--muted)" }}>Occupancy SF</td>
              {property.occupancySqft.map((s, i) => (
                <td key={i} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {s > 0 ? s.toLocaleString() : "—"}
                </td>
              ))}
            </tr>

            {expanded && OCCUPANCY_ORDER.flatMap((cat) => {
              const rows = grouped[cat];
              if (rows.length === 0) return [];
              return [
                <tr key={`hdr-${cat}`} style={{ background: "rgba(15,23,42,0.04)" }}>
                  <td colSpan={13} style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: "var(--muted)",
                    padding: "8px 12px",
                  }}>
                    {OCCUPANCY_LABELS[cat]} · {rows.length} {rows.length === 1 ? "suite" : "suites"}
                  </td>
                </tr>,
                ...rows.map((r) => (
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
                  </tr>
                )),
                <tr key={`sub-${cat}`} style={{ fontWeight: 700, background: "rgba(15,23,42,0.02)" }}>
                  <td style={{ color: "var(--muted)" }}>Subtotal — {OCCUPANCY_LABELS[cat]}</td>
                  {categoryTotals[cat].map((s, i) => (
                    <td key={i} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {s > 0 ? s.toLocaleString() : "—"}
                    </td>
                  ))}
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
  uploading,
  onUploadClick,
  onCreateClick,
}: {
  workbook: BudgetWorkbook;
  property: BudgetWorkbook["properties"][number];
  summaries: WorkbookSummary[];
  selectedId: string | null;
  onSelectBudget: (id: string) => void;
  onSelectProperty: (code: string) => void;
  canUpload: boolean;
  uploading: boolean;
  onUploadClick: () => void;
  onCreateClick: () => void;
}) {
  const skylineHref = `/api/financials/budgets/${encodeURIComponent(workbook.id)}/skyline?property=${encodeURIComponent(property.propertyCode)}`;
  const [psf, setPsf] = useState(false);
  const sqft = property.rentableSqft || 0;

  // Build the lookup of cross-section subtotals (TOTAL REVENUES, NOI,
  // etc.) by section name so we can inject them between section cards.
  const rollupByName = useMemo(() => {
    const m = new Map<string, { name: string; total: number; months: number[] }>();
    for (const r of property.rollups) m.set(r.name.toUpperCase().trim(), r);
    return m;
  }, [property.rollups]);
  const subtotalsAfter = useCallback((sectionName: string): { name: string; total: number; months: number[] }[] => {
    const norm = sectionName.toLowerCase();
    const wants: string[] = [];
    if (/reimburs/.test(norm) && !/expense/.test(norm) && !/non/.test(norm)) wants.push("TOTAL REVENUES");
    if (/non-reimbursable/.test(norm)) wants.push("TOTAL OPERATING EXPENSES", "NET OPERATING INCOME");
    if (/capital/.test(norm)) wants.push("CASH FLOW BEFORE DEBT SERVICE");
    if (/debt service/.test(norm)) wants.push("CASH FLOW AFTER DEBT SERVICE");
    return wants
      .map((n) => rollupByName.get(n))
      .filter((r): r is { name: string; total: number; months: number[] } => Boolean(r));
  }, [rollupByName]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Property summary tile */}
      <div className="card">
        {/* Top meta row — small budget selector + kind badge. Replaces
            the previous "Budget" dropdown in the now-removed toolbar. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {summaries.length > 1 ? (
            <select
              value={selectedId ?? ""}
              onChange={(e) => onSelectBudget(e.target.value)}
              style={budgetChipStyle}
              aria-label="Budget"
            >
              {summaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {s.year}{s.kind === "live" ? " (Live)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
              {workbook.year} Operating Budget · {workbook.category}
            </span>
          )}
          <span style={{
            fontSize: 9, padding: "2px 7px", borderRadius: 4,
            background: workbook.kind === "live" ? "rgba(22,163,74,0.10)" : "rgba(11,74,125,0.10)",
            color: workbook.kind === "live" ? "#15803d" : "#0b4a7d",
            border: `1px solid ${workbook.kind === "live" ? "rgba(22,163,74,0.30)" : "rgba(11,74,125,0.30)"}`,
            letterSpacing: "0.08em", fontWeight: 700, textTransform: "uppercase",
          }}>{workbook.kind === "live" ? "Live" : "Imported"}</span>
        </div>

        {/* Header row — large property dropdown styled as a heading, with
            the three actions right-aligned on the same line. */}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <select
            value={property.propertyCode}
            onChange={(e) => onSelectProperty(e.target.value)}
            style={propertyHeaderSelectStyle}
            aria-label="Property"
          >
            {workbook.properties.map((p) => (
              <option key={p.propertyCode} value={p.propertyCode}>
                {p.propertyCode} — {p.propertyName}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <a
              href={skylineHref}
              className="btn primary"
              style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, textDecoration: "none" }}
            >
              ⬇ Budget Import (.xlsx)
            </a>
            {canUpload && (
              <>
                <button
                  onClick={onCreateClick}
                  className="btn primary"
                  style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}
                >
                  + Create Live Budget
                </button>
                <button
                  onClick={onUploadClick}
                  disabled={uploading}
                  className="btn"
                  style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}
                >
                  {uploading ? "Uploading…" : "Upload New"}
                </button>
              </>
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
          <ViewToggle psf={psf} onChange={setPsf} disabled={sqft <= 0} />
        </div>

        <div className="pills">
          {property.rollups.map((r) => (
            <StatPill
              key={r.name}
              label={r.name}
              value={money(r.total)}
              accent={r.total < 0 ? "#b91c1c" : undefined}
            />
          ))}
        </div>
      </div>

      {/* Occupancy strip + expandable per-tenant breakdown */}
      {property.occupancyPct.some((p) => p > 0) && (
        <OccupancyPanel property={property} />
      )}

      {/* Sections with cross-section subtotal cards (TOTAL REVENUES,
          NOI, CASH FLOW, etc.) injected between them. */}
      {property.sections.map((sec) => (
        <Fragment key={sec.name}>
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
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 96 }}>GL</th>
                    <th>Line</th>
                    {MONTHS.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.lines.map((l, i) => (
                    <tr key={`${sec.name}-${i}`} style={{
                      background: l.isSubtotal ? "rgba(15,23,42,0.04)" : undefined,
                      fontWeight: l.isSubtotal ? 700 : 400,
                    }}>
                      <td className="muted small" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {l.glAccount ?? ""}
                      </td>
                      <td>
                        {l.subCategory && <span style={{ color: "var(--muted)", marginRight: 6, fontSize: 11 }}>{l.subCategory}</span>}
                        {l.label}
                        {l.notes && <div className="muted small" style={{ marginTop: 2 }}>{l.notes}</div>}
                      </td>
                      {l.months.map((m, j) => (
                        <td key={j} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                          {fmtAmount(m, sqft, psf)}
                        </td>
                      ))}
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: l.isSubtotal ? 800 : 600 }}>
                        {fmtAmount(l.total, sqft, psf)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {subtotalsAfter(sec.name).map((r) => (
            <SubtotalCard key={r.name} rollup={r} sqft={sqft} psf={psf} />
          ))}
        </Fragment>
      ))}
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
      <div className="tableWrap">
        <table>
          <colgroup>
            <col style={{ width: 96 }} />
            <col />
            {MONTHS.map((m) => <col key={m} />)}
            <col />
          </colgroup>
          <tbody>
            <tr style={{ fontWeight: 800 }}>
              <td></td>
              <td style={{
                fontSize: 13, fontWeight: 900, letterSpacing: "0.04em",
                textTransform: "uppercase", color: "#0b4a7d",
              }}>
                {rollup.name}
              </td>
              {rollup.months.map((m, j) => (
                <td key={j} style={{
                  textAlign: "right", fontVariantNumeric: "tabular-nums",
                  fontSize: 13, fontWeight: 800,
                  color: m < 0 ? "#b91c1c" : undefined,
                }}>
                  {fmtAmount(m, sqft, psf)}
                </td>
              ))}
              <td style={{
                textAlign: "right", fontVariantNumeric: "tabular-nums",
                fontSize: 14, fontWeight: 900,
                color: negative ? "#b91c1c" : "#0b4a7d",
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

/** Small chip-style budget selector that lives in the property card's
 *  top meta row. Looks like the uppercase label it replaces, but
 *  clickable. */
const budgetChipStyle: React.CSSProperties = {
  padding: "2px 22px 2px 0",
  border: "none",
  background: "transparent",
  color: "var(--muted)",
  fontFamily: "inherit",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
  outline: "none",
  appearance: "auto",
};

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
