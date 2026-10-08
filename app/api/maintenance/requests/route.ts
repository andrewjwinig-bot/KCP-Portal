import { NextRequest, NextResponse } from "next/server";
import {
  applyPatch,
  emptyRequest,
  type MaintenanceRequest,
} from "@/lib/maintenance/requests";
import { listRequests, saveRequest } from "@/lib/maintenance/requestsStorage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const requests = await listRequests();
    return NextResponse.json({ requests });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load requests" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: Partial<MaintenanceRequest>;
  try {
    body = (await req.json()) as Partial<MaintenanceRequest>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fresh = applyPatch(emptyRequest(), { ...body, source: body.source ?? "portal" });
  if (!fresh.subject.trim()) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }
  try {
    await saveRequest(fresh);
    return NextResponse.json({ request: fresh }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 },
    );
  }
}
