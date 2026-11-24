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
  /** OCR only: the accounts read, summed, against the total the bank printed
   *  on the page (Chase's "Total available balance", Liberty's "Total Current
   *  Balance"). Null when the page prints none (M&T). */
  totalCheck?: TotalCheck | null;
};

export type TotalCheck = { printed: number; sum: number; ties: boolean; what: string };

export type ParseOptions = {
  /** The text came from OCR of a page image (an "Adobe PDF" printout), not
   *  from the PDF's own text layer: read it through `normalizeOcrText` and the
   *  layout-tolerant readings below. Never set for a real-text export — the
   *  strict readings stay exactly as they were. */
  ocr?: boolean;
};

// Chase prints a negative balance with a typographic minus (U+2212, "−$381.46"),
// which a plain "-" never matched — an overdrawn account dropped out of the import.
const money = (s: string): number => {
  const neg = /[-\u2212]|\(/.test(s);
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return neg ? -n : n;
};
const AMT = String.raw`\(?[-\u2212]?\$?[-\u2212]?[\d,]+\.\d{2}\)?`;

/** The PDF's text cannot be read at all. A page printed through the "Adobe
 *  PDF" printer (PScript5 + Acrobat Distiller) embeds its fonts as Type 3 with
 *  no character map, so every reader — ours included — gets control characters
 *  and shuffled punctuation instead of words (Chase, 11/9/26). Such a file is
 *  read by OCR in the browser instead (lib/ocr/pdfOcr.ts → `{ ocr: true }`). */
export function unreadablePdfText(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 40) return true;
  if (/balance|account|total|checking|savings|chase|liberty|deposit/i.test(t)) return false;
  return true;
}

export const UNREADABLE_PDF_MESSAGE =
  "The PDF's text can't be read — it was likely saved with the \"Adobe PDF\" printer, which scrambles the fonts, and reading the page as an image (OCR) didn't work either. " +
  "Re-save the bank's accounts page from Chrome: Print → Destination \"Save as PDF\" (or \"Microsoft Print to PDF\"), then import that file.";

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

// ── OCR ──────────────────────────────────────────────────────────────────
// An "Adobe PDF" printout has no readable text layer, so the import page reads
// it as an image (tesseract.js, in the browser — lib/ocr/pdfOcr.ts) and sends
// the recognised text here. OCR text is messier than a text layer: "$" read as
// "S" or "§", a comma read as a period, "x7216" as "X7216", the Chase row's
// chevron ">" between the account number and its figures, a wrapped Chase name
// putting its figures on the line ABOVE the account number, and Liberty's
// labels printed after their figures. These readings tolerate exactly that, and
// only when `ocr` is set, so a real export is read as strictly as ever. And
// because one misread digit is a wrong balance, the page's own printed total is
// checked against the accounts read (`totalCheck`) — the route refuses a file
// that doesn't tie.

/** Digit look-alikes inside a token that must be digits (an account's last four). */
const DIGIT_LIKE: Record<string, string> = { O: "0", o: "0", D: "0", Q: "0", I: "1", l: "1", "|": "1", "!": "1", S: "5", s: "5", B: "8", Z: "2", G: "6" };
const fixDigits = (s: string) => s.replace(/[OoDQIl|!SsBZG]/g, (c) => DIGIT_LIKE[c] ?? c);
const LAST4 = "([0-9OoDQIl|!SsBZG]{4})";

/** An OCR'd figure: "$" or a look-alike ("S", "§" — never the last letter of a
 *  word), groups split by "," or "." (either read for the other), a stray space
 *  after a separator, always two decimals. */
const OCR_AMT = /(\(?[-−]?)((?<![A-Za-z])[$S§]\s?)?([-−]?)(?<![\d,.])(\d{1,3}(?:[,.]\s?\d{3})+|\d+)[.,](\d{2})(?!\d)(\)?)/g;

export function normalizeOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line
      // Chase's account marker: "(...5615)", read as "(..5615)", "(…5615)", "(,..56l5)".
      .replace(new RegExp(String.raw`\(\s*[.,…·:]{1,4}\s*${LAST4}\s*[)\]}]?`, "g"), (_m, d: string) => `(...${fixDigits(d)})`)
      // Liberty's: "x7216", read as "X7216", "×7216", "x 72I6" (at least one real digit).
      .replace(new RegExp(String.raw`(?<![A-Za-z0-9])[xX×]\s?${LAST4}(?![A-Za-z0-9])`, "g"), (m, d: string) => (/\d/.test(d) ? `x${fixDigits(d)}` : m))
      // The chevron after a Chase account.
      .replace(/\)\s*[>›»]+\s*/g, ") ")
      // Figures: "S1.638.623,00" → "$1,638,623.00". A bare figure (M&T prints
      // no "$") is normalised only when it has groups or a "$" — never an
      // ungrouped run of digits, which may be an account number.
      .replace(OCR_AMT, (m, open: string, dollar: string | undefined, neg: string, whole: string, cents: string, close: string) => {
        if (!dollar && !/[,.]/.test(whole) && whole.length > 3) return m;
        const digits = whole.replace(/[,.\s]/g, "");
        const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return `${open}${neg}${dollar ? "$" : ""}${grouped}.${cents}${close}`;
      }))
    .join("\n");
}

function parseChaseOcr(text: string): ParsedBalance[] {
  const out: ParsedBalance[] = [];
  // A wrapped name ("9820 KH SPRING" / "GARDE (...2296)") prints its figures on
  // the FIRST line and the account number on the next — hold the figures until
  // a line brings an account number with none of its own.
  let pending: { avail: string; present: string; name: string } | null = null;
  for (const line of text.split("\n")) {
    const acct = /\(\.\.\.(\d{4})\)/.exec(line);
    const amts = line.match(new RegExp(AMT, "g")) ?? [];
    if (/total\s+available\s+balance/i.test(line)) { pending = null; continue; }
    if (acct && amts.length >= 2) {
      out.push({ last4: `x${acct[1]}`, name: line.slice(0, acct.index).trim(), available: money(amts[0]), balance: money(amts[1]) });
      pending = null;
    } else if (acct && pending) {
      out.push({ last4: `x${acct[1]}`, name: `${pending.name} ${line.slice(0, acct.index).trim()}`.trim(), available: money(pending.avail), balance: money(pending.present) });
      pending = null;
    } else if (!acct && amts.length >= 2) {
      pending = { avail: amts[0], present: amts[1], name: line.slice(0, line.indexOf(amts[0])).trim() };
    }
  }
  return out;
}

function parseLibertyOcr(text: string): ParsedBalance[] {
  // OCR reads each account's card top to bottom: "<name> $available" /
  // "x7216 Available Balance" / "$current" / "Current Balance". So the
  // available figure is the last one BEFORE the account number (on its name
  // line) and the current one the first AFTER it.
  const flat = text.replace(/\s+/g, " ");
  const tokens = [...flat.matchAll(/\bx(\d{4})\b/g)];
  const out: ParsedBalance[] = [];
  tokens.forEach((t, i) => {
    const prevEnd = i > 0 ? tokens[i - 1].index! + tokens[i - 1][0].length : 0;
    const before = flat.slice(prevEnd, t.index!);
    const after = flat.slice(t.index! + t[0].length, i + 1 < tokens.length ? tokens[i + 1].index! : flat.length);
    const cur = new RegExp(AMT).exec(after);
    if (!cur) return;
    // After the first account, `before` opens with the previous account's
    // current figure; this account's available figure is a second one.
    const befores = [...before.matchAll(new RegExp(AMT, "g"))];
    const avail = befores.length > (i > 0 ? 1 : 0) ? befores[befores.length - 1] : null;
    const prior = avail && befores.length > 1 ? befores[befores.length - 2] : null;
    const name = before.slice(prior ? prior.index! + prior[0].length : 0, avail ? avail.index! : before.length)
      .replace(/^.*\b(Current|Available) Balance\b/i, "").replace(/^.*\bEdit Accounts View\b/i, "").trim();
    out.push({ last4: `x${t[1]}`, name, balance: money(cur[0]), available: avail ? money(avail[0]) : null });
  });
  return out;
}

/** The total the bank printed, against the accounts read — OCR's proof. */
function totalCheckOf(bank: BankName, text: string, accounts: ParsedBalance[]): TotalCheck | null {
  const flat = text.replace(/\s+/g, " ");
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const check = (m: RegExpExecArray | null, sum: number, what: string): TotalCheck | null =>
    m ? { printed: money(m[1]), sum: r2(sum), ties: Math.abs(r2(sum) - money(m[1])) < 0.005, what } : null;
  if (bank === "JPM-Chase") {
    return check(new RegExp(String.raw`Total available balance\s*(${AMT})`, "i").exec(flat),
      accounts.reduce((t, a) => t + (a.available ?? 0), 0), "total available balance");
  }
  if (bank === "Liberty Bank") {
    return check(new RegExp(String.raw`Deposits\s*(${AMT})`, "i").exec(flat) ?? new RegExp(String.raw`Total Current Balance\s*(${AMT})`, "i").exec(flat),
      accounts.reduce((t, a) => t + a.balance, 0), "total current balance");
  }
  return null;
}

/** Parse one export's text. Null when the bank cannot be told. `ocr`: the text
 *  was read off page images (see above). */
export function parseBankBalances(text: string, opts: ParseOptions = {}): ParsedStatement | null {
  if (opts.ocr) text = normalizeOcrText(text);
  const bank = detectBank(text);
  if (!bank) return null;
  if (bank === "M&T") return { bank, ...parseMT(text), ...(opts.ocr ? { totalCheck: null } : {}) };
  const accounts = opts.ocr
    ? (bank === "Liberty Bank" ? parseLibertyOcr(text) : parseChaseOcr(text))
    : (bank === "Liberty Bank" ? parseLiberty(text) : parseChase(text));
  // One balance per account: a print that repeats a row keeps the first.
  const seen = new Set<string>();
  const unique = accounts.filter((a) => (seen.has(a.last4) ? false : (seen.add(a.last4), true)));
  return { bank, asOf: null, accounts: unique, ...(opts.ocr ? { totalCheck: totalCheckOf(bank, text, unique) } : {}) };
}
