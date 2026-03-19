import { NextRequest, NextResponse } from "next/server";
import { storeJSON, listJSON } from "@/lib/storage";

export async function GET() {
  try {
    const all = await listJSON("periods");
    const metas = all
      .map(({ id, name, payDate, savedAt, invoices, employees }) => ({
        id,
        name,
        payDate,
        savedAt,
        total: (invoices ?? []).reduce((s: number, inv: any) => s + (inv.total ?? 0), 0),
        employeeCount: (employees ?? []).length,
      }))
      .sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1));
    return NextResponse.json({ periods: metas });
  } catch {
    return NextResponse.json({ periods: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, payroll, invoices, employees } = body;
    if (!name?.trim() || !invoices) {
      return NextResponse.json({ error: "name and invoices are required" }, { status: 400 });
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const period = {
      id,
      name: name.trim(),
      payDate: payroll?.payDate ?? null,
      savedAt: new Date().toISOString(),
      payroll,
      invoices,
      employees,
    };
    await storeJSON("periods", id, period);
    return NextResponse.json({ id, savedAt: period.savedAt });
  } catch (e: any) {
    const msg = e?.message || e?.toString() || "Unknown error";
    console.error("[POST /api/periods] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
