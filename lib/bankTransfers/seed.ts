// Initial bank-transfer log. Seeded on first page load; everything is
// editable through the UI thereafter.

import type { BankTransfer } from "./storage";

export const DEFAULT_SHARE_FOLDER_URL =
  "https://kormancommercial.sharepoint.com/sites/KormanCommercialProperties/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FKormanCommercialProperties%2FShared%20Documents%2FData%2FAccounting%2FBank%20Transfers&viewid=24fc9090%2D2b50%2D4b81%2Da5a4%2D3b98f3af93c3";

type SeedRow = [date: string, bank: string, from: string, to: string, amount: number, pdfSaved: boolean, description: string];

// Date is mm/dd/yyyy in the source; helper normalizes to ISO YYYY-MM-DD.
function iso(mdY: string): string {
  const [m, d, y] = mdY.split("/").map((s) => s.trim());
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const ROWS: SeedRow[] = [
  ["11/22/2024", "Chase", "LIK - Operating", "Clearing",            2597,     true,  "REIMB Mis-applied payment"],
  ["12/26/2024", "Chase", "LIK - Operating", "Lafayette Hilll SC",  35000,    true,  ""],
  ["1/17/2025",  "Chase", "LIK - Operating", "Clearing",            45034,    true,  "REIMB for Carol Borgman payroll. This was netted on 12/20/24"],
  ["3/27/2025",  "Chase", "LIK - Operating", "Clearing",            5000,     true,  ""],
  ["3/31/2025",  "Chase", "LIK - Operating", "JV III",              10000,    true,  "Mistake. Reimbursed 4/1/25"],
  ["4/8/2025",   "Chase", "LIK - Operating", "Joshua Rd",           2500,     false, ""],
  ["4/1/2025",   "Chase", "LIK - Operating", "Clearing",            50000,    true,  "ADV"],
  ["6/3/2025",   "Chase", "LIK - Operating", "Clearing",            30000,    true,  "Payroll"],
  ["7/1/2025",   "Chase", "LIK - Operating", "Clearing",            30000,    true,  ""],
  ["7/9/2025",   "Chase", "LIK - Operating", "Clearing",            15000,    true,  ""],
  ["7/16/2025",  "Chase", "LIK - Operating", "Clearing",            30870,    true,  ""],
  ["10/24/2025", "Chase", "LIK - Operating", "Spring Garden St",    15000,    true,  ""],
  ["10/24/2025", "Chase", "LIK - Operating", "Bellaire Ave",        2500,     true,  ""],
  ["10/29/2025", "Chase", "LIK - Operating", "Bellaire Ave",        15000,    true,  ""],
  ["11/19/2025", "Chase", "LIK - Operating", "Bellaire Ave",        20000,    true,  ""],
  ["12/5/2025",  "Chase", "LIK - Operating", "Ft Washington Ave",   3000,     true,  ""],
  ["12/9/2025",  "Chase", "LIK - Operating", "Bellaire Ave",        10000,    true,  ""],
  ["12/22/2025", "Chase", "LIK - Operating", "Bellaire Ave",        35000,    true,  ""],
  ["12/30/2025", "Chase", "LIK - Operating", "Clearing",            35000,    true,  "Payroll (REIMB 1/14/26)"],
  ["1/8/2026",   "Chase", "LIK - Operating", "Clearing",            5000,     true,  "ADV 1st of the Month Jan-26 (REIMB 1/14/26)"],
  ["1/14/2026",  "Chase", "Clearing",        "LIK - Operating",     35000,    true,  "REIMB for 12/30/25 Front"],
  ["1/14/2026",  "Chase", "Clearing",        "LIK - Operating",     5000,     true,  "REIMB for 1/8/26 Front"],
  ["1/14/2026",  "Chase", "LIK - Operating", "Bellaire Ave",        16000,    true,  "ADV Spring Garden & Ft Washington"],
  ["1/28/2026",  "Chase", "LIK - Operating", "Bellaire Ave",        20000,    true,  "ADV For Spring Garden Work"],
  ["2/25/2026",  "Chase", "LIK - Operating", "Bellaire Ave",        10000,    true,  "ADV For Spring Garden Work"],
  ["2/25/2026",  "Chase", "LIK - Operating", "Clearing",            45000,    true,  "ADV for Payroll (REIMB 3/11/26)"],
  ["3/11/2026",  "Chase", "Clearing",        "LIK - Operating",     45000,    true,  "REIMB ADV for Payroll"],
  ["3/20/2026",  "Chase", "Spring Garden St","Bellaire Ave",        3855,     true,  "George Herman Flooring install Spring Garden. Do not REIMB"],
  ["3/30/2026",  "Chase", "LIK - Operating", "Clearing",            12761.38, true,  "ADV for Payroll Wire - HF"],
  ["4/1/2026",   "Chase", "LIK - Operating", "Clearing",            10000,    true,  "ADV (overdraft and HF/DW on vacation)"],
  ["4/22/2026",  "Chase", "LIK - Operating", "Clearing",            15000,    true,  "ADV for payroll/EOM"],
  ["4/22/2026",  "Chase", "LIK - Operating", "Clearing",            25000,    true,  "Tom Hall Invoice. Do not Reimb"],
  ["4/28/2026",  "Chase", "LIK - Operating", "Clearing",            8600,     true,  "ADV"],
  ["4/29/2026",  "Chase", "Clearing",        "LIK - Operating",     8600,     true,  "REIMB for 4/28 ADV"],
  ["5/6/2026",   "Chase", "LIK - Operating", "Clearing",            30000,    true,  "ADV"],
];

export function BANK_TRANSFERS_SEED(): BankTransfer[] {
  const now = new Date().toISOString();
  return ROWS.map((r, i) => ({
    id: `bt_seed_${i.toString().padStart(3, "0")}`,
    date: iso(r[0]),
    bankName: r[1],
    fromLabel: r[2],
    toLabel: r[3],
    amount: r[4],
    pdfSaved: r[5],
    description: r[6],
    createdAt: now,
    updatedAt: now,
  }));
}
