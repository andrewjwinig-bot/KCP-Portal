import { NextResponse } from "next/server";
import { z } from "zod";
import { readFile } from "fs/promises";
import path from "path";

import { parsePayrollRegisterExcel } from "../../../lib/payroll/parsePayrollRegisterExcel";
import { parseAllocationWorkbook } from "../../../lib/allocation/parseAllocationWorkbook";
import { buildInvoices } from "../../../lib/invoicing/buildInvoices";

export const runtime = "nodejs";

const BodySchema = z.object({
  payroll: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());

    const payrollBuf = Buffer.from(body.payroll, "base64");
    const payrollEmployees = parsePayrollRegisterExcel(payrollBuf);

    const allocationPath = path.join(process.cwd(), "data", "allocation.xlsx");
    const allocBuf = await readFile(allocationPath);
    const allocation = parseAllocationWorkbook(allocBuf);

    const result = buildInvoices(payrollEmployees, allocation);

    // Enrich employee detail for UI (keep backward compatible fields)
    const merged = allocation.employees.map((ae) => {
      const pe =
        payrollEmployees.find((p) => String(p.employeeId ?? "") === String(ae.employeeId ?? "")) ??
        payrollEmployees.find((p) => p.name && ae.name && p.name.toLowerCase().includes(ae.name.toLowerCase())) ??
        null;

      return {
        employeeId: ae.employeeId ?? null,
        employeeKey: ae.employeeKey ?? null,
        name: ae.name,
        recoverable: ae.recoverable,
        allocations: (ae as any).allocations ?? {},
        payrollName: pe?.name ?? null,
        salaryAmt: pe?.salaryAmt ?? 0,
        overtimeAmt: pe?.overtimeAmt ?? 0,
        overtimeHours: pe?.overtimeHours ?? 0,
        holAmt: pe?.holAmt ?? 0,
        holHours: pe?.holHours ?? 0,
        er401kAmt: pe?.er401kAmt ?? 0,
      };
    });

    return NextResponse.json({
      allocation: { ...allocation, employees: merged },
      payrollEmployees,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 400 }
    );
  }
}
