// Master Task Tracker definitions and date helpers. Extracted from the
// tracker page so other views (e.g. the dashboard) can compute which
// tasks fall due in a given window.

export const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
export const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export type Category = "routine" | "weekly" | "quarterly" | "seasonal" | "daily";

export const CATEGORIES: Record<Category, { label: string; pill: string; dot: string; bg: string; text: string; border: string }> = {
  daily:     { label: "Daily",           pill: "D", dot: "#0369a1", bg: "rgba(3,105,161,0.07)",   text: "#0369a1", border: "rgba(3,105,161,0.22)"   },
  weekly:    { label: "Weekly",          pill: "W", dot: "#0d9488", bg: "rgba(13,148,136,0.08)",  text: "#0d9488", border: "rgba(13,148,136,0.25)"  },
  routine:   { label: "Monthly",         pill: "M", dot: "#0b4a7d", bg: "rgba(11,74,125,0.08)",   text: "#0b4a7d", border: "rgba(11,74,125,0.25)"   },
  quarterly: { label: "Quarterly",       pill: "Q", dot: "#6d28d9", bg: "rgba(109,40,217,0.08)",  text: "#6d28d9", border: "rgba(109,40,217,0.25)"  },
  seasonal:  { label: "Annual / Seasonal",pill: "A", dot: "#b45309", bg: "rgba(180,83,9,0.08)",   text: "#b45309", border: "rgba(180,83,9,0.25)"    },
};

// ─── TASK DEFINITIONS ───────────────────────────────────────────────────────
//
// dueDay:       calendar day (1–31). For end-of-month tasks set endOfMonth: true.
// endOfMonth:   task is due at the end of the month (last calendar day).
// lastFriday:   task is due on the last Friday of the month (computed per month).
// approxDay:    display as "~Xth" (e.g. Close Prior Month ~20th).
// months:       which months this task applies (1=Jan … 12=Dec). Omit = every month.
// link:         internal route to open when the Open → button is clicked.
// instructions: step-by-step detail shown in a modal when the task label is clicked.

export interface InstructionStep {
  title: string;
  path?: string;   // software navigation path, e.g. "Module → Menu → Sub"
  items: string[]; // bullet points
  note?: string;   // asterisk note at the end of the step
  links?: { label: string; url: string }[]; // quick-access buttons (e.g. bank logins)
}

export interface TaskInstructions {
  intro?: string;
  steps: InstructionStep[];
}

export interface TaskDef {
  id: string;
  label: string;
  category: Category;
  dueDay: number;
  endOfMonth?: boolean;
  lastFriday?: boolean;
  everyWednesday?: boolean; // expands into one task per Wednesday in the month
  everyMonday?: boolean;    // expands into one task per Monday in the month
  approxDay?: boolean;
  pinned?: boolean;         // always shown at top, no checkbox, not on calendar
  months?: number[];
  notes?: string;
  pillOverride?: string;        // custom pill label instead of category default
  link?: string;
  instructions?: TaskInstructions;
}

export const TASK_DEFS: TaskDef[] = [

  // ── DAILY PINNED REMINDER — always shown at top, not on calendar ──────────
  {
    id: "daily-chase",
    label: "Chase Bank Approvals",
    category: "daily",
    dueDay: 0,
    pinned: true,
    notes: "Check and approve checks and ACHs",
    link: "https://secure.chase.com/web/auth/dashboard#/dashboard/fraudProtectionHub/overview/index",
  },
  {
    id: "daily-avid",
    label: "Approve Avid Invoices",
    category: "daily",
    dueDay: 0,
    pinned: true,
    link: "https://one.avidxchange.net/#/invoices",
    notes: "Check and approve open invoices.",
  },

  // ── MONTHLY ROUTINE — appears every month ─────────────────────────────────
  {
    id: "m-checks",
    label: "1st of the Month Checks",
    category: "routine",
    dueDay: 1,
    notes: "Print checks and cover sheet",
    instructions: {
      intro: "Processing 1st of the Month to Avid from Skyline",
      steps: [
        {
          title: "Send the invoices to Avid",
          path: "Property Management → Billing → Invoicing",
          items: [
            "Unit Ref. Number: 2000-First – 2000-Last (this captures all properties set up as individual units)",
            "Billing Date: 1st of the month being processed",
            "Email Format: Acrobat Format PDF",
            "Select Preview",
            "Save report to: Data\\Shared\\...\\Avid Processing\\1st of Month LIKM\\2026",
            "Do you wish to record these invoice charges?: NO",
            "Would you like to email Statements to the selected Occupants: YES",
          ],
          note: "CC yourself to receive confirmation of export.",
        },
        {
          title: "Record the charges",
          path: "Property Management → Billing → Record Scheduled Charges",
          items: [
            "Select the 2000 units",
            "Select the first of the month for the date",
            "Save the report",
          ],
        },
      ],
    },
  },
  {
    id: "m-lbr",
    label: "Liberty Bank Report",
    category: "routine",
    dueDay: 15,
    notes: "Reprojections",
    instructions: {
      intro: "JVIII and NILLC only",
      steps: [
        {
          title: "Update Reprojections",
          path: "Data → Accounting → 20XX Year End → Skyline → Cumulus Reports → Reprojections",
          items: [
            "Change Parameters to period month",
            "Change cell highlight of monthly period",
            "Hit F9 to refresh",
            "Publish to Values — save to: Data\\Shared\\Properties\\Business Plans - All Entities\\2025\\Business Parks\\Budgets for Liberty",
          ],
        },
        {
          title: "Update Cash Report",
          items: [
            "Add Operating Cash: Net Cash amounts for JVIII and NILLC, then subtract the TI Reserves",
            "Add TI Cash: TI Reserves",
            "Add Operating Cash + budgeted Cash Flow from the next month — subtract 20,050 for NILLC TI Escrow and 5,000 for JVIII TI Escrow",
          ],
        },
        {
          title: "Save the Report",
          items: [
            "Save to: Data\\Shared\\Properties\\Business Plans – All Entities\\20XX\\Business Parks\\Budgets for Liberty",
          ],
        },
      ],
    },
  },
  {
    id: "m-lhsc",
    label: "LHSC Cushman Report",
    category: "routine",
    dueDay: 15,
    notes: "Activity Rec, Cash Journal, Check Register, Voucher Report, Bank Statement",
    instructions: {
      intro: "Save all reports to: Data\\Shared\\Properties\\MONTHLY REPORTS\\LHSC Cushman Monthly Reporting\\",
      steps: [
        {
          title: "Set Skyline Property Filter — 9510 only",
          items: [
            "Group Name: None",
            "Unit Ref Number — Beginning: 9510-   Ending: 9510-",
            "Select Add Range",
          ],
        },
        {
          title: "Pull Reports from Skyline",
          items: [
            "Activity Reconciliation Report → Property Management → Reports → Financial Reports",
            "Cash Journal → Property Management → Cash Management",
            "Check Register → Accounts Payable → Daily Procedures",
            "Voucher Report → Accounts Payable → Reports",
          ],
        },
        {
          title: "Save Chase Bank Statement",
          items: [
            "Save the Chase bank statement for the current period",
          ],
        },
        {
          title: "Verify Check Register vs. Bank Statement",
          items: [
            "Check Register — Check Amount must equal Checks Paid + Electronic Withdrawals on the Bank Statement",
          ],
          note: "If there is a variance, note the difference and explain it in the email.",
        },
        {
          title: "Email the Package",
          items: [
            "To: Emilio Belem/USA — Emilio.Belem@cushwake.com",
            "CC: Patrick Stanley/USA — Pat.Stanley@cushwake.com",
            "CC: Tiffany Sarver/USA — Tiffany.Sarver@cushwake.com",
          ],
        },
      ],
    },
  },
  {
    id: "m-close",
    label: "Close Prior Month",
    category: "routine",
    dueDay: 20,
    approxDay: true,
    notes: "Post and close period in Skyline.",
    instructions: {
      intro: "Post revenues and expenses, then run the full month-end close sequence",
      steps: [
        {
          title: "Post PM to GL (Revenues)",
          path: "Property Management → Additional Functions → PM Post to General Ledger",
          items: [
            "Group Name: None",
            "Leave Property Number blank — this picks up all properties in Skyline",
            "Posting Date: last day of the period being posted",
            "Posting Method and Report Format: leave at defaults",
            "Save to: Data → Accounting → Year End 20## → Skyline → Posting Reports → [month]",
          ],
          note: "If a warning appears about posting to prior periods, continue. Dates can be corrected via General Ledger → Transaction Entry → Correct Journal Entries.",
        },
        {
          title: "Post AP to GL (Expenses)",
          path: "Accounts Payable → AP Post to General Ledger",
          items: [
            "Run twice — once for PALL, once for PFUNDS",
            "Save to: Data → Accounting → Year End #### → Skyline → Posting Reports → [month]",
          ],
        },
        {
          title: "Complete Journal Posting Prep Report",
          path: "General Ledger → Period Processing → Journal Posting Prep",
          items: [
            "Run twice — once for PALL, once for PFUNDS",
            "Catches out-of-balance entries, inactive account numbers, and wrong-date transactions before consolidation",
            "If errors: General Ledger → Transaction Entry → Correct Journal Transactions → search by property and transaction number → edit dates to current period",
            "Alternative fix: change journal to PP (this changes opening balances — remember to update prior periods when posting)",
            "When clean, run Monthly Close. Full month-end and year-end instructions are in: Data → Shared → Accounting Process Procedures",
          ],
        },
        {
          title: "Consolidate Portfolios",
          path: "General Ledger → Portfolio Consolidation → Consolidation Process",
          items: [
            "Run twice — once for PNIPLX, once for PJV3",
          ],
          note: "Do not save the consolidation reports.",
        },
        {
          title: "Run Journal Posting Preparation Report — All Portfolios",
          path: "General Ledger → Period Processing → Journal Posting Preparation",
          items: [
            "Run for: PALL, PFUNDS, PIIICO, PNIPLX, PJV3, PHOMES, PSHOP",
          ],
        },
        {
          title: "Repeat Consolidation Process for All Portfolios Above",
          path: "General Ledger → Portfolio Consolidation → Consolidation Process",
          items: [
            "Run for each portfolio: PALL, PFUNDS, PIIICO, PNIPLX, PJV3, PHOMES, PSHOP",
          ],
        },
        {
          title: "Run Property / Company Status Report",
          path: "General Ledger → Period Processing → Property/Company Status Report",
          items: [
            "Save as Excel",
            "This shows which period each Prop/Co is in and which ones need to be closed",
          ],
        },
        {
          title: "Close Each Period",
          path: "General Ledger → Period Processing → Month End Closing",
          items: [
            "Reference the Prop/Co list from the Property/Company Status Report",
            "Close all individual properties",
            "Close all Fund properties",
          ],
          note: "DO NOT CLOSE P PROPERTIES.",
        },
        {
          title: "Repeat Consolidation Process (Post-Close)",
          path: "General Ledger → Portfolio Consolidation → Consolidation Process",
          items: [
            "Run consolidation again for each portfolio from the status report",
          ],
        },
        {
          title: "Verify Final Status",
          path: "General Ledger → Period Processing → Property/Company Status Report",
          items: [
            "Confirm all entities are in the correct period",
          ],
          note: "If any entity is still in the wrong period, run the consolidation process again.",
        },
      ],
    },
  },
  {
    id: "m-cash",
    label: "Cash Analysis Report",
    category: "routine",
    dueDay: 20,
    link: "/financials/cash-analysis",
    instructions: {
      steps: [
        {
          title: "Update Reporting Period Parameter",
          items: [
            "Update the parameter to the current reporting time period",
          ],
        },
        {
          title: "Roll Forward Operating Cash",
          items: [
            "Move the ending Operating Cash from the previous report (column M) into Operating Cash for the current period (column C)",
          ],
        },
        {
          title: "Pull Operating Cash from Marie's Cash Report",
          path: "Data → Accounting → 20XX Year End → Cash Reports - Monthly",
          items: [
            "Open Marie's Cash Report",
            "Populate Operating Cash in column N using the Operating Cash value from column H",
          ],
        },
        {
          title: "Update Security Deposit Changes from Bank Statements",
          path: "Data → Accounting → 20XX Year End → Bank Account Reconciliations",
          items: [
            "Add interest amounts in column 1",
            "Add net Security Deposit amounts in column 8 — include both deposits and withdrawals",
          ],
        },
        {
          title: "Resolve Any Remaining Variances",
          items: [
            "Verify ending balances against the Bank Recs",
            "Verify Marie's ending balances against the actual bank statements",
          ],
          note: "If there is an error in Marie's report, correct it and notify her.",
        },
      ],
    },
  },
  {
    id: "m-opstmt",
    label: "Operating Statements",
    category: "routine",
    dueDay: 20,
    link: "/financials/operating-statements",
    notes: "Update and record variances.",
  },
  {
    id: "m-tenant",
    label: "Tenant Group Setup",
    category: "routine",
    dueDay: 31,
    endOfMonth: true,
    instructions: {
      intro: "Log in to Skyline as MANAGER (password: SKY305)",
      steps: [
        {
          title: "Open Group Setup",
          path: "Gear Icon → Group Setup",
          items: [
            "Log in as MANAGER with password SKY305",
          ],
        },
        {
          title: "Add New Tenants to Their Groups",
          items: [
            "Check at the top for tenants whose Unit Ref # matches the selected property",
            "Add any new tenants to their correct group",
          ],
          note: "Tami sends Office Works tenancy changes on the 20th of each month — use this to identify new tenants.",
        },
        {
          title: "Add New Units to the Selected Unit List",
          items: [
            "For any new units, confirm the unit has been added to the selected Unit list",
          ],
          note: "This ensures all new tenants get billed correctly.",
        },
      ],
    },
  },
  {
    id: "m-mgmt-fees",
    label: "Print Management Fees",
    category: "routine",
    dueDay: 0,
    lastFriday: true,
    notes: "Print from Skyline.",
  },
  {
    id: "m-alloc-exp",
    label: "Allocate Expenses",
    category: "routine",
    dueDay: 20,
    approxDay: true,
    notes: "Same time as monthly close",
    link: "/allocated-invoicer",
  },
  {
    id: "m-alloc-cc",
    label: "Allocate CC Charges",
    category: "routine",
    dueDay: 20,
    approxDay: true,
    notes: "Same time as monthly close",
    link: "/expenses",
  },
  {
    id: "m-avid",
    label: "Pay Avid Bills",
    category: "weekly",
    dueDay: 0,          // placeholder — overridden per-Wednesday at expansion time
    everyWednesday: true,
    notes: "Export from Skyline and import to Avid.",
    instructions: {
      steps: [
        {
          title: "Open Auto Pay Processing",
          path: "Other Modules → Skyline Payment Automation → Auto Pay Processing",
          items: [
            "A/P Batch Processing — be sure to change NO to YES after reviewing each batch, then Pay Bills",
            "Run the process four times in this order:",
            "  1. JPM 3610 – JV III",
            "  2. JPM 3610A – JV III Condo",
            "  3. JPM 2010 Escrow – NI LLC FNIPLX",
            "  4. All Linked Accounts – All non-funds (do not select anything from the dropdown)",
          ],
          note: "You must fully restart Skyline before processing All Linked Accounts properties.",
        },
        {
          title: "Review Invoices and Set Due Date Range",
          items: [
            "Add 10 days to the Due Date Range",
            "Select / Unselect any invoices that should not be paid this cycle",
          ],
        },
        {
          title: "Check Bank Balances",
          items: [
            "Verify each account has sufficient funds to cover its payments",
            "If an account is short, unselect those payments and revisit after transferring funds",
          ],
        },
        {
          title: "Save Batches, Process, and Export Reports",
          items: [
            "Save AP Batches Auto Pay: Shared → AP 3 Batches Auto Pay → [By Year → By Month → Add date] → JVIII, FNIPLX, FIIICO, NonFunds",
            "Back to input screen → click APPLY → selections to pay will appear",
            "Export the selection report to PDF",
            "Save AP AutoPay Selection Report: Shared → ...AP Selection Reports → AP Auto Selection Report [By Year → By Month → Add date]",
            "Answer 'Do you want to process selected Auto Pay Payments?': YES",
          ],
        },
        {
          title: "Upload to AvidExchange",
          items: [
            "Log into AvidExchange → locate the Pay module icon in the left column",
            "Repeat four times — JV III, FNIPLX, Condo, Non-Funds:",
            "  1. Select 'Upload' in upper right corner",
            "  2. Select the file from the AP 3 Batches Auto Pay folder",
            "  3. Select 'Send to AvidPay'",
            "  4. Refresh the screen — Total should appear and Status should show 'Processing'",
            "  5. Notify Tanya that bills are paid",
          ],
          note: "If uploaded by 3 PM, funds come out the following day and checks will be sent.",
        },
      ],
    },
  },

  // ── QUARTERLY — January, April, July, October ─────────────────────────────
  {
    id: "q-bp",
    label: "BP Commissions",
    category: "quarterly",
    dueDay: 31,
    endOfMonth: true,
    months: [1, 4, 7, 10],
    notes: "Q4 (Jan) · Q1 (Apr) · Q2 (Jul) · Q3 (Oct)",
  },
  {
    id: "q-lhscwawa",
    label: "LHSC Wawa Quarterly CAM",
    category: "quarterly",
    dueDay: 31,
    endOfMonth: true,
    months: [1, 4, 7, 10],
    link: "/cam-recon?property=9510-WAWA-Q&year=2026",
    notes: "Due the end of the month following the quarter close — Q4 (Jan) · Q1 (Apr) · Q2 (Jul) · Q3 (Oct). Eligible expenses auto-pull from the 9510 GL.",
  },

  // ── SEASONAL / ANNUAL — specific months only ──────────────────────────────

  // January
  {
    id: "jan-1099due",
    label: "1099 Due",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [1],
    notes: "Track 1099 files for us",
  },
  {
    id: "jan-alloc",
    label: "Reconcile Allocated Expenses",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [1],
    notes: "9301, 9302, 9303 expenses in 2000 account",
  },

  // February
  {
    id: "feb-wp",
    label: "Start Workpapers",
    category: "seasonal",
    dueDay: 1,
    months: [2],
    notes: "Once January is closed",
  },

  // March
  {
    id: "mar-wak",
    label: "Wakefern CAM Rec Due",
    category: "seasonal",
    dueDay: 30,
    months: [3],
  },
  {
    id: "mar-ret",
    label: "Single-Tenant RET Bills",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [3],
    notes: "Add RET bills to their charges. Include copy of actual RET bill",
  },

  // April
  {
    id: "apr-cam",
    label: "CAM Recs Due",
    category: "seasonal",
    dueDay: 30,
    months: [4],
  },

  // July
  {
    id: "jul-sky",
    label: "Reprojection Skyline Upload",
    category: "seasonal",
    dueDay: 1,
    months: [7],
  },

  // August
  {
    id: "aug-ins",
    label: "Insurance Applications",
    category: "seasonal",
    dueDay: 1,
    months: [8],
  },

  // September
  {
    id: "sep-bud",
    label: "Next Year Budgets",
    category: "seasonal",
    dueDay: 1,
    months: [9],
    notes: "Begin budget discussions for next year",
  },

  // October
  {
    id: "oct-wak",
    label: "Wakefern Budget Due",
    category: "seasonal",
    dueDay: 1,
    months: [10],
    notes: "Must be sent by this date",
  },

  // November
  {
    id: "nov-kfff-990",
    label: "Submit KFFF Form 990",
    category: "seasonal",
    dueDay: 17,
    months: [11],
    pillOverride: "KFFF",
    instructions: {
      steps: [
        {
          title: "Submit Form 990",
          items: [
            "Sign and submit form 990-PF from GMS Surgent to Commonwealth of Pennsylvania Department of State with a $15 check made out to Commonwealth of Pennsylvania",
          ],
        },
      ],
    },
  },
  {
    id: "nov-chase",
    label: "Check Chase — Black Friday",
    category: "seasonal",
    dueDay: 28,
    months: [11],
    notes: "Bank is open. Check to approve checks due that day",
  },
  {
    id: "nov-camest",
    label: "Upload CAM Estimates",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [11],
    notes: "Once December charges post, end current recurring charges and upload new ones",
  },
  {
    id: "nov-budsky",
    label: "Upload Budgets to Skyline",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [11],
    notes: "Do not upload P properties — upload individual buildings and consolidate",
  },
  {
    id: "nov-rec",
    label: "1st of Month Reconciliation",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [11],
  },

  // December
  {
    id: "dec-1099",
    label: "1099 Start",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [12],
    notes: "Prepare the vendor list and upload to track1099.com",
  },
  {
    id: "dec-int",
    label: "Transfer Interest Income",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [12],
    notes: "From three security deposit accounts. Calculate management fees on interest",
  },
  {
    id: "dec-bank",
    label: "Reimburse Bank Fees",
    category: "seasonal",
    dueDay: 31,
    endOfMonth: true,
    months: [12],
    notes: "Office Works and Eastwick (unless M&T acc closes)",
  },
];

export function daysInMonth(year: number, month: number) {   // month 0-indexed
  return new Date(year, month + 1, 0).getDate();
}
export function firstDOW(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
export function getWednesdaysInMonth(year: number, month: number): number[] {
  const count = daysInMonth(year, month);
  const result: number[] = [];
  for (let d = 1; d <= count; d++) {
    if (new Date(year, month, d).getDay() === 3) result.push(d);
  }
  return result;
}
export function getMondaysInMonth(year: number, month: number): number[] {
  const count = daysInMonth(year, month);
  const result: number[] = [];
  for (let d = 1; d <= count; d++) {
    if (new Date(year, month, d).getDay() === 1) result.push(d);
  }
  return result;
}

export function tasksForMonth(year: number, month: number): TaskDef[] { // month 0-indexed
  const m = month + 1;
  const result: TaskDef[] = [];
  for (const t of TASK_DEFS) {
    if (t.months && !t.months.includes(m)) continue;
    if (t.everyWednesday) {
      for (const day of getWednesdaysInMonth(year, month)) {
        result.push({
          ...t,
          id: `${t.id}-${year}-${m}-${day}`,
          label: `${t.label} — ${MONTHS[month].slice(0, 3)} ${day}`,
          dueDay: day,
          everyWednesday: false,
        });
      }
    } else if (t.everyMonday) {
      for (const day of getMondaysInMonth(year, month)) {
        result.push({
          ...t,
          id: `${t.id}-${year}-${m}-${day}`,
          label: `${t.label} — ${MONTHS[month].slice(0, 3)} ${day}`,
          dueDay: day,
          everyMonday: false,
        });
      }
    } else {
      result.push(t);
    }
  }
  return result;
}

// Last Friday of a given month (0-indexed)
export function lastFridayOfMonth(year: number, month: number): number {
  const last = daysInMonth(year, month);
  for (let d = last; d >= last - 6; d--) {
    if (new Date(year, month, d).getDay() === 5) return d;
  }
  return last;
}

// Resolve computed due day (handles endOfMonth and lastFriday)
export function effDay(t: TaskDef, year: number, month: number): number {
  if (t.endOfMonth) return daysInMonth(year, month);
  if (t.lastFriday) return lastFridayOfMonth(year, month);
  return t.dueDay;
}

// Human-readable due date label for status badge
export function dueName(t: TaskDef, year: number, monthIdx: number): string {
  if (t.endOfMonth) return "End of Month";
  if (t.lastFriday) {
    const d = lastFridayOfMonth(year, monthIdx);
    return `Last Fri (${MONTHS[monthIdx].slice(0, 3)} ${d})`;
  }
  if (t.approxDay)  return `~${t.dueDay}th`;
  return `${MONTHS[monthIdx].slice(0, 3)} ${t.dueDay}`;
}


export type TaskOccurrence = {
  id: string;
  label: string;
  category: Category;
  date: Date;
  link?: string;
};

/** Concrete (non-pinned) task occurrences whose due date falls in [start, end]. */
export function taskOccurrencesBetween(start: Date, end: Date): TaskOccurrence[] {
  const out: TaskOccurrence[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= lastMonth) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    for (const t of tasksForMonth(y, m)) {
      if (t.pinned) continue;
      const day = effDay(t, y, m);
      if (!day || day < 1) continue;
      const d = new Date(y, m, day);
      if (d >= start && d <= end) {
        out.push({ id: t.id, label: t.label, category: t.category, date: d, link: t.link });
      }
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
