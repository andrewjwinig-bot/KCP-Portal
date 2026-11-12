// Big-picture money for the Cash Position email and PDF (owner, 11/2026: "if
// balances are over a certain amount … round to nearest 1,000 and say K …
// at this point its big picture"). The Excel export keeps exact dollars.
//
//   cell:     a table figure, no $ — 10K and up to the nearest thousand
//             ("1,893K"), under that exact ("7,638"); negatives (parens),
//             zero a dash.
//   headline: a figure on its own, with $ — $1M and up in millions
//             ("$11.57M"), 10K and up in thousands ("$893K"), under exact.

export const K_FROM = 10_000;

function body(abs: number, millions: boolean): string {
  if (millions && abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= K_FROM) return `${Math.round(abs / 1000).toLocaleString("en-US")}K`;
  return Math.round(abs).toLocaleString("en-US");
}

export function cell(n: number | null): string {
  if (n == null || Math.round(n) === 0) return "—";
  const t = body(Math.abs(n), false);
  return n < 0 ? `(${t})` : t;
}
export const cellSigned = (n: number | null) => (n == null || Math.round(n) === 0 ? "—" : n < 0 ? cell(n) : `+${cell(n)}`);

export function headline(n: number): string {
  const t = `$${body(Math.abs(n), true)}`;
  return n < 0 ? `(${t})` : t;
}
export const headlineSigned = (n: number) => (n < 0 ? headline(n) : `+${headline(n)}`);

/** A table's total row: the cell rule with $ ("$11,571K"). */
export function total(n: number | null): string {
  if (n == null || Math.round(n) === 0) return "\u2014";
  const t = `$${body(Math.abs(n), false)}`;
  return n < 0 ? `(${t})` : t;
}
export const totalSigned = (n: number | null) => (n == null || Math.round(n) === 0 ? "\u2014" : n < 0 ? total(n) : `+${total(n)}`);
