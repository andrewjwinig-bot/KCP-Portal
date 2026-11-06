import { NextRequest, NextResponse } from "next/server";
import { getShareLinks, setShareLink, type ShareLinkKind } from "@/lib/shareLinks/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const links = await getShareLinks();
    return NextResponse.json({ units: links.units, properties: links.properties });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load share links" },
      { status: 500 },
    );
  }
}

// PUT body: { kind: "unit" | "property", key: string, url: string }
// An empty url clears the link.
export async function PUT(req: NextRequest) {
  let body: { kind?: unknown; key?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind === "unit" || body.kind === "property" ? body.kind as ShareLinkKind : null;
  const key = typeof body.key === "string" ? body.key.trim() : "";
  let url = typeof body.url === "string" ? body.url.trim() : "";
  if (!kind || !key) {
    return NextResponse.json({ error: "kind and key are required" }, { status: 400 });
  }
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Enter a full link starting with https://" }, { status: 400 });
  }
  url = url.slice(0, 2000);

  try {
    const links = await setShareLink(kind, key, url);
    return NextResponse.json({ units: links.units, properties: links.properties });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save share link" },
      { status: 500 },
    );
  }
}
