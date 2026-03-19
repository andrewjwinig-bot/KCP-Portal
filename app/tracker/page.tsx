"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

type Category = "routine" | "weekly" | "quarterly" | "seasonal";

const CATEGORIES: Record<Category, { label: string; pill: string; dot: string; bg: string; text: string; border: string }> = {
  routine:   { label: "Monthly",          pill: "M", dot: "#0b4a7d", bg: "rgba(11,74,125,0.08)",  text: "#0b4a7d", border: "rgba(11,74,125,0.25)"  },
  weekly:    { label: "Weekly",           pill: "W", dot: "#0d9488", bg: "rgba(13,148,136,0.08)", text: "#0d9488", border: "rgba(13,148,136,0.25)" },
  quarterly: { label: "Quarterly",        pill: "Q", dot: "#6d28d9", bg: "rgba(109,40,217,0.08)", text: "#6d28d9", border: "rgba(109,40,217,0.25)" },
  seasonal:  { label: "Annual / Seasonal",pill: "A", dot: "#b45309", bg: "rgba(180,83,9,0.08)",   text: "#b45309", border: "rgba(180,83,9,0.25)"   },
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

interface InstructionStep {
  title: string;
  path?: string;   // software navigation path, e.g. "Module → Menu → Sub"
  items: string[]; // bullet points
  note?: string;   // asterisk note at the end of the step
}

interface TaskInstructions {
  intro?: string;
  steps: InstructionStep[];
}

interface TaskDef {
  id: string;
  label: string;
  category: Category;
  dueDay: number;
  endOfMonth?: boolean;
  lastFriday?: boolean;
  everyWednesday?: boolean; // expands into one task per Wednesday in the month
  approxDay?: boolean;
  months?: number[];
  notes?: string;
  link?: string;
  instructions?: TaskInstructions;
}

const TASK_DEFS: TaskDef[] = [

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
    notes: "Q4 (Jan) · Q1 (Apr) · Q2 (Jul) · Q3 (Oct)",
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

// ─── STORAGE ────────────────────────────────────────────────────────────────

function storageKey(year: number, month: number) {
  return `tracker-v2-${year}-${month}`;
}
function loadChecked(year: number, month: number): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(storageKey(year, month)) ?? "{}"); }
  catch { return {}; }
}
function saveChecked(year: number, month: number, data: Record<string, boolean>) {
  localStorage.setItem(storageKey(year, month), JSON.stringify(data));
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number) {   // month 0-indexed
  return new Date(year, month + 1, 0).getDate();
}
function firstDOW(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function getWednesdaysInMonth(year: number, month: number): number[] {
  const count = daysInMonth(year, month);
  const result: number[] = [];
  for (let d = 1; d <= count; d++) {
    if (new Date(year, month, d).getDay() === 3) result.push(d);
  }
  return result;
}

function tasksForMonth(year: number, month: number): TaskDef[] { // month 0-indexed
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
    } else {
      result.push(t);
    }
  }
  return result;
}

// Last Friday of a given month (0-indexed)
function lastFridayOfMonth(year: number, month: number): number {
  const last = daysInMonth(year, month);
  for (let d = last; d >= last - 6; d--) {
    if (new Date(year, month, d).getDay() === 5) return d;
  }
  return last;
}

// Resolve computed due day (handles endOfMonth and lastFriday)
function effDay(t: TaskDef, year: number, month: number): number {
  if (t.endOfMonth) return daysInMonth(year, month);
  if (t.lastFriday) return lastFridayOfMonth(year, month);
  return t.dueDay;
}

// Human-readable due date label for status badge
function dueName(t: TaskDef, year: number, monthIdx: number): string {
  if (t.endOfMonth) return "End of Month";
  if (t.lastFriday) {
    const d = lastFridayOfMonth(year, monthIdx);
    return `Last Fri (${MONTHS[monthIdx].slice(0, 3)} ${d})`;
  }
  if (t.approxDay)  return `~${t.dueDay}th`;
  return `${MONTHS[monthIdx].slice(0, 3)} ${t.dueDay}`;
}

// ─── PAGE ───────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const today = new Date();

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [checked,   setChecked]   = useState<Record<string, boolean>>({});
  const [selDay,    setSelDay]    = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState<Category | "all">("all");
  const [detailTask, setDetailTask] = useState<TaskDef | null>(null);

  useEffect(() => {
    setChecked(loadChecked(viewYear, viewMonth));
    setSelDay(null);
  }, [viewYear, viewMonth]);

  const tasks = useMemo(() => tasksForMonth(viewYear, viewMonth), [viewYear, viewMonth]);

  const toggle = useCallback((id: string) => {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveChecked(viewYear, viewMonth, next);
      return next;
    });
  }, [viewYear, viewMonth]);

  // Tasks grouped by their effective calendar day (for dots)
  const dayMap = useMemo(() => {
    const m: Record<number, TaskDef[]> = {};
    tasks.forEach(t => {
      const d = effDay(t, viewYear, viewMonth);
      (m[d] ??= []).push(t);
    });
    return m;
  }, [tasks, viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const isToday = (d: number) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const isPast = (d: number) => {
    const dt = new Date(viewYear, viewMonth, d);
    dt.setHours(23, 59, 59);
    return dt < today;
  };

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  // ── Checklist filtering
  const visible = useMemo(() => {
    let list = tasks;
    if (selDay !== null)     list = list.filter(t => effDay(t, viewYear, viewMonth) === selDay);
    if (filterCat !== "all") list = list.filter(t => t.category === filterCat);
    return list;
  }, [tasks, selDay, filterCat, viewYear, viewMonth]);

  const sortedVisible = useMemo(() =>
    visible.slice().sort((a, b) => {
      const doneA = checked[a.id] ? 1 : 0;
      const doneB = checked[b.id] ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return effDay(a, viewYear, viewMonth) - effDay(b, viewYear, viewMonth);
    }),
    [visible, checked, viewYear, viewMonth]
  );

  // ── Stats
  const total   = tasks.length;
  const done    = tasks.filter(t => checked[t.id]).length;
  const overdue = tasks.filter(t => !checked[t.id] && isCurrentMonth && isPast(effDay(t, viewYear, viewMonth))).length;
  const pending = total - done;

  // ── Status badge for a task row
  function taskStatus(t: TaskDef) {
    const d = effDay(t, viewYear, viewMonth);
    const name = dueName(t, viewYear, viewMonth);
    if (checked[t.id])
      return { label: "✓ Done",    color: "#16a34a", bg: "rgba(22,163,74,0.08)",  border: "rgba(22,163,74,0.2)"  };
    if (isCurrentMonth && isPast(d))
      return { label: "Overdue",   color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.2)" };
    if (isCurrentMonth && d === today.getDate())
      return { label: "Due today", color: "#ea580c", bg: "rgba(234,88,12,0.08)", border: "rgba(234,88,12,0.2)" };
    if (isCurrentMonth && d > today.getDate() && d - today.getDate() <= 3)
      return { label: "Due soon",  color: "#d97706", bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.2)"  };
    return { label: `Due ${name}`, color: "var(--muted)", bg: "rgba(0,0,0,0.04)", border: "var(--border)" };
  }

  // ── Calendar cells
  const numDays = daysInMonth(viewYear, viewMonth);
  const offset  = firstDOW(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ];

  return (
    <main>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 4 }}>
            Master Tracker
          </h1>
          <p className="muted small">Monthly to-do checklist · filing deadlines · recurring tasks</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn" onClick={prevMonth} style={{ padding: "8px 16px", fontWeight: 900 }}>←</button>
          <span style={{ fontWeight: 800, fontSize: 16, minWidth: 170, textAlign: "center" }}>
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button className="btn" onClick={nextMonth} style={{ padding: "8px 16px", fontWeight: 900 }}>→</button>
          {!isCurrentMonth && (
            <button className="btn" onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }} style={{ fontSize: 13 }}>
              Today
            </button>
          )}
        </div>
      </div>

      {/* ── Summary pills ────────────────────────────────────────────────── */}
      <div className="pills" style={{ justifyContent: "flex-start", marginBottom: 20 }}>
        <div className="pill">
          <b>{total}</b>
          <span className="muted small">Tasks this month</span>
        </div>
        <div className="pill" style={{ borderColor: "#16a34a", background: "rgba(22,163,74,0.06)" }}>
          <b style={{ color: "#16a34a" }}>{done}</b>
          <span className="muted small">Done</span>
        </div>
        <div className="pill">
          <b>{pending}</b>
          <span className="muted small">Remaining</span>
        </div>
        {overdue > 0 && (
          <div className="pill" style={{ borderColor: "#dc2626", background: "rgba(220,38,38,0.06)" }}>
            <b style={{ color: "#dc2626" }}>{overdue}</b>
            <span className="muted small">Overdue</span>
          </div>
        )}
        {total > 0 && (
          <div className="pill pill-total">
            <b>{Math.round((done / total) * 100)}%</b>
            <span className="muted small">Complete</span>
          </div>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {total > 0 && (
        <div style={{ height: 6, background: "var(--border)", borderRadius: 999, marginBottom: 22, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${(done / total) * 100}%`,
            background: done === total ? "#16a34a" : "var(--brand)",
            borderRadius: 999,
            transition: "width 0.3s ease",
          }} />
        </div>
      )}

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "290px 1fr", gap: 18, alignItems: "start" }}>

        {/* ─ Calendar card ─────────────────────────────────────────────── */}
        <div className="card" style={{ padding: 16, position: "sticky", top: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>
            {MONTHS[viewMonth]} {viewYear}
          </div>

          {/* Weekday headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 800, color: "var(--muted)", padding: "2px 0", letterSpacing: "0.04em" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />;
              const dayTasks = dayMap[day] ?? [];
              const hasTasks = dayTasks.length > 0;
              const sel = selDay === day;
              const tod = isToday(day);
              const past = isPast(day);
              const allDone = hasTasks && dayTasks.every(t => checked[t.id]);

              return (
                <div
                  key={day}
                  onClick={() => hasTasks && setSelDay(sel ? null : day)}
                  title={hasTasks ? `${dayTasks.length} task${dayTasks.length > 1 ? "s" : ""}` : undefined}
                  style={{
                    textAlign: "center",
                    padding: "5px 2px 4px",
                    borderRadius: 7,
                    cursor: hasTasks ? "pointer" : "default",
                    background: sel ? "var(--brand)" : tod ? "rgba(11,74,125,0.1)" : "transparent",
                    color: sel ? "#fff" : tod ? "var(--brand)" : past && !hasTasks ? "var(--muted)" : "var(--text)",
                    fontWeight: tod ? 800 : 400,
                    fontSize: 13,
                    border: tod && !sel ? "1.5px solid var(--brand)" : "1.5px solid transparent",
                    opacity: past && !hasTasks && !tod ? 0.4 : 1,
                    transition: "background 0.1s",
                  }}
                >
                  {day}
                  {hasTasks && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 2 }}>
                      {dayTasks.slice(0, 4).map(t => (
                        <div key={t.id} style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: allDone ? "#16a34a" : checked[t.id] ? "#16a34a" : CATEGORIES[t.category].dot,
                          opacity: checked[t.id] ? 0.45 : 1,
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <hr />

          {/* Category filter */}
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 8 }}>
            FILTER BY CATEGORY
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(Object.entries(CATEGORIES) as [Category, typeof CATEGORIES[Category]][]).map(([key, cat]) => {
              const count = tasks.filter(t => t.category === key).length;
              if (count === 0) return null;
              const active = filterCat === key;
              const catDone = tasks.filter(t => t.category === key && checked[t.id]).length;
              return (
                <button
                  key={key}
                  onClick={() => setFilterCat(active ? "all" : key)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 8, width: "100%",
                    background: active ? cat.bg : "transparent",
                    border: `1px solid ${active ? cat.border : "transparent"}`,
                    borderRadius: 6, padding: "5px 8px",
                    cursor: "pointer", fontFamily: "inherit",
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    color: active ? cat.text : "var(--text)",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.dot, display: "inline-block", flexShrink: 0 }} />
                    {cat.label}
                  </span>
                  <span style={{ fontSize: 11, color: active ? cat.text : "var(--muted)", fontWeight: 700 }}>
                    {catDone}/{count}
                  </span>
                </button>
              );
            })}
          </div>

          {(selDay !== null || filterCat !== "all") && (
            <button
              className="btn"
              onClick={() => { setSelDay(null); setFilterCat("all"); }}
              style={{ width: "100%", marginTop: 10, fontSize: 12 }}
            >
              Clear filter
            </button>
          )}
        </div>

        {/* ─ Checklist ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Active filter label */}
          {(selDay !== null || filterCat !== "all") && (
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>
              {selDay !== null
                ? `Tasks due ${MONTHS[viewMonth]} ${selDay}${filterCat !== "all" ? ` · ${CATEGORIES[filterCat].label}` : ""}`
                : `Filtered: ${CATEGORIES[filterCat as Category].label}`}
            </div>
          )}

          {/* Flat task list — one card, frequency pill per row */}
          {sortedVisible.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {sortedVisible.map((task, idx) => {
                const catDef  = CATEGORIES[task.category];
                const status  = taskStatus(task);
                const isDone  = !!checked[task.id];
                const isOver  = isCurrentMonth && !isDone && isPast(effDay(task, viewYear, viewMonth));
                const hasDetail = !!task.instructions;

                return (
                  <div
                    key={task.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "13px 16px",
                      borderBottom: idx < sortedVisible.length - 1 ? "1px solid var(--border)" : "none",
                      background: isDone ? "rgba(22,163,74,0.025)" : isOver ? "rgba(220,38,38,0.025)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggle(task.id)}
                      style={{ marginTop: 3, width: 16, height: 16, accentColor: catDef.dot, flexShrink: 0, cursor: "pointer" }}
                    />

                    {/* Frequency pill */}
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
                      color: catDef.text, background: catDef.bg,
                      border: `1px solid ${catDef.border}`,
                      padding: "2px 6px", borderRadius: 999,
                      flexShrink: 0, marginTop: 2,
                      opacity: isDone ? 0.45 : 1,
                    }}>
                      {catDef.pill}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          onClick={() => hasDetail && setDetailTask(task)}
                          title={hasDetail ? "Click for instructions" : undefined}
                          style={{
                            fontWeight: 600, fontSize: 14,
                            color: isDone ? "var(--muted)" : "var(--text)",
                            textDecoration: isDone ? "line-through" : "none",
                            cursor: hasDetail ? "pointer" : "default",
                          }}
                        >
                          {task.label}
                          {hasDetail && (
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 16, height: 16, borderRadius: "50%",
                              background: catDef.bg, border: `1px solid ${catDef.border}`,
                              color: catDef.text, fontSize: 10, fontWeight: 800,
                              marginLeft: 6, verticalAlign: "middle",
                              flexShrink: 0,
                            }}>i</span>
                          )}
                        </span>
                        {task.link && (
                          <Link
                            href={task.link}
                            title={`Open ${task.label}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              fontSize: 11, fontWeight: 700,
                              color: catDef.text, background: catDef.bg,
                              border: `1px solid ${catDef.border}`,
                              borderRadius: 5, padding: "2px 7px",
                              textDecoration: "none", flexShrink: 0,
                              opacity: isDone ? 0.5 : 1,
                            }}
                          >
                            Open →
                          </Link>
                        )}
                      </div>
                      {task.notes && (
                        <div className="muted small" style={{ marginTop: 3 }}>{task.notes}</div>
                      )}
                    </div>

                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      color: status.color, background: status.bg,
                      border: `1px solid ${status.border}`,
                      padding: "3px 9px", borderRadius: 999,
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {visible.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {total === 0 ? "No tasks this month" : "No tasks match the current filter"}
              </div>
              <div className="muted small">
                {total === 0
                  ? `Nothing scheduled for ${MONTHS[viewMonth]} ${viewYear}`
                  : "Try clearing the filter to see all tasks"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {detailTask?.instructions && (() => {
        const instr = detailTask.instructions!;
        return (
          <div
            onClick={() => setDetailTask(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 24,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: "#fff", borderRadius: 14,
                boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                width: "100%", maxWidth: 580,
                maxHeight: "80vh", overflowY: "auto",
                display: "flex", flexDirection: "column",
              }}
            >
              {/* Modal header */}
              <div style={{
                display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                padding: "20px 24px 16px",
                borderBottom: "1px solid var(--border)",
                position: "sticky", top: 0, background: "#fff", zIndex: 1,
              }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: "-0.02em" }}>
                    {detailTask.label}
                  </div>
                  {instr.intro && (
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontWeight: 500 }}>
                      {instr.intro}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setDetailTask(null)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--muted)", fontSize: 22, lineHeight: 1,
                    padding: "0 0 0 16px", flexShrink: 0, fontWeight: 300,
                  }}
                >×</button>
              </div>

              {/* Steps */}
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
                {instr.steps.map((step, si) => (
                  <div key={si}>
                    {/* Step header */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 24, height: 24, borderRadius: "50%",
                        background: "var(--brand)", color: "#fff",
                        fontSize: 12, fontWeight: 800, flexShrink: 0,
                      }}>
                        {si + 1}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: 15 }}>{step.title}</span>
                    </div>

                    {/* Navigation path */}
                    {step.path && (
                      <div style={{
                        display: "inline-flex", alignItems: "center",
                        fontSize: 12, fontWeight: 700,
                        color: "var(--brand)",
                        background: "rgba(11,74,125,0.07)",
                        border: "1px solid rgba(11,74,125,0.18)",
                        borderRadius: 6, padding: "5px 10px",
                        marginBottom: 10, gap: 4,
                        fontFamily: "monospace",
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                        {step.path}
                      </div>
                    )}

                    {/* Bullet items */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 8 }}>
                      {step.items.map((item, ii) => (
                        <div key={ii} style={{ display: "flex", gap: 10, fontSize: 13 }}>
                          <span style={{ color: "var(--brand)", fontWeight: 900, flexShrink: 0, marginTop: 1 }}>·</span>
                          <span style={{ color: "var(--text)", lineHeight: 1.5 }}>{item}</span>
                        </div>
                      ))}
                    </div>

                    {/* Asterisk note */}
                    {step.note && (
                      <div style={{
                        marginTop: 10, paddingLeft: 8,
                        fontSize: 12, fontStyle: "italic", color: "var(--muted)",
                        display: "flex", gap: 6,
                      }}>
                        <span style={{ fontWeight: 700, fontStyle: "normal" }}>*</span>
                        {step.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Modal footer */}
              <div style={{
                padding: "14px 24px",
                borderTop: "1px solid var(--border)",
                display: "flex", justifyContent: "flex-end",
                position: "sticky", bottom: 0, background: "#fff",
              }}>
                <button
                  className="btn"
                  onClick={() => setDetailTask(null)}
                  style={{ padding: "8px 20px", fontWeight: 700 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
