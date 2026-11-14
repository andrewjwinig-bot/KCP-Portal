// BANK REC — itemizing a bank statement (owner: "if there is inbalance, we need
// to know the specific detail. whether check #, amount, vendor date … so we can
// reference and fix"). A balance alone cannot say WHICH check is missing, so
// each statement is broken into its transactions.
//
// Every itemizer PROVES itself before it is trusted: the items must add up to
// the statement's own figures (Chase: each section's count and total; M&T:
// the running balance on every line; Liberty: beginning + items = ending). A
// statement that does not prove is reported "not itemized" and the rec falls
// back to balances — never a confident list that is missing a line.
//
// Pure (no I/O). Text is whitespace-collapsed PDF text.

import { amountOf, type BankStatement } from "./monthFiles";

export type BankItem = {
  dateISO: string;
  /** Signed: money in positive, money out negative. */
  amount: number;
  checkNo: string | null;
  description: string;
  kind: "deposit" | "check" | "withdrawal" | "fee" | "interest";
};

export type Itemized = { ok: boolean; reason?: string; items: BankItem[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: BankItem[]) => r2(xs.reduce((a, x) => a + x.amount, 0));
const MONEY = String.raw`\d{1,3}(?:,\d{3})*\.\d{2}`;
const num = (s: string) => Number(s.replace(/[$,]/g, ""));

/** The check number an electronic payment carries ("Ind ID:Ck001632", "AVIDPAY CK100993"). */
export function checkNoIn(desc: string): string | null {
  const m = desc.match(/\bCk\*?0*(\d{3,8})\b/i);
  return m ? m[1] : null;
}

function yearFor(md: string, periodEnd: string | null): string {
  // "09/01" on a statement ending 2026-09-30 → 2026-09-01; a January statement
  // can carry December lines from the year before.
  const y = Number(periodEnd?.slice(0, 4) ?? new Date().getFullYear());
  const endMonth = Number(periodEnd?.slice(5, 7) ?? 12);
  const [m, d] = md.split("/").map(Number);
  const year = m > endMonth ? y - 1 : y;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ── Chase ─────────────────────────────────────────────────────────────────
// Sections print in a fixed order — Deposits and Additions, Checks Paid,
// Electronic Withdrawals (and Other / ATM & Debit Card Withdrawals), Fees —
// and the summary states each section's COUNT and TOTAL. Checks are found by
// their number; the dated lines are taken in reading order and cut into the
// sections by those counts, and each section must then add to its total.

const CHASE_SECTIONS: { label: string; kind: BankItem["kind"]; sign: 1 | -1 }[] = [
  { label: "Deposits and Additions", kind: "deposit", sign: 1 },
  { label: "ATM & Debit Card Withdrawals", kind: "withdrawal", sign: -1 },
  { label: "Electronic Withdrawals", kind: "withdrawal", sign: -1 },
  { label: "Other Withdrawals", kind: "withdrawal", sign: -1 },
  { label: "Fees", kind: "fee", sign: -1 },
];

export function itemizeChase(text: string, st: BankStatement): Itemized {
  const t = text.replace(/\s+/g, " ");
  const summary = (label: string) => {
    const m = t.match(new RegExp(String.raw`${label.replace(/&/g, "&")} (\d{1,4}) -?\$?(${MONEY})`));
    return m ? { count: Number(m[1]), total: num(m[2]) } : null;
  };
  const checksSum = summary("Checks Paid");

  // Checks: "1633 ^ 09/21 $315.00", "1647 * ^ 09/16 9,755.37".
  const checkRe = new RegExp(String.raw`(?<![\d/.,:#])(\d{3,8}) (?:\* )?(?:\^ )?(\d{2}\/\d{2})(?![\/\d]) \$?(${MONEY})(?![\d])`, "g");
  const checks: BankItem[] = [];
  let rest = t;
  if (checksSum && checksSum.count > 0) {
    let m: RegExpExecArray | null;
    while ((m = checkRe.exec(t))) {
      checks.push({ dateISO: yearFor(m[2], st.periodEnd), amount: -num(m[3]), checkNo: m[1].replace(/^0+/, ""), description: `Check ${m[1]}`, kind: "check" });
    }
    rest = t.replace(checkRe, " ");
  }

  // Dated lines in reading order.
  const dated: { md: string; desc: string; amount: number }[] = [];
  const lineRe = new RegExp(String.raw`(?<![\d/])(\d{2}\/\d{2})(?![\/\d]) (.+?) \$?(${MONEY})(?=\s|$)`, "g");
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(rest))) dated.push({ md: m[1], desc: m[2].trim(), amount: num(m[3]) });

  const items: BankItem[] = [];
  let at = 0;
  for (const sec of CHASE_SECTIONS) {
    const s = summary(sec.label);
    if (!s || s.count === 0) continue;
    const slice = dated.slice(at, at + s.count);
    at += s.count;
    const secItems = slice.map((d) => ({
      dateISO: yearFor(d.md, st.periodEnd),
      amount: sec.sign * d.amount,
      checkNo: sec.sign < 0 ? checkNoIn(d.desc) : null,
      description: tidy(d.desc),
      kind: sec.kind,
    }));
    if (slice.length !== s.count || Math.abs(Math.abs(sum(secItems)) - s.total) > 0.005) {
      return { ok: false, reason: `${sec.label}: read ${slice.length} of ${s.count} lines totalling $${Math.abs(sum(secItems)).toFixed(2)}, statement says $${s.total.toFixed(2)}`, items: [] };
    }
    items.push(...secItems);
  }
  if (checksSum && (checks.length !== checksSum.count || Math.abs(Math.abs(sum(checks)) - checksSum.total) > 0.005)) {
    return { ok: false, reason: `Checks Paid: read ${checks.length} of ${checksSum.count} checks totalling $${Math.abs(sum(checks)).toFixed(2)}, statement says $${checksSum.total.toFixed(2)}`, items: [] };
  }
  items.push(...checks);
  return prove(items, st);
}

/** Chase ACH lines are mostly routing noise — keep who it is from / to. */
function tidy(desc: string): string {
  const co = desc.match(/Orig CO Name:\s*(.+?)\s+Orig ID/i)?.[1];
  const descr = desc.match(/Entry Descr:\s*(.+?)\s+Sec:/i)?.[1];
  if (co) return `${co.trim()}${descr ? ` · ${descr.trim()}` : ""}${checkNoIn(desc) ? ` · Ck ${checkNoIn(desc)}` : ""}`;
  const bo = desc.match(/B\/O:\s*(.+?)\s{1,}(?:[A-Z][a-z]+\s+){0,3}(?:[A-Z]{2}\s|US\b)/)?.[1];
  if (/Book Transfer Credit/i.test(desc) && bo) return `Book Transfer Credit · ${bo.trim()}`;
  return desc.replace(/\s*Trn:\s*\S+/i, "").slice(0, 140).trim();
}

// ── M&T ───────────────────────────────────────────────────────────────────
// Every activity line carries the RUNNING BALANCE, so the sign of each line is
// the move in the balance — and the chain of balances proves the list.

export function itemizeMt(text: string, st: BankStatement): Itemized {
  const t = text.replace(/\s+/g, " ");
  const re = new RegExp(String.raw`(\d{2}\/\d{2}\/\d{4}) ((?:(?!\d{2}\/\d{2}\/\d{4}).)+?) \$?(${MONEY}) (${MONEY})(?=\s)`, "g");
  const items: BankItem[] = [];
  let prev = st.beginning;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(t))) {
    if (/Beginning Balance/i.test(m[2])) continue;
    const key = `${m[1]}|${m[3]}|${m[4]}|${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const amt = num(m[3]), bal = num(m[4]);
    if (prev == null) return { ok: false, reason: "No beginning balance on the statement", items: [] };
    const delta = r2(bal - prev);
    if (Math.abs(Math.abs(delta) - amt) > 0.005) continue; // not an activity line
    const [mm, dd, yyyy] = m[1].split("/");
    const desc = m[2].trim();
    const check = desc.match(/CHECK NUMBER (\d+)/i)?.[1] ?? checkNoIn(desc);
    items.push({
      dateISO: `${yyyy}-${mm}-${dd}`,
      amount: delta,
      checkNo: check ? check.replace(/^0+/, "") : null,
      description: desc,
      kind: /SERVICE CHARGE/i.test(desc) ? "fee" : /INTEREST/i.test(desc) ? "interest" : check ? "check" : delta > 0 ? "deposit" : "withdrawal",
    });
    prev = bal;
  }
  return prove(items, st);
}

// ── Liberty ───────────────────────────────────────────────────────────────
// Liberty's columns read apart (dates in one run, amounts in another), so the
// sections are rebuilt: checks by number, then each section's dates paired in
// order with its amounts. Withdrawals print with a minus.

const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 } as Record<string, number>;
function libDate(s: string, periodEnd: string | null): string {
  const [mon, d] = s.split(" ");
  const mo = MON[mon];
  const y = Number(periodEnd?.slice(0, 4) ?? new Date().getFullYear());
  const endMo = Number(periodEnd?.slice(5, 7) ?? 12);
  return `${mo > endMo ? y - 1 : y}-${String(mo).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function itemizeLiberty(text: string, st: BankStatement): Itemized {
  const t = text.replace(/\s+/g, " ");
  const items: BankItem[] = [];
  const D = String.raw`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{2}`;

  // Checks: "291 Sep 01 o 450.00" (o = image, e = electronic, * = skip).
  const ck = new RegExp(String.raw`(?<![\d,.])(\d{1,8}) (${D}) [oe*]? ?(${MONEY})`, "g");
  let m: RegExpExecArray | null;
  const checkBlock = t.match(/Check Summary/i) ? t : "";
  while ((m = ck.exec(checkBlock))) {
    items.push({ dateISO: libDate(m[2], st.periodEnd), amount: -num(m[3]), checkNo: m[1], description: `Check ${m[1]}`, kind: "check" });
  }
  const noChecks = t.replace(ck, " ");

  // A section reads "<dates…> <descriptions…> <amounts…> <Section label>".
  const section = (label: string, sign: 1 | -1, kind: BankItem["kind"]) => {
    // The description may not run across another date (it would swallow the
    // section before it).
    const re = new RegExp(String.raw`((?:${D}\s+)+)((?:(?!${D}).)*?)\s+((?:-?${MONEY}\s+)+)${label}`, "g");
    let s: RegExpExecArray | null;
    while ((s = re.exec(noChecks))) {
      const dates = s[1].trim().match(new RegExp(D, "g")) ?? [];
      const amts = s[3].trim().split(/\s+/);
      if (dates.length !== amts.length) continue;
      dates.forEach((d, i) => items.push({
        dateISO: libDate(d, st.periodEnd),
        amount: sign * Math.abs(num(amts[i])),
        checkNo: checkNoIn(s![2]),
        description: dates.length === 1 ? s![2].trim().slice(0, 140) : `${label.replace(/s$/, "")} ${i + 1} of ${dates.length}`,
        kind: dates.length === 1 && /interest/i.test(s![2]) ? "interest" : dates.length === 1 && /service charge|fee/i.test(s![2]) ? "fee" : kind,
      }));
    }
  };
  section("Deposits and Credits", 1, "deposit");
  section("Withdrawals and Debits", -1, "withdrawal");

  // Money-market statements: "Credit Interest … 52.08" with no section list.
  if (!items.some((i) => i.kind === "interest")) {
    const at = t.search(/Credit Interest/i);
    if (at >= 0 && st.ending != null && st.beginning != null) {
      const gap = r2(st.ending - st.beginning - sum(items));
      const near = t.slice(at, at + 240).match(new RegExp(MONEY, "g")) ?? [];
      if (gap > 0 && near.some((a) => Math.abs(num(a) - gap) < 0.005)) {
        items.push({ dateISO: st.periodEnd ?? "", amount: gap, checkNo: null, description: "Credit Interest", kind: "interest" });
      }
    }
  }
  return prove(items, st);
}

/** The list is trusted only when it carries the statement from beginning to ending. */
function prove(items: BankItem[], st: BankStatement): Itemized {
  if (st.beginning == null || st.ending == null) return { ok: false, reason: "The statement's beginning or ending balance could not be read", items };
  const gap = r2(st.ending - st.beginning - sum(items));
  if (Math.abs(gap) > 0.005) {
    return { ok: false, reason: `Items read add to $${sum(items).toFixed(2)}; the statement moved $${r2(st.ending - st.beginning).toFixed(2)} (off by $${gap.toFixed(2)})`, items };
  }
  return { ok: true, items: items.sort((a, b) => a.dateISO.localeCompare(b.dateISO)) };
}

export function itemizeStatement(text: string, st: BankStatement): Itemized {
  if (st.bank === "Chase") return itemizeChase(text, st);
  if (st.bank === "M&T") return itemizeMt(text, st);
  if (st.bank === "Liberty") return itemizeLiberty(text, st);
  return { ok: false, reason: "Bank not recognised", items: [] };
}

export { amountOf };
