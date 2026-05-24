"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/app/components/UserProvider";
import type { BudgetWorkbook } from "@/lib/financials/budgets/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const CAN_UPLOAD = new Set(["admin", "drew", "harry", "nancy"]);

type WorkbookSummary = {
  id: string;
  label: string;
  category: string;
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

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Budgets</h1>
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

      <Toolbar
        canUpload={canUpload}
        summaries={summaries ?? []}
        selectedId={selectedId}
        onSelect={setSelectedId}
        workbook={workbook}
        propertyCode={propertyCode}
        onPropertyChange={setPropertyCode}
        onUploaded={async (newId) => {
          await reload();
          setSelectedId(newId);
        }}
      />

      {loading && !workbook && (
        <div className="card"><div className="muted small">Loading…</div></div>
      )}

      {!loading && summaries && summaries.length === 0 && (
        <div className="card">
          <p style={{ fontWeight: 700, marginBottom: 6 }}>No budget uploaded yet.</p>
          <p className="muted small">
            {canUpload
              ? "Use the Upload Budget button above to import the operating-budget workbook (e.g. Shopping Centers 2026)."
              : "Once a budget is uploaded by Drew, Harry, or Nancy, it'll appear here."}
          </p>
        </div>
      )}

      {workbook && property && (
        <BudgetTable workbook={workbook} property={property} />
      )}
    </main>
  );
}

function Toolbar({
  canUpload,
  summaries,
  selectedId,
  onSelect,
  workbook,
  propertyCode,
  onPropertyChange,
  onUploaded,
}: {
  canUpload: boolean;
  summaries: WorkbookSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  workbook: BudgetWorkbook | null;
  propertyCode: string | null;
  onPropertyChange: (code: string) => void;
  onUploaded: (id: string) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
      await onUploaded(body.id);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const skylineHref = workbook && propertyCode
    ? `/api/financials/budgets/${encodeURIComponent(workbook.id)}/skyline?property=${encodeURIComponent(propertyCode)}`
    : null;

  return (
    <div className="card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      {summaries.length > 0 && (
        <>
          <Field label="Budget">
            <select
              value={selectedId ?? ""}
              onChange={(e) => onSelect(e.target.value)}
              style={selectStyle}
            >
              {summaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {s.year}
                </option>
              ))}
            </select>
          </Field>
          {workbook && (
            <Field label="Property">
              <select
                value={propertyCode ?? ""}
                onChange={(e) => onPropertyChange(e.target.value)}
                style={{ ...selectStyle, minWidth: 240 }}
              >
                {workbook.properties.map((p) => (
                  <option key={p.propertyCode} value={p.propertyCode}>
                    {p.propertyCode} — {p.propertyName}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {skylineHref && (
          <a
            href={skylineHref}
            className="btn primary"
            style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, textDecoration: "none" }}
          >
            ⬇ Budget Import (.xlsx)
          </a>
        )}
        {canUpload && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn"
              style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}
            >
              {uploading ? "Uploading…" : (summaries.length === 0 ? "Upload Budget" : "Upload New")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </>
        )}
      </div>

      {uploadError && (
        <div style={{ width: "100%", marginTop: 6, color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{uploadError}</div>
      )}
    </div>
  );
}

function BudgetTable({ workbook, property }: { workbook: BudgetWorkbook; property: BudgetWorkbook["properties"][number] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Property summary tile */}
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
            {workbook.year} Operating Budget · {workbook.category}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
            {property.propertyCode} — {property.propertyName}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            Rentable SF: {property.rentableSqft.toLocaleString()} ·
            {" "}Uploaded {new Date(workbook.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 20, flexWrap: "wrap" }}>
          {property.rollups.map((r) => (
            <div key={r.name} style={{ minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
                {r.name}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                {money(r.total)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Occupancy strip */}
      {property.occupancyPct.some((p) => p > 0) && (
        <div className="card" style={{ padding: 0 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th></th>
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
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sections */}
      {property.sections.map((sec) => (
        <div className="card" key={sec.name} style={{ padding: 0 }}>
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
                  <th style={{ textAlign: "right" }}>$/SF</th>
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
                        {money(m)}
                      </td>
                    ))}
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: l.isSubtotal ? 800 : 600 }}>
                      {money(l.total)}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--muted)", fontSize: 12 }}>
                      {l.totalPsf != null ? `$${l.totalPsf.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Skyline import preview */}
      {property.skylineImport.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Budget Import — {property.propertyCode}
            </span>
            <span className="muted small">
              Skyline payload. Revenues stored as negatives (credits). Use the Budget Import (.xlsx) button at the top.
            </span>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th style={{ width: 110 }}>Account</th>
                  <th style={{ textAlign: "right", width: 140 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {property.skylineImport.map((l, i) => (
                  <tr key={i}>
                    <td>{l.label}</td>
                    <td className="muted small" style={{ fontVariantNumeric: "tabular-nums" }}>{l.glAccount}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(l.total)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 800, background: "rgba(15,23,42,0.04)" }}>
                  <td colSpan={2}>Total</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {money(property.skylineImport.reduce((s, l) => s + l.total, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
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
