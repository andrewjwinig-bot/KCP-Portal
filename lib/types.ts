export type AllocationEmployee = {
  /** Optional employee ID from allocation workbook (column A) */
  employeeId?: string | number | null;
  /** Display name from allocation workbook (EmployeeName) */
  name: string;
  /** Normalized key (EmployeeKey) used for matching; optional if using employeeId */
  employeeKey?: string | null;
  /** True => REC, False => NR */
  recoverable: boolean;
  /** propertyKey -> allocation fraction (0..1) */
  allocations: Record<string, number>;
};

export type AllocationProperty = {
  key: string;
  /** Code/label shown in UI (usually same as key) */
  label: string;
  /** Friendly name from the Property Code/Property Name table, if present */
  name?: string | null;
};

export type AllocationTable = {
  employees: AllocationEmployee[];
  properties: AllocationProperty[];
  propertyNames: Record<string, string>;
};

export type PayrollEmployee = {
  /** Employee ID read from payroll register (column L) if present */
  employeeId?: string | number | null;
  name: string;
  salaryAmt: number;
  overtimeAmt: number;
  overtimeHours: number;
  holAmt: number;
  holHours: number;
  er401kAmt: number;
};

export type InvoiceLineKey =
  | "salaryREC"
  | "salaryNR"
  | "overtime"
  | "holREC"
  | "holNR"
  | "er401k";

export type EmployeeBreakdownLine = {
  employeeName: string;
  /** total pay component before allocation (company-wide) */
  base: number;
  /** allocation percent for this property (0..1) */
  pct: number;
  /** base * pct */
  amount: number;
  /** Optional ids for debugging */
  employeeId?: string | number | null;
  employeeKey?: string | null;
};

export type PropertyInvoice = {
  propertyKey: string;
  propertyLabel: string;
  propertyName?: string | null;
  salaryREC: number;
  salaryNR: number;
  overtime: number;
  holREC: number;
  holNR: number;
  er401k: number;
  total: number;

  breakdown?: Partial<Record<InvoiceLineKey, EmployeeBreakdownLine[]>>;
};

export type BuildInvoicesResult = {
  invoices: PropertyInvoice[];
  totals: Omit<PropertyInvoice, "propertyKey" | "propertyLabel" | "propertyName" | "breakdown">;
  payrollEmployees: PayrollEmployee[];
};
