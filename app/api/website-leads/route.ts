import { NextResponse } from "next/server";
import { listLeads } from "@/lib/site/leadStore";

// Website Leads (lib/site/leadStore.ts) — every inquiry from a space page,
// newest first. Gated to /website-leads (SENSITIVE_API_PREFIXES): it carries
// prospects' names, emails and phones. NOT under /api/website/, which is public.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ leads: await listLeads() });
  } catch (e) {
    return NextResponse.json({ error: `Could not read the leads: ${e instanceof Error ? e.message : String(e)}` }, { status: 503 });
  }
}
