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
  } catch (err: any) {
    // A failed read must not read as "nothing ticked" — the page would save
    // its next tick over every other one.
    console.error("[GET bank-rec/comments]", err?.message ?? err);
    return NextResponse.json({ error: "Could not load — refresh before making changes." }, { status: 503 });
  }
}

/** POST body: { comments: Record<string, string> } — or { patch } — see below. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // { patch: { key: value | null } } changes only those keys against what is
    // stored — two people ticking different accounts no longer overwrite each
    // other. The whole-map form ({ comments }) is still taken from an old page.
    let comments: Record<string, any> = {};
    if (body?.patch && typeof body.patch === "object") {
      const stored = (await getJSON(PREFIX, ID, { retryOnMiss: true })) ?? {};
      comments = { ...stored };
      for (const [k, v] of Object.entries(body.patch as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim() !== "") comments[k] = v; else delete comments[k];
      }
    } else if (body?.comments && typeof body.comments === "object") {
      for (const [k, v] of Object.entries(body.comments as Record<string, unknown>)) {
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
