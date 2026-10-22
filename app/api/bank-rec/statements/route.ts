import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "bank-rec";
const ID     = "statements";

export const runtime = "nodejs";

type CheckedMap = Record<string, boolean>;

export async function GET() {
  try {
    const data = (await getJSON(PREFIX, ID)) as CheckedMap | null;
    return NextResponse.json({ statements: data ?? {} });
  } catch {
    return NextResponse.json({ statements: {} });
  }
}

/** POST body: { statements: Record<string, boolean> } — replaces the whole map. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const statements: CheckedMap = {};
    if (body?.statements && typeof body.statements === "object") {
      for (const [k, v] of Object.entries(body.statements)) {
        if (v === true) statements[k] = true;
      }
    }
    await storeJSON(PREFIX, ID, statements);
    return NextResponse.json({ ok: true, statements });
  } catch (err: any) {
    console.error("[POST /api/bank-rec/statements]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
