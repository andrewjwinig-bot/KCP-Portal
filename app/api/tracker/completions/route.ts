import { NextResponse } from "next/server";
import { completionKey, getCompletions } from "@/lib/tracker/completionStore";
import { getRun } from "@/lib/statements/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET → { completions: { "<year>-<month0>-<taskId>": { at, by?, source? } } }
 *  Server-recorded task completions (e.g. auto-completed when an invoicer run is
 *  processed) so the dashboard/tracker can show them checked across browsers. */
export async function GET() {
  try {
    const completions = await getCompletions();
    // A Laser Statement month already in the store IS that month's "Laser
    // Statements" task done — months imported before the import ticked the
    // task count too. Checks this month, last month and next.
    const now = new Date();
    await Promise.all([-1, 0, 1].map(async (d) => {
      const dt = new Date(now.getFullYear(), now.getMonth() + d, 1);
      const key = completionKey(dt.getFullYear(), dt.getMonth(), "m-stmts");
      if (completions[key]) return;
      const run = await getRun(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`).catch(() => null);
      const src = run?.sources?.[run.sources.length - 1];
      if (run) completions[key] = { at: src?.importedAt ?? run.updatedAt, by: src?.importedBy ?? undefined, source: "laser-statement" };
    }));
    return NextResponse.json({ completions });
  } catch {
    return NextResponse.json({ completions: {} });
  }
}
