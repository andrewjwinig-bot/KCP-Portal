import { NextResponse } from "next/server";
import { listCloseOuts } from "@/lib/cam/moveout/queue";
import { listMoveoutSends } from "@/lib/cam/moveout/sendLog";
import { moveoutCandidates } from "@/lib/cam/moveout/candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — the move-out close-out queue (waiting / ready / approved) plus the
// recent finalized sends. Backs the dashboard card and the interim page.
//
// A queued entry shows only while the rent roll still says the tenant LEFT
// (`kind: "vacated"` — gone from the newest roll covering their property). A
// tenant who renewed stays on the roll, so their entry is hidden here at once
// rather than waiting for the daily watcher to prune it. Approved entries are
// the finalized record and always show.
export async function GET() {
  const [closeOuts, sends, cands] = await Promise.all([
    listCloseOuts(),
    listMoveoutSends(10),
    moveoutCandidates().catch(() => []),
  ]);
  const gone = new Set(cands.filter((c) => c.kind === "vacated").map((c) => `${c.propertyCode}|${c.unitRef}`));
  const shown = cands.length
    ? closeOuts.filter((c) => c.status === "approved" || gone.has(`${c.property}|${c.unitRef}`))
    : closeOuts;
  return NextResponse.json({ closeOuts: shown, sends });
}
