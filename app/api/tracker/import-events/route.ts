import { NextResponse } from "next/server";
import { getImportEvents, recordImport } from "@/lib/tracker/importEvents";
import { IMPORT_REMINDERS, type ImportCoverage } from "@/lib/tracker/imports";
import { outstandingGlUploads } from "@/lib/financials/operating-statements/outstanding";
import { monthlyStatements } from "@/lib/financials/operating-statements/mappingStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** How many properties still owe a GL for the period that is due.
 *
 *  The GL is THIRTEEN files, so "somebody imported" is not "the month is in" —
 *  and the timestamp cannot tell them apart. `outstandingGlUploads` compares
 *  each mapped property's newest posted period against the one expected, which
 *  is the actual question, so the card reads the ledger rather than the log.
 *  Best-effort: an error here leaves the reminder on its timestamp rather than
 *  taking the card down. */
async function glCoverage(): Promise<ImportCoverage | null> {
  try {
    const [{ behind }, mapped] = await Promise.all([outstandingGlUploads(new Date()), monthlyStatements()]);
    const total = mapped.length;
    if (!total) return null;
    return { done: total - behind.length, total, behind: behind.map((b) => b.propertyCode) };
  } catch {
    return null;
  }
}

/** GET → { events: { "<reminderId>": { at, by? } }, coverage: { "<id>": {...} } }
 *  — the last import per source, plus (where the app can check) how much of it
 *  actually landed. */
export async function GET() {
  try {
    const [events, gl] = await Promise.all([getImportEvents(), glCoverage()]);
    const coverage: Record<string, ImportCoverage> = {};
    if (gl) coverage["imp-gl"] = gl;
    return NextResponse.json({ events, coverage });
  } catch {
    return NextResponse.json({ events: {}, coverage: {} });
  }
}

const VALID_IDS = new Set(IMPORT_REMINDERS.map((r) => r.id));

/** POST { id, by? } — record a client-side import (e.g. the CC statement coded
 *  in the browser). Recipient ids are whitelisted to the known reminders. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body?.id ?? "");
    if (!VALID_IDS.has(id)) return NextResponse.json({ error: "Unknown import id" }, { status: 400 });
    const by = typeof body?.by === "string" ? body.by : null;
    await recordImport(id, { at: new Date().toISOString(), by });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
