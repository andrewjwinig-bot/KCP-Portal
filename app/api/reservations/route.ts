import { NextResponse } from "next/server";
import { listReservations } from "@/lib/reservations/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const reservations = await listReservations();
    return NextResponse.json({ reservations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load reservations" },
      { status: 500 },
    );
  }
}
