import { NextRequest, NextResponse } from "next/server";
import {
  getOrEmptyCamConfig,
  saveCamConfig,
} from "@/lib/cam/configStorage";
import { sanitizeCamConfig } from "@/lib/cam/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unitRefOf(params: { unitRef: string }): string {
  return decodeURIComponent(params.unitRef).trim();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { unitRef: string } },
) {
  const unitRef = unitRefOf(params);
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });
  const config = await getOrEmptyCamConfig(unitRef);
  return NextResponse.json({ config });
}

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

  const clean = sanitizeCamConfig(unitRef, body);
  const config = await saveCamConfig(clean);
  return NextResponse.json({ config });
}
