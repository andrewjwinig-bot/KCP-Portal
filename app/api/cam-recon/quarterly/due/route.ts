import { NextResponse } from "next/server";
import { quarterlyObligations } from "@/lib/cam/retail/quarterlySend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET → every closed quarterly CAM statement (Wawa @ 9510) the portal owes
 *  and has not sent, with its due date and what is in the way. Drew's Work
 *  Queue lists them, red once overdue, so a quarter cannot sit unsent unseen. */
export async function GET() {
  const due = await quarterlyObligations();
  return NextResponse.json({ due });
}
