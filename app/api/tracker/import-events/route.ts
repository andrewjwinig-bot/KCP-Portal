import { NextResponse } from "next/server";
import { getImportEvents, recordImport } from "@/lib/tracker/importEvents";
import { IMPORT_REMINDERS } from "@/lib/tracker/imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET → { events: { "<reminderId>": { at, by? } } } — last import per source. */
export async function GET() {
  try {
    return NextResponse.json({ events: await getImportEvents() });
  } catch {
    return NextResponse.json({ events: {} });
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
