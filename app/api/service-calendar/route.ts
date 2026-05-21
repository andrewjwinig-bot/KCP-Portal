import { NextResponse } from "next/server";
import {
  listServiceItems,
  saveServiceItem,
  removeServiceItem,
  newServiceItemId,
  type ServiceItem,
} from "@/lib/serviceCalendar/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await listServiceItems();
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const months: number[] = Array.isArray(body.months)
      ? Array.from<number>(new Set(body.months.map((m: unknown) => Number(m))))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
          .sort((a, b) => a - b)
      : [];
    const item: ServiceItem = {
      id: typeof body.id === "string" && body.id ? body.id : newServiceItemId(),
      propertyLabel: String(body.propertyLabel ?? "").trim(),
      service: String(body.service ?? "").trim(),
      months,
      amount: Math.max(0, Number(body.amount ?? 0) || 0),
      notes: String(body.notes ?? ""),
      createdAt: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!item.propertyLabel || !item.service) {
      return NextResponse.json({ error: "Property and service are required" }, { status: 400 });
    }
    await saveServiceItem(item);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await removeServiceItem(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete" },
      { status: 500 },
    );
  }
}
