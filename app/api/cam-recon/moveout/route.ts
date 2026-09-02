import { NextResponse } from "next/server";
import { listCloseOuts } from "@/lib/cam/moveout/queue";
import { listMoveoutSends } from "@/lib/cam/moveout/sendLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — the move-out close-out queue (waiting / ready / approved) plus the
// recent finalized sends. Backs the dashboard card and the interim page.
export async function GET() {
  const [closeOuts, sends] = await Promise.all([listCloseOuts(), listMoveoutSends(10)]);
  return NextResponse.json({ closeOuts, sends });
}
