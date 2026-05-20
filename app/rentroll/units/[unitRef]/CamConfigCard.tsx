"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { MultiSelect } from "@/app/components/MultiSelect";
import { StatPill } from "@/app/components/Pill";
import { AutosaveStatus, useAutosave } from "@/app/components/useAutosave";
import {
  CAM_CATEGORIES,
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

// PRS cell: a narrow % input with an inline "%" affix and the implied
// building GLA right beside it — e.g. "[5.25] % (95,238 SF)". The whole
// group is centered within the grid cell.
function PrsInput({
  value,
  onChange,
  disabled,
  unitSqft,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  unitSqft: number;
}) {
  const [text, setText] = useState<string>(value == null ? "" : String(value));
  useEffect(() => { setText(value == null ? "" : String(value)); }, [value]);

  const gla = value && value > 0 && unitSqft > 0
    ? Math.round(unitSqft / (value / 100))
    : null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 6, whiteSpace: "nowrap",
    }}>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        max={100}
        value={text}
        placeholder="—"
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
          width: 72,
          textAlign: "right",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
      <span style={{
        fontSize: 13, fontWeight: 700, color: "var(--text)",
        opacity: disabled ? 0.5 : 1,
      }}>%</span>
      {gla != null && (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          ({gla.toLocaleString()} SF)
        </span>
      )}
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
    <div style={{ display: "flex", justifyContent: "center" }}>
      <select
        value={intValue}
        disabled={disabled}
        onChange={(e) => {
          const t = e.target.value;
          onChange(t === "" ? null : Number(t));
        }}
        style={{
          ...inputStyle,
          width: 110,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          textAlign: "center",
          textAlignLast: "center",
          appearance: "auto",
        }}
      >
        <option value="">—</option>
        {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n}%</option>
        ))}
      </select>
    </div>
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
  unitSqft,
  opexMonth,
  reTaxMonth,
  otherMonth,
}: {
  unitRef: string;
  /** True PRS for the unit (unit sqft / building sqft × 100), used to
   *  pre-fill the PRS columns when no override is stored. */
  actualPrs: number | null;
  /** The unit's square footage. Used to compute the building SF implied
   *  by each entered PRS (`unitSqft / (prs / 100)`). */
  unitSqft: number;
  /** Monthly NNN breakouts pulled off the rent roll. Each renders as a
   *  pill above the table when non-zero. */
  opexMonth: number;
  reTaxMonth: number;
  otherMonth: number;
}) {
  const [config, setConfig] = useState<CamConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const api = `/api/cam-config/${encodeURIComponent(unitRef)}`;

  const { saving, savedFlash, error, schedule } = useAutosave<CamConfig>({
    save: async (snapshot) => {
      const res = await fetch(api, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
    },
    keepalive: (snapshot) => {
      void fetch(api, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
        keepalive: true,
      }).catch(() => { /* ignore */ });
    },
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(api)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.config) return;
        // Hydrate any unset stipulated-PRS field with the unit's actual
        // PRS so the user sees a sensible starting value. Doesn't trigger
        // a save — only real edits do.
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
    setConfig((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      schedule(next);
      return next;
    });
  }

  function updateCategory(cat: CamCategory, patch: Partial<CamCategoryConfig>) {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [cat]: { ...prev[cat], ...patch } };
      schedule(next);
      return next;
    });
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
        <AutosaveStatus saving={saving} savedFlash={savedFlash} />
      </div>

      {error && (
        <div style={{
          margin: "8px 0", padding: "8px 10px", borderRadius: 8,
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)",
          color: "#b91c1c", fontSize: 12, fontWeight: 600,
        }}>{error}</div>
      )}

      {/* Monthly NNN breakouts pulled from the rent roll — these reflect
          the 2026 budgeted expense schedule, so they're estimates until
          the year-end reconciliation. Read-only here; editing happens
          upstream in the Excel import. */}
      {(opexMonth > 0 || reTaxMonth > 0 || otherMonth > 0) && (
        <div className="pills" style={{ marginTop: 0, marginBottom: 14 }}>
          {opexMonth > 0  && <StatPill label="Est. CAM / mo" value={money(opexMonth)}  sub="2026 budget" />}
          {reTaxMonth > 0 && <StatPill label="Est. RET / mo" value={money(reTaxMonth)} sub="2026 budget" />}
          {otherMonth > 0 && <StatPill label="Est. INS / mo" value={money(otherMonth)} sub="2026 budget" />}
        </div>
      )}

      <div style={{ opacity: isGross ? 0.45 : 1, pointerEvents: isGross ? "none" : "auto" }}>
        {/* Single 4-column / 2-row grid: CAM Admin Fee on the left, then
            CAM PRS / INS PRS / RET PRS. Row 1 headers, row 2 values —
            PRS cells render "[%] (NN,NNN SF)" inline; admin fee is a
            centered dropdown. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(140px, 0.7fr) repeat(3, minmax(0, 1fr))",
          rowGap: 6,
          columnGap: 18,
          alignItems: "center",
        }}>
          {/* Row 1: headers */}
          <ColumnHeader>CAM Admin Fee</ColumnHeader>
          <ColumnHeader>CAM PRS</ColumnHeader>
          <ColumnHeader>INS PRS</ColumnHeader>
          <ColumnHeader>RET PRS</ColumnHeader>

          {/* Row 2: inputs — PRS cells render "% (NN SF)" inline. */}
          <AdminFeeSelect
            value={config.cam.adminFeePct}
            onChange={(v) => updateCategory("cam", { adminFeePct: v })}
            disabled={isGross}
          />
          {CAM_CATEGORIES.map((cat) => (
            <PrsInput
              key={`v-${cat}`}
              value={config[cat].stipulatedPrs}
              onChange={(v) => updateCategory(cat, { stipulatedPrs: v })}
              unitSqft={unitSqft}
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

      {/* Lease modifiers — plain inline checkboxes at the bottom, both
          on one line. Both off-by-default; the reconciliation table above
          assumes NNN with admin on every line and no excluded lines
          unless turned on. */}
      <div style={{
        marginTop: 18, paddingTop: 14,
        borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 24px",
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={isGross}
            onChange={(e) => update({ grossLease: e.target.checked })}
            style={{ width: 15, height: 15, cursor: "pointer" }}
          />
          <span style={{ fontWeight: 600, color: "var(--text)" }}>Gross Lease</span>
        </label>
        <label style={{
          display: "flex", alignItems: "center", gap: 8, fontSize: 13,
          cursor: isGross ? "not-allowed" : "pointer",
          opacity: isGross ? 0.5 : 1,
        }}>
          <input
            type="checkbox"
            checked={hasExclusions}
            disabled={isGross}
            onChange={(e) => update({ hasExclusions: e.target.checked })}
            style={{ width: 15, height: 15, cursor: "pointer" }}
          />
          <span style={{ fontWeight: 600, color: "var(--text)" }}>Lease Has Exclusions</span>
        </label>
      </div>
    </div>
  );
}
