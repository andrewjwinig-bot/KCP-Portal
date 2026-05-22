"use client";

import { useEffect, useMemo, useState } from "react";
import type { RentRollData, RentRollUnit } from "../../../lib/rentroll/parseRentRollExcel";
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
        <div className="card"><div className="muted small">Loading rent roll…</div></div>
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
    setSaving(true); setError(null);
    try {
      const newBaseYear = new Date().getFullYear();
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
      {/* Form */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 2.2fr) minmax(84px, 0.6fr) minmax(230px, 1.3fr) minmax(190px, 2fr) auto", gap: 10, alignItems: "flex-end", marginTop: 14 }}>
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
                  <button
                    type="button"
                    onClick={() => remove(r.unitRef)}
                    style={{
                      background: "transparent", border: "1px solid rgba(220,38,38,0.35)",
                      color: "#b91c1c", fontSize: 12, fontWeight: 600,
                      padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >Remove</button>
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
