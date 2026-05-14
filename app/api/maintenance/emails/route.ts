import { NextResponse } from "next/server";
import { listEmails } from "@/lib/maintenance/emails";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const emails = await listEmails();
    return NextResponse.json({ emails });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load inbox" },
      { status: 500 },
    );
  }
}
