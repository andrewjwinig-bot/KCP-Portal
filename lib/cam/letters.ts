// Deterministic communication templates — fill the reconciliation numbers into
// a ready-to-send letter. No AI: the numbers are exact from the statement, so
// these are instant and free. Staff review/edit before sending.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function money(n: number): string {
  const s = Math.abs(Math.round(n)).toLocaleString("en-US");
  return `$${s}`;
}

const SIGNOFF = "Sincerely,\n\nKorman Commercial Properties\nProperty Management";

export type DepositStatus = "held" | "refunded" | "forfeited" | "partial";

export type LetterInput = {
  propertyName: string;
  tenant: string;
  suite?: string;
  year: number;
  asOfMonth: number;       // 1-12
  occupiedMonths: number;
  /** Total reconciliation balance: positive = owed by tenant, negative = credit due to tenant. */
  totalBalance: number;
  kind: "office" | "retail";
  /** Security deposit on file (dollars). Undefined/null = unknown → deposit
   *  handled under separate cover (legacy wording). */
  securityDeposit?: number | null;
  /** Disposition of that deposit. Defaults to "held" when a deposit is known. */
  depositStatus?: DepositStatus | null;
};

/** Move-out close-out letter for a departed tenant. Weaves in the security
 *  deposit and net settlement when the deposit is known. */
export function moveOutCloseOutLetter(i: LetterInput): string {
  const asOf = `${MONTHS[i.asOfMonth - 1]} ${i.year}`;
  const owed = Math.round(i.totalBalance) >= 0;
  const amt = money(i.totalBalance);
  const months = `${i.occupiedMonths} month${i.occupiedMonths === 1 ? "" : "s"}`;
  const chargeLabel = i.kind === "retail" ? "CAM, insurance, and real-estate-tax" : "CAM and real-estate-tax";

  // Security-deposit paragraph. When we hold the deposit, show the net
  // settlement (deposit applied against the reconciliation balance).
  let depositPara: string;
  const dep = i.securityDeposit;
  if (dep == null) {
    depositPara = `The enclosed statement details the reconciliation. Your security deposit is being reconciled separately and any return will follow under separate cover.`;
  } else if (i.depositStatus === "refunded") {
    depositPara = `The enclosed statement details the reconciliation. Your security deposit of ${money(dep)} has already been returned to you.`;
  } else if (i.depositStatus === "forfeited") {
    depositPara = `The enclosed statement details the reconciliation. Your security deposit of ${money(dep)} was applied to amounts owed under the lease.`;
  } else {
    // Held (or partial) → present the net settlement.
    const net = dep - i.totalBalance; // >0 → refund to tenant; <0 → tenant owes
    const netAmt = money(net);
    depositPara = net >= 0
      ? `The enclosed statement details the reconciliation. We hold a security deposit of ${money(dep)} on your account. Applying it against the ${owed ? `balance of ${amt} due` : `credit of ${amt}`}, a net refund of ${netAmt} will be issued to you.`
      : `The enclosed statement details the reconciliation. We hold a security deposit of ${money(dep)} on your account. Applying it against the balance of ${amt} due, a net balance of ${netAmt} remains due; please remit payment within 30 days of the date of this letter.`;
  }

  return [
    `Re: Final ${i.kind === "retail" ? "CAM/INS/RET" : "CAM/RET"} Reconciliation — ${i.propertyName}${i.suite ? `, Suite ${i.suite}` : ""}`,
    ``,
    `Dear ${i.tenant},`,
    ``,
    `Thank you for your tenancy at ${i.propertyName}. We have completed the final ${chargeLabel} reconciliation for your occupied period in ${i.year} (${months}, through ${asOf}).`,
    ``,
    owed
      ? `Based on the actual operating expenses for the period against the amounts you were billed, a balance of ${amt} is due.`
      : `Based on the actual operating expenses for the period against the amounts you were billed, a credit of ${amt} is due to you.`,
    ``,
    depositPara,
    ``,
    `Please contact us with any questions.`,
    ``,
    SIGNOFF,
  ].join("\n");
}

/** Annual CAM/RET reconciliation cover letter (for the year-end statement). */
export function camCoverLetter(i: LetterInput): string {
  const owed = Math.round(i.totalBalance) >= 0;
  const amt = money(i.totalBalance);
  const chargeLabel = i.kind === "retail" ? "CAM, insurance, and real-estate-tax" : "CAM and real-estate-tax";
  return [
    `Re: ${i.year} ${i.kind === "retail" ? "CAM/INS/RET" : "CAM/RET"} Reconciliation — ${i.propertyName}${i.suite ? `, Suite ${i.suite}` : ""}`,
    ``,
    `Dear ${i.tenant},`,
    ``,
    `Enclosed is your ${i.year} ${chargeLabel} reconciliation for ${i.propertyName}. It compares the actual operating expenses for the year to the estimated amounts you were billed.`,
    ``,
    owed
      ? `The reconciliation shows a balance of ${amt} due. This amount will appear on your next statement; please remit with your regular payment.`
      : `The reconciliation shows a credit of ${amt} in your favor, which will be applied to your account.`,
    ``,
    `Your estimated monthly charges for the coming year have been adjusted to reflect the current expense run-rate. Please contact us with any questions on the enclosed detail.`,
    ``,
    SIGNOFF,
  ].join("\n");
}
