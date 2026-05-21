"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { MultiSelect } from "@/app/components/MultiSelect";
import { StatPill } from "@/app/components/Pill";
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
// building GLA right beside it — e.g. "[5.250] % (95,238 SF)". The
// denominator is sourced from the property rule (or full GLA when no
// rule applies) rather than reverse-computed from the rounded percent,
// so the displayed SF matches the actual denominator exactly.
function PrsInput({
  value,
  onChange,
  disabled,
  denominator,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  /** Building SF this category's PRS is computed against. Displayed
   *  beside the % input. */
  denominator: number;
}) {
  const [text, setText] = useState<string>(value == null ? "" : String(value));
  useEffect(() => { setText(value == null ? "" : String(value)); }, [value]);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 6, whiteSpace: "nowrap",
    }}>
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
        style={{
          ...inputStyle,
          width: 84,
          textAlign: "right",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
      <span style={{
        fontSize: 13, fontWeight: 700, color: "var(--text)",
        opacity: disabled ? 0.5 : 1,
      }}>%</span>
      {denominator > 0 && (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          ({denominator.toLocaleString()} SF)
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
  propertyCode,
  occupantName,
  unitSqft,
  buildingSqft,
  opexMonth,
  reTaxMonth,
  otherMonth,
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
  /** Monthly NNN breakouts pulled off the rent roll. Each renders as a
   *  pill above the table when non-zero. */
  opexMonth: number;
  reTaxMonth: number;
  otherMonth: number;
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
              denominator={categoryMeta[cat].denominator}
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
            checked={hasExclusions}
            disabled={isGross}
            onChange={(e) => update({ hasExclusions: e.target.checked })}
            style={{ width: 15, height: 15, cursor: "pointer" }}
          />
          <span style={{ fontWeight: 600, color: "var(--text)" }}>Lease Has Exclusions</span>
        </label>
      </div>

      {/* Exclusion picker reveals directly beneath the "Lease Has
          Exclusions" toggle that controls it, so the cause/effect is
          obvious without scrolling. Dimmed alongside the rest of the
          card when Gross Lease is on. */}
      {hasExclusions && (
        <div style={{
          marginTop: 14, paddingTop: 14,
          borderTop: "1px solid var(--border)",
          display: "flex", flexDirection: "column", gap: 14,
          opacity: isGross ? 0.45 : 1,
          pointerEvents: isGross ? "none" : "auto",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            color: "var(--muted)", textTransform: "uppercase",
          }}>
            CAM Line Items
          </div>

          {/* Two consistent exclusion rows. Both empty by default → admin
              fee applies to every CAM line and every CAM line is billed. */}
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

          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "6px 20px", alignItems: "start" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", paddingTop: 6 }}>
              Excluded CAM lines
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
