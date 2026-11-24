import { NextResponse } from "next/server";
import { readSecureFile, writeSecureFile, SECURE_FILES } from "@/lib/secureFiles";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { logAudit, auditIp } from "@/lib/audit";
import { parseAllocationWorkbook } from "../../../lib/allocation/parseAllocationWorkbook";

function cleanName(raw: string): string {
  return raw.replace(/\s*Default\s*-\s*#\d+\s*$/i, "").replace(/\s+/g, " ").trim();
}

function extractEmpNumber(raw: string): string | undefined {
  return raw.match(/Default\s*-\s*#(\d+)/i)?.[1];
}

export async function GET() {
  try {
    const buf = await readSecureFile(SECURE_FILES.allocation);
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

/** Replace the employee allocation workbook (Payroll Invoicer page, gated to
 *  "/" by SENSITIVE_API_PREFIXES). It lives in protected storage now, so a new
 *  version is uploaded here rather than committed. Checked before it is saved:
 *  a file that does not read as an allocation workbook is refused. */
export async function POST(req: Request) {
  try {
    const user = await budgetUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose the allocation workbook (.xlsx)." }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    let count = 0;
    try {
      count = parseAllocationWorkbook(buf).employees.length;
    } catch {
      count = 0;
    }
    if (!count) return NextResponse.json({ error: "That file doesn't read as the allocation workbook — no employees found." }, { status: 400 });
    await writeSecureFile(SECURE_FILES.allocation, buf);
    await logAudit({ event: "allocation.replace", user, ip: auditIp(req), detail: `${file.name} · ${count} employees` }).catch(() => {});
    return NextResponse.json({ ok: true, employees: count });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
