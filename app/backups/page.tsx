"use client";

// Backups (lib/backup; owner, 11/2026: "some sort of way to back this up
// regularly"). Every night the portal's data is copied into a dated snapshot —
// 30 nights kept, then one a month for a year. Here: is the backup healthy,
// back up now, download a snapshot to keep a copy off Vercel, and put a
// document, or a whole folder, back the way it was.

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, RotateCcw, X } from "lucide-react";
import JSZip from "jszip";
import { PageHeader } from "@/app/components/PageHeader";
import { MetaLine } from "@/app/components/LastImported";
import { StatusBanner } from "@/app/components/StatusBanner";
import { StatPill } from "@/app/components/Pill";
import LoadingState from "@/app/components/LoadingState";
import { th, thL, td, tdL } from "@/app/components/tableStyles";

const ICON = { size: 16, strokeWidth: 1.75 } as const;

type Snap = { date: string; finishedAt: string; documents: number; files: number; bytes: number; parts: number; errors: number };
type Folder = { folder: string; documents: number; files: number; bytes: number };
type Detail = { date: string; finishedAt: string; parts: number; documents: number; files: number; bytes: number; errors: string[]; folders: Folder[] };
type Entry = { pathname: string; size: number; uploadedAt: string; part?: number; copy?: string };
type Restore = { date: string; label: string; paths?: string[]; folder?: string; count: number };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const size = (b: number) => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
const n = (x: number) => x.toLocaleString("en-US");

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export default function BackupsPage() {
  const [data, setData] = useState<{ configured: boolean; snapshots: Snap[]; health?: { ok: boolean; hoursAgo: number | null } } | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, Detail>>({});
  const [folderOpen, setFolderOpen] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry[]>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; title: string; text: string } | null>(null);
  const [restore, setRestore] = useState<Restore | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/backups", { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not load the backups.");
      setData(j);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const openSnap = async (date: string) => {
    if (open === date) { setOpen(null); return; }
    setOpen(date);
    setFolderOpen(null);
    if (!detail[date]) {
      const r = await fetch(`/api/backups?date=${date}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setDetail((d) => ({ ...d, [date]: j }));
      else setNotice({ tone: "danger", title: "Could not open that snapshot", text: j.error ?? "" });
    }
  };
  const openFolder = async (date: string, folder: string) => {
    const key = `${date}|${folder}`;
    if (folderOpen === key) { setFolderOpen(null); return; }
    setFolderOpen(key);
    if (!entries[key]) {
      const r = await fetch(`/api/backups?date=${date}&folder=${encodeURIComponent(folder)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setEntries((e) => ({ ...e, [key]: j.entries ?? [] }));
    }
  };

  // Back up now: the run stops after ~4 minutes and carries on when called
  // again, so keep calling until it is done.
  const backUpNow = async () => {
    setRunning("Starting…");
    setNotice(null);
    try {
      for (let i = 0; i < 20; i++) {
        const r = await fetch("/api/backups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run", fresh: i === 0 }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `Backup failed (${r.status}).`);
        if (j.status === "partial") { setRunning(`Copied ${n(j.done)} of ${n(j.total)} items…`); continue; }
        if (j.status === "done") {
          setNotice({ tone: j.errors?.length ? "danger" : "success", title: `Backed up ${day(j.date)}`, text: `${n(j.documents)} documents and ${n(j.files)} files copied${j.errors?.length ? ` · ${j.errors.length} could not be read` : ""}.` });
        }
        break;
      }
    } catch (e) {
      setNotice({ tone: "danger", title: "The backup did not finish", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(null);
      setDetail({});
      setEntries({});
      load();
    }
  };

  // One ZIP of every document in a snapshot, built in the browser from its
  // parts, to keep on OneDrive — a copy that does not depend on Vercel.
  const downloadSnapshot = async (s: Snap) => {
    setDownloading(s.date);
    try {
      const out = new JSZip();
      for (let p = 1; p <= s.parts; p++) {
        const r = await fetch(`/api/backups?date=${s.date}&part=${p}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`Part ${p} of ${s.parts} could not be downloaded.`);
        const z = await JSZip.loadAsync(await r.arrayBuffer());
        await Promise.all(Object.values(z.files).filter((f) => !f.dir).map(async (f) => out.file(`data/${f.name}`, await f.async("uint8array"))));
      }
      out.file("README.txt", [
        `KCP Portal data backup — night of ${s.date}, finished ${when(s.finishedAt)} ET.`,
        `${s.documents} documents (data/…, each the exact JSON the portal stores).`,
        `${s.files} files (PDFs, images, workbooks) are kept in the portal's own backup storage and are not in this download.`,
        `Restore from the Backups page in the portal.`,
      ].join("\n"));
      saveBlob(await out.generateAsync({ type: "blob", compression: "DEFLATE" }), `kcp-portal-backup-${s.date}.zip`);
    } catch (e) {
      setNotice({ tone: "danger", title: "Download failed", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setDownloading(null);
    }
  };

  const doRestore = async () => {
    if (!restore) return;
    setRestoring(true);
    try {
      const r = await fetch("/api/backups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "restore", date: restore.date, paths: restore.paths, folder: restore.folder }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Restore failed (${r.status}).`);
      setNotice({
        tone: j.failed?.length ? "danger" : "success",
        title: `Restored ${n(j.restored.length)} item${j.restored.length === 1 ? "" : "s"} from ${day(restore.date)}`,
        text: j.failed?.length ? `${j.failed.length} could not be restored: ${j.failed.slice(0, 3).join("; ")}` : "What was there before was saved first, so this can be undone.",
      });
      setRestore(null);
    } catch (e) {
      setNotice({ tone: "danger", title: "Restore failed", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setRestoring(false);
    }
  };

  const latest = data?.snapshots[0];
  const header = (
    <PageHeader
      title="Backups"
      info={<>Every night the portal copies all of its data — every document and file — into a dated snapshot. The last 30 nights are kept, then one a month for a year. Download a snapshot to keep a copy on OneDrive, or put a document or a whole folder back the way it was on that night.</>}
      actions={<button className="btn primary" disabled={!!running || !data?.configured} onClick={backUpNow}>{running ? "Backing up…" : "Back Up Now"}</button>}
      meta={latest && <MetaLine><span>Last backup {when(latest.finishedAt)}</span><span>· {data!.snapshots.length} snapshot{data!.snapshots.length === 1 ? "" : "s"} kept</span></MetaLine>}
    />
  );

  if (!data) return <main className="page">{header}{error ? <StatusBanner tone="danger" title="Something went wrong">{error}</StatusBanner> : <LoadingState status="Loading backups…" columns={6} rows={6} />}</main>;

  return (
    <main className="page">
      {header}
      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {!data.configured ? (
          <StatusBanner tone="info" title="Backups run on the live portal">Blob storage is not configured here, so there is nothing to back up.</StatusBanner>
        ) : running ? (
          <StatusBanner tone="info" icon="clock" title="Backing up">{running}</StatusBanner>
        ) : !latest ? (
          <StatusBanner tone="warning" title="No backup yet" actions={<button className="btn" onClick={backUpNow}>Back Up Now</button>}>The first nightly backup runs between 1 and 6am. Run one now to start.</StatusBanner>
        ) : data.health?.ok ? (
          <StatusBanner tone="success" title={`Backed up ${day(latest.date)}`}>{`${n(latest.documents)} documents and ${n(latest.files)} files · ${size(latest.bytes)} · finished ${when(latest.finishedAt)}`}</StatusBanner>
        ) : (
          <StatusBanner tone="danger" title="The nightly backup has stopped" actions={<button className="btn" onClick={backUpNow}>Back Up Now</button>}>{`The last snapshot finished ${data.health?.hoursAgo ?? "?"} hours ago. Run one now and let Drew know.`}</StatusBanner>
        )}
        {notice && <StatusBanner tone={notice.tone} title={notice.title} actions={<button className="btn sm" aria-label="Close" onClick={() => setNotice(null)}><X {...ICON} /></button>}>{notice.text}</StatusBanner>}
      </div>

      {latest && (
        <div className="pills" style={{ marginTop: 16 }}>
          <StatPill label="Documents" value={n(latest.documents)} />
          <StatPill label="Files" value={n(latest.files)} />
          <StatPill label="Size" value={size(latest.bytes)} />
          <StatPill label="Snapshots kept" value={String(data.snapshots.length)} total />
        </div>
      )}

      {data.snapshots.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><th style={thL}>Night of</th><th style={thL}>Finished</th><th style={th}>Documents</th><th style={th}>Files</th><th style={th}>Size</th><th style={thL}>Status</th><th style={th} /></tr>
            </thead>
            <tbody>
              {data.snapshots.map((s) => {
                const d = detail[s.date];
                return (
                  <Fragment key={s.date}>
                    <tr className="task-row" style={{ cursor: "pointer" }} onClick={() => openSnap(s.date)}>
                      <td style={{ ...tdL, fontWeight: 600 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{open === s.date ? <ChevronDown {...ICON} /> : <ChevronRight {...ICON} />}{day(s.date)}</span>
                      </td>
                      <td style={tdL}>{when(s.finishedAt)}</td>
                      <td style={td}>{n(s.documents)}</td>
                      <td style={td}>{n(s.files)}</td>
                      <td style={td}>{size(s.bytes)}</td>
                      <td style={{ ...tdL, color: s.errors ? "var(--c-b42318, #B42318)" : "var(--c-067647, #067647)" }}>{s.errors ? `${s.errors} not read` : "Complete"}</td>
                      <td style={td} onClick={(e) => e.stopPropagation()}>
                        <button className="btn sm" disabled={downloading === s.date} onClick={() => downloadSnapshot(s)}>
                          <Download {...ICON} />{downloading === s.date ? "Preparing…" : "Download"}
                        </button>
                      </td>
                    </tr>
                    {open === s.date && (
                      <tr>
                        <td colSpan={7} style={{ padding: "4px 16px 16px", maxWidth: 0 }}>
                          {!d ? <div className="muted" style={{ padding: 12 }}>Loading…</div> : (
                            <>
                              {d.errors.length > 0 && (
                                <div style={{ margin: "8px 0" }}>
                                  <StatusBanner compact tone="danger" title={`${d.errors.length} item${d.errors.length === 1 ? "" : "s"} could not be read that night`}>{d.errors.slice(0, 3).join(" · ")}</StatusBanner>
                                </div>
                              )}
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr><th style={thL}>Folder</th><th style={th}>Documents</th><th style={th}>Files</th><th style={th}>Size</th><th style={th} /></tr></thead>
                                <tbody>
                                  {d.folders.map((f) => {
                                    const key = `${s.date}|${f.folder}`;
                                    const list = entries[key];
                                    return (
                                      <Fragment key={f.folder}>
                                        <tr className="task-row" style={{ cursor: "pointer" }} onClick={() => openFolder(s.date, f.folder)}>
                                          <td style={tdL}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{folderOpen === key ? <ChevronDown {...ICON} /> : <ChevronRight {...ICON} />}<code>{f.folder}</code></span></td>
                                          <td style={td}>{f.documents ? n(f.documents) : "—"}</td>
                                          <td style={td}>{f.files ? n(f.files) : "—"}</td>
                                          <td style={td}>{size(f.bytes)}</td>
                                          <td style={td} onClick={(e) => e.stopPropagation()}>
                                            <button className="btn sm" onClick={() => setRestore({ date: s.date, label: f.folder, folder: f.folder, count: f.documents + f.files })}><RotateCcw {...ICON} />Restore Folder</button>
                                          </td>
                                        </tr>
                                        {folderOpen === key && (
                                          <tr><td colSpan={5} style={{ padding: "0 0 8px 28px", maxWidth: 0 }}>
                                            {!list ? <div className="muted" style={{ padding: 8 }}>Loading…</div> : (
                                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                                <tbody>
                                                  {list.slice(0, 300).map((e) => (
                                                    <tr key={e.pathname} className="task-row">
                                                      <td style={{ ...tdL, overflowWrap: "anywhere" }}><code>{e.pathname}</code></td>
                                                      <td style={{ ...tdL, whiteSpace: "nowrap" }} className="muted">saved {when(e.uploadedAt)}</td>
                                                      <td style={td}>{size(e.size)}</td>
                                                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                                                        <a className="btn sm" href={`/api/backups?date=${s.date}&doc=${encodeURIComponent(e.pathname)}`}><Download {...ICON} />Download</a>{" "}
                                                        <button className="btn sm" onClick={() => setRestore({ date: s.date, label: e.pathname, paths: [e.pathname], count: 1 })}><RotateCcw {...ICON} />Restore</button>
                                                      </td>
                                                    </tr>
                                                  ))}
                                                  {list.length > 300 && <tr><td colSpan={4} style={tdL} className="muted">{n(list.length - 300)} more — restore the whole folder, or download the snapshot.</td></tr>}
                                                </tbody>
                                              </table>
                                            )}
                                          </td></tr>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {restore && (
        <div className="no-print" onClick={() => !restoring && setRestore(null)} style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" role="dialog" aria-label="Restore" onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "100%", padding: 22 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Restore from {day(restore.date)}?</div>
            <div style={{ fontSize: 15, marginBottom: 6 }}>
              {restore.folder ? <>Every item in <code>{restore.label}</code> ({n(restore.count)}) goes back to how it was that night.</> : <><code style={{ overflowWrap: "anywhere" }}>{restore.label}</code> goes back to how it was that night.</>}
            </div>
            <div className="muted" style={{ fontSize: "var(--fs-14)", marginBottom: 16 }}>
              Changes made since then to {restore.count === 1 ? "it" : "these"} are replaced. What is there now is saved first, so the restore can be undone. Anything added to the folder since that night is left as it is.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" disabled={restoring} onClick={() => setRestore(null)}>Cancel</button>
              <button className="btn primary" disabled={restoring} onClick={doRestore}>{restoring ? "Restoring…" : `Restore ${n(restore.count)} Item${restore.count === 1 ? "" : "s"}`}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
