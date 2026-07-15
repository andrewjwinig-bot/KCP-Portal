"use client";

// CAM backup invoices — attach the supporting invoices/statements to each
// property expense line (by GL account), and download a per-property package.
// Files live behind /api/cam-recon/attachments; this is the UI over it.

import { useCallback, useEffect, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";

const BRAND = "#0b4a7d";
const RED = "#b91c1c";

export type AttachmentMeta = {
  id: string; property: string; year: number; account: string; accountLabel: string;
  name: string; contentType: string; size: number; uploadedAt: string; uploadedBy?: string; includeInPackage: boolean;
};

const fmtSize = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const fileUrl = (a: AttachmentMeta, dl = false) => `/api/cam-recon/attachments/file?property=${encodeURIComponent(a.property)}&year=${a.year}&id=${a.id}${dl ? "&download=1" : ""}`;

/** Load all attachments for a property/year and expose counts by account. */
export function useCamBackup(property: string | null, year: number) {
  const [items, setItems] = useState<AttachmentMeta[]>([]);
  const [blob, setBlob] = useState(false); // Blob configured server-side → direct upload
  const refresh = useCallback(() => {
    if (!property) { setItems([]); return; }
    fetch(`/api/cam-recon/attachments?property=${encodeURIComponent(property)}&year=${year}`)
      .then((r) => (r.ok ? r.json() : { attachments: [] }))
      .then((j) => { setItems(Array.isArray(j.attachments) ? j.attachments : []); setBlob(!!j.blob); })
      .catch(() => setItems([]));
  }, [property, year]);
  useEffect(() => { refresh(); }, [refresh]);
  const countByAccount: Record<string, number> = {};
  for (const a of items) countByAccount[a.account] = (countByAccount[a.account] ?? 0) + 1;
  return { items, countByAccount, total: items.length, refresh, blob };
}

/** Small paperclip trigger showing the attachment count for a line. */
export function BackupTrigger({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} title={count ? `${count} backup file${count === 1 ? "" : "s"}` : "Attach backup"} style={{
      display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid var(--border)", borderRadius: 6,
      padding: "2px 7px", background: count ? "rgba(11,74,125,0.08)" : "transparent", color: count ? BRAND : "var(--muted)",
      cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700,
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
      {count || ""}
    </button>
  );
}

/** Download-package button for a whole property/year. */
export function PackageButton({ property, year, total }: { property: string; year: number; total: number }) {
  return (
    <a
      href={total ? `/api/cam-recon/attachments/package?property=${encodeURIComponent(property)}&year=${year}` : undefined}
      className="btn"
      style={{ fontSize: 12, fontWeight: 700, opacity: total ? 1 : 0.5, pointerEvents: total ? "auto" : "none", display: "inline-flex", alignItems: "center", gap: 6 }}
      title={total ? "Download all backup invoices (Tax · Insurance · Operating) as one zip" : "No backup files uploaded yet"}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      Download backup {total ? `(${total})` : ""}
    </a>
  );
}

/** Mixed-center backup: two separate buckets — Office and Retail — so a mixed
 *  property's invoices never get confused. Office files store under the office
 *  fixture key, retail under the retail key: physically separate, and
 *  forward-compatible with per-portion tenant packages. */
export function MixedCamBackup({ retailProperty, officeProperty, year }: {
  retailProperty: string; officeProperty: string; year: number;
}) {
  const retail = useCamBackup(retailProperty, year);
  const office = useCamBackup(officeProperty, year);
  const [open, setOpen] = useState<"office" | "retail" | null>(null);
  const rows = [
    { key: "office" as const, title: "Office", b: office, property: officeProperty },
    { key: "retail" as const, title: "Retail", b: retail, property: retailProperty },
  ];
  const openRow = rows.find((r) => r.key === open);
  return (
    <div className="card">
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND }}>CAM Backup · {year}</div>
      <div className="muted small" style={{ marginTop: 2, marginBottom: 12, maxWidth: 640 }}>
        This is a mixed center — office and retail invoices are kept in two separate buckets so they don&rsquo;t get mixed up. Attach each portion&rsquo;s invoices below; download either as its own package.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "rgba(15,23,42,0.02)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{r.title} portion</div>
              <div className="muted small">{r.b.total} file{r.b.total === 1 ? "" : "s"} attached</div>
            </div>
            <button onClick={() => setOpen(r.key)} className="btn" style={{ fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
              Add / view
            </button>
            <PackageButton property={r.property} year={year} total={r.b.total} />
          </div>
        ))}
      </div>
      {openRow && (
        <CamBackupModal
          property={openRow.property} year={year} account="ALL" label={`${openRow.title} invoices`}
          items={openRow.b.items} blobEnabled={openRow.b.blob} onClose={() => setOpen(null)} onChange={openRow.b.refresh}
        />
      )}
    </div>
  );
}

/** Per-line modal: upload / view / download / delete backup for one account. */
export function CamBackupModal({ property, year, account, label, items, blobEnabled = false, onClose, onChange }: {
  property: string; year: number; account: string; label: string;
  items: AttachmentMeta[]; blobEnabled?: boolean; onClose: () => void; onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const mine = items.filter((a) => a.account === account);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Direct browser → Vercel Blob upload (no 4.5 MB serverless limit; multipart
  // for big files), then record the resulting URL. Used when Blob is configured.
  async function uploadViaBlob(file: File) {
    const seg = (v: string) => String(v).replace(/[^\w.\-]+/g, "_").slice(0, 80) || "_";
    const path = `cam-attachments/${seg(property)}/${year}/${seg(account)}/${seg(file.name || "attachment")}`;
    const blob = await blobUpload(path, file, {
      access: "private",
      handleUploadUrl: "/api/cam-recon/attachments/blob-upload",
      contentType: file.type || undefined,
      multipart: file.size > 8 * 1024 * 1024,
      clientPayload: JSON.stringify({ property, year, account, accountLabel: label, name: file.name }),
    });
    const res = await fetch("/api/cam-recon/attachments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blobUrl: blob.url, property, year, account, accountLabel: label, name: file.name, size: file.size, contentType: file.type }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Could not record upload (HTTP ${res.status})`);
  }

  async function upload(files: FileList | File[] | null) {
    const arr = Array.from(files ?? []);
    if (arr.length === 0) return;
    setBusy(true); setError(null); setProgress({ done: 0, total: arr.length });
    try {
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        if (blobEnabled) {
          await uploadViaBlob(file);
        } else {
          const fd = new FormData();
          fd.append("file", file); fd.append("property", property); fd.append("year", String(year));
          fd.append("account", account); fd.append("accountLabel", label);
          let res: Response;
          try { res = await fetch("/api/cam-recon/attachments", { method: "POST", body: fd }); }
          catch { throw new Error("Network error — check your connection and try again."); }
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            const hint = res.status === 413 ? " — file too large" : res.status === 401 ? " — please sign in again" : "";
            throw new Error((body?.error ?? `Upload failed (HTTP ${res.status})`) + hint);
          }
        }
        setProgress({ done: i + 1, total: arr.length });
      }
      onChange();
    } catch (e: any) { setError(e?.message ?? "Upload failed"); }
    finally { setBusy(false); setProgress(null); }
  }
  async function remove(id: string) {
    setBusy(true);
    try { await fetch(`/api/cam-recon/attachments?property=${encodeURIComponent(property)}&year=${year}&id=${id}`, { method: "DELETE" }); onChange(); }
    catch { /* ignore */ } finally { setBusy(false); }
  }
  async function toggleInclude(a: AttachmentMeta) {
    setBusy(true);
    try { await fetch("/api/cam-recon/attachments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property, year, id: a.id, includeInPackage: !a.includeInPackage }) }); onChange(); }
    catch { /* ignore */ } finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "7vh 16px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 540, background: "var(--card)", borderRadius: 14, boxShadow: "0 20px 50px rgba(15,23,42,0.3)", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND }}>Backup · {year}</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{label} <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>· {account}</span></div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="muted small" style={{ marginBottom: 12 }}>The invoices/statements that make up this expense — kept with the {year} number as backup.</div>

        <label
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!busy) upload(e.dataTransfer.files); }}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center",
            border: `2px dashed ${dragOver ? BRAND : "var(--border)"}`, borderRadius: 12, padding: "22px 16px",
            cursor: busy ? "default" : "pointer", background: dragOver ? "rgba(11,74,125,0.07)" : "rgba(15,23,42,0.02)",
            transition: "border-color .15s, background .15s",
          }}
        >
          {busy ? (
            <>
              <span className="imp-anim" style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: BRAND, animation: "spin .8s linear infinite" }} />
              <div style={{ fontWeight: 700, fontSize: 14, color: BRAND }}>
                Uploading{progress ? ` ${progress.done + 1} of ${progress.total}` : ""}…
              </div>
              <div className="muted small">Keeping them with the {year} number as backup.</div>
            </>
          ) : (
            <>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={dragOver ? BRAND : "var(--muted)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Drag &amp; drop invoices here</div>
              <div className="muted small">or <span style={{ color: BRAND, fontWeight: 700 }}>browse your files</span> · PDF, image, Excel, Word</div>
            </>
          )}
          <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.csv,.doc,.docx" onChange={(e) => upload(e.target.files)} style={{ display: "none" }} disabled={busy} />
        </label>
        {error && <div className="small" style={{ color: RED, fontWeight: 700, marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
          {mine.length === 0 ? (
            <div className="muted small">No backup attached yet.</div>
          ) : mine.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "rgba(15,23,42,0.02)" }}>
              <a href={fileUrl(a)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "var(--text)" }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                <div className="muted small">{fmtSize(a.size)} · {new Date(a.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{a.uploadedBy ? ` · ${a.uploadedBy}` : ""}</div>
              </a>
              <label className="small muted" title="Include in the tenant package / zip" style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", flexShrink: 0 }}>
                <input type="checkbox" checked={a.includeInPackage} onChange={() => toggleInclude(a)} /> package
              </label>
              <a href={fileUrl(a, true)} title="Download" style={{ color: BRAND, flexShrink: 0, display: "flex" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              </a>
              <button onClick={() => remove(a.id)} title="Delete" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
