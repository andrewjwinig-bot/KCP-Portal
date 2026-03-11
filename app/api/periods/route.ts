import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const PERIODS_DIR = path.join(process.cwd(), "data", "periods");

async function ensureDir() {
  if (!existsSync(PERIODS_DIR)) {
    await mkdir(PERIODS_DIR, { recursive: true });
  }
}

export async function GET() {
  await ensureDir();
  try {
    const files = (await readdir(PERIODS_DIR)).filter((f) => f.endsWith(".json")).sort().reverse();
    const metas = await Promise.all(
      files.map(async (f) => {
        const raw = await readFile(path.join(PERIODS_DIR, f), "utf-8");
        const { id, name, payDate, savedAt, invoices, employees } = JSON.parse(raw);
        const total = (invoices ?? []).reduce((s: number, inv: any) => s + (inv.total ?? 0), 0);
        return { id, name, payDate, savedAt, total, employeeCount: (employees ?? []).length };
      })
    );
    return NextResponse.json({ periods: metas });
  } catch {
    return NextResponse.json({ periods: [] });
  }
}

export async function POST(req: NextRequest) {
  console.log("[POST /api/periods] handler called");
  try {
    await ensureDir();
    const body = await req.json();
    const { name, payroll, invoices, employees } = body;
    console.log("[POST /api/periods] parsed body, name:", name, "invoices:", invoices?.length);
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
    const filePath = path.join(PERIODS_DIR, `${id}.json`);
    console.log("[POST /api/periods] writing to:", filePath);
    await writeFile(filePath, JSON.stringify(period), "utf-8");
    console.log("[POST /api/periods] write succeeded, id:", id);
    return NextResponse.json({ id, savedAt: period.savedAt });
  } catch (e: any) {
    const msg = e?.message || e?.toString() || "Unknown error";
    console.error("[POST /api/periods] error:", msg, e?.stack);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
