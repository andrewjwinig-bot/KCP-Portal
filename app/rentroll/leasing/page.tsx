"use client";
import LoadingState from "@/app/components/LoadingState";

import { useEffect, useMemo, useState } from "react";
import type { RentRollData, RentRollUnit } from "../../../lib/rentroll/parseRentRollExcel";
import { useUser } from "../../components/UserProvider";
import LeasingActivityCard from "../LeasingActivityCard";
import { PROPERTY_DEFS } from "../../../lib/properties/data";
import {
  SEED_EXPENSES,
  latestExpenseYear,
  reimbursement,
} from "../../../lib/rentroll/baseYearExpenses";
import { StatPill } from "../../components/Pill";

type TenantMeta = { baseYear?: number | string | null };
type BaseYearReset = {
  unitRef: string;
  propertyCode: string | null;
  occupantName: string;
  originalBaseYear: number | null;
  newBaseYear: number;
  resetDate: string;
  notes?: string;
  updatedAt: string;
};
type SnowBaseExclusion = {
  unitRef: string;
  propertyCode: string | null;
  occupantName: string;
  baseYear: number | null;
  effectiveMonth: number;
  effectiveYear: number;
  notes?: string;
  updatedAt: string;
};

function isOfficeCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
  return def?.type === "Office";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// A base year can only be reset to the current year or a future year.
const RESET_YEARS = (() => {
  const y = new Date().getFullYear();
  return Array.from({ length: 3 }, (_, i) => y + i);
})();

// Base-year resets are always dated to the 1st of a month.
function firstOfMonthISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function LeasingActivityPage() {
  const [rentroll, setRentroll] = useState<RentRollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantMeta, setTenantMeta] = useState<Record<string, TenantMeta>>({});
  const [resets, setResets] = useState<Record<string, BaseYearReset>>({});
  const [snowExclusions, setSnowExclusions] = useState<Record<string, SnowBaseExclusion>>({});
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    fetch("/api/rentroll").then((r) => r.json())
      .then((j) => setRentroll(j.rentroll ?? null))
      .catch(() => setRentroll(null))
      .finally(() => setLoading(false));
    fetch("/api/tenant-meta").then((r) => r.json())
      .then((j) => setTenantMeta(j.tenantMeta ?? {}))
      .catch(() => {});
    fetch("/api/base-year-resets").then((r) => r.json())
      .then((j) => setResets(j.resets ?? {}))
      .catch(() => {});
    fetch("/api/snow-base-exclusions").then((r) => r.json())
      .then((j) => setSnowExclusions(j.exclusions ?? {}))
      .catch(() => {});
  }, []);

  async function handleStatusReport() {
    if (!rentroll) return;
    setGeneratingReport(true);
    try {
      const res = await fetch("/api/status-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "All",
          tenantMeta,
          properties: rentroll.properties,
          reportFrom: rentroll.reportFrom,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const m = rentroll.reportFrom.match(/^(\d{1,2})\/\d+\/(\d{4})$/);
      const period = m ? `${MONTHS_SHORT[parseInt(m[1]) - 1]}-${m[2].slice(2)}` : "";
      a.href = url;
      a.download = `All - ${period} Status Report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingReport(false);
    }
  }

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h1 style={{ margin: 0 }}>Leasing Activity</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </header>

      {loading ? (
        <LoadingState status="Loading leasing activity…" columns={4} rows={4} />
      ) : (
        <>
          <LeasingActivityCard
            rentroll={rentroll}
            headerSlot={
              <button
                onClick={handleStatusReport}
                disabled={generatingReport || !rentroll}
                style={{
                  background: generatingReport ? "rgba(11,74,125,0.4)" : "rgba(11,74,125,0.85)",
                  color: "#fff", borderRadius: 999, padding: "8px 16px",
                  fontSize: 13, fontWeight: 700, border: "1px solid transparent",
                  display: "inline-flex", alignItems: "center",
                  cursor: generatingReport || !rentroll ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {generatingReport ? "Generating…" : "Status Report"}
              </button>
            }
          />
          <BaseYearResets
            rentroll={rentroll}
            tenantMeta={tenantMeta}
            setTenantMeta={setTenantMeta}
            resets={resets}
            setResets={setResets}
          />
          <SnowBaseExclusions
            rentroll={rentroll}
            tenantMeta={tenantMeta}
            exclusions={snowExclusions}
            setExclusions={setSnowExclusions}
          />
          <SnowCostEstimator
            rentroll={rentroll}
            tenantMeta={tenantMeta}
            exclusions={snowExclusions}
          />
        </>
      )}
    </main>
  );
}

function BaseYearResets({
  rentroll, tenantMeta, setTenantMeta, resets, setResets,
}: {
  rentroll: RentRollData | null;
  tenantMeta: Record<string, TenantMeta>;
  setTenantMeta: (next: Record<string, TenantMeta>) => void;
  resets: Record<string, BaseYearReset>;
  setResets: (next: Record<string, BaseYearReset>) => void;
}) {
  const { user } = useUser();
  // Base-year updates are restricted to Nancy and admin to prevent other
  // personas from accidentally rewriting a tenant's negotiated terms.
  const canEditBaseYear = user.id === "nancy" || user.id === "admin";
  // Build the office tenant dropdown options.
  const options = useMemo(() => {
    type Opt = { unitRef: string; label: string; propertyCode: string; occupantName: string; sqft: number };
    if (!rentroll) return [] as Opt[];
    const out: Opt[] = [];
    for (const p of rentroll.properties) {
      if (!isOfficeCode(p.propertyCode)) continue;
      for (const u of p.units) {
        if (u.isVacant) continue;
        out.push({
          unitRef: u.unitRef,
          propertyCode: p.propertyCode,
          occupantName: u.occupantName,
          sqft: u.sqft,
          label: `${u.unitRef} · ${u.occupantName}`,
        });
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [rentroll]);

  const [open, setOpen] = useState(false);
  const [selectedUnitRef, setSelectedUnitRef] = useState<string>("");
  const [resetDate, setResetDate] = useState<string>(firstOfMonthISO());
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = options.find((o) => o.unitRef === selectedUnitRef) ?? null;
  const currentBaseYear = selectedOption ? (tenantMeta[selectedOption.unitRef]?.baseYear ?? null) : null;

  // Sort displayed resets by reset date desc.
  const resetRows = useMemo(() => {
    return Object.values(resets).sort((a, b) => b.resetDate.localeCompare(a.resetDate));
  }, [resets]);

  async function save() {
    if (!selectedOption) { setError("Pick a tenant."); return; }
    const newBaseYear = new Date().getFullYear();
    const when = new Date(Number(resetDate.slice(0, 4)), Number(resetDate.slice(5, 7)) - 1, 1)
      .toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const ok = window.confirm(
      `Reset the base year for ${selectedOption.occupantName} (${selectedOption.unitRef})?\n\n` +
      `• From ${currentBaseYear ?? "—"} → ${newBaseYear}\n` +
      `• Effective ${when}\n\n` +
      `This flips the tenant's base year and changes their CAM reconciliation going forward.`,
    );
    if (!ok) return;
    setSaving(true); setError(null);
    try {
      // 1) Save the reset row.
      const r = await fetch("/api/base-year-resets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitRef: selectedOption.unitRef,
          propertyCode: selectedOption.propertyCode,
          occupantName: selectedOption.occupantName,
          originalBaseYear: currentBaseYear,
          newBaseYear,
          resetDate,
          notes: notes.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Save failed");
      setResets(j.resets ?? {});

      // 2) Also flip the tenant's base year to the current year.
      await fetch("/api/tenant-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitRef: selectedOption.unitRef, baseYear: newBaseYear }),
      });
      setTenantMeta({
        ...tenantMeta,
        [selectedOption.unitRef]: { ...(tenantMeta[selectedOption.unitRef] ?? {}), baseYear: newBaseYear },
      });

      // Reset form.
      setSelectedUnitRef("");
      setResetDate(firstOfMonthISO());
      setNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(unitRef: string) {
    if (!confirm("Remove this base year reset? The tenant's base year value won't change.")) return;
    const r = await fetch("/api/base-year-resets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitRef, clear: true }),
    });
    const j = await r.json();
    if (r.ok) setResets(j.resets ?? {});
  }

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Base Year Resets</h2>
          <div className="muted small" style={{ marginTop: 2 }}>
            Pick an office tenant, record the reset date, and the base year is flipped to the current year. The rent roll cell will be highlighted with the reset date in a tooltip.
          </div>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
      <>
      {!canEditBaseYear && (
        <div className="muted small" style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "rgba(15,23,42,0.04)", border: "1px solid var(--border)" }}>
          Read-only view. Only Nancy can record base-year resets.
        </div>
      )}
      {/* Form */}
      <fieldset disabled={!canEditBaseYear} style={{ border: "none", padding: 0, margin: 0, display: "contents" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 2.2fr) minmax(84px, 0.6fr) minmax(230px, 1.3fr) minmax(190px, 2fr) auto", gap: 10, alignItems: "flex-end", marginTop: 14, opacity: canEditBaseYear ? 1 : 0.55 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>Tenant (office only)</span>
          <select
            value={selectedUnitRef}
            onChange={(e) => setSelectedUnitRef(e.target.value)}
            style={selectStyle}
          >
            <option value="">— Pick a tenant —</option>
            {options.map((o) => (
              <option key={o.unitRef} value={o.unitRef}>{o.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>Current B/Y</span>
          <div style={{
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "rgba(15,23,42,0.025)",
            fontSize: 13, fontWeight: 600,
            color: currentBaseYear == null ? "var(--muted)" : "var(--text)",
          }}>
            {currentBaseYear ?? "—"}
          </div>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={fieldLabel}>Reset Month</span>
          <div style={{ display: "flex", gap: 6, minWidth: 0 }}>
            <select
              value={resetDate.slice(5, 7)}
              onChange={(e) => setResetDate(`${resetDate.slice(0, 4)}-${e.target.value}-01`)}
              style={{ ...selectStyle, flex: 1, minWidth: 0 }}
            >
              {MONTH_NAMES.map((mn, i) => (
                <option key={mn} value={String(i + 1).padStart(2, "0")}>{mn}</option>
              ))}
            </select>
            <select
              value={resetDate.slice(0, 4)}
              onChange={(e) => setResetDate(`${e.target.value}-${resetDate.slice(5, 7)}-01`)}
              style={{ ...selectStyle, width: 84, flexShrink: 0 }}
            >
              {RESET_YEARS.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>Notes (optional)</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Lease renewal — Suite 200"
            style={selectStyle}
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving || !selectedUnitRef}
          className="btn primary"
          style={{ fontSize: 13, padding: "9px 14px", fontWeight: 700 }}
        >
          {saving ? "Saving…" : "Record reset"}
        </button>
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>{error}</div>}
      </fieldset>

      {/* Reset impact for the selected tenant */}
      {selectedOption && (
        <ResetImpactPanel option={selectedOption} baseYearRaw={currentBaseYear} />
      )}

      {/* Table */}
      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
              <th style={{ padding: "8px 10px", fontWeight: 700 }}>PROP</th>
              <th style={{ padding: "8px 10px", fontWeight: 700 }}>UNIT</th>
              <th style={{ padding: "8px 10px", fontWeight: 700 }}>TENANT</th>
              <th style={{ padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>OLD B/Y</th>
              <th style={{ padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>NEW B/Y</th>
              <th style={{ padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>RESET DATE</th>
              <th style={{ padding: "8px 10px", fontWeight: 700 }}>NOTES</th>
              <th style={{ padding: "8px 10px", fontWeight: 700, width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {resetRows.length === 0 ? (
              <tr><td colSpan={8} className="muted small" style={{ padding: 14 }}>No base year resets recorded yet.</td></tr>
            ) : resetRows.map((r) => (
              <tr key={r.unitRef} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 10px" }}>
                  {r.propertyCode ? (
                    <code style={{ fontSize: 12, fontWeight: 700, color: "#0b4a7d" }}>{r.propertyCode}</code>
                  ) : <span className="muted small">—</span>}
                </td>
                <td style={{ padding: "10px 10px" }}><code style={{ fontSize: 12 }}>{r.unitRef}</code></td>
                <td style={{ padding: "10px 10px", fontWeight: 600 }}>{r.occupantName || <span className="muted small">—</span>}</td>
                <td style={{ padding: "10px 10px", color: "var(--muted)" }}>{r.originalBaseYear ?? "—"}</td>
                <td style={{ padding: "10px 10px", fontWeight: 600 }}>{r.newBaseYear}</td>
                <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>{fmtDate(r.resetDate)}</td>
                <td style={{ padding: "10px 10px" }}>{r.notes || <span className="muted small">—</span>}</td>
                <td style={{ padding: "10px 10px" }}>
                  {canEditBaseYear && (
                    <button
                      type="button"
                      onClick={() => remove(r.unitRef)}
                      style={{
                        background: "transparent", border: "1px solid rgba(220,38,38,0.35)",
                        color: "#b91c1c", fontSize: 12, fontWeight: 600,
                        padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
    </section>
  );
}

// ── Snow Base Year Exclusions ────────────────────────────────────────────────
// Exclude Snow Removal from a tenant's base year: from the effective month/year
// on, the snow line's base cost is treated as $0, so the tenant recovers its
// full pro-rata share of current-year snow (the effective year prorates by
// month). Every other base-year line is unaffected.
function SnowBaseExclusions({
  rentroll, tenantMeta, exclusions, setExclusions,
}: {
  rentroll: RentRollData | null;
  tenantMeta: Record<string, TenantMeta>;
  exclusions: Record<string, SnowBaseExclusion>;
  setExclusions: (next: Record<string, SnowBaseExclusion>) => void;
}) {
  const { user } = useUser();
  const canEdit = user.id === "nancy" || user.id === "admin";
  const options = useMemo(() => {
    type Opt = { unitRef: string; label: string; propertyCode: string; occupantName: string };
    if (!rentroll) return [] as Opt[];
    const out: Opt[] = [];
    for (const p of rentroll.properties) {
      if (!isOfficeCode(p.propertyCode)) continue;
      for (const u of p.units) {
        if (u.isVacant) continue;
        out.push({ unitRef: u.unitRef, propertyCode: p.propertyCode, occupantName: u.occupantName, label: `${u.unitRef} · ${u.occupantName}` });
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [rentroll]);

  const [open, setOpen] = useState(false);
  const [selectedUnitRef, setSelectedUnitRef] = useState<string>("");
  const now = new Date();
  const [effMonth, setEffMonth] = useState<number>(now.getMonth() + 1);
  const [effYear, setEffYear] = useState<number>(RESET_YEARS[0]);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = options.find((o) => o.unitRef === selectedUnitRef) ?? null;
  const currentBaseYear = selectedOption ? (tenantMeta[selectedOption.unitRef]?.baseYear ?? null) : null;
  const firstYearPct = Math.round(((13 - effMonth) / 12) * 100);

  const rows = useMemo(
    () => Object.values(exclusions).sort((a, b) => (b.effectiveYear - a.effectiveYear) || (b.effectiveMonth - a.effectiveMonth)),
    [exclusions],
  );

  async function save() {
    if (!selectedOption) { setError("Pick a tenant."); return; }
    const ok = window.confirm(
      `Exclude Snow Removal from the base year for ${selectedOption.occupantName} (${selectedOption.unitRef})?\n\n` +
      `• Effective ${MONTH_NAMES[effMonth - 1]} ${effYear}\n` +
      `• The snow line's base year becomes $0 (${effYear}: ~${firstYearPct}% prorated; 100% thereafter)\n` +
      `• Every other base-year line is unchanged\n\n` +
      `This increases the tenant's snow recovery from ${effYear} CAM reconciliations onward.`,
    );
    if (!ok) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/snow-base-exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitRef: selectedOption.unitRef,
          propertyCode: selectedOption.propertyCode,
          occupantName: selectedOption.occupantName,
          baseYear: currentBaseYear,
          effectiveMonth: effMonth,
          effectiveYear: effYear,
          notes: notes.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Save failed");
      setExclusions(j.exclusions ?? {});
      setSelectedUnitRef(""); setNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(unitRef: string) {
    if (!confirm("Remove this snow base-year exclusion? The tenant's snow will go back to a normal base-year stop.")) return;
    const r = await fetch("/api/snow-base-exclusions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitRef, clear: true }),
    });
    const j = await r.json();
    if (r.ok) setExclusions(j.exclusions ?? {});
  }

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Snow Base Year Exclusions</h2>
          <div className="muted small" style={{ marginTop: 2 }}>
            Pull Snow Removal out of a tenant&rsquo;s base year — the snow base becomes $0, so they pay their full pro-rata share of each year&rsquo;s snow (all other base-year lines stay in effect). Recovers more of the variable, unpredictable snow spend. A footnote is added to their CAM statement.
          </div>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
      <>
      {!canEdit && (
        <div className="muted small" style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "rgba(15,23,42,0.04)", border: "1px solid var(--border)" }}>
          Read-only view. Only Nancy can record snow base-year exclusions.
        </div>
      )}
      <fieldset disabled={!canEdit} style={{ border: "none", padding: 0, margin: 0, display: "contents" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 2.2fr) minmax(84px, 0.6fr) minmax(230px, 1.3fr) minmax(190px, 2fr) auto", gap: 10, alignItems: "flex-end", marginTop: 14, opacity: canEdit ? 1 : 0.55 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>Tenant (office only)</span>
          <select value={selectedUnitRef} onChange={(e) => setSelectedUnitRef(e.target.value)} style={selectStyle}>
            <option value="">— Pick a tenant —</option>
            {options.map((o) => <option key={o.unitRef} value={o.unitRef}>{o.label}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>Current B/Y</span>
          <div style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "rgba(15,23,42,0.025)", fontSize: 13, fontWeight: 600, color: currentBaseYear == null ? "var(--muted)" : "var(--text)" }}>
            {currentBaseYear ?? "—"}
          </div>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={fieldLabel}>Effective Month</span>
          <div style={{ display: "flex", gap: 6, minWidth: 0 }}>
            <select value={String(effMonth)} onChange={(e) => setEffMonth(Number(e.target.value))} style={{ ...selectStyle, flex: 1, minWidth: 0 }}>
              {MONTH_NAMES.map((mn, i) => <option key={mn} value={String(i + 1)}>{mn}</option>)}
            </select>
            <select value={String(effYear)} onChange={(e) => setEffYear(Number(e.target.value))} style={{ ...selectStyle, width: 84, flexShrink: 0 }}>
              {RESET_YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={fieldLabel}>Notes (optional)</span>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. High-snow recovery strategy" style={selectStyle} />
        </label>
        <button type="button" onClick={save} disabled={saving || !selectedUnitRef} className="btn primary" style={{ fontSize: 13, padding: "9px 14px", fontWeight: 700 }}>
          {saving ? "Saving…" : "Exclude snow"}
        </button>
      </div>
      {selectedOption && (
        <div className="small" style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, background: "rgba(11,74,125,0.05)", border: "1px solid rgba(11,74,125,0.18)", color: "var(--text)" }}>
          From <b>{MONTH_NAMES[effMonth - 1]} {effYear}</b>, {selectedOption.occupantName}&rsquo;s Snow Removal base year is treated as <b>$0</b> — they recover their full pro-rata share of snow.
          {" "}In {effYear} it&rsquo;s prorated to <b>~{firstYearPct}%</b> of the exclusion (snow from {MONTH_NAMES[effMonth - 1]}&ndash;December); every {effYear + 1}+ reconciliation is 100%.
        </div>
      )}
      {error && <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>{error}</div>}
      </fieldset>

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
              <th style={{ padding: "8px 10px", fontWeight: 700 }}>PROP</th>
              <th style={{ padding: "8px 10px", fontWeight: 700 }}>UNIT</th>
              <th style={{ padding: "8px 10px", fontWeight: 700 }}>TENANT</th>
              <th style={{ padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>B/Y</th>
              <th style={{ padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>EFFECTIVE</th>
              <th style={{ padding: "8px 10px", fontWeight: 700 }}>NOTES</th>
              <th style={{ padding: "8px 10px", fontWeight: 700, width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="muted small" style={{ padding: 14 }}>No snow base-year exclusions recorded yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.unitRef} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 10px" }}>{r.propertyCode ? <code style={{ fontSize: 12, fontWeight: 700, color: "#0b4a7d" }}>{r.propertyCode}</code> : <span className="muted small">—</span>}</td>
                <td style={{ padding: "10px 10px" }}><code style={{ fontSize: 12 }}>{r.unitRef}</code></td>
                <td style={{ padding: "10px 10px", fontWeight: 600 }}>{r.occupantName || <span className="muted small">—</span>}</td>
                <td style={{ padding: "10px 10px", color: "var(--muted)" }}>{r.baseYear ?? "—"}</td>
                <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>{MONTH_NAMES[Math.min(12, Math.max(1, r.effectiveMonth)) - 1]} {r.effectiveYear}</td>
                <td style={{ padding: "10px 10px" }}>{r.notes || <span className="muted small">—</span>}</td>
                <td style={{ padding: "10px 10px" }}>
                  {canEdit && (
                    <button type="button" onClick={() => remove(r.unitRef)} style={{ background: "transparent", border: "1px solid rgba(220,38,38,0.35)", color: "#b91c1c", fontSize: 12, fontWeight: 600, padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
    </section>
  );
}

// Income forgone by resetting the selected tenant's base year to the current
// year, measured per GL line against the most recent full year of expenses.
function ResetImpactPanel({
  option,
  baseYearRaw,
}: {
  option: { unitRef: string; propertyCode: string; occupantName: string; sqft: number };
  baseYearRaw: number | string | null;
}) {
  const expenses = SEED_EXPENSES[option.propertyCode] ?? null;
  const baseYear =
    typeof baseYearRaw === "number"
      ? baseYearRaw
      : typeof baseYearRaw === "string" && /^\d{4}$/.test(baseYearRaw.trim())
        ? Number(baseYearRaw.trim())
        : null;

  if (!expenses) {
    return (
      <div className="muted small" style={{ marginTop: 14 }}>
        No operating-expense history loaded for {option.propertyCode} — reset impact unavailable.
      </div>
    );
  }
  if (baseYear == null) {
    return (
      <div className="muted small" style={{ marginTop: 14 }}>
        {option.occupantName} has no numeric base year — reset impact unavailable.
      </div>
    );
  }

  const latest = latestExpenseYear(expenses);
  if (latest == null) return null;

  const cam = reimbursement(expenses, option.sqft, baseYear, latest, "opex");
  const total = reimbursement(expenses, option.sqft, baseYear, latest, "opexRet");
  const ret = cam != null && total != null ? total - cam : null;
  const fmt = (n: number | null) =>
    n != null ? "$" + Math.round(n).toLocaleString("en-US") : "—";
  const fmtPsf = (n: number | null) =>
    n != null && option.sqft > 0
      ? "$" + (n / option.sqft).toFixed(2) + "/sf"
      : "—";

  return (
    <div style={{ marginTop: 16 }}>
      <span style={fieldLabel}>Reset impact — annual income forgone</span>
      <div className="pills" style={{ marginTop: 6 }}>
        <StatPill label="CAM loss" value={fmt(cam)} sub={fmtPsf(cam)} />
        <StatPill label="RET loss" value={fmt(ret)} sub={fmtPsf(ret)} />
        <StatPill
          label="Total loss"
          value={fmt(total)}
          sub={fmtPsf(total)}
          accent={total ? "#b91c1c" : undefined}
        />
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>
        Recovery the landlord would forgo by resetting {option.occupantName}&rsquo;s
        base year ({baseYear}) to the current year — computed per GL line on the
        95%-grossed-up Op Ex and RE taxes against {latest} expenses.
      </div>
    </div>
  );
}

// ── Snow Removal Cost Estimator ──────────────────────────────────────────────
// Answers "what's this year's snow cost per building, and what would a
// prospective tenant's proportionate share be?" at a glance. Current-year cost
// is pulled LIVE from the imported operating statements (Snow Removal, GL
// 6370-8502, YTD through the last posted month); prior years come from the
// operating-expense workbook. A tenant's share = their pro-rata SF share of the
// building × that year's building snow cost.
type SnowBuilding = {
  code: string;
  name: string;
  fund: "JV III" | "NI LLC";
  rentableSqft: number;
  history: Record<string, number>;
  current: { ytd: number; throughPeriod: number; throughLabel: string } | null;
};

function money0(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function SnowCostEstimator({
  rentroll,
  tenantMeta,
  exclusions,
}: {
  rentroll: RentRollData | null;
  tenantMeta: Record<string, TenantMeta>;
  exclusions: Record<string, SnowBaseExclusion>;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ currentYear: number; buildings: SnowBuilding[] } | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Two modes: an EXISTING tenant (auto-fills their building, SF and base year,
  // and shows the actual base-year snow recovery) or a PROSPECTIVE tenant (enter
  // SF for the gross pro-rata share of the building's snow).
  const [mode, setMode] = useState<"existing" | "prospective">("existing");
  const [tenantUnitRef, setTenantUnitRef] = useState<string>("");
  const [calcCode, setCalcCode] = useState<string>("");
  const [tenantSqft, setTenantSqft] = useState<string>("");
  const [basisYear, setBasisYear] = useState<string>(""); // "" = current-year YTD

  useEffect(() => {
    fetch("/api/snow-costs")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j))
      .catch(() => setData(null))
      .finally(() => setLoaded(true));
  }, []);

  const currentYear = data?.currentYear ?? new Date().getFullYear();
  const buildings = data?.buildings ?? [];

  // Office tenants (occupied) for the existing-tenant picker.
  const tenantOptions = useMemo(() => {
    type Opt = { unitRef: string; propertyCode: string; occupantName: string; sqft: number; label: string };
    if (!rentroll) return [] as Opt[];
    const out: Opt[] = [];
    for (const p of rentroll.properties) {
      if (!isOfficeCode(p.propertyCode)) continue;
      for (const u of p.units) {
        if (u.isVacant) continue;
        out.push({ unitRef: u.unitRef, propertyCode: p.propertyCode, occupantName: u.occupantName, sqft: u.sqft, label: `${u.unitRef} · ${u.occupantName}` });
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [rentroll]);

  // The two most recent closed years present in the workbook, for context columns.
  const historyYears = useMemo(() => {
    const set = new Set<number>();
    for (const b of buildings) for (const y of Object.keys(b.history)) set.add(Number(y));
    return [...set].filter((y) => y < currentYear).sort((a, b) => b - a);
  }, [buildings, currentYear]);
  const contextYears = historyYears.slice(0, 2);
  const anyCurrent = buildings.some((b) => b.current && b.current.ytd !== 0);

  const snowFor = (b: SnowBuilding, year: number): number =>
    year === currentYear ? b.current?.ytd ?? 0 : b.history[String(year)] ?? 0;

  // ── Existing-tenant selection ──
  const tenant = tenantOptions.find((t) => t.unitRef === tenantUnitRef) ?? null;
  const tenantBuilding = tenant ? buildings.find((b) => b.code === tenant.propertyCode) ?? null : null;
  const tenantBaseYearRaw = tenant ? tenantMeta[tenant.unitRef]?.baseYear ?? null : null;
  const tenantBaseYear = tenantBaseYearRaw != null && !Number.isNaN(Number(tenantBaseYearRaw)) ? Number(tenantBaseYearRaw) : null;
  const snowExcluded = tenant ? !!exclusions[tenant.unitRef] && (exclusions[tenant.unitRef].effectiveYear ?? currentYear) <= currentYear : false;
  const tProRataPct = tenant && tenantBuilding && tenantBuilding.rentableSqft > 0 ? (tenant.sqft / tenantBuilding.rentableSqft) * 100 : 0;
  const tCurrentSnow = tenantBuilding ? snowFor(tenantBuilding, currentYear) : 0;
  // Base-year snow: $0 when snow is excluded from the base year, else the
  // building's snow in the tenant's base year (floored at the recovery step).
  const tBaseSnow = snowExcluded ? 0 : tenantBuilding && tenantBaseYear != null ? tenantBuilding.history[String(tenantBaseYear)] ?? 0 : 0;
  const tRecoverable = Math.max(0, tCurrentSnow - tBaseSnow);
  const tGrossShare = tCurrentSnow * (tProRataPct / 100);
  const tRecovery = tRecoverable * (tProRataPct / 100);
  const currentThroughLabel = tenantBuilding?.current?.throughLabel;

  // ── Prospective-tenant selection ──
  const selected = buildings.find((b) => b.code === calcCode) ?? null;
  const basisYearNum = basisYear ? Number(basisYear) : currentYear;
  const sqftNum = Number(tenantSqft) || 0;
  const proRataPct = selected && selected.rentableSqft > 0 ? (sqftNum / selected.rentableSqft) * 100 : 0;
  const buildingSnow = selected ? snowFor(selected, basisYearNum) : 0;
  const tenantShare = buildingSnow * (proRataPct / 100);
  const basisIsCurrent = basisYearNum === currentYear;
  const currentThrough = selected?.current?.throughLabel;

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Snow Removal Cost Estimator</h2>
          <div className="muted small" style={{ marginTop: 2 }}>
            This year&rsquo;s snow cost per building — pulled live from the operating statements (YTD through the last posted month) — plus a prospective-tenant proportionate-share calculator. Prior years come from the operating-expense workbook.
          </div>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          {!loaded ? (
            <div className="muted small" style={{ marginTop: 14 }}>Loading snow costs…</div>
          ) : (
            <>
              {!anyCurrent && (
                <div className="small" style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, background: "rgba(180,83,9,0.07)", border: "1px solid rgba(180,83,9,0.25)", color: "#9a3412" }}>
                  No {currentYear} operating-statement GL is imported yet, so this year&rsquo;s snow-to-date isn&rsquo;t available. Import the {currentYear} monthly GLs on Operating Statements and it will populate here. The prior-year columns below still let you estimate a share.
                </div>
              )}

              {/* Per-building snow cost table */}
              <div style={{ marginTop: 14, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                      <th style={{ padding: "8px 10px", fontWeight: 700 }}>BUILDING</th>
                      <th style={{ padding: "8px 10px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>RENTABLE SF</th>
                      <th style={{ padding: "8px 10px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", color: "#0b4a7d" }}>
                        {currentYear} YTD{anyCurrent ? "" : " *"}
                      </th>
                      {contextYears.map((y) => (
                        <th key={y} style={{ padding: "8px 10px", fontWeight: 700, textAlign: "right" }}>{y}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {buildings.map((b) => (
                      <tr key={b.code} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "9px 10px" }}>
                          <code style={{ fontSize: 12, fontWeight: 700, color: "#0b4a7d" }}>{b.code}</code>{" "}
                          <span style={{ fontWeight: 600 }}>{b.name}</span>{" "}
                          <span className="muted" style={{ fontSize: 11 }}>· {b.fund}</span>
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "right" }}>{b.rentableSqft.toLocaleString("en-US")}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, color: "#0b4a7d", whiteSpace: "nowrap" }}>
                          {b.current ? money0(b.current.ytd) : <span className="muted">—</span>}
                          {b.current && <span className="muted" style={{ fontSize: 10, fontWeight: 600 }}> · thru {b.current.throughLabel}</span>}
                        </td>
                        {contextYears.map((y) => (
                          <td key={y} style={{ padding: "9px 10px", textAlign: "right" }}>
                            {b.history[String(y)] != null ? money0(b.history[String(y)]) : <span className="muted">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!anyCurrent && (
                <div className="muted small" style={{ marginTop: 6 }}>* No {currentYear} GL imported yet.</div>
              )}

              {/* Proportionate-share calculator */}
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <span style={fieldLabel}>Snow share for:</span>
                  {(["existing", "prospective"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 999,
                        border: `1px solid ${mode === m ? "#0b4a7d" : "var(--border)"}`,
                        background: mode === m ? "#0b4a7d" : "var(--card)",
                        color: mode === m ? "#fff" : "var(--text)", cursor: "pointer",
                      }}
                    >
                      {m === "existing" ? "Existing tenant" : "Prospective tenant"}
                    </button>
                  ))}
                </div>

                {mode === "existing" ? (
                  <>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 420 }}>
                      <span style={fieldLabel}>Tenant (office)</span>
                      <select value={tenantUnitRef} onChange={(e) => setTenantUnitRef(e.target.value)} style={selectStyle}>
                        <option value="">— Pick a tenant —</option>
                        {tenantOptions.map((t) => <option key={t.unitRef} value={t.unitRef}>{t.label}</option>)}
                      </select>
                    </label>

                    {tenant && tenantBuilding && (
                      <div style={{ marginTop: 14 }}>
                        <div className="pills">
                          <StatPill label="Pro-rata share" value={`${tProRataPct.toFixed(2)}%`} />
                          <StatPill label={`${currentYear} building snow${currentThroughLabel ? ` · thru ${currentThroughLabel}` : ""}`} value={money0(tCurrentSnow)} />
                          <StatPill label={snowExcluded ? "Base year (snow excluded)" : `Base year snow (${tenantBaseYear ?? "—"})`} value={money0(tBaseSnow)} />
                          <StatPill label={`${currentYear} snow recovery`} value={money0(tRecovery)} accent="#0b4a7d" />
                        </div>
                        <div className="small" style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, background: "rgba(11,74,125,0.05)", border: "1px solid rgba(11,74,125,0.18)", color: "var(--text)" }}>
                          <b>{tenant.occupantName}</b> ({tenant.sqft.toLocaleString("en-US")} SF) carries <b>{tProRataPct.toFixed(2)}%</b> of {tenantBuilding.code} {tenantBuilding.name}.
                          {" "}Their gross share of {currentYear} snow{currentThroughLabel ? ` (through ${currentThroughLabel})` : ""} is <b>{money0(tGrossShare)}</b>.
                          {" "}
                          {snowExcluded ? (
                            <>Snow is <b>excluded from their base year</b> (base $0), so they recover the full share: <b>{money0(tRecovery)}</b>.</>
                          ) : tenantBaseYear != null ? (
                            <>Netting their {tenantBaseYear} base-year snow of <b>{money0(tBaseSnow)}</b> (recovery only on the increase over base), the {currentYear} snow recovery is <b>{money0(tRecovery)}</b>.</>
                          ) : (
                            <>No base year is recorded for this tenant, so the recovery shown assumes a $0 base. Record their base year to net it out.</>
                          )}
                          {!tenantBuilding.current && <> No {currentYear} GL is imported for this building yet — figures use $0 for {currentYear} snow until it&rsquo;s imported.</>}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) minmax(130px, 1fr) minmax(150px, 1fr)", gap: 10, alignItems: "flex-end" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={fieldLabel}>Building</span>
                        <select value={calcCode} onChange={(e) => setCalcCode(e.target.value)} style={selectStyle}>
                          <option value="">— Pick a building —</option>
                          {buildings.map((b) => (
                            <option key={b.code} value={b.code}>{b.code} · {b.name}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={fieldLabel}>Prospective SF</span>
                        <input
                          type="number"
                          value={tenantSqft}
                          onChange={(e) => setTenantSqft(e.target.value)}
                          placeholder="e.g. 5,000"
                          style={selectStyle}
                        />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={fieldLabel}>Cost basis year</span>
                        <select value={basisYear} onChange={(e) => setBasisYear(e.target.value)} style={selectStyle}>
                          <option value="">{currentYear} YTD (live)</option>
                          {historyYears.map((y) => (
                            <option key={y} value={String(y)}>{y} (full year)</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {selected && sqftNum > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div className="pills">
                          <StatPill label="Pro-rata share" value={`${proRataPct.toFixed(2)}%`} />
                          <StatPill
                            label={basisIsCurrent ? `${currentYear} building snow${currentThrough ? ` · thru ${currentThrough}` : ""}` : `${basisYearNum} building snow`}
                            value={money0(buildingSnow)}
                          />
                          <StatPill label="Tenant's snow share" value={money0(tenantShare)} accent="#0b4a7d" />
                        </div>
                        <div className="small" style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, background: "rgba(11,74,125,0.05)", border: "1px solid rgba(11,74,125,0.18)", color: "var(--text)" }}>
                          A <b>{sqftNum.toLocaleString("en-US")} SF</b> tenant in <b>{selected.code} {selected.name}</b> ({selected.rentableSqft.toLocaleString("en-US")} SF) carries <b>{proRataPct.toFixed(2)}%</b> of the building.
                          {" "}At {basisIsCurrent ? `${currentYear} snow-to-date${currentThrough ? ` (through ${currentThrough})` : ""}` : `${basisYearNum} snow`} of <b>{money0(buildingSnow)}</b>, their proportionate share is <b>{money0(tenantShare)}</b>.
                          {" "}A new tenant typically has no base-year offset in year one, so this gross share is the exposure to quote.
                          {basisIsCurrent && !selected.current && (
                            <> No {currentYear} GL is imported for this building yet — pick a prior full year, or import the {currentYear} GL.</>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

const fieldLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)",
};

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
