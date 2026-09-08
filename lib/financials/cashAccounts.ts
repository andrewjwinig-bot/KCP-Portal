// Which GL accounts hold cash. ONE definition, shared by the bank-rec book side
// (which reconciles a cash account against a statement) and the 1099 register
// (which reads money OUT of those accounts) — if the two disagreed, a payment
// could reconcile on one page and be invisible on the other.

/** Skyline cash / money-market / security-deposit accounts. */
export function isCashAccount(code: string, name: string): boolean {
  if (/^0[12]\d\d-/.test(code)) return true;
  return /\b(cash|money market|security dep)/i.test(name);
}
