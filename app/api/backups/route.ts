import { NextResponse } from "next/server";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { BACKUPS_PAGE, isPathAllowed } from "@/lib/users";
import {
  backupConfigured, documentFromSnapshot, listSnapshots, partBytes, readManifest,
  restoreFromSnapshot, runBackup,
} from "@/lib/backup/run";
import { backupHealth, folderOf, folderSummary } from "@/lib/backup/plan";
import { logAudit, auditIp } from "@/lib/audit";

// Backups (lib/backup) — gated to /backups (SENSITIVE_API_PREFIXES) and checked
// again here, since a snapshot holds every document in the store.
//
// GET                         → snapshots + health
// GET ?date=                  → that snapshot's folders
// GET ?date=&folder=          → the documents / files in a folder
// GET ?date=&part=n           → download a part (zip of JSON documents)
// GET ?date=&doc=<pathname>   → download one document or file as backed up
// POST { action: "run" }      → back up now (call again while it says partial)
// POST { action: "restore", date, paths?: string[], folder?: string }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function allowed() {
  const u = await budgetUser();
  return u && isPathAllowed(u, BACKUPS_PAGE) ? u : null;
}

export async function GET(req: Request) {
  const user = await allowed();
  if (!user) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!backupConfigured()) return NextResponse.json({ configured: false, snapshots: [] });
  const q = new URL(req.url).searchParams;
  const date = q.get("date");
  try {
    if (!date) {
      const snapshots = await listSnapshots();
      return NextResponse.json({ configured: true, snapshots, health: backupHealth(snapshots[0]?.finishedAt ?? null, new Date()) });
    }
    if (!DATE.test(date)) return NextResponse.json({ error: "Bad date." }, { status: 400 });
    const part = q.get("part");
    if (part) {
      const bytes = await partBytes(date, Number(part));
      if (!bytes) return NextResponse.json({ error: "Part not found." }, { status: 404 });
      return new Response(new Uint8Array(bytes), { headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="kcp-portal-backup-${date}-part-${Number(part)}.zip"`,
        "cache-control": "no-store",
      } });
    }
    const m = await readManifest(date);
    if (!m) return NextResponse.json({ error: "No finished snapshot for that date." }, { status: 404 });
    const doc = q.get("doc");
    if (doc) {
      const bytes = await documentFromSnapshot(m, doc);
      if (!bytes) return NextResponse.json({ error: "Not in this snapshot." }, { status: 404 });
      const name = doc.split("/").pop() || "file";
      return new Response(new Uint8Array(bytes), { headers: {
        "content-type": doc.endsWith(".json") ? "application/json" : "application/octet-stream",
        "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
        "cache-control": "no-store",
      } });
    }
    const folder = q.get("folder");
    if (folder) {
      return NextResponse.json({ date, folder, entries: m.entries.filter((e) => folderOf(e.pathname) === folder) });
    }
    return NextResponse.json({
      date, startedAt: m.startedAt, finishedAt: m.finishedAt, parts: m.parts, documents: m.documents,
      files: m.files, bytes: m.bytes, filesCopied: m.filesCopied, errors: m.errors, folders: folderSummary(m.entries),
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not read the backups: ${e instanceof Error ? e.message : String(e)}` }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const user = await allowed();
  if (!user) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!backupConfigured()) return NextResponse.json({ error: "Backups need Vercel Blob storage." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "run") {
      const r = await runBackup({ deadline: Date.now() + 240_000, force: !!body.fresh });
      if (r.status === "done") {
        await logAudit({ event: "backup.run", user, ip: auditIp(req), detail: `${r.date} · ${r.manifest.documents} documents, ${r.manifest.files} files` }).catch(() => {});
        return NextResponse.json({ status: "done", date: r.date, documents: r.manifest.documents, files: r.manifest.files, errors: r.manifest.errors });
      }
      return NextResponse.json(r);
    }
    if (body.action === "restore") {
      const date = String(body.date ?? "");
      if (!DATE.test(date)) return NextResponse.json({ error: "Bad date." }, { status: 400 });
      const m = await readManifest(date);
      if (!m) return NextResponse.json({ error: "No finished snapshot for that date." }, { status: 404 });
      let paths: string[] = Array.isArray(body.paths) ? body.paths.map(String) : [];
      if (typeof body.folder === "string" && body.folder) paths = m.entries.filter((e) => folderOf(e.pathname) === body.folder).map((e) => e.pathname);
      paths = [...new Set(paths)];
      if (!paths.length) return NextResponse.json({ error: "Nothing chosen to restore." }, { status: 400 });
      if (paths.length > 2000) return NextResponse.json({ error: "Restore at most 2,000 items at a time." }, { status: 400 });
      const r = await restoreFromSnapshot(m, paths, user);
      await logAudit({ event: "backup.restore", user, ip: auditIp(req), detail: `from ${date} · ${r.restored.length} restored, ${r.failed.length} failed · previous saved to ${r.savedTo}` }).catch(() => {});
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
