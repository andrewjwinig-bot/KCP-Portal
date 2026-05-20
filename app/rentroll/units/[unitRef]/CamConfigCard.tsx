"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { MultiSelect } from "@/app/components/MultiSelect";
import { StatPill } from "@/app/components/Pill";
import {
  CAM_CATEGORIES,
  CAM_CATEGORY_LABELS,
  CAM_LINE_ITEMS,
  type CamCategory,
  type CamCategoryConfig,
  type CamConfig,
} from "@/lib/cam/config";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--card)", color: "var(--text)", outline: "none",
};

function ColumnHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
      textTransform: "uppercase", color: "var(--muted)",
      textAlign: "center",
      paddingBottom: 6,
      borderBottom: "1px solid var(--border)",
    }}>
      {children}
    </div>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 13, fontWeight: 700, color: "var(--text)",
      alignSelf: "center",
    }}>
      {children}
    </span>
  );
}

// Numeric % input with a trailing "%" affordance.
function PctInput({
  value,
  onChange,
  disabled,
  placeholder = "—",
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  // Track local text so users can clear the field while typing.
  const [text, setText] = useState<string>(value == null ? "" : String(value));

  useEffect(() => {
    setText(value == null ? "" : String(value));
  }, [value]);

  return (
    <div style={{ position: "relative" }}>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        max={100}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t === "") { onChange(null); return; }
          const n = Number(t);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          if (text === "") return;
          const n = Number(text);
          if (!Number.isFinite(n)) { setText(value == null ? "" : String(value)); return; }
          const clamped = Math.max(0, Math.min(100, Math.round(n * 100) / 100));
          setText(String(clamped));
          onChange(clamped);
        }}
        style={{
          ...inputStyle,
          paddingRight: 26,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "text",
          textAlign: "right",
        }}
      />
      <span style={{
        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
        fontSize: 12, fontWeight: 600, color: "var(--muted)", pointerEvents: "none",
      }}>%</span>
    </div>
  );
}

// Admin-fee dropdown — whole percentages 1–15 plus an empty "—" option
// meaning "no admin fee". Matches the only values that show up on real
// retail leases (0/5/10 are the common ones; up to 15 covers the outliers).
function AdminFeeSelect({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  disabled?: boolean;
}) {
  // Coerce stored decimals (legacy values) to the closest whole number
  // so the dropdown still shows a matching option.
  const intValue = value == null ? "" : String(Math.round(value));
  return (
    <select
      value={intValue}
      disabled={disabled}
      onChange={(e) => {
        const t = e.target.value;
        onChange(t === "" ? null : Number(t));
      }}
      style={{
        ...inputStyle,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        textAlign: "right",
        appearance: "auto",
      }}
    >
      <option value="">—</option>
      {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>{n}%</option>
      ))}
    </select>
  );
}

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
}

export default function CamConfigCard({
  unitRef,
  actualPrs,
  opexMonth,
  reTaxMonth,
  otherMonth,
}: {
  unitRef: string;
  /** True PRS for the unit (unit sqft / building sqft × 100), used to
   *  pre-fill the Stipulated PRS column when no override is stored. */
  actualPrs: number | null;
  /** Monthly NNN breakouts pulled off the rent roll. Each renders as a
   *  pill above the table when non-zero. */
  opexMonth: number;
  reTaxMonth: number;
  otherMonth: number;
}) {
  const [config, setConfig] = useState<CamConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = `/api/cam-config/${encodeURIComponent(unitRef)}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(api)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.config) return;
        // Hydrate any unset stipulated-PRS field with the unit's actual
        // PRS so the user sees a sensible starting value. Doesn't mark
        // the form dirty — the value only persists if they touch
        // something and click Save.
        const c: CamConfig = j.config;
        if (actualPrs != null) {
          for (const cat of ["cam", "ins", "ret"] as const) {
            if (c[cat].stipulatedPrs == null) {
              c[cat] = { ...c[cat], stipulatedPrs: actualPrs };
            }
          }
        }
        setConfig(c);
      })
      .catch(() => { /* leave null */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, actualPrs]);

  function update(patch: Partial<CamConfig>) {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
    setSavedFlash(false);
  }

  function updateCategory(cat: CamCategory, patch: Partial<CamCategoryConfig>) {
    setConfig((prev) => (prev ? { ...prev, [cat]: { ...prev[cat], ...patch } } : prev));
    setDirty(true);
    setSavedFlash(false);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(api, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setConfig(j.config);
      setDirty(false);
      setSavedFlash(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Build the line-item option set: standard list plus any custom lines
  // already saved on this tenant (so legacy values aren't dropped from
  // the picker).
  const lineOptions = useMemo(() => {
    const set = new Set<string>(CAM_LINE_ITEMS);
    for (const v of config?.camAdminLines ?? []) set.add(v);
    for (const v of config?.camExcludedLines ?? []) set.add(v);
    return Array.from(set);
  }, [config?.camAdminLines, config?.camExcludedLines]);

  if (loading) {
    return (
      <div className="card">
        <SectionLabel>CAM / INS / RET</SectionLabel>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="card">
        <SectionLabel>CAM / INS / RET</SectionLabel>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Couldn’t load CAM configuration.</div>
      </div>
    );
  }

  const isGross = config.grossLease;
  const hasExclusions = config.hasExclusions;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SectionLabel>CAM / INS / RET</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {savedFlash && !dirty && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "#15803d" }}>✓ Saved</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="btn primary"
            style={{ fontSize: 13, padding: "7px 16px", fontWeight: 700, opacity: !dirty ? 0.5 : 1 }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          margin: "8px 0", padding: "8px 10px", borderRadius: 8,
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)",
          color: "#b91c1c", fontSize: 12, fontWeight: 600,
        }}>{error}</div>
      )}

      {/* Monthly NNN breakouts pulled from the rent roll. Read-only —
          editing happens upstream in the Excel import. */}
      {(opexMonth > 0 || reTaxMonth > 0 || otherMonth > 0) && (
        <div className="pills" style={{ marginTop: 0, marginBottom: 14 }}>
          {opexMonth > 0   && <StatPill label="CAM / mo"    value={money(opexMonth)} />}
          {reTaxMonth > 0  && <StatPill label="RE Tax / mo" value={money(reTaxMonth)} />}
          {otherMonth > 0  && <StatPill label="Other / mo"  value={money(otherMonth)} />}
        </div>
      )}

      {/* Lease modifiers — both off-by-default. The reconciliation table
          assumes NNN with admin on every line and no excluded lines unless
          one of these is turned on. */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
        marginBottom: 14,
      }}>
        <label style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 12px",
          border: "1px solid var(--border)", borderRadius: 10,
          background: isGross ? "rgba(11,74,125,0.06)" : "rgba(15,23,42,0.015)",
          cursor: "pointer",
        }}>
          <input
            type="checkbox"
            checked={isGross}
            onChange={(e) => update({ grossLease: e.target.checked })}
            style={{ width: 16, height: 16, cursor: "pointer", marginTop: 2 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              Gross lease <span style={{ color: "var(--muted)", fontWeight: 500 }}>(default: NNN)</span>
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              Tenant pays gross rent — no CAM, INS, or RET reconciliation.
            </span>
          </div>
        </label>

        <label style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 12px",
          border: "1px solid var(--border)", borderRadius: 10,
          background: hasExclusions && !isGross ? "rgba(11,74,125,0.06)" : "rgba(15,23,42,0.015)",
          cursor: isGross ? "not-allowed" : "pointer",
          opacity: isGross ? 0.45 : 1,
        }}>
          <input
            type="checkbox"
            checked={hasExclusions}
            disabled={isGross}
            onChange={(e) => update({ hasExclusions: e.target.checked })}
            style={{ width: 16, height: 16, cursor: "pointer", marginTop: 2 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              Lease has exclusions
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              Admin fee applies only to some CAM lines, or some CAM lines aren’t billed to this tenant.
            </span>
          </div>
        </label>
      </div>

      <div style={{ opacity: isGross ? 0.45 : 1, pointerEvents: isGross ? "none" : "auto" }}>
        {/* Grid: rows = items, columns = CAM / INS / RET */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "160px repeat(3, minmax(0, 1fr))",
          gap: "10px 16px",
          alignItems: "center",
        }}>
          {/* Header row */}
          <div />
          {CAM_CATEGORIES.map((cat) => (
            <ColumnHeader key={cat}>{CAM_CATEGORY_LABELS[cat]}</ColumnHeader>
          ))}

          {/* Stipulated PRS row */}
          <RowLabel>Stipulated PRS</RowLabel>
          {CAM_CATEGORIES.map((cat) => (
            <PctInput
              key={cat}
              value={config[cat].stipulatedPrs}
              onChange={(v) => updateCategory(cat, { stipulatedPrs: v })}
              disabled={isGross}
            />
          ))}

          {/* Admin Fee row (whole-% dropdown, 1–15) */}
          <RowLabel>Admin Fee</RowLabel>
          {CAM_CATEGORIES.map((cat) => (
            <AdminFeeSelect
              key={cat}
              value={config[cat].adminFeePct}
              onChange={(v) => updateCategory(cat, { adminFeePct: v })}
              disabled={isGross}
            />
          ))}
        </div>

        {/* CAM-only: admin scope + excluded lines. Hidden unless the
            "Lease has exclusions" box is checked — most retail tenants
            don't have either of these carve-outs. */}
        {hasExclusions && (
        <div style={{
          marginTop: 18, paddingTop: 14,
          borderTop: "1px solid var(--border)",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            color: "var(--muted)", textTransform: "uppercase",
          }}>
            CAM Line Items
          </div>

          {/* Admin scope */}
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "6px 20px", alignItems: "start" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", paddingTop: 6 }}>
              Admin Fee applies to
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {([
                  { value: "all", label: "All CAM lines" },
                  { value: "select", label: "Select lines only" },
                ] as const).map((opt) => {
                  const active = config.camAdminScope === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isGross}
                      onClick={() => update({ camAdminScope: opt.value })}
                      style={{
                        fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
                        padding: "5px 12px", borderRadius: 999,
                        border: `1px solid ${active ? "rgba(11,74,125,0.4)" : "var(--border)"}`,
                        background: active ? "rgba(11,74,125,0.10)" : "transparent",
                        color: active ? "#0b4a7d" : "var(--muted)",
                        cursor: isGross ? "not-allowed" : "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {config.camAdminScope === "select" && (
                <MultiSelect
                  options={lineOptions}
                  selected={config.camAdminLines}
                  onChange={(next) => update({ camAdminLines: next })}
                  placeholder="Pick the CAM lines that carry an admin fee…"
                  disabled={isGross}
                />
              )}
            </div>
          </div>

          {/* Excluded lines */}
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "6px 20px", alignItems: "start" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", paddingTop: 6 }}>
              Excluded CAM lines
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                CAM lines this tenant is not billed for under their lease.
              </span>
              <MultiSelect
                options={lineOptions}
                selected={config.camExcludedLines}
                onChange={(next) => update({ camExcludedLines: next })}
                placeholder="Pick lines to exclude from this tenant’s CAM…"
                disabled={isGross}
              />
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
