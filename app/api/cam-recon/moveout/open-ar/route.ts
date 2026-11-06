import { NextResponse } from "next/server";
import { tenantOpenAr } from "@/lib/cam/moveout/deposit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?unitRef=&tenant=&year= — the departing tenant's open balance off their
// newest monthly statement, for the interim page's close-out package. Gated
// with the rest of /api/cam-recon.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const unitRef = u.searchParams.get("unitRef") ?? "";
  const year = Number(u.searchParams.get("year")) || new Date().getFullYear();
  if (!unitRef) return NextResponse.json({ error: "unitRef required" }, { status: 400 });
  const openAr = await tenantOpenAr(unitRef, u.searchParams.get("tenant") || undefined, year);
  return NextResponse.json({ openAr });
}
