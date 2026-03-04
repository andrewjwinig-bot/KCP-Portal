export type PropertyRef = {
  key: string;
  label?: string;
  name?: string; // optional friendly name
};

export type AllocationEmployee = {
  // Preferred stable identifier (matches payroll register column L)
  employeeId?: string | number;

  // Back-compat / older sheets
  id?: string | number;
  name: string;
  employeeKey?: string;

  recoverable: boolean;

  /**
   * Preferred allocation map: propertyKey -> fraction (0..1) or percent (0..100)
   */
  allocations?: Record<string, number>;

  /**
   * Back-compat allocation map (older code used `top`)
   */
  top?: Record<string, number>;

  /**
   * Optional grouping map: group name -> fraction (how marketing alloc splits across groups)
   */
  marketingToGroups?: Record<string, number>;

  // These fields are attached after merging with payroll parse results
  payrollName?: string | null;
  salaryAmt?: number;
  overtimeAmt?: number;
  overtimeHours?: number;
  holAmt?: number;
  holHours?: number;
  er401kAmt?: number;
};

export type AllocationTable = {
  employees: AllocationEmployee[];
  properties?: PropertyRef[];
  prs: {
    salaryREC: Record<string, Record<string, number>>;
    salaryNR: Record<string, Record<string, number>>;
  };
  propertyMeta: Record<string, { code?: string; label: string }>;
};

export type PayrollEmployee = {
  employeeId?: string | number;
  name: string;
  salaryAmt: number;
  overtimeAmt: number;
  overtimeHours: number;
  holAmt: number;
  holHours: number;
  er401kAmt: number;
  /** Pay items excluded from salary (Commission, Bonus, Auto Allowance, etc.) */
  exclusions?: Array<{ label: string; amount: number }>;
};

export type PayrollTotals = {
  salaryAmt: number;
  overtimeAmt: number;
  overtimeHours: number;
  holAmt: number;
  holHours: number;
  er401kAmt: number;
};

export type PayrollParseResult = {
  payDate?: string | null;
  employees: PayrollEmployee[];
  totals: PayrollTotals;
};

export type DrilldownRow = {
  employee: string;
  baseAmount: number;
  allocPct: number;
  amount: number;
};

export type PropertyInvoice = {
  propertyKey: string;
  propertyLabel: string;
  propertyName?: string;
  propertyCode?: string;
  payDate?: string | null;
  lines?: Array<{ description: string; accCode: string; amount: number }>;
  salaryREC: number;
  salaryNR: number;
  overtime: number;
  holREC: number;
  holNR: number;
  er401k: number;
  total: number;
  drilldown?: Record<string, DrilldownRow[]>;
  /** Footnotes about excluded pay items (commissions, bonuses, auto allowance) */
  footnotes?: string[];
};
