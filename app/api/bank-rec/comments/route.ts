import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "bank-rec";
const ID     = "comments";

export const runtime = "nodejs";

type CommentsMap = Record<string, string>;

export async function GET() {
  try {
    const data = (await getJSON(PREFIX, ID)) as CommentsMap | null;
    return NextResponse.json({ comments: data ?? {} });
  } catch {
    return NextResponse.json({ comments: {} });
  }
}

/** POST body: { comments: Record<string, string> } — replaces the whole map. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const comments: CommentsMap = {};
    if (body?.comments && typeof body.comments === "object") {
      for (const [k, v] of Object.entries(body.comments)) {
        if (typeof v === "string" && v.trim() !== "") comments[k] = v;
      }
    }
    await storeJSON(PREFIX, ID, comments);
    return NextResponse.json({ ok: true, comments });
  } catch (err: any) {
    console.error("[POST /api/bank-rec/comments]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
