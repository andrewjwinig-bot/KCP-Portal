"use client";

// Dashboard "New Tenants on the Website" — Harry's prompt to describe a tenant
// the public center page does not know yet (a new lease or a turnover on a
// DESIGNED page, /centers/<slug>). Until he does, the suite reads "Coming
// soon" there; what he saves here — the store name, its line, website,
// online-ordering link, logo and a short description — is exactly what the
// public page shows. Hidden when nothing is waiting.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pill, TONE_AMBER } from "@/app/components/Pill";
import { centerImageSrc } from "@/lib/centers/registry";

type Pending = {
  code: string; center: string; slug: string;
  suite: string; unitRef: string; occupant: string; sf: number;
  suggestedName?: string;
};
type Form = { tenant: string; use: string; url: string; order: string; orderLabel: string; logo: string; blurb: string };

const SECTION: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const FIELD: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 4, display: "block" };

export default function NewTenantsCard({ order = -1 }: { order?: number }) {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [open, setOpen] = useState<Pending | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    fetch("/api/centers/tenant-profiles", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setPending(j?.pending ?? []))
      .catch(() => setPending([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!pending?.length) return null;
  return (
    <div className="card" style={{ order }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={SECTION}>New Tenants on the Website</div>
        <Pill tone={TONE_AMBER}>{pending.length} to describe</Pill>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        These tenants are on the rent roll but the public center page has nothing on them yet, so they read
        &ldquo;Coming soon&rdquo;. Add the store name, website and logo as they should appear to the public.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pending.map((p) => (
          <div key={`${p.code}-${p.suite}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{p.occupant}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {p.center} · Suite {p.suite} · {p.sf.toLocaleString("en-US")} SF
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <a href={`/centers/${p.slug}`} target="_blank" rel="noopener" style={{ color: "#0b4a7d", fontWeight: 600, fontSize: 12 }}>View page ↗</a>
              <button className="btn primary" style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700 }} onClick={() => setOpen(p)}>Add details</button>
            </span>
          </div>
        ))}
      </div>
      {open && mounted && createPortal(<ProfileDialog p={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />, document.body)}
    </div>
  );
}

function ProfileDialog({ p, onClose, onSaved }: { p: Pending; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>({ tenant: p.suggestedName ?? "", use: "", url: "", order: "", orderLabel: "Order online", logo: "", blurb: "" });
  const [busy, setBusy] = useState<"" | "upload" | "save">("");
  const [err, setErr] = useState("");
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload"); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("key", `logo-${p.suite}`);
      const res = await fetch(`/api/centers/${p.code}/upload-direct`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || !j.url) throw new Error(j.error ?? "Upload failed");
      setF((x) => ({ ...x, logo: j.url }));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };

  const save = async () => {
    if (!f.tenant.trim()) { setErr("The store name is required."); return; }
    setBusy("save"); setErr("");
    try {
      const res = await fetch("/api/centers/tenant-profiles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: p.code, suite: p.suite, rollName: p.occupant, ...f, orderLabel: f.order ? f.orderLabel : undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `Save failed (${res.status})`);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(""); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "56px 16px 32px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Tenant details" className="card"
        style={{ width: 560, maxWidth: "100%", boxShadow: "0 30px 70px rgba(15,23,42,0.38)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{p.occupant}</div>
            <div className="muted" style={{ fontSize: 12 }}>{p.center} · Suite {p.suite} · <code style={{ fontSize: 11 }}>{p.unitRef}</code></div>
          </div>
          <button className="btn" onClick={onClose} title="Close" style={{ marginLeft: "auto" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ gridColumn: "1 / -1" }}><span style={FIELD}>Store name (as the public sees it)</span>
            <input value={f.tenant} onChange={set("tenant")} placeholder="e.g. Toyosu Sushi & Poke" style={{ width: "100%" }} autoFocus /></label>
          <label style={{ gridColumn: "1 / -1" }}><span style={FIELD}>What it is</span>
            <input value={f.use} onChange={set("use")} placeholder="e.g. Sushi & poke · Takeout" style={{ width: "100%" }} /></label>
          <label style={{ gridColumn: "1 / -1" }}><span style={FIELD}>Website</span>
            <input value={f.url} onChange={set("url")} placeholder="https://" style={{ width: "100%" }} /></label>
          <label><span style={FIELD}>Online ordering / booking link</span>
            <input value={f.order} onChange={set("order")} placeholder="Optional" style={{ width: "100%" }} /></label>
          <label><span style={FIELD}>Button reads</span>
            <select value={f.orderLabel} onChange={set("orderLabel")} disabled={!f.order} style={{ width: "100%" }}>
              <option>Order online</option><option>Shop online</option><option>Book online</option>
            </select></label>
          <div style={{ gridColumn: "1 / -1" }}>
            <span style={FIELD}>Logo</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 120, height: 60, border: "1px dashed var(--border)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "var(--card)" }}>
                {f.logo ? <img src={centerImageSrc(f.logo)} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  : <span className="muted" style={{ fontSize: 11 }}>No logo</span>}
              </div>
              <label className="btn" style={{ cursor: "pointer" }}>
                {busy === "upload" ? "Uploading…" : f.logo ? "Replace" : "Upload logo"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: "none" }} onChange={(e) => upload(e.target.files?.[0])} />
              </label>
              {f.logo && <button className="btn" onClick={() => setF((x) => ({ ...x, logo: "" }))}>Remove</button>}
            </div>
          </div>
          <label style={{ gridColumn: "1 / -1" }}><span style={FIELD}>Short description (optional)</span>
            <textarea value={f.blurb} onChange={set("blurb")} rows={2} maxLength={240} style={{ width: "100%" }} /></label>
        </div>

        {err && <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600, marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!!busy} onClick={save}>{busy === "save" ? "Publishing…" : "Publish to the website"}</button>
        </div>
      </div>
    </div>
  );
}
