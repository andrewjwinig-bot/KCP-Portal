export type Frequency = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "ongoing" | "eoy";

export type StacieTask = {
  id: string;
  title: string;
  frequency: Frequency;
  instructions?: string; // line-broken plain text
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

export const STACIE_TASKS: StacieTask[] = [
  // ── Weekly ────────────────────────────────────────────────────
  {
    id: "wkly-dl-ach-wires",
    title: "Download ACH and Incoming Wires from Tenants",
    frequency: "weekly",
    instructions:
      "Mondays.\n• Chase LB (2300, 7010, NILLC, JVIII), 7200, 9510, Liberty 7300 & 4500, M&T 4900.\n• Including WAWA 1st of month (3).\n• Send to Tami to post.\n• Assist Tami with any questions regarding tenant payments.",
  },
  {
    id: "wkly-ap",
    title: "AP — Review/Approve Legal & 2000 in AVID; Select & Pay Bills (all properties)",
    frequency: "weekly",
    instructions: "Review and approve all legal bills and 2000 in AVID Box.\nSelect & pay bills for all properties.",
  },

  // ── Monthly ───────────────────────────────────────────────────
  { id: "mo-dl-bank-statements", title: "Download ALL Bank Statements", frequency: "monthly", instructions: "Chase 16, Liberty 6 (+3?), M&T 6." },
  { id: "mo-reconcile-bank",     title: "Reconcile ALL Bank Statements (except 5600 and 2000)", frequency: "monthly", instructions: "Schedule." },
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
