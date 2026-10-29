import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import {
  getOrEmptySuiteInformation,
  saveSuiteInformation,
} from "@/lib/suites/informationStorage";
import { sanitizeFields, type SuiteAttachment } from "@/lib/suites/information";
import { isPlanCrop, isTurn } from "@/lib/suites/floorplanTurn";

// Admin-only — site auth middleware covers everything outside the public
// /submit and /reserve paths.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB — Vercel request body cap is ~4.5 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function unitRefOf(params: { unitRef: string }): string {
  return decodeURIComponent(params.unitRef).trim();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { unitRef: string } },
) {
  const unitRef = unitRefOf(params);
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });
  const info = await getOrEmptySuiteInformation(unitRef);
  return NextResponse.json({ info });
}

// Save the free-text + dropdown fields. Attachments and floorplan are left
// untouched — they go through POST / DELETE below.
export async function PUT(
  req: NextRequest,
  { params }: { params: { unitRef: string } },
) {
  const unitRef = unitRefOf(params);
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await getOrEmptySuiteInformation(unitRef);
  const fields = sanitizeFields(body);
  const info = await saveSuiteInformation({ ...existing, ...fields, unitRef });
  return NextResponse.json({ info });
}

// Turn or crop the floor plan: `{ floorplanTurn: 0 | 90 | 180 | 270 | null }`
// sets how it is drawn (on the unit page and the website; null → the automatic
// rule — a turn also drops the crop, which was drawn at the old turn);
// `{ floorplanCrop: PlanCrop | null }` sets the part the website shows large.
// The file itself is never rewritten.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { unitRef: string } },
) {
  const unitRef = unitRefOf(params);
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });
  let body: { floorplanTurn?: unknown; floorplanCrop?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const existing = await getOrEmptySuiteInformation(unitRef);
  if (!existing.floorplan) return NextResponse.json({ error: "No floorplan on file" }, { status: 404 });
  let fp: SuiteAttachment = { ...existing.floorplan };
  if ("floorplanTurn" in body) {
    const turn = body.floorplanTurn;
    if (turn !== null && !isTurn(turn)) return NextResponse.json({ error: "floorplanTurn must be 0, 90, 180, 270 or null" }, { status: 400 });
    delete fp.turn;
    delete fp.crop;
    if (isTurn(turn)) fp = { ...fp, turn };
  }
  if ("floorplanCrop" in body) {
    const crop = body.floorplanCrop;
    if (crop !== null && !isPlanCrop(crop)) return NextResponse.json({ error: "Invalid floorplanCrop" }, { status: 400 });
    delete fp.crop;
    if (isPlanCrop(crop)) {
      const r4 = (n: number) => Math.round(n * 10000) / 10000;
      fp = { ...fp, crop: { x: r4(crop.x), y: r4(crop.y), w: r4(crop.w), h: r4(crop.h), rotation: crop.rotation } };
    }
  }
  const info = await saveSuiteInformation({ ...existing, floorplan: fp });
  return NextResponse.json({ info });
}

// Upload a file. `kind` = "attachment" (appended to the list) or
// "floorplan" (replaces the single floorplan).
export async function POST(
  req: NextRequest,
  { params }: { params: { unitRef: string } },
) {
  const unitRef = unitRefOf(params);
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const kind = String(form.get("kind") ?? "attachment");
  if (kind !== "attachment" && kind !== "floorplan") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB).` },
      { status: 400 },
    );
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "File must be an image or PDF." },
      { status: 400 },
    );
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "File uploads are not configured on the server." },
      { status: 503 },
    );
  }

  let info;
  try {
    const result = await put(`suites/${encodeURIComponent(unitRef)}/${file.name}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });

    const attachment: SuiteAttachment = {
      id: "satt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: file.name,
      url: result.url,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };

    const existing = await getOrEmptySuiteInformation(unitRef);
    const next =
      kind === "floorplan"
        ? { ...existing, floorplan: attachment }
        : { ...existing, attachments: [...existing.attachments, attachment] };
    info = await saveSuiteInformation(next);
  } catch (e) {
    // Always return JSON so the client doesn't choke on an empty error body.
    return NextResponse.json(
      { error: `Upload failed: ${e instanceof Error ? e.message : "storage error"}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ info });
}

// Remove a file. `?kind=floorplan` clears the floorplan; otherwise
// `?fileId=` removes that attachment.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { unitRef: string } },
) {
  const unitRef = unitRefOf(params);
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });

  const kind = req.nextUrl.searchParams.get("kind") ?? "attachment";
  const fileId = req.nextUrl.searchParams.get("fileId") ?? "";
  const existing = await getOrEmptySuiteInformation(unitRef);

  let removedUrl: string | null = null;
  let next = existing;
  if (kind === "floorplan") {
    removedUrl = existing.floorplan?.url ?? null;
    next = { ...existing, floorplan: null };
  } else {
    const target = existing.attachments.find((a) => a.id === fileId);
    if (!target) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    removedUrl = target.url;
    next = { ...existing, attachments: existing.attachments.filter((a) => a.id !== fileId) };
  }

  const info = await saveSuiteInformation(next);

  // Best-effort blob cleanup — the record already dropped the reference.
  if (removedUrl && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(removedUrl);
    } catch { /* ignore */ }
  }

  return NextResponse.json({ info });
}
