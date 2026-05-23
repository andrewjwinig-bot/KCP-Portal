"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { MultiSelect } from "@/app/components/MultiSelect";
import { AutosaveStatus, useAutosave } from "@/app/components/useAutosave";
import {
  CAM_CATEGORIES,
  CAM_CATEGORY_LABELS,
  CAM_LINE_ITEMS,
  type CamCategory,
  type CamCategoryConfig,
  type CamConfig,
} from "@/lib/cam/config";
import {
  getCategoryDenominator,
  getCategoryFootnote,
  isTenantExcluded,
} from "@/lib/cam/propertyRules";

// Big editable tile for one PRS category — matches the visual weight of
// a StatPill (border, padded, label below, optional sub line). The PRS
// value is rendered as a wide input so users can edit in place; the
// denominator (building SF this category's PRS is computed against) shows
// underneath as the sub-line.
function PrsTile({
  value,
  onChange,
  disabled,
  denominator,
  label,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  denominator: number;
  label: string;
}) {
  const [text, setText] = useState<string>(value == null ? "" : String(value));
  useEffect(() => { setText(value == null ? "" : String(value)); }, [value]);

  return (
    <div style={tileStyle}>
      <span style={tileLabelStyle}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
        <input
          type="number"
          inputMode="decimal"
          step="0.001"
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
            const clamped = Math.max(0, Math.min(100, Math.round(n * 1000) / 1000));
            setText(String(clamped));
            onChange(clamped);
          }}
          style={tileInputStyle(disabled, 120)}
        />
        <span style={{
          fontSize: 18, fontWeight: 700, color: "var(--muted)",
          opacity: disabled ? 0.5 : 1,
        }}>%</span>
      </div>
      {denominator > 0 && (
        <span style={tileSubStyle}>({denominator.toLocaleString()} SF)</span>
      )}
    </div>
  );
}

// Big editable tile for the CAM Admin Fee dropdown — same visual weight
// as the PRS tiles to its right.
function AdminFeeTile({
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
    <div style={tileStyle}>
      <span style={tileLabelStyle}>CAM Admin Fee</span>
      <select
        value={intValue}
        disabled={disabled}
        onChange={(e) => {
          const t = e.target.value;
          onChange(t === "" ? null : Number(t));
        }}
        style={{
          ...tileInputStyle(disabled, 120),
          textAlign: "center",
          textAlignLast: "center",
          appearance: "auto",
          cursor: disabled ? "not-allowed" : "pointer",
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

// ── Shared big-tile styling so PrsTile + AdminFeeTile look identical ────
const tileStyle: React.CSSProperties = {
  flex: "1 1 0", minWidth: 0,
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  padding: "13px 16px 11px",
  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
  whiteSpace: "nowrap",
  background: "var(--card)",
};
const tileLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "var(--muted)",
  textTransform: "uppercase", letterSpacing: "0.04em",
  marginBottom: 2,
};
const tileSubStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--muted)",
};
function tileInputStyle(disabled: boolean | undefined, width: number): React.CSSProperties {
  return {
    width,
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1,
    textAlign: "right",
    padding: "4px 8px",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--card)",
    color: "var(--text)",
    fontFamily: "inherit",
    outline: "none",
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "text",
  };
}

export default function CamConfigCard({
  unitRef,
  propertyCode,
  occupantName,
  unitSqft,
  buildingSqft,
}: {
  unitRef: string;
  /** Property code (e.g. "2300") — used to look up per-property CAM rules
   *  in lib/cam/propertyRules.ts. */
  propertyCode: string;
  /** Tenant occupant name from the rent roll — used to match tenant
   *  carve-outs (e.g. "Wawa" pays no CAM at Brookwood). */
  occupantName: string;
  /** The unit's square footage. Used to compute each category's
   *  prefill PRS (`unitSqft / denominator × 100`). */
  unitSqft: number;
  /** Full building GLA. Default denominator for any category that
   *  doesn't have a property-rule override. */
  buildingSqft: number;
}) {
  // Per-category prefill PRS and exclusion flags. A tenant excluded
  // from a category (e.g. Wawa from CAM) pays nothing for that category;
  // their PRS cell is forced to 0 and the input is disabled.
  const categoryMeta = useMemo(() => {
    const out: Record<CamCategory, { prefillPrs: number | null; denominator: number; excluded: boolean; footnote: string | null }> = {
      cam: { prefillPrs: null, denominator: buildingSqft, excluded: false, footnote: null },
      ins: { prefillPrs: null, denominator: buildingSqft, excluded: false, footnote: null },
      ret: { prefillPrs: null, denominator: buildingSqft, excluded: false, footnote: null },
    };
    for (const cat of CAM_CATEGORIES) {
      const excluded = isTenantExcluded(propertyCode, cat, occupantName);
      const denom = getCategoryDenominator(propertyCode, cat, occupantName, buildingSqft);
      // Three decimals so the reverse-computed SF lands within ~1 sf of
      // the actual denominator on edits, and the stored value carries
      // enough precision for reconciliation math.
      const prefill = !excluded && unitSqft > 0 && denom > 0
        ? Math.round((unitSqft / denom) * 100000) / 1000
        : excluded ? 0 : null;
      out[cat] = {
        prefillPrs: prefill,
        denominator: denom,
        excluded,
        footnote: getCategoryFootnote(propertyCode, cat),
      };
    }
    return out;
  }, [propertyCode, occupantName, unitSqft, buildingSqft]);
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
        // Hydrate each category's stipulated-PRS field from the per-
        // category prefill (which honors property-rule denominator
        // overrides). Excluded tenants default to 0 instead of the
        // rule's prefill, but the field remains editable so users can
        // override per lease. Doesn't trigger a save — only real edits do.
        const c: CamConfig = j.config;
        for (const cat of CAM_CATEGORIES) {
          if (c[cat].stipulatedPrs != null) continue;  // respect saved values
          const meta = categoryMeta[cat];
          const defaultValue = meta.excluded ? 0 : meta.prefillPrs;
          if (defaultValue != null) {
            c[cat] = { ...c[cat], stipulatedPrs: defaultValue };
          }
        }
        setConfig(c);
      })
      .catch(() => { /* leave null */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, categoryMeta]);

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
    for (const v of config?.camAdminExcludedLines ?? []) set.add(v);
    for (const v of config?.camExcludedLines ?? []) set.add(v);
    return Array.from(set);
  }, [config?.camAdminExcludedLines, config?.camExcludedLines]);

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
  const hasAdminFeeExclusions = config.hasAdminFeeExclusions;
  const hasExpenseExclusions = config.hasExpenseExclusions;
  const anyExclusions = hasAdminFeeExclusions || hasExpenseExclusions;

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

      <div style={{ opacity: isGross ? 0.45 : 1, pointerEvents: isGross ? "none" : "auto" }}>
        {/* Big tile row — CAM Admin Fee + the three PRS tiles. These are
            the values staff actually edit, so they get the prominent
            StatPill-style treatment with labels and (SF) denominators
            below each input. */}
        <div className="pills" style={{ marginTop: 0, marginBottom: 14 }}>
          <AdminFeeTile
            value={config.cam.adminFeePct}
            onChange={(v) => updateCategory("cam", { adminFeePct: v })}
            disabled={isGross}
          />
          {CAM_CATEGORIES.map((cat) => (
            <PrsTile
              key={`v-${cat}`}
              value={config[cat].stipulatedPrs}
              onChange={(v) => updateCategory(cat, { stipulatedPrs: v })}
              denominator={categoryMeta[cat].denominator}
              label={`${CAM_CATEGORY_LABELS[cat]} PRS`}
              disabled={isGross}
            />
          ))}
        </div>

        {/* Property-rule footnotes (e.g. "* CAM denominator excludes
            Wawa outparcel."). Only rendered when a rule applies to this
            property + category combo. */}
        {(categoryMeta.cam.footnote || categoryMeta.ins.footnote || categoryMeta.ret.footnote) && (
          <div style={{
            marginTop: 10,
            display: "flex", flexDirection: "column", gap: 4,
            fontSize: 11, fontStyle: "italic", color: "var(--muted)",
            lineHeight: 1.5,
          }}>
            {CAM_CATEGORIES.map((cat) =>
              categoryMeta[cat].footnote ? (
                <div key={`fn-${cat}`}>* {categoryMeta[cat].footnote}</div>
              ) : null,
            )}
          </div>
        )}

        {/* Per-category exclusion notice — when this specific tenant is
            carved out of a category entirely. */}
        {CAM_CATEGORIES.some((c) => categoryMeta[c].excluded) && (
          <div style={{
            marginTop: 6,
            fontSize: 11, fontStyle: "italic", color: "var(--muted)",
          }}>
            {CAM_CATEGORIES.filter((c) => categoryMeta[c].excluded)
              .map((c) => `${occupantName || "This tenant"} does not pay ${CAM_CATEGORY_LABELS[c]}.`)
              .join(" ")}
          </div>
        )}

      </div>

      {/* Lease modifiers — plain inline checkboxes, both on one line.
          Both off-by-default; the reconciliation table above assumes
          NNN with admin on every line and no excluded lines unless
          turned on. */}
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
            checked={hasAdminFeeExclusions}
            disabled={isGross}
            onChange={(e) => update({ hasAdminFeeExclusions: e.target.checked })}
            style={{ width: 15, height: 15, cursor: "pointer" }}
          />
          <span style={{ fontWeight: 600, color: "var(--text)" }}>Admin Fee Exclusions</span>
        </label>
        <label style={{
          display: "flex", alignItems: "center", gap: 8, fontSize: 13,
          cursor: isGross ? "not-allowed" : "pointer",
          opacity: isGross ? 0.5 : 1,
        }}>
          <input
            type="checkbox"
            checked={hasExpenseExclusions}
            disabled={isGross}
            onChange={(e) => update({ hasExpenseExclusions: e.target.checked })}
            style={{ width: 15, height: 15, cursor: "pointer" }}
          />
          <span style={{ fontWeight: 600, color: "var(--text)" }}>Expense Pool Exclusions</span>
        </label>
        <label style={{
          display: "flex", alignItems: "center", gap: 8, fontSize: 13,
          cursor: isGross ? "not-allowed" : "pointer",
          opacity: isGross ? 0.5 : 1,
        }} title="Lease-level CAM cap">
          <input
            type="checkbox"
            checked={!!config.camCap}
            disabled={isGross}
            onChange={(e) => update({
              camCap: e.target.checked
                ? (config.camCap ?? {
                    priorYear: new Date().getFullYear() - 1,
                    controllableAmount: 0,
                    growthPct: 4,
                    notes: "",
                  })
                : undefined,
            })}
            style={{ width: 15, height: 15, cursor: "pointer" }}
          />
          <span style={{ fontWeight: 600, color: "var(--text)" }}>CAM Cap</span>
        </label>
      </div>

      {/* CAM Cap panel — appears when CAM Cap is checked. Single-tenant
          outlier feature so it stays scoped to this card only. */}
      {config.camCap && !isGross && (() => {
        const cap = config.camCap;
        const nextYear = cap.priorYear + 1;
        const capAmount = cap.controllableAmount * (1 + cap.growthPct / 100);
        const currentYear = new Date().getFullYear();
        const isStale = cap.priorYear < currentYear - 1;
        return (
          <div style={{
            marginTop: 14, paddingTop: 14,
            borderTop: "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
                  CAM Cap
                </div>
                <div className="small muted" style={{ marginTop: 2 }}>
                  Bill the lesser of (current-year applicable CAM × PRS) or (prior-year controllable × growth × PRS). Bump the base year and amount each reconciliation cycle.
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: 22, fontWeight: 900, color: "#0b4a7d",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {capAmount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
                  Cap for {nextYear} reconciliation
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Prior year
                </span>
                <input
                  type="number"
                  value={cap.priorYear}
                  min={1900}
                  max={2100}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) update({ camCap: { ...cap, priorYear: Math.round(v) } });
                  }}
                  style={{
                    padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
                    background: "var(--card)", color: "var(--text)", fontSize: 13, fontFamily: "inherit",
                  }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Controllable expenses ({cap.priorYear})
                </span>
                <div style={{ position: "relative" }}>
                  <span style={{
                    position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                    fontSize: 13, color: "var(--muted)", pointerEvents: "none",
                  }}>$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cap.controllableAmount > 0 ? cap.controllableAmount.toLocaleString("en-US") : ""}
                    placeholder="0"
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9.]/g, "");
                      const v = raw === "" ? 0 : Number(raw);
                      if (Number.isFinite(v)) update({ camCap: { ...cap, controllableAmount: Math.max(0, v) } });
                    }}
                    style={{
                      width: "100%", padding: "8px 10px 8px 22px", borderRadius: 6,
                      border: "1px solid var(--border)", background: "var(--card)",
                      color: "var(--text)", fontSize: 13, fontFamily: "inherit",
                      fontVariantNumeric: "tabular-nums", textAlign: "right",
                    }}
                  />
                </div>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Annual growth %
                </span>
                <input
                  type="number"
                  value={cap.growthPct}
                  min={0}
                  max={100}
                  step="0.1"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) update({ camCap: { ...cap, growthPct: Math.max(0, Math.min(100, v)) } });
                  }}
                  style={{
                    padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
                    background: "var(--card)", color: "var(--text)", fontSize: 13, fontFamily: "inherit",
                  }}
                />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Notes
              </span>
              <textarea
                rows={2}
                value={cap.notes}
                placeholder="Lease cite, etc."
                onChange={(e) => update({ camCap: { ...cap, notes: e.target.value.slice(0, 500) } })}
                style={{
                  padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
                  background: "var(--card)", color: "var(--text)", fontSize: 13, fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </label>
            {isStale && (
              <div style={{
                marginTop: 10, padding: "8px 10px", borderRadius: 6,
                background: "rgba(220,38,38,0.06)",
                border: "1px solid rgba(220,38,38,0.35)",
                color: "#b91c1c", fontSize: 12, fontWeight: 600,
              }}>
                Prior year is {cap.priorYear} — for a {currentYear} reconciliation the cap should be based on {currentYear - 1} controllable. Update before billing.
              </div>
            )}
          </div>
        );
      })()}

      {/* Exclusion pickers reveal directly beneath the two checkboxes
          that control them, so the cause/effect reads at a glance.
          Either checkbox can be on independently. Both panels dim with
          the rest of the card when Gross Lease is on. */}
      {anyExclusions && (
        <div style={{
          marginTop: 14, paddingTop: 14,
          borderTop: "1px solid var(--border)",
          display: "flex", flexDirection: "column", gap: 14,
          opacity: isGross ? 0.45 : 1,
          pointerEvents: isGross ? "none" : "auto",
        }}>
          {hasAdminFeeExclusions && (
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "6px 20px", alignItems: "start" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", paddingTop: 6 }}>
                Excluded from Admin Fee
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  CAM lines this tenant’s admin fee does not apply to.
                </span>
                <MultiSelect
                  options={lineOptions}
                  selected={config.camAdminExcludedLines ?? []}
                  onChange={(next) => update({ camAdminExcludedLines: next })}
                  placeholder="Pick lines to exclude from the admin fee…"
                  disabled={isGross}
                />
              </div>
            </div>
          )}

          {hasExpenseExclusions && (
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "6px 20px", alignItems: "start" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", paddingTop: 6 }}>
                Excluded CAM lines
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  CAM lines this tenant is not billed for under their lease.
                </span>
                <MultiSelect
                  options={lineOptions}
                  selected={config.camExcludedLines ?? []}
                  onChange={(next) => update({ camExcludedLines: next })}
                  placeholder="Pick lines to exclude from this tenant’s CAM…"
                  disabled={isGross}
                />
                {/* "Other" — flat-$ exclusion for line items that aren't
                    in CAM_LINE_ITEMS and have no separate GL code. */}
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 4, cursor: isGross ? "not-allowed" : "pointer", opacity: isGross ? 0.5 : 1 }}>
                  <input
                    type="checkbox"
                    checked={!!config.camExcludedOther}
                    disabled={isGross}
                    onChange={(e) => update({
                      camExcludedOther: e.target.checked
                        ? (config.camExcludedOther ?? { description: "", amount: 0 })
                        : undefined,
                    })}
                    style={{ width: 15, height: 15, cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: 600 }}>Other</span>
                  <span className="small muted">(flat $ amount, no GL code)</span>
                </label>
                {config.camExcludedOther && !isGross && (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 160px", gap: 8 }}>
                    <input
                      type="text"
                      value={config.camExcludedOther.description}
                      placeholder="What is being excluded? e.g. Liability Insurance"
                      onChange={(e) => update({
                        camExcludedOther: {
                          ...(config.camExcludedOther ?? { amount: 0 }),
                          description: e.target.value.slice(0, 120),
                        },
                      })}
                      style={{
                        padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
                        background: "var(--card)", color: "var(--text)", fontSize: 13, fontFamily: "inherit",
                      }}
                    />
                    <div style={{ position: "relative" }}>
                      <span style={{
                        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                        fontSize: 13, color: "var(--muted)", pointerEvents: "none",
                      }}>$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={config.camExcludedOther.amount > 0 ? config.camExcludedOther.amount.toLocaleString("en-US") : ""}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9.]/g, "");
                          const v = raw === "" ? 0 : Number(raw);
                          if (Number.isFinite(v)) update({
                            camExcludedOther: {
                              ...(config.camExcludedOther ?? { description: "" }),
                              amount: Math.max(0, v),
                            },
                          });
                        }}
                        style={{
                          width: "100%", padding: "8px 10px 8px 22px", borderRadius: 6,
                          border: "1px solid var(--border)", background: "var(--card)",
                          color: "var(--text)", fontSize: 13, fontFamily: "inherit",
                          fontVariantNumeric: "tabular-nums", textAlign: "right",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
