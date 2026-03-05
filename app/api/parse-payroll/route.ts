import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

import { parseAllocationWorkbook } from "../../../lib/allocation/parseAllocationWorkbook";
import { parsePayrollRegisterExcel } from "../../../lib/payroll/parsePayrollRegisterExcel";
import { buildInvoices } from "../../../lib/invoicing/buildInvoices";
import type { AllocationEmployee } from "../../../lib/types";

/** Strip "Default - #N" suffix, normalize whitespace, convert to Title Case. */
function cleanAllocName(raw: string): string {
  const stripped = raw.replace(/\s*Default\s*-\s*#\d+\s*$/i, "").replace(/\s+/g, " ").trim();
  return stripped.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/** Extract the employee number from "Default - #N" suffix, e.g. "10". */
function extractEmpNumber(raw: string): string | undefined {
  return raw.match(/Default\s*-\s*#(\d+)/i)?.[1];
}

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
    // Single diagnostic log — Vercel shows this as the message for the request
    // Two short logs so neither gets truncated before the key values
    console.log(`[parse1] taxesEr=${payroll.totals.taxesErAmt} other=${payroll.totals.otherAmt} er401k=${payroll.totals.er401kAmt} salary=${payroll.totals.salaryAmt} emp=${payroll.employees.length}`);
    console.log(`[parse2] ${payroll.employees.map(e=>`${e.name}:tEr=${e.taxesErAmt}`).join(' | ')}`);

    // Load allocation workbook from the fixed location on disk
    const allocPath = path.join(process.cwd(), "data", "allocation.xlsx");
    const allocBuf = await readFile(allocPath);
    const allocation = parseAllocationWorkbook(allocBuf);

    // Build invoices: matching is done internally by buildInvoices
    const invoices = buildInvoices(payroll, allocation);

    // Also build a merged employee list for the UI (shows match status + amounts per employee)
    const payrollEmployees = payroll.employees;
    const mergedEmployees: (AllocationEmployee & { total: number; employeeNumber?: string })[] = allocation.employees.map((ae) => {
      const rawName = String(ae.name ?? "");
      const displayName = cleanAllocName(rawName);
      const employeeNumber = extractEmpNumber(rawName);
      const aId = ae.employeeId ?? ae.id ?? null;

      const pe =
        payrollEmployees.find((p) => aId != null && String(p.employeeId ?? "").trim() === String(aId).trim()) ??
        payrollEmployees.find((p) => {
          const pn = String(p.name ?? "").toLowerCase();
          const an = rawName.toLowerCase();
          return pn && an && (pn.includes(an) || an.includes(pn));
        }) ??
        null;

      // Position of this employee in the payroll register (for sort order)
      const payrollIndex = pe ? payrollEmployees.indexOf(pe) : 9999;

      const salaryAmt = pe?.salaryAmt ?? 0;
      const overtimeAmt = pe?.overtimeAmt ?? 0;
      const holAmt = pe?.holAmt ?? 0;
      const er401kAmt = pe?.er401kAmt ?? 0;
      const otherAmt = pe?.otherAmt ?? 0;
      const taxesErAmt = pe?.taxesErAmt ?? 0;

      return {
        ...ae,
        name: displayName,
        employeeNumber,
        payrollIndex,
        payrollName: pe?.name ?? null,
        salaryAmt,
        overtimeAmt,
        overtimeHours: pe?.overtimeHours ?? 0,
        holAmt,
        holHours: pe?.holHours ?? 0,
        er401kAmt,
        otherAmt,
        otherBreakdown: pe?.otherBreakdown ?? [],
        taxesErAmt,
        taxesErBreakdown: pe?.taxesErBreakdown ?? [],
        exclusions: pe?.exclusions ?? [],
        total: salaryAmt + overtimeAmt + holAmt + er401kAmt + otherAmt + taxesErAmt,
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
