// Bank balance exports → one balance per account. Three banks, three shapes,
// each read from the PDF's extracted text:
//
//   Chase    "Accounts – chase.com" print: "<name> (...5615)  $avail  $present"
//            — a long name can wrap onto the line above the account number.
//   Liberty  "Account Summary": "<name> x7216 Available Balance $… Current
//            Balance $…" — the two labels are not always beside their figures.
//   M&T      Treasury Center "Previous Day Deposit Accounts": one row per
//            account, "<date> <NAME> <account #> <closing ledger> <closing
//            available> …".
//
// The BALANCE we report is the bank's ledger figure — Chase's Present, Liberty's
// Current, M&T's Closing Ledger — because it is what the account actually
// holds; the available figure is kept beside it (holds and float differ by
// bank and day). Pure: no storage, no PDF library, so it is testable on text.

export type BankName = "JPM-Chase" | "Liberty Bank" | "M&T";

export type ParsedBalance = {
  /** "x5615" — the registry's form (lib/bank-rec/accounts.ts). */
  last4: string;
  name: string;
  balance: number;
  available: number | null;
};

export type ParsedStatement = {
  bank: BankName;
  /** ISO date the balances are as of, when the export says (M&T does). */
  asOf: string | null;
  accounts: ParsedBalance[];
};

const money = (s: string): number => {
  const neg = /-|\(/.test(s);
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return neg ? -n : n;
};
const AMT = String.raw`\(?-?\$?-?[\d,]+\.\d{2}\)?`;

export function detectBank(text: string): BankName | null {
  if (/Previous Day Deposit Accounts|Closing Ledger|M&?T Bank|Treasury Center/i.test(text)) return "M&T";
  if (/Liberty Bank/i.test(text)) return "Liberty Bank";
  if (/Chase|JPMorgan/i.test(text)) return "JPM-Chase";
  return null;
}

function parseChase(text: string): ParsedBalance[] {
  const flat = text.replace(/\s+/g, " ");
  const re = new RegExp(String.raw`([^$()]*?)\(\.\.\.(\d{4})\)\s*(${AMT})\s+(${AMT})`, "g");
  const out: ParsedBalance[] = [];
  for (const m of flat.matchAll(re)) {
    const name = m[1].replace(/^.*\b(Checking|Savings|Money Market)\b/i, "").replace(/^.*balance\b/i, "").trim();
    out.push({ last4: `x${m[2]}`, name, available: money(m[3]), balance: money(m[4]) });
  }
  return out;
}

function parseLiberty(text: string): ParsedBalance[] {
  const flat = text.replace(/\s+/g, " ");
  const tokens = [...flat.matchAll(/\bx(\d{4})\b/g)];
  const out: ParsedBalance[] = [];
  tokens.forEach((t, i) => {
    const start = t.index! + t[0].length;
    const end = i + 1 < tokens.length ? tokens[i + 1].index! : flat.length;
    const seg = flat.slice(start, end);
    const cur = new RegExp(String.raw`Current Balance\s*(${AMT})`).exec(seg);
    const avail = new RegExp(String.raw`Available Balance\s*(${AMT})`).exec(seg);
    if (!cur) return;
    const prevEnd = i > 0 ? tokens[i - 1].index! : 0;
    const before = flat.slice(prevEnd, t.index!);
    const name = before.replace(/^.*\$[\d,]+\.\d{2}/, "").replace(/^x\d{4}/, "").trim();
    out.push({ last4: `x${t[1]}`, name, balance: money(cur[1]), available: avail ? money(avail[1]) : null });
  });
  return out;
}

function parseMT(text: string): { asOf: string | null; accounts: ParsedBalance[] } {
  const out: ParsedBalance[] = [];
  let asOf: string | null = null;
  const re = /(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+(\d{6,})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})/g;
  for (const line of text.split(/\n/)) {
    for (const m of line.matchAll(re)) {
      asOf ??= `${m[3]}-${m[1]}-${m[2]}`;
      out.push({ last4: `x${m[5].slice(-4)}`, name: m[4].trim(), balance: money(m[6]), available: money(m[7]) });
    }
  }
  return { asOf, accounts: out };
}

/** Parse one export's text. Null when the bank cannot be told. */
export function parseBankBalances(text: string): ParsedStatement | null {
  const bank = detectBank(text);
  if (!bank) return null;
  if (bank === "M&T") return { bank, ...parseMT(text) };
  const accounts = bank === "Liberty Bank" ? parseLiberty(text) : parseChase(text);
  // One balance per account: a print that repeats a row keeps the first.
  const seen = new Set<string>();
  return { bank, asOf: null, accounts: accounts.filter((a) => (seen.has(a.last4) ? false : (seen.add(a.last4), true))) };
}
