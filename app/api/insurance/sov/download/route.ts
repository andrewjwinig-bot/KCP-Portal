// GET → the broker's own workbook with the portal's data written in.
// `?bi=1` also replaces BI values with the rent roll's annualised billings.

import { NextResponse } from "next/server";
import { getStoredSov, buildFilledSov } from "@/lib/insurance/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const stored = await getStoredSov();
  if (!stored) return NextResponse.json({ error: "Upload the Statement of Values first." }, { status: 404 });
  const updateBi = new URL(req.url).searchParams.get("bi") === "1";
  const out = await buildFilledSov(stored, { updateBi });
  if (!out) return NextResponse.json({ error: "The stored file no longer reads as a Statement of Values." }, { status: 422 });
  // Keep the broker's filename, marked as ours, so it goes back recognisably.
  const base = stored.fileName.replace(/\.xlsx$/i, "");
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `${base} - updated ${stamp}.xlsx`.replace(/["\r\n]/g, "");
  return new NextResponse(out.buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
