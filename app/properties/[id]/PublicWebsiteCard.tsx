"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { normName } from "../../../lib/centers/registry";

// Admin "Public website" card, shown on the property detail page for the five
// shopping centers. Manages the things the rent roll does NOT carry: photos +
// site plan (uploaded to Vercel Blob), the marketed availabilities, and DBA
// display names for the current tenants. Saving writes /api/centers/[code],
// which revalidates the public page so edits show up immediately.

type Space = { suite: string; sf: number; kind: string; frontage: string; notes: string };
type Assets = { hero?: string; sitePlan?: string; neighborhood?: string[] };
type Defaults = {
  availabilities: Space[];
  displayNames: Record<string, string>;
  neighborhood: { title: string; img: string }[];
};

const LABEL: React.CSSProperties = {
  fontFamily: "var(--f-mono, ui-monospace, monospace)",
  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
  color: "var(--muted)",
};
const INPUT: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px",
  fontSize: 14, background: "var(--card)", color: "var(--text)", width: "100%", fontFamily: "inherit",
};
const BTN: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
  border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)",
};

export default function PublicWebsiteCard({ code }: { code: string }) {
  const [slug, setSlug] = useState<string>("");
  const [assets, setAssets] = useState<Assets>({});
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [dba, setDba] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [tenants, setTenants] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cfgRes, rrRes] = await Promise.all([
          fetch(`/api/centers/${code}`),
          fetch("/api/rentroll").catch(() => null),
        ]);
        const cfg = await cfgRes.json();
        if (!alive) return;
        setSlug(cfg.slug);
        setDefaults(cfg.defaults);
        setAssets(cfg.override?.assets ?? {});
        setSpaces(
          cfg.override?.availabilities?.length ? cfg.override.availabilities : cfg.defaults.availabilities,
        );
        setDba(cfg.override?.dba ?? {});
        if (rrRes && rrRes.ok) {
          const rr = await rrRes.json();
          const prop = (rr.properties ?? []).find(
            (p: { propertyCode: string }) => p.propertyCode?.toUpperCase() === code.toUpperCase(),
          );
          const names: string[] = (prop?.units ?? [])
            .filter((u: { isVacant: boolean; amenity?: unknown; occupantName: string; sqft: number }) =>
              !u.isVacant && !u.amenity && u.occupantName && u.sqft > 0)
            .map((u: { occupantName: string }) => u.occupantName);
          setTenants(Array.from(new Set(names)));
        }
      } catch {
        if (alive) setStatus("Couldn't load the website config.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [code]);

  const doUpload = useCallback(async (file: File, key: string): Promise<string | null> => {
    setBusyKey(key);
    setStatus(null);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const res = await upload(`centers/${code}/${key}-${safe}`, file, {
        access: "public",
        handleUploadUrl: `/api/centers/${code}/upload`,
        contentType: file.type,
      });
      return res.url;
    } catch (e) {
      setStatus(e instanceof Error ? `Upload failed: ${e.message}` : "Upload failed.");
      return null;
    } finally {
      setBusyKey(null);
    }
  }, [code]);

  const onHero = async (f: File | null) => { if (f) { const u = await doUpload(f, "hero"); if (u) setAssets((a) => ({ ...a, hero: u })); } };
  const onPlan = async (f: File | null) => { if (f) { const u = await doUpload(f, "siteplan"); if (u) setAssets((a) => ({ ...a, sitePlan: u })); } };
  const onHood = async (f: File | null, i: number) => {
    if (!f) return;
    const u = await doUpload(f, `hood${i}`);
    if (!u) return;
    setAssets((a) => {
      const arr = [...(a.neighborhood ?? [])];
      arr[i] = u;
      return { ...a, neighborhood: arr };
    });
  };

  const setSpace = (i: number, patch: Partial<Space>) =>
    setSpaces((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addSpace = () => setSpaces((s) => [...s, { suite: "", sf: 0, kind: "Inline retail", frontage: "", notes: "" }]);
  const removeSpace = (i: number) => setSpaces((s) => s.filter((_, idx) => idx !== i));

  const dbaValue = useCallback((name: string): string => {
    const key = normName(name);
    if (dba[key] != null) return dba[key];
    // fall back to the code default (registry.displayNames), exact then contains
    const d = defaults?.displayNames ?? {};
    if (d[key]) return d[key];
    for (const [k, v] of Object.entries(d)) if (k && (key.includes(k) || k.includes(key))) return v;
    return "";
  }, [dba, defaults]);

  const setDbaFor = (name: string, val: string) =>
    setDba((m) => ({ ...m, [normName(name)]: val }));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/centers/${code}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assets, availabilities: spaces, dba }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Save failed");
      setStatus("Saved — the public page will refresh momentarily.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const publicHref = slug ? `/centers/${slug}` : "#";
  const hoodCount = defaults?.neighborhood.length ?? 0;

  return (
    <section style={{
      border: "1px solid var(--border)", borderRadius: 14, background: "var(--card)",
      boxShadow: "var(--shadow, 0 2px 8px rgba(2,6,23,0.05))", padding: 20,
      display: "flex", flexDirection: "column", gap: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>Public website</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Photos, site plan, availabilities &amp; tenant display names for the public leasing page. The tenant roster itself syncs from the rent roll.
          </div>
        </div>
        <a href={publicHref} target="_blank" rel="noreferrer"
          style={{ ...BTN, background: "var(--brand)", color: "#fff", border: "1px solid var(--brand)", textDecoration: "none" }}>
          View public page ↗
        </a>
      </div>

      {loading ? (
        <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading…</div>
      ) : (
        <>
          {/* IMAGES */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={LABEL}>Images</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              <ImageSlot label="Hero photo (3000×1500)" url={assets.hero} busy={busyKey === "hero"} onPick={onHero} onClear={() => setAssets((a) => ({ ...a, hero: undefined }))} />
              <ImageSlot label="Site plan" url={assets.sitePlan} busy={busyKey === "siteplan"} onPick={onPlan} onClear={() => setAssets((a) => ({ ...a, sitePlan: undefined }))} />
              {Array.from({ length: hoodCount }).map((_, i) => (
                <ImageSlot
                  key={i}
                  label={`Neighborhood: ${defaults?.neighborhood[i]?.title ?? `photo ${i + 1}`}`}
                  url={assets.neighborhood?.[i]}
                  busy={busyKey === `hood${i}`}
                  onPick={(f) => onHood(f, i)}
                  onClear={() => setAssets((a) => { const arr = [...(a.neighborhood ?? [])]; arr[i] = ""; return { ...a, neighborhood: arr }; })}
                />
              ))}
            </div>
          </div>

          {/* AVAILABILITIES */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={LABEL}>Available spaces</div>
              <button style={BTN} onClick={addSpace} type="button">+ Add space</button>
            </div>
            {spaces.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No marketed availabilities — the public page shows a “fully leased” note.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {spaces.map((s, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 90px 1fr 150px 150px 32px", gap: 8, alignItems: "center" }}>
                  <input style={INPUT} placeholder="Suite" value={s.suite} onChange={(e) => setSpace(i, { suite: e.target.value })} />
                  <input style={INPUT} placeholder="SF" type="number" value={s.sf || ""} onChange={(e) => setSpace(i, { sf: Number(e.target.value) })} />
                  <input style={INPUT} placeholder="Marketing note (e.g. Corner bay, grocery-adjacent)" value={s.notes} onChange={(e) => setSpace(i, { notes: e.target.value })} />
                  <input style={INPUT} placeholder="Kind" value={s.kind} onChange={(e) => setSpace(i, { kind: e.target.value })} />
                  <input style={INPUT} placeholder="Frontage" value={s.frontage} onChange={(e) => setSpace(i, { frontage: e.target.value })} />
                  <button type="button" onClick={() => removeSpace(i)} title="Remove"
                    style={{ ...BTN, padding: "8px 0", color: "#b3341f" }}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* DBA */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={LABEL}>Tenant display names (DBA)</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: -4 }}>
              Public roster name for each current tenant. Blank = use the rent-roll name. (Later this can pull from lease abstracts automatically.)
            </div>
            {tenants.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No live rent-roll tenants loaded for {code}.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {tenants.map((name) => (
                  <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 13, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>{name}</div>
                    <input style={INPUT} placeholder={name} value={dbaValue(name)} onChange={(e) => setDbaFor(name, e.target.value)} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <button type="button" onClick={save} disabled={saving}
              style={{ ...BTN, background: "var(--brand)", color: "#fff", border: "1px solid var(--brand)", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save website"}
            </button>
            {status && <div style={{ fontSize: 13, color: status.startsWith("Saved") ? "var(--brand)" : "#b3341f" }}>{status}</div>}
          </div>
        </>
      )}
    </section>
  );
}

function ImageSlot({ label, url, busy, onPick, onClear }: {
  label: string; url?: string; busy: boolean;
  onPick: (f: File | null) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ ...LABEL, fontSize: 10 }}>{label}</div>
      <div style={{
        position: "relative", aspectRatio: "16 / 9", borderRadius: 8, overflow: "hidden",
        border: "1px dashed var(--border)", background: "var(--panel, #f4f6f8)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {url
          ? <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 11, color: "var(--muted)" }}>No image</span>}
        {busy && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", color: "#fff", display: "grid", placeItems: "center", fontSize: 12 }}>Uploading…</div>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={{ ...BTN, fontSize: 12, padding: "6px 10px" }} onClick={() => ref.current?.click()}>
          {url ? "Replace" : "Upload"}
        </button>
        {url && <button type="button" style={{ ...BTN, fontSize: 12, padding: "6px 10px", color: "#b3341f" }} onClick={onClear}>Remove</button>}
        <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { onPick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      </div>
    </div>
  );
}
