// Shared by the Invoice History page and Tanya's dashboard card.

export const FLOW_LABEL: Record<string, string> = {
  allocated: "Allocated Expenses",
  "credit-card": "Credit Card",
  payroll: "Payroll",
  commissions: "Commissions",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const usd = (n: number) => `$${Math.round(n || 0).toLocaleString("en-US")}`;

export function sentDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

/** A batch's period in words: "September 2026", "Q3 2026", "Aug 2026 – Sep 2026",
 *  a pay date, else as stored. */
export function batchPeriodLabel(source: string, period: string): string {
  const p = String(period).trim();
  const qm = /^Q([1-4])(\d{2})\b/.exec(p);
  if (source === "commissions" && qm) return `Q${qm[1]} 20${qm[2]}`;
  const month = (m: string) => {
    const r = /^(\d{4})-(\d{2})$/.exec(m);
    return r ? `${MONTHS[Number(r[2]) - 1]} ${r[1]}` : null;
  };
  if (month(p)) return month(p)!;
  const range = /^(\d{4}-\d{2})_to_(\d{4}-\d{2})$/.exec(p);
  if (range) return `${month(range[1])} – ${month(range[2])}`;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p);
  if (day) return `Pay date ${Number(day[2])}/${Number(day[3])}/${day[1]}`;
  return p;
}
