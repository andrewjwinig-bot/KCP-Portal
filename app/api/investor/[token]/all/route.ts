import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { checkInvestorAccess } from "@/lib/investors/k1Access";
import { publishedK1sForOwner, saveK1 } from "@/lib/investors/k1Store";
import { readK1Bytes } from "@/lib/investors/k1Files";
import { coveredOwnerIds } from "@/lib/investors/linkCoverage";
import { partnershipName } from "@/lib/investors/partnershipName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public — every K-1 on this link, as one zip.
 *
 * An investor in fifteen partnerships was downloading fifteen files one at a
 * time, each landing as "K-1 2025 <their name>.pdf" and so each overwriting or
 * numbering against the last. The point of one link per investor is that
 * everything they hold is in one place; taking it one file at a time gives that
 * back.
 *
 * SAME GUARDS AS THE SINGLE-FILE ROUTE, deliberately reusing the same two
 * functions rather than re-deriving the rule: `checkInvestorAccess` (token +
 * PIN) and then, per document, PUBLISHED and belonging to an owner this link
 * covers. A zip must never be the lenient door — it is the one route that
 * returns many documents at once, so a wrong rule here leaks in bulk.
 */
export async function GET(req: NextRequest, { params }: { params: { token: string } }): Promise<Response> {
  const access = await checkInvestorAccess((await params).token, req);
  if (!access.ok) {
    return NextResponse.json({ error: access.error, ...(access.pinRequired ? { pinRequired: true } : {}) }, { status: access.status });
  }
  const link = access.link!;

  const ids = coveredOwnerIds(link);
  const docs = (await Promise.all(ids.map((id) => publishedK1sForOwner(id)))).flat();
  if (docs.length === 0) return NextResponse.json({ error: "Nothing to download." }, { status: 404 });

  const zip = new JSZip();
  // Named by PARTNERSHIP and year, not by the uploaded filename — those run
  // from "k1.pdf" to "2025 Parkwood SC K1P V1 FINAL SIGNED.pdf", and several
  // resolve to the same thing. The interest is in the name too, because a
  // trust interest and a personal one in the same partnership are two
  // different K-1s that would otherwise collide.
  const used = new Set<string>();
  const safe = (s: string) => s.replace(/[^\w.\- ]+/g, " ").replace(/\s+/g, " ").trim();
  let added = 0;
  for (const d of docs) {
    let base = safe(`${d.taxYear} ${partnershipName(d.propertyCode)} K-1 ${d.ownerName}`).slice(0, 120);
    let name = `${base}.pdf`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n}).pdf`;
    used.add(name.toLowerCase());
    try {
      zip.file(name, await readK1Bytes(d));
      added++;
    } catch {
      // One unreadable file must not cost the investor the other fourteen.
      zip.file(`${base} — COULD NOT BE READ.txt`,
        "This document could not be read when the zip was built. Please contact us and we will send it to you directly.");
    }
  }
  if (added === 0) return NextResponse.json({ error: "Those files could not be read." }, { status: 502 });

  // Recorded like any other read — a bulk download is still a read of each.
  try {
    const at = new Date().toISOString();
    for (const d of docs) {
      d.views = [...(d.views ?? []), { at }].slice(-50);
      d.viewCount = (d.viewCount ?? 0) + 1;
      d.lastViewedAt = at;
      await saveK1(d);
    }
  } catch { /* best-effort */ }

  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  const file = safe(`Schedule K-1s ${link.ownerName}`) || "Schedule K-1s";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${file}.zip"`,
      "Cache-Control": "no-store, private",
    },
  });
}
