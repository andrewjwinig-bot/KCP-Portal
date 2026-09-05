"use client";

import { useEffect, useRef, useState } from "react";
import { AutosaveStatus, useAutosave } from "@/app/components/useAutosave";
import { normName } from "@/lib/centers/registry";

// Public display name (DBA) override for a single tenant, on the unit info page.
// The public shopping-center marketing page shows this instead of the raw rent-
// roll name when set. Stored in the per-center override blob (CenterOverride.dba,
// keyed by normName(tenant)), the same source the public page reads — this card
// is just a per-tenant editor for it, which is a more natural home than the
// property-wide Public Website card.

type Override = {
  assets?: unknown;
  availabilities?: unknown;
  availDesc?: unknown;
  dba?: Record<string, string>;
};

/** Resolve the registry default display name for a tenant (exact then loose). */
function defaultDisplay(displayNames: Record<string, string>, name: string): string {
  const key = normName(name);
  if (displayNames[key]) return displayNames[key];
  for (const [k, v] of Object.entries(displayNames)) {
    if (k && (key.includes(k) || k.includes(key))) return v;
  }
  return "";
}

export default function DisplayNameCard({ code, occupantName }: { code: string; occupantName: string }) {
  const key = normName(occupantName);
  const [loaded, setLoaded] = useState(false);
  const [value, setValue] = useState("");
  const [fallback, setFallback] = useState(""); // registry default, if any
  const overrideRef = useRef<Override>({});

  useEffect(() => {
    let alive = true;
    fetch(`/api/centers/${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!alive || !cfg) { if (alive) setLoaded(true); return; }
        overrideRef.current = (cfg.override ?? {}) as Override;
        setValue(overrideRef.current.dba?.[key] ?? "");
        setFallback(defaultDisplay(cfg.defaults?.displayNames ?? {}, occupantName));
        setLoaded(true);
      })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [code, key, occupantName]);

  const { saving, savedFlash, error, schedule } = useAutosave<string>({
    save: async (snapshot) => {
      // Re-read the override right before saving so we don't clobber other
      // fields (photos, availabilities) the Public Website card may have
      // changed — /api/centers/[code] does a full-object replace, not a patch.
      const cfg = await fetch(`/api/centers/${code}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const ov: Override = (cfg?.override ?? overrideRef.current ?? {}) as Override;
      const dba: Record<string, string> = { ...(ov.dba ?? {}) };
      const v = snapshot.trim();
      if (v) dba[key] = v; else delete dba[key];
      const res = await fetch(`/api/centers/${code}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assets: ov.assets ?? {}, availabilities: ov.availabilities ?? [], availDesc: ov.availDesc ?? {}, dba }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Save failed");
      overrideRef.current = { ...ov, dba };
    },
  });

  const onChange = (v: string) => { setValue(v); schedule(v); };

  if (!loaded) return null;

  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", flexWrap: "wrap" }}>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
        color: "var(--muted)", textTransform: "uppercase", whiteSpace: "nowrap",
      }}>Public Name (DBA)</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fallback || occupantName}
        title="Public leasing-page name. Blank uses the rent-roll name."
        style={{
          flex: "1 1 200px", maxWidth: 360,
          border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px",
          fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "inherit",
        }}
      />
      <AutosaveStatus saving={saving} savedFlash={savedFlash} />
      {error && <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{error}</span>}
    </div>
  );
}
