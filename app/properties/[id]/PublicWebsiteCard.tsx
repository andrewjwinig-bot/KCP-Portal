"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { upload } from "@vercel/blob/client";
import { normName } from "../../../lib/centers/registry";

// Admin "Public Website" card, shown on the property detail page for the five
// shopping centers. Manages the things the rent roll does NOT carry: photos +
// site plan (uploaded to Vercel Blob), marketing copy for the available spaces,
// and DBA display names for the current tenants. Which spaces are available
// (suite + SF + count) syncs LIVE from the rent roll's vacant units — staff
// only fill in the marketing description columns. Saving writes
// /api/centers/[code], which the public page reads per-request.

type Space = { suite: string; sf: number; kind: string; frontage: string; notes: string };
type Assets = { hero?: string; sitePlan?: string; neighborhood?: string[] };
type Desc = { kind: string; frontage: string; notes: string };
type Vacant = { suite: string; sf: number };
type Defaults = {
  availabilities: Space[];
  displayNames: Record<string, string>;
  neighborhood: { title: string; img: string }[];
};

const BRAND = "#0b4a7d";
const RED = "#b91c1c";
const RING_C = 2 * Math.PI * 20; // upload progress ring (r=20)
const EMPTY_DESC: Desc = { kind: "", frontage: "", notes: "" };
const fmt = (n: number) => n.toLocaleString("en-US");

const SHIMMER: CSSProperties = {
  background: "linear-gradient(90deg, var(--text) 30%, var(--import-blue) 50%, var(--text) 70%)",
  backgroundSize: "200% auto", WebkitBackgroundClip: "text", backgroundClip: "text",
  color: "transparent", animation: "kcpShimmer 2.2s linear infinite",
};

const LABEL: CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)",
};
const INPUT: CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px",
  fontSize: 14, background: "var(--card)", color: "var(--text)", width: "100%", fontFamily: "inherit",
};
const READONLY: CSSProperties = {
  ...INPUT, background: "var(--panel, #f4f6f8)", color: "var(--muted)", fontWeight: 600,
  display: "flex", alignItems: "center", minHeight: 37, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

export default function PublicWebsiteCard({ code }: { code: string }) {
  const [slug, setSlug] = useState<string>("");
  const [assets, setAssets] = useState<Assets>({});
  const [spaces, setSpaces] = useState<Space[]>([]);        // fallback (no live roll)
  const [vacants, setVacants] = useState<Vacant[]>([]);     // live vacant units
  const [hasRoll, setHasRoll] = useState(false);            // property found in the current rent roll
  const [availDesc, setAvailDesc] = useState<Record<string, Desc>>({});
  const [dba, setDba] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [tenants, setTenants] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pct, setPct] = useState(0);

  // Latest form state, so an upload's auto-save persists current values without
  // waiting on a stale closure.
  const initialAvail = useRef<Space[]>([]);
  const latest = useRef({ assets, spaces, dba, availDesc });
  latest.current = { assets, spaces, dba, availDesc };

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
        initialAvail.current = cfg.override?.availabilities ?? [];
        setSpaces(
          cfg.override?.availabilities?.length ? cfg.override.availabilities : cfg.defaults.availabilities,
        );
        setAvailDesc(cfg.override?.availDesc ?? {});
        setDba(cfg.override?.dba ?? {});
        if (rrRes && rrRes.ok) {
          const rr = await rrRes.json();
          const prop = (rr.properties ?? []).find(
            (p: { propertyCode: string }) => p.propertyCode?.toUpperCase() === code.toUpperCase(),
          );
          if (prop) {
            setHasRoll(true);
            type U = { isVacant: boolean; amenity?: unknown; occupantName: string; unitRef: string; sqft: number };
            const units: U[] = prop.units ?? [];
            setTenants(Array.from(new Set(
              units.filter((u) => !u.isVacant && !u.amenity && u.occupantName && u.sqft > 0).map((u) => u.occupantName),
            )));
            setVacants(
              units.filter((u) => u.isVacant && !u.amenity && u.sqft > 0)
                .map((u) => ({ suite: u.unitRef, sf: Math.round(u.sqft) }))
                .sort((a, b) => b.sf - a.sf),
            );
          }
        }
      } catch {
        if (alive) setStatus({ ok: false, msg: "Couldn't load the website config." });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [code]);

  const doUpload = useCallback(async (file: File, key: string): Promise<string | null> => {
    setBusyKey(key);
    setPct(0);
    setStatus(null);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const res = await upload(`centers/${code}/${key}-${safe}`, file, {
        access: "public",
        handleUploadUrl: `/api/centers/${code}/upload`,
        contentType: file.type || undefined,
        multipart: file.size > 8 * 1024 * 1024, // reliable for big hero photos
        onUploadProgress: (e) => setPct(e.percentage / 100),
      });
      return res.url;
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? `Upload failed: ${e.message}` : "Upload failed." });
      return null;
    } finally {
      setBusyKey(null);
      setPct(0);
    }
  }, [code]);

  // Persist the override. Photos auto-save (the blob is already stored, so there
  // is no separate "Save" step for images); text edits use the Save button.
  const putOverride = useCallback(async (patch: Partial<typeof latest.current>): Promise<void> => {
    const s = { ...latest.current, ...patch };
    const res = await fetch(`/api/centers/${code}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assets: s.assets,
        // In live mode the availabilities come from the rent roll, so preserve
        // the stored fallback list untouched rather than injecting defaults.
        availabilities: hasRoll ? initialAvail.current : s.spaces,
        availDesc: s.availDesc,
        dba: s.dba,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Save failed");
  }, [code, hasRoll]);

  const uploadInto = async (f: File | null, key: string, apply: (a: Assets, url: string) => Assets) => {
    if (!f) return;
    const url = await doUpload(f, key);
    if (!url) return;
    const next = apply(latest.current.assets, url);
    setAssets(next);
    try { await putOverride({ assets: next }); setStatus({ ok: true, msg: "Image uploaded & saved." }); }
    catch (e) { setStatus({ ok: false, msg: e instanceof Error ? `Uploaded, but saving failed: ${e.message}` : "Uploaded, but saving failed." }); }
  };
  const onHero = (f: File | null) => uploadInto(f, "hero", (a, url) => ({ ...a, hero: url }));
  const onPlan = (f: File | null) => uploadInto(f, "siteplan", (a, url) => ({ ...a, sitePlan: url }));
  const onHood = (f: File | null, i: number) => uploadInto(f, `hood${i}`, (a, url) => {
    const arr = [...(a.neighborhood ?? [])]; arr[i] = url; return { ...a, neighborhood: arr };
  });

  const clearAsset = async (apply: (a: Assets) => Assets) => {
    const next = apply(latest.current.assets);
    setAssets(next);
    try { await putOverride({ assets: next }); } catch { /* surfaced on next save */ }
  };

  // Fallback manual-space editor (only when there is no live rent roll).
  const setSpace = (i: number, patch: Partial<Space>) => setSpaces((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addSpace = () => setSpaces((s) => [...s, { suite: "", sf: 0, kind: "Inline retail", frontage: "", notes: "" }]);
  const removeSpace = (i: number) => setSpaces((s) => s.filter((_, idx) => idx !== i));

  const descFor = (suite: string): Desc => availDesc[normName(suite)] ?? EMPTY_DESC;
  const setDescFor = (suite: string, patch: Partial<Desc>) =>
    setAvailDesc((m) => ({ ...m, [normName(suite)]: { ...descFor(suite), ...patch } }));

  const dbaValue = useCallback((name: string): string => {
    const key = normName(name);
    if (dba[key] != null) return dba[key];
    const d = defaults?.displayNames ?? {};
    if (d[key]) return d[key];
    for (const [k, v] of Object.entries(d)) if (k && (key.includes(k) || k.includes(key))) return v;
    return "";
  }, [dba, defaults]);
  const setDbaFor = (name: string, val: string) => setDba((m) => ({ ...m, [normName(name)]: val }));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await putOverride({});
      setStatus({ ok: true, msg: "Saved — the public page will refresh momentarily." });
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  };

  const publicHref = slug ? `/centers/${slug}` : "#";
  const hoodCount = defaults?.neighborhood.length ?? 0;
  const availSf = vacants.reduce((s, v) => s + v.sf, 0);

  return (
    <section className="card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>Public Website</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Photos, site plan, availabilities &amp; tenant display names for the public leasing page. Tenants &amp; vacancies sync from the rent roll.
          </div>
        </div>
        <a href={publicHref} target="_blank" rel="noreferrer" className="btn primary" style={{ textDecoration: "none" }}>
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
              <ImageSlot label="Hero photo (3000×1500)" url={assets.hero} busy={busyKey === "hero"} pct={pct} onPick={onHero} onClear={() => clearAsset((a) => ({ ...a, hero: undefined }))} />
              <ImageSlot label="Site plan" url={assets.sitePlan} busy={busyKey === "siteplan"} pct={pct} onPick={onPlan} onClear={() => clearAsset((a) => ({ ...a, sitePlan: undefined }))} />
              {Array.from({ length: hoodCount }).map((_, i) => (
                <ImageSlot
                  key={i}
                  label={`Neighborhood: ${defaults?.neighborhood[i]?.title ?? `photo ${i + 1}`}`}
                  url={assets.neighborhood?.[i]}
                  busy={busyKey === `hood${i}`}
                  pct={pct}
                  onPick={(f) => onHood(f, i)}
                  onClear={() => clearAsset((a) => { const arr = [...(a.neighborhood ?? [])]; arr[i] = ""; return { ...a, neighborhood: arr }; })}
                />
              ))}
            </div>
          </div>

          {/* AVAILABLE SPACES */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={LABEL}>Available spaces</div>
              {hasRoll
                ? <span style={{ fontSize: 12, color: "var(--muted)" }}>{vacants.length} available · {fmt(availSf)} SF · synced from the rent roll</span>
                : <button className="btn" style={{ padding: "6px 12px", fontSize: 13 }} onClick={addSpace} type="button">+ Add space</button>}
            </div>

            {hasRoll ? (
              vacants.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>No vacancies on the current rent roll — the public page shows a “fully leased” note.</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "110px 90px 1fr 150px 150px", gap: 8, ...LABEL, fontSize: 10 }}>
                    <div>Suite</div><div>SF</div><div>Marketing note</div><div>Kind</div><div>Frontage</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {vacants.map((v) => {
                      const d = descFor(v.suite);
                      return (
                        <div key={v.suite} style={{ display: "grid", gridTemplateColumns: "110px 90px 1fr 150px 150px", gap: 8, alignItems: "center" }}>
                          <div style={READONLY} title={v.suite}>{v.suite}</div>
                          <div style={READONLY}>{fmt(v.sf)}</div>
                          <input style={INPUT} placeholder="e.g. Corner bay, grocery-adjacent" value={d.notes} onChange={(e) => setDescFor(v.suite, { notes: e.target.value })} />
                          <input style={INPUT} placeholder="Kind (e.g. Inline retail)" value={d.kind} onChange={(e) => setDescFor(v.suite, { kind: e.target.value })} />
                          <input style={INPUT} placeholder="Frontage" value={d.frontage} onChange={(e) => setDescFor(v.suite, { frontage: e.target.value })} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Suite &amp; SF sync from the rent roll — add the descriptions, then Save.</div>
                </>
              )
            ) : (
              <>
                {spaces.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No marketed availabilities — the public page shows a “fully leased” note.</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {spaces.map((s, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 90px 1fr 150px 150px 32px", gap: 8, alignItems: "center" }}>
                      <input style={INPUT} placeholder="Suite" value={s.suite} onChange={(e) => setSpace(i, { suite: e.target.value })} />
                      <input style={INPUT} placeholder="SF" type="number" value={s.sf || ""} onChange={(e) => setSpace(i, { sf: Number(e.target.value) })} />
                      <input style={INPUT} placeholder="Marketing note (e.g. Corner bay, grocery-adjacent)" value={s.notes} onChange={(e) => setSpace(i, { notes: e.target.value })} />
                      <input style={INPUT} placeholder="Kind" value={s.kind} onChange={(e) => setSpace(i, { kind: e.target.value })} />
                      <input style={INPUT} placeholder="Frontage" value={s.frontage} onChange={(e) => setSpace(i, { frontage: e.target.value })} />
                      <button type="button" onClick={() => removeSpace(i)} title="Remove" style={{ ...INPUT, cursor: "pointer", color: RED, textAlign: "center", padding: "8px 0" }}>×</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* DBA */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={LABEL}>Tenant display names (DBA)</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: -4 }}>
              Public roster name for each current tenant. Blank = use the rent-roll name.
            </div>
            {tenants.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No live rent-roll tenants loaded for {code}.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 }}>
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
            <button type="button" className="btn primary" onClick={save} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save website"}
            </button>
            {status && <div style={{ fontSize: 13, fontWeight: 600, color: status.ok ? BRAND : RED }}>{status.msg}</div>}
          </div>
        </>
      )}
    </section>
  );
}

function ImageSlot({ label, url, busy, pct, onPick, onClear }: {
  label: string; url?: string; busy: boolean; pct: number;
  onPick: (f: File | null) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const takeImage = (files: FileList | null): File | null => {
    if (!files) return null;
    for (const f of Array.from(files)) if (f.type.startsWith("image/")) return f;
    return null;
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const f = takeImage(e.dataTransfer?.files ?? null);
    if (f) onPick(f);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ ...LABEL, fontSize: 10 }}>{label}</div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${url ? "Replace" : "Upload"} ${label} — click or drop an image`}
        title="Click or drop an image to upload"
        onClick={() => { if (!busy) ref.current?.click(); }}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); ref.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={onDrop}
        style={{
          position: "relative", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden",
          border: `2px dashed ${dragOver ? BRAND : "var(--border)"}`,
          background: dragOver ? "rgba(11,74,125,0.07)" : "rgba(15,23,42,0.02)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: busy ? "default" : "pointer", transition: "border-color .15s, background .15s",
        }}>
        {url && !busy
          ? <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
          : !busy && <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: "0 10px" }}>
              {dragOver ? "Drop to upload" : "Drag & drop or click to upload"}
            </span>}
        {busy && (
          <div className="imp-anim" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "var(--card)" }}>
            <div style={{ position: "relative", width: 54, height: 54 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px dashed var(--import-blue-border)", animation: "impHalo 9s linear infinite" }} />
              <svg width="54" height="54" viewBox="0 0 54 54" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="27" cy="27" r="20" fill="none" stroke="var(--import-strip-div)" strokeWidth="5" />
                <circle cx="27" cy="27" r="20" fill="none" stroke="var(--import-blue)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${pct * RING_C} ${RING_C}`} style={{ transition: "stroke-dasharray .25s ease" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "var(--import-blue)", fontVariantNumeric: "tabular-nums" }}>{Math.round(pct * 100)}%</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 12.5, ...SHIMMER }}>Uploading…</div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="btn" style={{ fontSize: 12, padding: "6px 12px" }} disabled={busy} onClick={() => ref.current?.click()}>
          {url ? "Replace" : "Upload"}
        </button>
        {url && !busy && <button type="button" className="btn" style={{ fontSize: 12, padding: "6px 12px", color: RED }} onClick={onClear}>Remove</button>}
        <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { onPick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      </div>
    </div>
  );
}
