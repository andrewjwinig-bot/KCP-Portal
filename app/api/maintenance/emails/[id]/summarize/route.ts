import { NextRequest, NextResponse } from "next/server";
import { getEmail, saveEmail } from "@/lib/maintenance/emails";
import { isAIConfigured, summarizeEmail } from "@/lib/maintenance/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/maintenance/emails/:id/summarize
// Runs Claude triage on an existing email and persists aiSummary + aiCategories.
// Used to backfill emails received before ANTHROPIC_API_KEY was configured.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set" },
      { status: 503 },
    );
  }
  const email = await getEmail(params.id);
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const triage = await summarizeEmail(email.subject, email.textBody);
    email.aiSummary = triage.summary;
    email.aiCategories = triage.categories;
    await saveEmail(email);
    return NextResponse.json({ email });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Summarize failed" },
      { status: 500 },
    );
  }
}
