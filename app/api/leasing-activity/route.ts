import { NextRequest, NextResponse } from "next/server";
import { getJSON, storeJSON } from "@/lib/storage";
import { EMPTY_LEASING_ACTIVITY, SEED_LEASING_ACTIVITY, type LeasingActivity } from "@/lib/leasing/types";

const PREFIX = "leasing-activity";
const ID     = "all";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = (await getJSON(PREFIX, ID)) as LeasingActivity | null;
    if (!data) {
      // First-time read: persist the seed so the editor sees the same rows the
      // status report draws and Nancy can edit from there.
      await storeJSON(PREFIX, ID, SEED_LEASING_ACTIVITY);
      return NextResponse.json({ leasingActivity: SEED_LEASING_ACTIVITY });
    }
    return NextResponse.json({ leasingActivity: data });
  } catch {
    return NextResponse.json({ leasingActivity: EMPTY_LEASING_ACTIVITY });
  }
}

/** PUT /api/leasing-activity — replaces the entire payload. */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const data: LeasingActivity = {
      prospects: Array.isArray(body?.prospects) ? body.prospects : [],
      pendingLeases: Array.isArray(body?.pendingLeases) ? body.pendingLeases : [],
      tenantsVacating: Array.isArray(body?.tenantsVacating) ? body.tenantsVacating : [],
      optionsToRenew: Array.isArray(body?.optionsToRenew) ? body.optionsToRenew : [],
    };
    await storeJSON(PREFIX, ID, data);
    return NextResponse.json({ ok: true, leasingActivity: data });
  } catch (err: any) {
    console.error("[PUT /api/leasing-activity]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
