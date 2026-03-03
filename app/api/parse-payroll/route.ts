import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

import { parseAllocationWorkbook } from "../../../lib/allocation/parseAllocationWorkbook";
import { parsePayrollRegisterExcel } from "../../../lib/payroll/parsePayrollRegisterExcel";
import { buildInvoices } from "../../../lib/invoicing/buildInvoices";
import type { AllocationEmployee } from "../../../lib/types";

/**
 * POST /api/parse-payroll
 *
 * Body: { fileBase64: string, filename?: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fileBase64 = body?.fileBase64 as string | undefined;

    if (!fileBase64) {
      return NextResponse.json({ error: "Missing fileBase64" }, { status: 400 });
    }

    // Convert base64-encoded file to Buffer for XLSX parsing
    const payrollBuf = Buffer.from(fileBase64, "base64");
    const payroll = parsePayrollRegisterExcel(payrollBuf);

    // Load allocation workbook from the fixed location on disk
    const allocPath = path.join(process.cwd(), "data", "allocation.xlsx");
    const allocBuf = await readFile(allocPath);
    const allocation = parseAllocationWorkbook(allocBuf);

    // Build invoices: matching is done internally by buildInvoices
    const invoices = buildInvoices(payroll, allocation);

    // Also build a merged employee list for the UI (shows match status + amounts per employee)
    const payrollEmployees = payroll.employees;
    const mergedEmployees: (AllocationEmployee & { total: number })[] = allocation.employees.map((ae) => {
      const aId = ae.employeeId ?? ae.id ?? null;

      const pe =
        payrollEmployees.find((p) => aId != null && String(p.employeeId ?? "").trim() === String(aId).trim()) ??
        payrollEmployees.find((p) => {
          const pn = String(p.name ?? "").toLowerCase();
          const an = String(ae.name ?? "").toLowerCase();
          return pn && an && (pn.includes(an) || an.includes(pn));
        }) ??
        null;

      const salaryAmt = pe?.salaryAmt ?? 0;
      const overtimeAmt = pe?.overtimeAmt ?? 0;
      const holAmt = pe?.holAmt ?? 0;
      const er401kAmt = pe?.er401kAmt ?? 0;

      return {
        ...ae,
        payrollName: pe?.name ?? null,
        salaryAmt,
        overtimeAmt,
        overtimeHours: pe?.overtimeHours ?? 0,
        holAmt,
        holHours: pe?.holHours ?? 0,
        er401kAmt,
        total: salaryAmt + overtimeAmt + holAmt + er401kAmt,
        allocations: ae.allocations ?? ae.top ?? {},
      };
    });

    const properties = Object.values(allocation.propertyMeta).map((m) => ({
      key: m.code || m.label,
      label: m.label,
    }));

    return NextResponse.json({
      payroll: {
        payDate: payroll.payDate ?? null,
        employees: payroll.employees,
        totals: payroll.totals,
      },
      employees: mergedEmployees,
      invoices,
      properties,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
