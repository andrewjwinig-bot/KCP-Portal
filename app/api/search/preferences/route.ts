import { NextResponse } from "next/server";
import { getAssistantPrefs, addAssistantPref, removeAssistantPref, clearAssistantPrefs } from "@/lib/assistant/preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const prefs = await getAssistantPrefs();
  return NextResponse.json(prefs);
}

export async function POST(req: Request) {
  let body: { text?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Empty preference" }, { status: 400 });
  const prefs = await addAssistantPref(text);
  return NextResponse.json(prefs);
}

export async function DELETE(req: Request) {
  let body: { text?: string; all?: boolean };
  try { body = await req.json(); } catch { body = {}; }
  const prefs = body.all ? await clearAssistantPrefs() : await removeAssistantPref((body.text ?? "").trim());
  return NextResponse.json(prefs);
}
