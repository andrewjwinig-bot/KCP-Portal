"use client";

import { useEffect, useState } from "react";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { AutosaveStatus, useAutosave } from "@/app/components/useAutosave";

// Office CAM config — the CAMPRep lease-level inputs (pro-rata share +
// gross-up) for an office tenant, mirroring the retail CamConfigCard so the
// same data is captured per tenant and editable/overridable. Office uses
// base-year expense recovery (the base year lives in its own card above), so
// the only lease-level levers here are the pro-rata share and whether
// expenses are grossed up to 95% occupancy. These flow into the CAM / RET
// reconciliation via /api/cam-recon/office.

type Effective = { proRataPct: number | null; grossUp: boolean };
type Seed = { proRataPct: number | null; grossUp: boolean | null; baseYear: number | null };

// Shared big-tile styling, matched to the retail card's tiles.
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
const tileSubStyle: React.CSSProperties = { fontSize: 11, color: "var(--muted)" };
function tileInputStyle(width: number): React.CSSProperties {
  return {
    width,
    fontSize: 22, fontWeight: 800, lineHeight: 1,
    textAlign: "right", padding: "4px 8px",
    border: "1px solid var(--border)", borderRadius: 7,
    background: "var(--card)", color: "var(--text)",
    fontFamily: "inherit", outline: "none",
  };
}

export default function OfficeCamConfigCard({
  unitRef,
  unitSqft,
  buildingSqft,
  baseYear,
}: {
  unitRef: string;
  unitSqft: number;
  buildingSqft: number;
  /** Current base year from the rent roll / tenant metadata (the master
   *  source) — echoed here so it autofills for every office building, not
   *  just those with a reconciliation fixture. */
  baseYear?: number | string | null;
}) {
  const [seed, setSeed] = useState<Seed | null>(null);
  const [config, setConfig] = useState<Effective | null>(null);
  const [loading, setLoading] = useState(true);
  const [prsText, setPrsText] = useState("");

  const api = `/api/cam-recon/office/unit-config/${encodeURIComponent(unitRef)}`;

  const { saving, savedFlash, error, schedule } = useAutosave<Partial<Effective>>({
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
        if (!alive || !j) return;
        setSeed(j.seed ?? null);
        const eff: Effective = j.effective ?? { proRataPct: null, grossUp: false };
        setConfig(eff);
        setPrsText(eff.proRataPct == null ? "" : String(eff.proRataPct));
      })
      .catch(() => { /* leave null */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api]);

  function update(patch: Partial<Effective>) {
    setConfig((prev) => {
      const next = { ...(prev ?? { proRataPct: null, grossUp: false }), ...patch };
      schedule(patch);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="card">
        <SectionLabel>CAM / RET (Office)</SectionLabel>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="card">
        <SectionLabel>CAM / RET (Office)</SectionLabel>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Couldn’t load CAM configuration.</div>
      </div>
    );
  }

  // True pro-rata share = unit SF ÷ building SF. CAMPrep shares sometimes
  // diverge from this (lease amendments, excluded areas), so flag when the
  // stipulated share doesn't match the raw SF share — beyond a 0.01% rounding
  // tolerance — so staff can confirm it's intentional.
  const truePRS = buildingSqft > 0 && unitSqft > 0 ? (unitSqft / buildingSqft) * 100 : null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const prsMismatch =
    truePRS != null && config.proRataPct != null && config.proRataPct > 0 &&
    Math.abs(r2(config.proRataPct) - r2(truePRS)) > 0.01;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SectionLabel>CAM / RET (Office)</SectionLabel>
        <AutosaveStatus saving={saving} savedFlash={savedFlash} />
      </div>

      {error && (
        <div style={{
          margin: "8px 0", padding: "8px 10px", borderRadius: 8,
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)",
          color: "#b91c1c", fontSize: 12, fontWeight: 600,
        }}>{error}</div>
      )}

      <div className="pills" style={{ marginTop: 0 }}>
        {/* Pro-Rata Share */}
        <div style={tileStyle}>
          <span style={tileLabelStyle}>Pro-Rata Share</span>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
            <input
              type="number"
              inputMode="decimal"
              step="0.001"
              min={0}
              max={100}
              value={prsText}
              placeholder="—"
              onChange={(e) => {
                const t = e.target.value;
                setPrsText(t);
                if (t === "") { update({ proRataPct: null }); return; }
                const n = Number(t);
                if (Number.isFinite(n)) update({ proRataPct: n });
              }}
              onBlur={() => {
                if (prsText === "") return;
                const n = Number(prsText);
                if (!Number.isFinite(n)) {
                  setPrsText(config.proRataPct == null ? "" : String(config.proRataPct));
                  return;
                }
                const clamped = Math.max(0, Math.min(100, Math.round(n * 1000) / 1000));
                setPrsText(String(clamped));
                update({ proRataPct: clamped });
              }}
              style={tileInputStyle(120)}
            />
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--muted)" }}>%</span>
          </div>
          {truePRS != null && (
            prsMismatch ? (
              <span style={{ ...tileSubStyle, color: "#b45309", fontWeight: 700 }}
                title={`Building true share is ${truePRS.toFixed(2)}% (${unitSqft.toLocaleString()} / ${buildingSqft.toLocaleString()} SF). The stipulated CAMPrep share differs.`}>
                ≠ true {truePRS.toFixed(2)}%
              </span>
            ) : (
              <span style={tileSubStyle}>
                {unitSqft.toLocaleString()} / {buildingSqft.toLocaleString()} SF
              </span>
            )
          )}
        </div>

        {/* Gross Up */}
        <div style={tileStyle}>
          <span style={tileLabelStyle}>Gross Up</span>
          <select
            value={config.grossUp ? "yes" : "no"}
            onChange={(e) => update({ grossUp: e.target.value === "yes" })}
            style={{
              ...tileInputStyle(120),
              textAlign: "center",
              textAlignLast: "center",
              appearance: "auto",
              cursor: "pointer",
            }}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <span style={tileSubStyle}>{config.grossUp ? "to 95% occupancy" : "actual expenses"}</span>
        </div>

        {/* Base Year (read-only echo from the rent roll — edited in the Base
            Year card above) */}
        <div style={tileStyle}>
          <span style={tileLabelStyle}>Base Year</span>
          <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: "var(--text)" }}>
            {baseYear ?? seed?.baseYear ?? "—"}
          </span>
          <span style={tileSubStyle}>expense recovery</span>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
        Office tenants recover expenses over their base year. The pro-rata share and gross-up
        feed the CAM / RET reconciliation; edits here override the workbook seed and persist for
        future years.
      </div>
    </div>
  );
}
