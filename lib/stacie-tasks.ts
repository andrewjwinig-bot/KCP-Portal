export type Frequency = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "ongoing" | "eoy";

export type Owner = "stacie" | "drew";

// Rich, click-to-open task detail (numbered steps, bullets, quick links).
export type TaskDetailStep = {
  title: string;
  items: string[];
  note?: string;
  links?: { label: string; url: string }[];
};
export type TaskDetail = {
  intro?: string;
  steps: TaskDetailStep[];
};

export type StacieTask = {
  id: string;
  title: string;
  frequency: Frequency;
  instructions?: string; // line-broken plain text
  detail?: TaskDetail;   // rich detail shown in a modal when the task is clicked
  owner?: Owner; // defaults to "stacie" when omitted
  /** Optional deep link rendered as a button next to the task title. */
  link?: string;
  /** When set, render a live progress bar for this task pulled from the
   *  bank-rec/statements blob for the current period. */
  bankRecProgress?: "statements" | "reconciled";
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly:     "Weekly",
  monthly:    "Monthly",
  quarterly:  "Quarterly",
  semiannual: "Semi-Annual",
  annual:     "Annual",
  ongoing:    "Ongoing",
  eoy:        "End of Year",
};

export const FREQUENCY_ORDER: Frequency[] = ["weekly", "monthly", "quarterly", "semiannual", "annual", "ongoing", "eoy"];

// Shared detail for the weekly ACH/wires download — used by both the
// dashboard task tracker and the /tracker calendar task.
export const ACH_WIRES_DETAIL: TaskDetail = {
  intro: "Weekly — pull tenant ACH credits and incoming wires for the accounts below, save the reports, and hand off to Tami to post.",
  steps: [
    {
      title: "Deposits to post — open these accounts",
      items: [
        "Chase — Brookwood (2300)",
        "Chase — Parkwood (7010)",
        "Chase — JV III (3610)",
        "Chase — NI LLC (4000)",
      ],
      links: [
        { label: "Brookwood 2300", url: "https://secure.chase.com/web/auth/dashboard#/dashboard/summary/745774880/DDA/CHK" },
        { label: "Parkwood 7010", url: "https://secure.chase.com/web/auth/dashboard#/dashboard/summary/745774883/DDA/CHK" },
        { label: "JV III 3610", url: "https://secure.chase.com/web/auth/dashboard#/dashboard/summary/745774882/DDA/CHK" },
        { label: "NI LLC 4000", url: "https://secure.chase.com/web/auth/dashboard#/dashboard/summary/747627665/DDA/CHK" },
      ],
    },
    {
      title: "ACH Credits",
      items: [
        "Select Type: ACH Credit. Date: Sunday to Sunday. SEARCH.",
        "To save: copy the description from the current month's posted batches (File: PDF Proc / Year / Property).",
        "Change the dates and delete the Batch # — it should read ACH.",
        "Save as PDF to: DATA / Sky Vol / PDF Process / Year / Year Lock Box and ACH reports / Property.",
        "Name: \"Date Range ACH (Property) Batch #\" — leave the batch # blank.",
      ],
    },
    {
      title: "Incoming Wires",
      items: [
        "Select Type: Incoming Wire Transfers. Date: Sunday to Sunday. SEARCH.",
        "To save: copy the description from the current month's posted batches (File: PDF Proc / Year / Property).",
        "Change the dates and delete the Batch # — it should read WIRE.",
        "Save as PDF to: DATA / Sky Vol / PDF Process / Year / Year Lock Box and ACH reports / Property.",
        "Name: \"Date Range WIRE (Property) Batch #\" — leave the batch # blank.",
      ],
      note: "When Tami posts a batch she adds the batch # and moves the file to Sky Vol / PDF Proc / Year / Property along with the batch report PDF.",
    },
    {
      title: "Month start / end — recurring ACH deposits",
      items: [
        "At the beginning or end of the month, also check for these recurring ACH deposits:",
        "Lafayette Hill SC (9510) — WAWA ACH (always on the 1st)",
        "Elbridge (7200) — Leevers ACH",
        "KH Bellaire (9800) — Kreher (Homelink)",
        "Grays Ferry (4500) — Wakefern, Grays Eye (TuDinh), Victra (ABC Phones) ACH",
        "Revere (7300) — K&G ACH",
      ],
      links: [
        { label: "Lafayette Hill 9510", url: "https://secure.chase.com/web/auth/dashboard#/dashboard/summary/913650367/DDA/CHK" },
        { label: "Elbridge 7200", url: "https://secure.chase.com/web/auth/dashboard#/dashboard/summary/884656389/DDA/CHK" },
        { label: "KH Bellaire 9800", url: "https://secure.chase.com/web/auth/dashboard#/dashboard/summary/789298739/DDA/CHK" },
        { label: "Grays Ferry 4500", url: "https://secure.myvirtualbranch.com/LibertyBank/React/Accounts.aspx?p_r=1#Accounts/6" },
        { label: "Revere 7300", url: "https://secure.myvirtualbranch.com/LibertyBank/React/Accounts.aspx?p_r=1#Accounts/3" },
      ],
    },
  ],
};

export const STACIE_TASKS: StacieTask[] = [
  // ── Weekly ────────────────────────────────────────────────────
  {
    id: "wkly-dl-ach-wires",
    title: "Download ACH and Incoming Wires from Tenants",
    frequency: "weekly",
    instructions: "Mondays — download tenant ACH/wires and send to Tami to post.",
    detail: ACH_WIRES_DETAIL,
  },
  {
    id: "wkly-ap",
    title: "AP — Review/Approve Legal & 2000 in AVID; Select & Pay Bills (all properties)",
    frequency: "weekly",
    instructions: "Review and approve all legal bills and 2000 in AVID Box.\nSelect & pay bills for all properties.",
  },

  // ── Monthly ───────────────────────────────────────────────────
  { id: "mo-dl-bank-statements", title: "Download ALL Bank Statements", frequency: "monthly", instructions: "JPM Chase 19 · M&T 6 · Liberty 9. Due by the 1st of the next month.", link: "/bank-rec", bankRecProgress: "statements" },
  { id: "mo-reconcile-bank",     title: "Reconcile ALL Bank Statements (except 5600 and 2000)", frequency: "monthly", instructions: "Due by the 10th of the following month.", link: "/bank-rec", bankRecProgress: "reconciled" },
  { id: "mo-direct-pay-mtg",     title: "Post Direct Pay Mortgages", frequency: "monthly" },
  { id: "mo-nillc-mtg-alloc",    title: "Post NILLC allocation of Mortgage Principal & Interest", frequency: "monthly" },
  { id: "mo-bank-fees",          title: "Post all monthly Bank Fees", frequency: "monthly", instructions: "Chase — Lock Boxes; M&T (4900 & 1500); Liberty (7300)." },
  { id: "mo-ach-debits",         title: "Process ACH debits", frequency: "monthly", instructions: "AVID Transaction Fee, TrustPoint Fees, RentPay (MRI), Guardian Employee Benefits." },
  { id: "mo-int-income-liberty", title: "Post Interest Income — Liberty", frequency: "monthly", instructions: "2300, 7010. Money Market Accounts (Revere, Grays Ferry, LIK)?" },
  { id: "mo-nsf-em",             title: "Process NSF Checks and EM Tenants", frequency: "monthly" },
  { id: "mo-deposits",           title: "Scan to bank & record Monthly Deposits", frequency: "monthly", instructions: "1st of Month, Management Fees, Refunds, Misc. Cash Receipts, etc." },
  { id: "mo-cash-report",        title: "Monthly Cash Report", frequency: "monthly" },
  {
    id: "mo-mailed-payments",
    title: "Deposit Tenant Payments mailed to KCP address",
    frequency: "monthly",
    instructions:
      "Scan deposits & send PDF to shared box for Tami to post.\n9510 (LH); 4500 (GF); Chase — 1100 (2); 5600 (1); 8200 (2); 9800 (1); Condo (1).",
  },

  // ── Quarterly ─────────────────────────────────────────────────
  { id: "qrt-wakefern",  title: "Invoice Wakefern (4500) for Fire Service", frequency: "quarterly", instructions: "EM w/ PWD invoice copies." },

  // ── Semi-Annual ───────────────────────────────────────────────
  { id: "sa-water",     title: "Water Allocation for 1100 and 4500", frequency: "semiannual", instructions: "EM bills to tenants. Post to tenant ledgers. JE vacancy credit. (July and January)" },
  { id: "sa-erie-ins",  title: "Calculate allocation of Company car insurance (Erie) & pay (2000 / 2010)", frequency: "semiannual", instructions: "Distribute proof of insurance. (May)" },

  // ── Annual ────────────────────────────────────────────────────
  { id: "ann-gym",         title: "Post Gym fee revenue", frequency: "annual", instructions: "Tanya to complete?" },
  { id: "ann-sec-dep-int", title: "Transfer Interest Income from 2 Security Deposit accounts to 2010 and 4000", frequency: "annual", instructions: "December." },
  { id: "ann-bank-reimb",  title: "Reimburse Bank Fees to 4900 and 1500 (2010?)", frequency: "annual", instructions: "December." },
  { id: "ann-active-dev",  title: "Process Active Development Fee ($12,500) from 9200 (1990-0000) to 2000 for Eastwick JV XII", frequency: "annual", instructions: "December." },
  { id: "ann-ins-proof",   title: "Send proof of Insurance to Liberty for Mortgages", frequency: "annual", instructions: "Upon request." },

  // ── Ongoing ───────────────────────────────────────────────────
  { id: "ong-sec-deposits",  title: "Deposit ALL Security Deposit Checks", frequency: "ongoing" },
  { id: "ong-sec-refunds",   title: "Process Security Deposit Refunds and Forfeits", frequency: "ongoing", instructions: "Transfer funds from Security Deposit accounts to Operating accounts." },
  { id: "ong-tenant-replies", title: "Reply to tenant calls and emails (statement balances, credits, charges, etc.)", frequency: "ongoing" },

  // ── End of Year ───────────────────────────────────────────────
  { id: "eoy-workpapers", title: "Prepare EOY Workpaper Support", frequency: "eoy", instructions: "As assigned." },
];

/**
 * Drew's recurring tasks, mirrored from the Master Tracker (app/tracker/page.tsx)
 * so Stacie can view them inside her tracker via the owner filter.
 *
 * Drew's master tracker lives in localStorage on his page; checks here are
 * tracked separately in Stacie's blob store and reflect *her* view of progress.
 * They do not sync to Drew's actual tracker.
 */
export const DREW_TASKS: StacieTask[] = [
  // ── Daily reminders → "ongoing" bucket ───────────────────────────
  { id: "drew-daily-chase", title: "Chase Bank Approvals", frequency: "ongoing", owner: "drew",
    instructions: "Check and approve checks and ACHs.\nhttps://secure.chase.com/" },
  { id: "drew-daily-avid",  title: "Approve Avid Invoices", frequency: "ongoing", owner: "drew",
    instructions: "Check and approve open invoices.\nhttps://one.avidxchange.net/#/invoices" },

  // ── Weekly ───────────────────────────────────────────────────────
  { id: "drew-wkly-avid", title: "Pay Avid Bills (every Wednesday)", frequency: "weekly", owner: "drew",
    instructions: "Export from Skyline and import to Avid. Run JV III, JV III Condo, NI LLC FNIPLX, then All Linked Accounts." },

  // ── Monthly routine ──────────────────────────────────────────────
  { id: "drew-m-checks",      title: "1st of the Month Checks",       frequency: "monthly", owner: "drew", instructions: "Print checks and cover sheet." },
  { id: "drew-m-lbr",         title: "Liberty Bank Report",            frequency: "monthly", owner: "drew", instructions: "JVIII and NILLC reprojections." },
  { id: "drew-m-lhsc",        title: "LHSC Cushman Report",            frequency: "monthly", owner: "drew", instructions: "Activity Rec, Cash Journal, Check Register, Voucher Report, Bank Statement." },
  { id: "drew-m-close",       title: "Close Prior Month",              frequency: "monthly", owner: "drew", instructions: "Post and close period in Skyline (~20th)." },
  { id: "drew-m-cash",        title: "Cash Analysis Report",           frequency: "monthly", owner: "drew" },
  { id: "drew-m-opstmt",      title: "Operating Statements",           frequency: "monthly", owner: "drew", instructions: "Update and record variances." },
  { id: "drew-m-tenant",      title: "Tenant Group Setup",             frequency: "monthly", owner: "drew" },
  { id: "drew-m-mgmt-fees",   title: "Print Management Fees",          frequency: "monthly", owner: "drew", instructions: "Print from Skyline (last Friday of month)." },
  { id: "drew-m-alloc-exp",   title: "Allocate Expenses",              frequency: "monthly", owner: "drew", instructions: "Same time as monthly close (~20th)." },
  { id: "drew-m-alloc-cc",    title: "Allocate CC Charges",            frequency: "monthly", owner: "drew", instructions: "Same time as monthly close (~20th)." },

  // ── Quarterly ────────────────────────────────────────────────────
  { id: "drew-q-bp",        title: "BP Commissions",            frequency: "quarterly", owner: "drew", instructions: "Q4 (Jan) · Q1 (Apr) · Q2 (Jul) · Q3 (Oct)" },
  { id: "drew-q-lhscwawa",  title: "LHSC Wawa Quarterly CAM",   frequency: "quarterly", owner: "drew", instructions: "Q4 (Jan) · Q1 (Apr) · Q2 (Jul) · Q3 (Oct)" },

  // ── Annual / Seasonal ────────────────────────────────────────────
  { id: "drew-jan-1099due",   title: "1099 Due (Jan)",                       frequency: "annual", owner: "drew" },
  { id: "drew-jan-alloc",     title: "Reconcile Allocated Expenses (Jan)",   frequency: "annual", owner: "drew", instructions: "9301, 9302, 9303 expenses in 2000 account." },
  { id: "drew-feb-wp",        title: "Start Workpapers (Feb)",                frequency: "annual", owner: "drew", instructions: "Once January is closed." },
  { id: "drew-mar-wak",       title: "Wakefern CAM Rec Due (Mar)",            frequency: "annual", owner: "drew" },
  { id: "drew-mar-ret",       title: "Single-Tenant RET Bills (Mar)",         frequency: "annual", owner: "drew", instructions: "Add RET bills to charges. Include copy of actual RET bill." },
  { id: "drew-apr-cam",       title: "CAM Recs Due (Apr)",                    frequency: "annual", owner: "drew" },
  { id: "drew-jul-sky",       title: "Reprojection Skyline Upload (Jul)",     frequency: "annual", owner: "drew" },
  { id: "drew-aug-ins",       title: "Insurance Applications (Aug)",          frequency: "annual", owner: "drew" },
  { id: "drew-sep-bud",       title: "Next Year Budgets (Sep)",               frequency: "annual", owner: "drew" },
  { id: "drew-oct-wak",       title: "Wakefern Budget Due (Oct)",             frequency: "annual", owner: "drew" },
  { id: "drew-nov-kfff-990",  title: "Submit KFFF Form 990 (Nov)",            frequency: "annual", owner: "drew" },
  { id: "drew-nov-chase",     title: "Check Chase — Black Friday (Nov)",      frequency: "annual", owner: "drew" },
  { id: "drew-nov-camest",    title: "Upload CAM Estimates (Nov)",            frequency: "annual", owner: "drew" },
  { id: "drew-nov-budsky",    title: "Upload Budgets to Skyline (Nov)",       frequency: "annual", owner: "drew" },
  { id: "drew-nov-rec",       title: "1st of Month Reconciliation (Nov)",     frequency: "annual", owner: "drew" },

  // ── End of Year (December) ───────────────────────────────────────
  { id: "drew-dec-1099", title: "1099 Start",                  frequency: "eoy", owner: "drew", instructions: "Prepare vendor list and upload to track1099.com." },
  { id: "drew-dec-int",  title: "Transfer Interest Income",    frequency: "eoy", owner: "drew", instructions: "From three security deposit accounts. Calculate management fees on interest." },
  { id: "drew-dec-bank", title: "Reimburse Bank Fees",         frequency: "eoy", owner: "drew", instructions: "Office Works and Eastwick (unless M&T acc closes)." },
];

/** Returns the period key the given frequency uses for the supplied date. */
export function currentPeriod(freq: Frequency, now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  switch (freq) {
    case "weekly": {
      // ISO week number (Mon–Sun); first week of the year contains Jan 4th.
      const d = new Date(Date.UTC(y, now.getMonth(), now.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    }
    case "monthly":    return `${y}-${String(m).padStart(2, "0")}`;
    case "quarterly":  return `${y}-Q${Math.ceil(m / 3)}`;
    case "semiannual": return `${y}-H${m <= 6 ? 1 : 2}`;
    case "annual":     return `${y}`;
    case "eoy":        return `${y}`;
    case "ongoing":    return "ongoing";
  }
}

/** Compose the storage key used for a single task's completion in a given period. */
export function checkedKey(taskId: string, period: string): string {
  return `${taskId}|${period}`;
}
