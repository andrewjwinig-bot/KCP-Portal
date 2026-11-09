// RECEIPT RECONCILIATION — what did the tenant MEAN to pay?
//
// Owner (11/2026): Tami processes the tenant receipts, and tenants keep paying
// amounts that do not line up with their statement — they took their open
// credit, or forgot it; they paid one old item; they paid "the usual" monthly
// amount. "Get in the brain of the tenant and figure out what charges they
// meant to apply to", then tell the tenant in a clear, consistent email how
// the payment will be applied, give them a day to answer, and otherwise apply
// it by a fixed HIERARCHY.
//
// Pure: a laser statement (open charges + credits, `lib/statements`) and the
// amount received in, ranked explanations out — each one the exact lines it
// pays, how much of the credit it uses and what is left over. The page, the
// API and the email all read these, and the server recomputes the chosen one
// from the stored statement before anything is sent or saved (a client figure
// is never what a payment is applied against — the same rule as remittances).
//
// Nothing here posts to Skyline. The plan is the list of entries to key there.

import type { ChargeCategory, StatementCharge, TenantStatement } from "./types";
import { CATEGORY_LABEL } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const c = (n: number) => Math.round(n * 100);
const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthOf = (iso: string | null) => (iso ? iso.slice(0, 7) : null);
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const dateLabel = (iso: string | null) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");

// ── The master order of application ────────────────────────────────────────
// How a payment the tenant did not direct is applied (owner, 11/2026): by
// CHARGE TYPE in this order, OLDEST FIRST within each type — "apply all
// electric charges before moving on to applying to rent". Rent is last.
//
// The laser statement prints DESCRIPTIONS, not Skyline's charge codes, so each
// code is recognised by its wording (`applicationClassOf`):
//   U&O   "U & O", "Use & Occupancy"
//   AD    legal charges — "Legal", "Attorney", "Court", "Counsel", "AD"
//   Electric  "Elec …", "PECO"
//   Water     "Water", "Sewer", "Aqua"
//   YEC   "2025 Year End CAM Adjustment", "2024 CAM Reconciliation"
//   RER   "2024 RET Reconciliation", "Year End RET Adjustment"
//   YEI   "Year End INS Adjustment", "INS Reconciliation"
//   then the monthly CAM / RET / INS estimates, then Rent.
// A charge the order does not name (gas, trash, a late fee, a one-off) is
// "Other charges", applied after the year-end reconciliations and BEFORE the
// monthly estimates and rent — so rent stays last.
// The email states this order whenever it decides how a payment is applied
// (`ORDER_SENTENCE`), so change it HERE and the explanation follows.

export type ApplicationClass = "uando" | "legal" | "electric" | "water" | "yec" | "rer" | "yei" | "other" | "cam" | "ret" | "ins" | "rent";

export const APPLICATION_ORDER: { key: ApplicationClass; label: string; code: string | null }[] = [
  { key: "uando", label: "Use & Occupancy", code: "U&O" },
  { key: "legal", label: "Legal charges", code: "AD" },
  { key: "electric", label: "Electric", code: null },
  { key: "water", label: "Water", code: null },
  { key: "yec", label: "Year-end CAM reconciliation", code: "YEC" },
  { key: "rer", label: "Year-end real estate tax reconciliation", code: "RER" },
  { key: "yei", label: "Year-end insurance reconciliation", code: "YEI" },
  { key: "other", label: "Other charges", code: null },
  { key: "cam", label: "Monthly CAM", code: null },
  { key: "ret", label: "Monthly real estate tax", code: null },
  { key: "ins", label: "Monthly insurance", code: null },
  { key: "rent", label: "Rent", code: null },
];
export const APPLICATION_LABEL = Object.fromEntries(APPLICATION_ORDER.map((x) => [x.key, x.label])) as Record<ApplicationClass, string>;

const isYearEnd = (d: string) => /year\s*-?\s*end|reconcil|\badj(ustment)?\b|true[\s-]?up/i.test(d);

/** Which step of the master order a statement line falls in. */
export function applicationClassOf(ch: { description: string; category: ChargeCategory }): ApplicationClass {
  const d = ch.description;
  if (ch.category === "uando" || /^u\s*&\s*o\b|use\s*(&|and)\s*occupancy/i.test(d)) return "uando";
  if (/\blegal\b|attorney|counsel|\bcourt\b|lawyer/i.test(d) || /\bAD\b/.test(d)) return "legal";
  if (/\belec|\bpeco\b|electric/i.test(d)) return "electric";
  if (/water|sewer|\baqua\b/i.test(d)) return "water";
  if (ch.category === "cam") return isYearEnd(d) ? "yec" : "cam";
  if (ch.category === "ret") return isYearEnd(d) ? "rer" : "ret";
  if (ch.category === "insurance") return isYearEnd(d) ? "yei" : "ins";
  if (ch.category === "rent") return "rent";
  return "other";
}

/** The order in one sentence, for the email. */
export const ORDER_SENTENCE =
  "Payments that don't specify which charges they cover are applied in our standard order: Use & Occupancy, legal charges, electric, water, year-end CAM, real estate tax and insurance reconciliations, other charges, monthly CAM, real estate tax and insurance estimates, and rent last — the oldest charge first within each.";

export type OpenCharge = {
  /** Index into the statement's `charges` — stable for a stored statement. */
  idx: number;
  dateISO: string | null;
  description: string;
  category: ChargeCategory;
  /** Its step in the master order of application. */
  appClass: ApplicationClass;
  amount: number;
};

export type Account = {
  charges: OpenCharge[];
  /** Credits on account, as a positive figure. */
  credit: number;
  creditLines: { dateISO: string | null; description: string; amount: number }[];
  /** Sum of the open charges, before the credit. */
  gross: number;
  /** What the statement says is due: gross − credit. */
  net: number;
};

export function accountOf(st: TenantStatement): Account {
  const charges: OpenCharge[] = [];
  const creditLines: Account["creditLines"] = [];
  st.charges.forEach((ch: StatementCharge, idx) => {
    if (ch.amount > 0.005) charges.push({ idx, dateISO: ch.dateISO, description: ch.description, category: ch.category, appClass: applicationClassOf(ch), amount: r2(ch.amount) });
    else if (ch.amount < -0.005) creditLines.push({ dateISO: ch.dateISO, description: ch.description, amount: r2(-ch.amount) });
  });
  const gross = r2(charges.reduce((a, x) => a + x.amount, 0));
  const credit = r2(creditLines.reduce((a, x) => a + x.amount, 0));
  return { charges, credit, creditLines, gross, net: r2(gross - credit) };
}

export type PlanLine = OpenCharge & { fromCredit: number; fromPayment: number };

export type Explanation = {
  /** Stable within one (statement, amount) — the API re-derives by it. */
  id: string;
  /** Short title: "Paid the full balance, credit taken". */
  title: string;
  /** One plain sentence in the tenant's shoes — read by Tami. */
  why: string;
  /** 0–100: how sure we are this is what they meant. */
  confidence: number;
  exact: boolean;
  lines: PlanLine[];
  creditUsed: number;
  /** Payment beyond what the plan applies (an overpayment, held as a credit). */
  unapplied: number;
  /** What the tenant still owes after this payment is applied. */
  balanceAfter: number;
  /** The fallback by hierarchy — what happens if the tenant does not answer. */
  fallback?: boolean;
};

/** Apply `credit` then `payment` across `targets` in order. */
function applyTo(targets: OpenCharge[], payment: number, credit: number): { lines: PlanLine[]; creditUsed: number; unapplied: number } {
  let cr = c(credit), pay = c(payment);
  const lines: PlanLine[] = [];
  for (const t of targets) {
    let open = c(t.amount);
    const fromCredit = Math.min(cr, open); cr -= fromCredit; open -= fromCredit;
    const fromPayment = Math.min(pay, open); pay -= fromPayment;
    if (fromCredit || fromPayment) lines.push({ ...t, fromCredit: fromCredit / 100, fromPayment: fromPayment / 100 });
  }
  return { lines, creditUsed: r2(credit - cr / 100), unapplied: pay / 100 };
}

/** The master order: by charge type (APPLICATION_ORDER), then OLDEST first
 *  within the type, then the statement's own order. Undated lines last. */
const RANK = new Map(APPLICATION_ORDER.map((x, i) => [x.key, i]));
export function byHierarchy(xs: OpenCharge[]): OpenCharge[] {
  return [...xs].sort((a, b) =>
    (RANK.get(a.appClass) ?? 99) - (RANK.get(b.appClass) ?? 99)
    || (a.dateISO ?? "9999").localeCompare(b.dateISO ?? "9999") || a.idx - b.idx);
}

/**
 * CREDITS ARE ALWAYS USED (owner, 11/2026: "if tenant pays less than the
 * statement charges and there is a credit, apply the credit to keep them
 * current … apply their credits to get them to a $0 balance"). Whatever the
 * payment was meant for, any credit the plan has not used goes on the charges
 * still open after it, in the master order — so the tenant ends as close to
 * $0 as the payment and credit together allow. A credit stays on account only
 * when nothing is left open to apply it to.
 */
export function topUpCredit(acct: Account, e: Explanation): Explanation {
  let left = c(acct.credit - e.creditUsed);
  if (left <= 0) return e;
  const byIdx = new Map(e.lines.map((l) => [l.idx, { ...l }]));
  for (const ch of byHierarchy(acct.charges)) {
    if (left <= 0) break;
    const l = byIdx.get(ch.idx);
    const open = c(ch.amount) - c(l?.fromPayment ?? 0) - c(l?.fromCredit ?? 0);
    if (open <= 0) continue;
    const take = Math.min(open, left);
    left -= take;
    byIdx.set(ch.idx, l ? { ...l, fromCredit: (c(l.fromCredit) + take) / 100 } : { ...ch, fromCredit: take / 100, fromPayment: 0 });
  }
  const order = new Map(byHierarchy(acct.charges).map((x, i) => [x.idx, i]));
  const lines = [...byIdx.values()].sort((a, b) => (order.get(a.idx) ?? 0) - (order.get(b.idx) ?? 0));
  const creditUsed = r2(acct.credit - left / 100);
  const added = r2(creditUsed - e.creditUsed);
  return {
    ...e, lines, creditUsed,
    why: added > 0 ? `${e.why} Their ${usd(added)} credit goes on the oldest open charges to bring them current.` : e.why,
  };
}

/** Exact subsets of `items` (by cents) summing to `target`, fewest items first.
 *  Bounded — a statement is tens of lines, never thousands. */
function subsets(items: OpenCharge[], target: number, max = 3): OpenCharge[][] {
  const want = c(target);
  if (want <= 0) return [];
  const xs = [...items].sort((a, b) => b.amount - a.amount).slice(0, 26);
  const vals = xs.map((x) => c(x.amount));
  const suffix: number[] = new Array(xs.length + 1).fill(0);
  for (let i = xs.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + vals[i];
  const found: OpenCharge[][] = [];
  let nodes = 0;
  const pick: number[] = [];
  const walk = (i: number, left: number) => {
    if (found.length >= 12 || ++nodes > 250_000) return;
    if (left === 0) { found.push(pick.map((k) => xs[k])); return; }
    if (i >= xs.length || left < 0 || suffix[i] < left) return;
    pick.push(i); walk(i + 1, left - vals[i]); pick.pop();
    walk(i + 1, left);
  };
  walk(0, want);
  return found.sort((a, b) => a.length - b.length).slice(0, max);
}

const sum = (xs: OpenCharge[]) => r2(xs.reduce((a, x) => a + x.amount, 0));
const describe = (xs: OpenCharge[]) => xs.length === 1
  ? `${xs[0].description} (${dateLabel(xs[0].dateISO)})`
  : `${xs.length} charges: ${xs.slice(0, 3).map((x) => x.description).join(", ")}${xs.length > 3 ? "…" : ""}`;

/**
 * Every plausible reading of a payment, best first. Always ends with the
 * hierarchy fallback, so there is always a plan.
 */
export function explainPayment(acct: Account, paid: number, opts: { currentMonth?: string } = {}): Explanation[] {
  const P = r2(paid);
  const { charges, credit: C, gross: G, net: N } = acct;
  const out: Explanation[] = [];
  const seen = new Set<string>();
  const add = (e: Omit<Explanation, "balanceAfter">) => {
    const key = e.lines.map((l) => `${l.idx}:${c(l.fromCredit)}:${c(l.fromPayment)}`).join("|") + `#${c(e.creditUsed)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...e, balanceAfter: 0 });
  };
  // What is still owed after the payment, net of any credit left on account:
  // gross − credit used − payment applied − credit left = net − payment applied
  // (an overpayment, held as a credit, takes it below zero).
  const fix = (e0: Explanation) => { const e = topUpCredit(acct, e0); return { ...e, balanceAfter: r2(N - e.lines.reduce((a, l) => a + l.fromPayment, 0) - e.unapplied) }; };

  if (P <= 0 || !charges.length) {
    const fb = applyTo(byHierarchy(charges), P, 0);
    add({ id: "fallback", title: "Apply in the standard order", why: "Nothing open to match against.", confidence: 0, exact: false, ...fb, fallback: true });
    return out.map(fix);
  }
  const ordered = byHierarchy(charges);

  // 1. The full balance, credit taken.
  if (C > 0 && c(P) === c(N)) {
    const a = applyTo(ordered, P, C);
    add({ id: "full-net", title: "Paid the full balance, credit taken", why: `${usd(P)} is exactly the statement balance after their ${usd(C)} credit — they paid everything and used the credit.`, confidence: 98, exact: true, ...a });
  }
  // 2. Every charge, credit ignored.
  if (c(P) === c(G)) {
    const a = applyTo(ordered, P, 0);
    add({
      id: "full-gross", title: C > 0 ? "Paid every charge, didn't take the credit" : "Paid the full balance",
      why: C > 0 ? `${usd(P)} is every open charge before the ${usd(C)} credit — they paid in full and the credit stays on account.` : `${usd(P)} is exactly the statement balance.`,
      confidence: C > 0 ? 95 : 99, exact: true, ...a,
    });
  }

  // 3. Whole months — the tenant paid "the September bill", with or without the credit.
  const months = [...new Set(charges.map((x) => monthOf(x.dateISO)).filter(Boolean) as string[])].sort();
  const inMonths = (ms: string[]) => ordered.filter((x) => x.dateISO && ms.includes(monthOf(x.dateISO)!));
  const runs: string[][] = [];
  for (let i = 0; i < months.length; i++) for (let j = i; j < months.length; j++) runs.push(months.slice(i, j + 1));
  for (const ms of runs) {
    const xs = inMonths(ms);
    const t = sum(xs);
    const label = ms.length === 1 ? monthLabel(ms[0]) : `${monthLabel(ms[0])} – ${monthLabel(ms[ms.length - 1])}`;
    const isAll = xs.length === charges.length;
    if (isAll) continue; // covered by 1 / 2
    if (c(P) === c(t)) {
      add({ id: `months:${ms.join(",")}`, title: `Paid the ${label} charges`, why: `${usd(P)} is exactly what was billed for ${label}${C > 0 ? ", without the credit" : ""}.`, confidence: ms.includes(opts.currentMonth ?? "") ? 90 : 84, exact: true, ...applyTo(xs, P, 0) });
    }
    if (C > 0 && c(P) === c(t - C) && t > C) {
      add({ id: `months-net:${ms.join(",")}`, title: `Paid the ${label} charges, less their credit`, why: `${usd(P)} is the ${label} charges (${usd(t)}) less their ${usd(C)} credit.`, confidence: ms.includes(opts.currentMonth ?? "") ? 88 : 84, exact: true, ...applyTo(xs, P, C) });
    }
  }

  // 4. One category across every month — "the rent", "the CAM".
  const cats = [...new Set(charges.map((x) => x.category))];
  for (const cat of cats) {
    const xs = ordered.filter((x) => x.category === cat);
    if (xs.length === charges.length) continue;
    const t = sum(xs);
    if (c(P) === c(t)) add({ id: `cat:${cat}`, title: `Paid all the open ${CATEGORY_LABEL[cat]}`, why: `${usd(P)} is every open ${CATEGORY_LABEL[cat]} charge, and nothing else.`, confidence: 80, exact: true, ...applyTo(xs, P, 0) });
  }

  // 5. Everything except one item — a charge they dispute or did not expect.
  for (const x of charges) {
    const rest = ordered.filter((y) => y.idx !== x.idx);
    if (c(P) === c(G - x.amount)) add({ id: `skip:${x.idx}`, title: `Paid everything except ${x.description}`, why: `${usd(P)} is every charge except ${x.description} of ${usd(x.amount)} (${dateLabel(x.dateISO)}) — possibly one they question.`, confidence: 78, exact: true, ...applyTo(rest, P, 0) });
    if (C > 0 && c(P) === c(N - x.amount)) add({ id: `skip-net:${x.idx}`, title: `Paid the balance except ${x.description}, credit taken`, why: `${usd(P)} is the net balance less ${x.description} of ${usd(x.amount)} — they used the credit and left that one charge.`, confidence: 76, exact: true, ...applyTo(rest, P, C) });
  }

  // 6. Specific items — any exact combination, fewest charges first. Only when
  // nothing natural (a balance, a month, a category) already explains it: a
  // month's three charges also "add up" with another month's mixed in, and
  // offering those reads as noise.
  const natural = out.some((e) => e.exact);
  if (!natural) for (const xs of subsets(charges, P)) {
    const sorted = byHierarchy(xs);
    add({ id: `items:${sorted.map((x) => x.idx).join(",")}`, title: xs.length === 1 ? `Paid one item: ${xs[0].description}` : `Paid ${xs.length} specific charges`, why: `${usd(P)} is exactly ${describe(sorted)}.`, confidence: Math.max(40, 74 - xs.length * 6), exact: true, ...applyTo(sorted, P, 0) });
  }
  if (C > 0 && !natural) for (const xs of subsets(charges, r2(P + C))) {
    const sorted = byHierarchy(xs);
    add({ id: `items-net:${sorted.map((x) => x.idx).join(",")}`, title: `Paid ${xs.length === 1 ? xs[0].description : `${xs.length} specific charges`}, credit taken`, why: `${usd(P)} plus their ${usd(C)} credit is exactly ${describe(sorted)}.`, confidence: Math.max(38, 70 - xs.length * 6), exact: true, ...applyTo(sorted, P, C) });
  }

  // 7. The usual monthly amount — they paid what a month normally costs.
  const latest = months[months.length - 1];
  if (latest) {
    const monthly = sum(inMonths([latest]));
    if (c(P) === c(monthly) && !out.some((e) => e.exact)) {
      add({ id: "monthly", title: "Paid their regular monthly amount", why: `${usd(P)} matches one month's charges (${monthLabel(latest)}), applied in the standard order.`, confidence: 70, exact: true, ...applyTo(ordered, P, 0) });
    }
  }

  // 8. Near misses — a short or over payment against the obvious targets.
  if (!out.some((e) => e.exact)) {
    const near: { t: number; label: string; credit: number }[] = [
      { t: N, label: "the statement balance", credit: C },
      ...(C > 0 ? [{ t: G, label: "every charge before the credit", credit: 0 }] : []),
    ];
    for (const n of near) {
      const d = r2(P - n.t);
      if (Math.abs(d) <= Math.max(25, n.t * 0.05)) {
        add({
          id: `near:${c(n.t)}`, title: d < 0 ? `Short-paid ${n.label} by ${usd(d)}` : `Over-paid ${n.label} by ${usd(d)}`,
          why: `${usd(P)} is ${usd(d)} ${d < 0 ? "less" : "more"} than ${n.label} (${usd(n.t)}) — likely a ${d < 0 ? "deduction or a stale figure" : "late fee or rounding"} on their side.`,
          confidence: 55, exact: false, ...applyTo(ordered, P, n.credit),
        });
      }
    }
  }

  // 9. The fallback — always there: the hierarchy, credit untouched.
  add({ id: "fallback", title: "Apply in the standard order", why: `No reading fits exactly; apply ${usd(P)} by the master order — U&O, legal, electric, water, year-end reconciliations, other, monthly CAM / RET / INS, rent last — oldest first within each.`, confidence: 20, exact: false, ...applyTo(ordered, P, 0), fallback: true });

  return out.map(fix).sort((a, b) => b.confidence - a.confidence);
}

/** Re-derive one explanation by id (the API never trusts a client plan). A
 *  `custom:` id is a hand-picked set of charge indexes, applied in hierarchy
 *  order, with or without the credit. */
export function planById(acct: Account, paid: number, id: string, opts: { currentMonth?: string } = {}): Explanation | null {
  const m = /^custom(-net)?:([\d,]+)$/.exec(id);
  if (m) {
    const pick = new Set(m[2].split(",").map(Number));
    const xs = byHierarchy(acct.charges.filter((x) => pick.has(x.idx)));
    if (!xs.length) return null;
    const useCredit = !!m[1];
    const a = applyTo(xs, paid, useCredit ? acct.credit : 0);
    const applied = r2(a.lines.reduce((s, l) => s + l.fromPayment, 0));
    const e = topUpCredit(acct, { id, title: `Applied to ${xs.length === 1 ? xs[0].description : `${xs.length} chosen charges`}${useCredit ? ", credit taken" : ""}`, why: "Chosen by hand.", confidence: 100, exact: a.unapplied < 0.005 && c(sum(xs)) === c(paid + a.creditUsed), ...a, balanceAfter: 0 });
    return { ...e, balanceAfter: r2(acct.net - applied - a.unapplied) };
  }
  return explainPayment(acct, paid, opts).find((e) => e.id === id) ?? null;
}

// ── The email ──────────────────────────────────────────────────────────────
// ONE wording for every tenant, so the communication is consistent: what we
// received, what is open, the credit, how we will apply it, the deadline, and
// what happens if we do not hear back. Edited in place before sending; the
// figures come from the plan, never retyped.

export type ReceiptEmailInput = {
  tenantName: string;
  propertyName: string;
  suite: string;
  amount: number;
  receivedISO: string;
  checkNo?: string | null;
  asOfISO: string | null;
  acct: Account;
  plan: Explanation;
  respondByISO: string;
  /** The statement PDF rides along — the email says so. */
  attached?: boolean;
  signer: { name: string; title?: string; email: string; phone?: string };
};

const longDate = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`); return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }); };

// The email is three parts: an OPENING and a CLOSING Tami can edit, and in
// between the ACCOUNT TABLE — every open charge and credit, what the payment
// and the credit cover, and what stays open — generated from the plan on the
// server, never retyped (owner: "make it a table like the open charges &
// credits to clean it up and be very clear"). Sent as HTML with a plain-text
// twin of the same three parts.

export type ReceiptEmailParts = { subject: string; opening: string; closing: string };

export function receiptEmailParts(x: ReceiptEmailInput): ReceiptEmailParts {
  const { plan } = x;
  const ref = x.checkNo ? ` (check #${x.checkNo})` : "";
  const opening = [
    `Hello,`,
    ``,
    `Thank you for your payment of ${usd(x.amount)}${ref}, received ${longDate(x.receivedISO)}, for ${x.propertyName}, Suite ${x.suite}.`,
    ``,
    `The amount doesn't match the balance on your account exactly, so we want to confirm how it should be applied before we post it. The table below shows your open charges and credits and how we will apply your payment.${x.attached ? " Your current statement of account is attached for reference." : ""}`,
  ].join("\n");
  const closing = [
    // Wherever WE decided the order (no reading of theirs did), say what it is.
    ...(plan.fallback || plan.id === "monthly" || plan.id.startsWith("near:") ? [ORDER_SENTENCE, ``] : []),
    `If you intended this payment for different charges, please reply to this email by ${longDate(x.respondByISO)} and let us know which charges it covers. If we don't hear from you by then, we'll apply it as shown above.`,
    ``,
    `If you are not the person who makes payment allocation decisions for your company, please forward this email to the appropriate person or department.`,
    ``,
    `Thank you,`,
    x.signer.name, ...(x.signer.title ? [x.signer.title] : []), "Korman Commercial Properties", x.signer.email, ...(x.signer.phone ? [x.signer.phone] : []),
  ].join("\n");
  return { subject: `Your payment of ${usd(x.amount)} — ${x.propertyName}, Suite ${x.suite}`, opening, closing };
}

/** How much of each credit line the plan uses, and what is LEFT on account —
 *  in printed order (owner: "if a credit is applied but theres still an open
 *  credit show that leftover credit too"). */
export function creditUsage(acct: Account, creditUsed: number): { used: number; left: number }[] {
  let use = c(creditUsed);
  return acct.creditLines.map((cl) => {
    const u = Math.min(use, c(cl.amount)); use -= u;
    return { used: u / 100, left: (c(cl.amount) - u) / 100 };
  });
}

type TableRow = { date: string; description: string; open: number; fromPayment: number; fromCredit: number; stillOpen: number; isCredit?: boolean };

function tableRows(acct: Account, plan: Explanation): { rows: TableRow[]; totals: { open: number; fromPayment: number; fromCredit: number; stillOpen: number } } {
  const by = new Map(plan.lines.map((l) => [l.idx, l]));
  const rows: TableRow[] = byHierarchy(acct.charges).sort((p, q) => (p.dateISO ?? "9999").localeCompare(q.dateISO ?? "9999") || p.idx - q.idx).map((ch) => {
    const l = by.get(ch.idx);
    const fp = l?.fromPayment ?? 0, fc = l?.fromCredit ?? 0;
    return { date: dateLabel(ch.dateISO), description: ch.description, open: ch.amount, fromPayment: fp, fromCredit: fc, stillOpen: r2(ch.amount - fp - fc) };
  });
  // A credit row: how much of it is applied (From your credit) and what is
  // LEFT on account (Still open, as a credit).
  const usage = creditUsage(acct, plan.creditUsed);
  acct.creditLines.forEach((cl, i) => rows.push({ date: dateLabel(cl.dateISO), description: cl.description, open: -cl.amount, fromPayment: 0, fromCredit: usage[i].used, stillOpen: -usage[i].left, isCredit: true }));
  const t = (k: "fromPayment" | "fromCredit") => r2(rows.reduce((a, r) => a + (r.isCredit ? 0 : r[k]), 0));
  // Still open nets the credit left: what they owe after this, or (negative)
  // the credit the account keeps.
  const stillOpen = r2(rows.reduce((a, r) => a + r.stillOpen, 0));
  return { rows, totals: { open: acct.net, fromPayment: t("fromPayment"), fromCredit: t("fromCredit"), stillOpen } };
}

/** The sentences under the table — figures, so generated, not edited. */
function summaryLines(acct: Account, plan: Explanation): string[] {
  const out: string[] = [];
  if (plan.creditUsed > 0) out.push(`${usd(plan.creditUsed)} of the credit on your account is applied as shown, to bring your account current.`);
  if (acct.credit - plan.creditUsed > 0.005 && plan.balanceAfter > 0.005) out.push(`Your remaining credit of ${usd(acct.credit - plan.creditUsed)} stays on your account toward future charges.`);
  if (plan.unapplied > 0.005) out.push(`${usd(plan.unapplied)} of your payment is more than the charges above and will be held as a credit on your account.`);
  out.push(plan.balanceAfter > 0.005
    ? `After this payment, your remaining balance will be ${usd(plan.balanceAfter)}.`
    : plan.balanceAfter < -0.005 ? `After this payment, your account will carry a credit of ${usd(-plan.balanceAfter)}.` : `After this payment, your account will be paid in full.`);
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paras = (t: string) => t.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

/** The account table as email-safe HTML (inline styles, no classes). */
export function receiptTableHtml(x: Pick<ReceiptEmailInput, "acct" | "plan" | "asOfISO">): string {
  const { rows, totals } = tableRows(x.acct, x.plan);
  const NAVY = "#0b4a7d", GREEN = "#15803d", LINE = "#d9dee5", MUTED = "#6b7280";
  const th = (t: string, right = false) => `<th style="padding:8px 10px;text-align:${right ? "right" : "left"};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#ffffff;background:${NAVY}">${t}</th>`;
  const td = (t: string, o: { right?: boolean; color?: string; bold?: boolean } = {}) => `<td style="padding:7px 10px;border-bottom:1px solid ${LINE};text-align:${o.right ? "right" : "left"};${o.color ? `color:${o.color};` : ""}${o.bold ? "font-weight:700;" : ""}white-space:nowrap">${t}</td>`;
  const m = (n: number) => (n ? usd(n) : "—");
  const body = rows.map((r) => {
    const applied = r.fromPayment > 0 || r.fromCredit > 0;
    return `<tr style="${applied ? "background:#effaf3" : ""}">${td(esc(r.date), { color: MUTED })}${`<td style="padding:7px 10px;border-bottom:1px solid ${LINE}">${esc(r.description)}</td>`}${
      td(r.isCredit ? `(${usd(-r.open)})` : usd(r.open), { right: true, color: r.isCredit ? GREEN : undefined })}${
      td(r.isCredit ? "" : m(r.fromPayment), { right: true, color: r.fromPayment ? GREEN : MUTED, bold: r.fromPayment > 0 })}${
      td(r.isCredit ? (r.fromCredit ? `${usd(r.fromCredit)} applied` : "—") : m(r.fromCredit), { right: true, color: r.fromCredit ? GREEN : MUTED, bold: !r.isCredit && r.fromCredit > 0 })}${
      td(r.isCredit ? (r.stillOpen ? `(${usd(-r.stillOpen)}) credit left` : "fully applied") : m(r.stillOpen), { right: true, color: r.isCredit ? (r.stillOpen ? GREEN : MUTED) : r.stillOpen ? undefined : MUTED, bold: !!r.isCredit && !!r.stillOpen })}</tr>`;
  }).join("");
  const tot = `<tr style="background:#f3f6f9">${td("")}${`<td style="padding:8px 10px;font-weight:800">Total</td>`}${td(usd(totals.open), { right: true, bold: true })}${td(m(totals.fromPayment), { right: true, bold: true, color: GREEN })}${td(m(totals.fromCredit), { right: true, bold: true, color: totals.fromCredit ? GREEN : MUTED })}${td(totals.stillOpen < -0.005 ? `(${usd(-totals.stillOpen)}) credit` : m(totals.stillOpen), { right: true, bold: true, color: totals.stillOpen < -0.005 ? GREEN : undefined })}</tr>`;
  const summary = summaryLines(x.acct, x.plan).map((l) => `<li style="margin:0 0 4px">${esc(l)}</li>`).join("");
  return `<div style="margin:6px 0 18px">
<div style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${NAVY};margin:0 0 6px">Your account${x.asOfISO ? ` as of ${dateLabel(x.asOfISO)}` : ""} — and how we will apply your payment</div>
<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:680px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;border:1px solid ${LINE}">
<thead><tr>${th("Date")}${th("Charge")}${th("Open", true)}${th("From your payment", true)}${th("From your credit", true)}${th("Still open", true)}</tr></thead>
<tbody>${body}${tot}</tbody></table>
<ul style="margin:10px 0 0;padding-left:18px;font-size:13px;color:#111827">${summary}</ul>
</div>`;
}

/** The same table as plain text, for the text part of the email. */
function receiptTableText(x: Pick<ReceiptEmailInput, "acct" | "plan" | "asOfISO">): string {
  const { rows, totals } = tableRows(x.acct, x.plan);
  const out = [`YOUR ACCOUNT${x.asOfISO ? ` AS OF ${dateLabel(x.asOfISO)}` : ""} — AND HOW WE WILL APPLY YOUR PAYMENT`, ""];
  for (const r of rows) {
    if (r.isCredit) {
      const bits = [r.fromCredit ? `${usd(r.fromCredit)} applied` : "", r.stillOpen ? `${usd(-r.stillOpen)} credit left on account` : "fully applied"].filter(Boolean).join("; ");
      out.push(`  ${r.date === "—" ? "" : `${r.date} — `}${r.description}: (${usd(-r.open)}) → ${bits}`);
      continue;
    }
    const parts = [r.fromPayment ? `${usd(r.fromPayment)} from your payment` : "", r.fromCredit ? `${usd(r.fromCredit)} from your credit` : ""].filter(Boolean).join(" + ");
    out.push(`  ${r.date} — ${r.description}: ${usd(r.open)}${parts ? ` → ${parts}` : ""}${r.stillOpen > 0.005 ? `; ${usd(r.stillOpen)} still open` : ""}`);
  }
  out.push("", `  Total: ${usd(totals.open)} · from your payment ${usd(totals.fromPayment)}${totals.fromCredit ? ` · from your credit ${usd(totals.fromCredit)}` : ""} · ${totals.stillOpen < -0.005 ? `credit left ${usd(-totals.stillOpen)}` : `still open ${usd(totals.stillOpen)}`}`, "");
  for (const l of summaryLines(x.acct, x.plan)) out.push(`• ${l}`);
  return out.join("\n");
}

/** Put an email together from the (edited) opening and closing and the
 *  generated table: HTML and its plain-text twin. */
export function renderReceiptEmail(x: Pick<ReceiptEmailInput, "acct" | "plan" | "asOfISO">, opening: string, closing: string): { html: string; text: string } {
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:700px">${paras(opening)}${receiptTableHtml(x)}${paras(closing)}</div>`;
  const text = `${opening}\n\n${receiptTableText(x)}\n\n${closing}`;
  return { html, text };
}

/** Subject + the whole plain-text body — the parts with no edits. */
export function composeReceiptEmail(x: ReceiptEmailInput): { subject: string; body: string; html: string } {
  const p = receiptEmailParts(x);
  const r = renderReceiptEmail(x, p.opening, p.closing);
  return { subject: p.subject, body: r.text, html: r.html };
}

/** How long a tenant has to answer before the plan applies (owner, 11/2026:
 *  "give 2 days before we apply the charges"). */
export const RESPOND_BUSINESS_DAYS = 2;

/** `days` business days (Mon–Fri) after `iso`, as YYYY-MM-DD. */
export function respondByFrom(iso: string, days = RESPOND_BUSINESS_DAYS): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  for (let n = 0; n < days;) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++;
  }
  return d.toISOString().slice(0, 10);
}
