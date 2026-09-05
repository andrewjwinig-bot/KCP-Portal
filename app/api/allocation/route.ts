import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { parseAllocationWorkbook } from "../../../lib/allocation/parseAllocationWorkbook";

function cleanName(raw: string): string {
  return raw.replace(/\s*Default\s*-\s*#\d+\s*$/i, "").replace(/\s+/g, " ").trim();
}

function extractEmpNumber(raw: string): string | undefined {
  return raw.match(/Default\s*-\s*#(\d+)/i)?.[1];
}

export async function GET() {
  try {
    const allocPath = path.join(process.cwd(), "data", "allocation.xlsx");
    const buf = await readFile(allocPath);
    const { employees } = parseAllocationWorkbook(buf);

    const data = employees.map((e) => ({
      name: cleanName(String(e.name ?? "")),
      employeeNumber: extractEmpNumber(String(e.name ?? "")),
      recoverable: e.recoverable,
      allocations: e.allocations ?? e.top ?? {},
    }));

    return NextResponse.json({ employees: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
