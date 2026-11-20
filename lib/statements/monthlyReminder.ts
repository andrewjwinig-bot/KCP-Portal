// The MONTHLY ACCOUNT REMINDER (owner, 11/2026): every tenant with open
// charges or an open credit is emailed around the 20th — after the Credit
// Balance Report is re-imported, before next month's statements go out — in
// one of three styles:
//
//   courtesy  — open charges, the oldest 0–2 months old: a friendly reminder
//   past-due  — open charges, the oldest 3+ months old: firm, no threats
//               (no late fees, no default language)
//   credit    — a net credit: deduct it from the next statement, with the
//               payment it leaves (and, when it covers more than a month,
//               each month at $0 and the credit still left after)
//
// Every one carries the itemized open charges / credits and "payments in
// transit, please disregard". Pure: the review page's preview and the send
// build the SAME email; the tables are generated from the stored statement,
// so the figures a tenant reads are never typed.

import { byHierarchy, type Account } from "./receiptMatch";

export type ReminderTier = "courtesy" | "past-due" | "credit";

export const TIER_LABEL: Record<ReminderTier, string> = {
  courtesy: "Courtesy reminder",
  "past-due": "Past-due notice",
  credit: "Credit to apply",
};

/** A credit or balance under this is not worth an email. */
export const MIN_REMINDER_AMOUNT = 5;
/** The oldest open charge at this many calendar months old turns the email firm. */
export const PAST_DUE_MONTHS = 3;
/** The credit schedule lists at most this many months before "credit left". */
const SCHEDULE_MAX_MONTHS = 6;

const r2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" }) : "—");
const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthName = (ym: string) => new Date(`${ym.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const monthIdx = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const ymOf = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

/** Calendar months between the oldest dated open charge and the as-of date. */
export function oldestChargeMonths(acct: Account, asOfISO: string): number | null {
  const dated = acct.charges.map((c) => c.dateISO).filter((d): d is string => !!d).sort();
  if (!dated.length) return null;
  return Math.max(0, monthIdx(asOfISO) - monthIdx(dated[0]));
}

/** Which email, if any. null = nothing worth sending. */
export function tierOf(acct: Account, asOfISO: string): ReminderTier | null {
  if (acct.net <= -MIN_REMINDER_AMOUNT) return "credit";
  if (acct.net < MIN_REMINDER_AMOUNT) return null;
  const age = oldestChargeMonths(acct, asOfISO);
  if (age != null && age >= PAST_DUE_MONTHS) return "past-due";
  // NO courtesy reminder when everything open is THIS month's (owner: "dont
  // send a courtesy reminder november 15th if their only open charges are in
  // november"): open charges come from the Laser Statement run around the 5th,
  // and many tenants pay this month's rent between then and the 15th — it is
  // not re-run mid-month. Anything from a prior month still open is reliable.
  if (age === 0) return null;
  return "courtesy";
}

export type CreditMonth = { ym: string; charges: number; credit: number; pay: number };
export type CreditSchedule = { months: CreditMonth[]; creditLeft: number };

/**
 * The net credit run against the next months' regular charges, starting with
 * `firstYM` (the next statement). Stops when the credit is used up or after
 * SCHEDULE_MAX_MONTHS. With no monthly figure there is no schedule.
 */
export function creditSchedule(netCredit: number, monthlyCharges: number | null, firstYM: string): CreditSchedule | null {
  if (!monthlyCharges || monthlyCharges <= 0.005) return null;
  let left = r2(netCredit);
  const months: CreditMonth[] = [];
  const start = monthIdx(`${firstYM}-01`);
  for (let i = 0; i < SCHEDULE_MAX_MONTHS && left > 0.005; i++) {
    const credit = r2(Math.min(left, monthlyCharges));
    left = r2(left - credit);
    months.push({ ym: ymOf(start + i), charges: r2(monthlyCharges), credit, pay: r2(monthlyCharges - credit) });
  }
  return { months, creditLeft: left };
}

export type CreditPlanLine = { dateISO: string | null; description: string; open: number; applied: number };
export type CreditPlan = {
  credit: number;
  /** The open charges the credit clears, in the master order of application. */
  toOpen: CreditPlanLine[];
  appliedToOpen: number;
  /** What is left for the next statement (the credit-balance case). */
  toNext: number;
  /** Credit still on account after the next statement. */
  remaining: number;
};

/**
 * Where an "apply my credit" click puts the credit: first on the open charges
 * in the master order of application (byHierarchy — type, then oldest), then
 * whatever is left on the next statement's charges, the rest carried.
 */
export function creditPlan(acct: Account, monthlyCharges: number | null): CreditPlan | null {
  if (acct.credit < MIN_REMINDER_AMOUNT) return null;
  let left = r2(acct.credit);
  const toOpen: CreditPlanLine[] = [];
  for (const ch of byHierarchy(acct.charges)) {
    if (left <= 0.005) break;
    const applied = r2(Math.min(left, ch.amount));
    left = r2(left - applied);
    toOpen.push({ dateISO: ch.dateISO, description: ch.description, open: ch.amount, applied });
  }
  const appliedToOpen = r2(acct.credit - left);
  const toNext = monthlyCharges && monthlyCharges > 0 ? r2(Math.min(left, monthlyCharges)) : 0;
  return { credit: r2(acct.credit), toOpen, appliedToOpen, toNext, remaining: r2(left - toNext) };
}

/** The open charges still owed once the plan's credit is applied — each
 *  charge less what the credit took from it, in the statement's own order. */
export function openAfterCredit(acct: Account, plan: CreditPlan): { dateISO: string | null; description: string; amount: number }[] {
  const left = new Map<number, number>();
  let cr = plan.appliedToOpen;
  for (const ch of byHierarchy(acct.charges)) {
    const take = r2(Math.min(cr, ch.amount));
    cr = r2(cr - take);
    left.set(ch.idx, r2(ch.amount - take));
  }
  return acct.charges.map((ch) => ({ dateISO: ch.dateISO, description: ch.description, amount: left.get(ch.idx) ?? ch.amount })).filter((x) => x.amount > 0.005);
}

export type MonthlyReminderInput = {
  tier: ReminderTier;
  tenantName: string;
  propertyName: string;
  suite: string;
  /** Picks the header logo (Interplex buildings carry theirs). */
  propertyCode?: string;
  acct: Account;
  asOfISO: string;
  /** The next statement's month, YYYY-MM. */
  nextYM: string;
  /** The suite's regular monthly charges (rent roll gross) — the credit schedule. */
  monthlyCharges: number | null;
  attached: boolean;
  /** Credit notice: the signed link to the "apply my credit" page. */
  applyUrl?: string;
};

// ─── The email ───────────────────────────────────────────────────────────────
// It matches the Interplex tenant notices (Greg's Tenant Emails,
// lib/communications): a 600px table, a white logo row with the letter-spaced
// "TENANT NOTICE" tag, a navy hero with a two-tone Jost headline, the
// four-colour strip, an olive-railed key-figure panel, hairline tables, a blue
// callout and the dark Korman footer. Drawn as live HTML, not images, because
// every figure is the tenant's own. It is SENT BY THE COMPANY, never a person
// (owner: "i dont think we want the emails to come from a person but seem
// more just like an automated system message"); replies reach Accounts
// Receivable. An Interplex building carries the Interplex logo, as Greg's
// notices do; every other property the Korman one.

export const NOTICE_FROM_NAME = "Korman Commercial Properties";
/** Questions go to Tami by EMAIL, never a phone number (owner: "if you have
 *  questions email tami not phone number"). */
export const AR_CONTACT_NAME = "Tami Tomlinson";
export const AR_CONTACT_EMAIL = (process.env.RECEIPT_FROM ?? "ttomlinson@kormancommercial.com").trim();
const ASSET_BASE = "https://kormancommercial.com/site/email";
const INTERPLEX_CODES = new Set(["3610", "3620", "3640", "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0", "4900"]);

/** The notice palette — the Interplex tenant notices' — shared with the
 *  public apply-my-credit page so the two read as one. */
export const NOTICE_COLORS = {
  navy: "#0c1f40", ink: "#0e2c5a", text: "#13213a", soft: "#43506a", muted: "#6c7890",
  blue: "#18468b", olive: "#838906", oliveDark: "#6d7205", lime: "#b8bd4a", oliveTint: "#f1f3d6",
  line: "#dde3ec", hair: "#eaecf0", green: "#3f7d20", red: "#b42318",
  canvas: "#f4f6f9", border: "#e4e7ec", onNavy: "#c9d3e6", white: "#ffffff",
};
const C = NOTICE_COLORS;
const FONT = "Jost,'Century Gothic',Futura,Arial,Helvetica,sans-serif";
const BODY = "Arial,Helvetica,sans-serif";

const TAG: Record<ReminderTier, string> = { courtesy: "Account Reminder", "past-due": "Past-Due Notice", credit: "Credit Balance" };

export type ReminderCopy = { subject: string; opening: string; closing: string };

/** Subject + the editable paragraphs (the headline, panels and tables are generated). */
export function monthlyReminderParts(x: MonthlyReminderInput): ReminderCopy {
  const where = `${x.propertyName}, Suite ${x.suite}`;
  const asOf = longDate(x.asOfISO);
  const next = monthName(x.nextYM);
  const attached = x.attached ? " Your current statement is attached." : "";
  const questions = `If someone else handles payments for your company, please forward this notice to them.`;

  if (x.tier === "credit") {
    const credit = -x.acct.net;
    const sched = creditSchedule(credit, x.monthlyCharges, x.nextYM);
    const first = sched?.months[0];
    let howTo: string;
    if (!sched || !first) howTo = `It is not applied yet — use the button below to apply it to your ${next} statement.`;
    else if (sched.months.length === 1) howTo = `It is not applied yet. Once applied, your ${next} charges of ${usd(first.charges)} less the ${usd(first.credit)} credit would leave ${usd(first.pay)} to pay.`;
    else {
      const zeros = sched.months.filter((m) => m.pay < 0.005).map((m) => monthName(m.ym));
      const last = sched.months[sched.months.length - 1];
      const after = sched.creditLeft > 0.005 ? `, and ${usd(sched.creditLeft)} will remain on the account after that`
        : last.pay > 0.005 ? `, and your ${monthName(last.ym)} payment would be ${usd(last.pay)}` : "";
      howTo = `It is not applied yet. Once applied, it would cover your ${zeros.join(", ")} charges in full${after}.`;
    }
    return {
      subject: `Credit balance notice — ${where}: ${usd(credit)}`,
      opening: `The account for ${where} shows a credit of ${usd(credit)} as of ${asOf}. ${howTo}${attached}`,
      closing: questions,
    };
  }
  const owe = x.acct.net;
  if (x.tier === "past-due") {
    const age = oldestChargeMonths(x.acct, x.asOfISO) ?? PAST_DUE_MONTHS;
    return {
      subject: `Past-due account notice — ${where}: ${usd(owe)}`,
      opening: `The account for ${where} shows a balance of ${usd(owe)} as of ${asOf}, and some of these charges have been open for ${age} months.${attached}`
        + `\n\nPlease pay the full balance with your ${next} payment. If you cannot pay it in full, or believe an item is incorrect, please reply by the end of the month.`,
      closing: questions,
    };
  }
  return {
    subject: `Account reminder — ${where}: ${usd(owe)} open`,
    opening: `The account for ${where} shows ${usd(owe)} open as of ${asOf}. Please include this amount with your ${next} payment, if not sooner.${attached}`,
    closing: questions,
  };
}

/** The generated headline: [white part, lime part]. */
function headline(x: MonthlyReminderInput): [string, string] {
  if (x.tier === "credit") return ["You have a credit", `of ${usd(-x.acct.net)}.`];
  if (x.tier === "past-due") return ["Your account is", "past due."];
  return ["A friendly reminder:", `${usd(x.acct.net)} is open.`];
}

const cap = (t: string, color = C.muted) => `<div style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${color};">${esc(t)}</div>`;
const row = (inner: string, pad = "26px 36px 0") => `<tr><td style="padding:${pad};">${inner}</td></tr>`;
const para = (t: string) => t.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;font-family:${BODY};font-size:15px;line-height:1.55;color:${C.text};">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

function keyPanel(x: MonthlyReminderInput, sched: CreditSchedule | null): string {
  let label: string, figure: string, sub: string;
  if (x.tier === "credit") {
    // The CREDIT, never "your payment is $0": the next statement is only
    // reduced once the credit is applied (owner: "i dont want them to read it
    // and think they owe $0 without clicking to apply").
    label = "Credit on your account";
    figure = usd(-x.acct.net);
    sub = `Not yet applied · apply it below to reduce your ${monthName(x.nextYM)} statement`;
  } else {
    label = "Balance due";
    figure = usd(x.acct.net);
    sub = `Suite ${x.suite} · as of ${longDate(x.asOfISO)}`;
  }
  return row(`<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td width="6" style="width:6px;background:${C.olive};font-size:0;line-height:0;">&nbsp;</td>
<td style="background:${C.oliveTint};padding:20px 24px;">${cap(label, C.oliveDark)}
<div style="font-family:${FONT};font-size:34px;font-weight:bold;color:${C.ink};margin-top:6px;line-height:1.1;">${esc(figure)}</div>
<div style="font-family:${BODY};font-size:14px;color:${C.soft};margin-top:6px;">${esc(sub)}</div></td></tr></table>`);
}

function itemsTable(x: MonthlyReminderInput): string {
  const th = (t: string, right = false) => `<td style="padding:0 0 8px;border-bottom:1px solid ${C.line};text-align:${right ? "right" : "left"};">${cap(t)}</td>`;
  const td = (t: string, extra = "") => `<td style="padding:11px 8px 11px 0;border-bottom:1px solid ${C.hair};font-family:${BODY};font-size:14px;color:${C.text};${extra}">${t}</td>`;
  const body = rowsOf(x.acct).map((r) => `<tr>${td(esc(r.date), `color:${C.muted};white-space:nowrap;`)}${td(esc(r.description))}${td(r.credit ? `(${usd(r.amount)})` : usd(r.amount), `text-align:right;white-space:nowrap;${r.credit ? `color:${C.green};` : ""}`)}</tr>`).join("");
  const n = x.acct.net;
  const total = `<tr><td style="padding:12px 0 0;"></td><td style="padding:12px 0 0;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.ink};">${n < 0 ? "Credit on your account" : "Balance due"}</td><td style="padding:12px 0 0;text-align:right;font-family:${FONT};font-size:15px;font-weight:bold;white-space:nowrap;color:${n < 0 ? C.green : C.ink};">${n < 0 ? `(${usd(n)})` : usd(n)}</td></tr>`;
  return row(`${cap(x.tier === "credit" ? "Your account" : "Open items")}<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>${th("Date")}${th("Item")}${th("Amount", true)}</tr>${body}${total}</table>`);
}

function scheduleTable(s: CreditSchedule): string {
  const th = (t: string, right = false) => `<td style="padding:0 0 8px;border-bottom:1px solid ${C.line};text-align:${right ? "right" : "left"};">${cap(t)}</td>`;
  const td = (t: string, extra = "") => `<td style="padding:11px 8px 11px 0;border-bottom:1px solid ${C.hair};font-family:${BODY};font-size:14px;color:${C.text};white-space:nowrap;${extra}">${t}</td>`;
  const body = s.months.map((m) => `<tr>${td(esc(monthName(m.ym)), `font-weight:bold;color:${C.ink};`)}${td(usd(m.charges), "text-align:right;")}${td(`(${usd(m.credit)})`, `text-align:right;color:${C.green};`)}${td(usd(m.pay), `text-align:right;font-weight:bold;color:${C.ink};`)}</tr>`).join("");
  const left = s.creditLeft > 0.005 ? `<tr><td colspan="3" style="padding:12px 0 0;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.ink};">Credit remaining after ${esc(monthName(s.months[s.months.length - 1].ym))}</td><td style="padding:12px 0 0;text-align:right;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.green};white-space:nowrap;">(${usd(s.creditLeft)})</td></tr>` : "";
  return row(`${cap("How to apply your credit")}<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>${th("Statement")}${th("Charges", true)}${th("Your credit", true)}${th("You pay", true)}</tr>${body}${left}</table>`);
}

/** The credit notice's call to action: one button that asks us to apply the
 *  credit to the next statement BEFORE it goes out (owner: "click here if
 *  you wish to apply your credit to your December 2026 statement … trigger
 *  an email to Tami to apply the credit BEFORE the december statements go
 *  out"). The button opens a confirm page — a link scanner opening the URL
 *  must never apply a credit. */
export function applyButtonLabel(x: Pick<MonthlyReminderInput, "nextYM" | "tier">): string {
  return x.tier === "credit" ? `Apply my credit to my ${monthName(x.nextYM)} statement` : "Apply my credit to my open charges";
}

const blueBox = (inner: string) => row(`<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr><td style="background:${C.blue};padding:24px 26px;">${inner}</td></tr></table>`, "24px 36px 0");
const boxTitle = (t: string) => `<div style="font-family:${FONT};font-size:22px;font-weight:bold;color:#ffffff;line-height:1.2;">${esc(t)}</div>`;
const boxText = (t: string) => `<div style="font-family:${BODY};font-size:15px;line-height:1.5;color:#dbe4f3;margin-top:6px;">${esc(t)}</div>`;

/** The credit's call to action — what a click would apply, then the button,
 *  then "or reply to pick specific charges" (owner: "click to apply your
 *  credit to the charges (according to our hierarchy) or reply to this email
 *  to apply your credit to specific charges"). The button opens a confirm
 *  page: a link scanner opening the URL must never apply a credit. */
function creditBox(x: MonthlyReminderInput, plan: CreditPlan): string {
  const next = monthName(x.nextYM);
  const lineRows = [
    ...plan.toOpen.map((l) => [`${l.description}${l.dateISO ? ` (${shortDate(l.dateISO)})` : ""}`, l.applied]),
    ...(plan.toNext > 0.005 ? [[`Your ${next} statement`, plan.toNext]] : []),
  ] as [string, number][];
  const list = `<table role="presentation" width="476" cellpadding="0" cellspacing="0" border="0" style="width:476px;border-collapse:collapse;margin-top:14px;">${lineRows.map(([d, a]) =>
    `<tr><td style="padding:7px 0;border-bottom:1px solid #3a5f9c;font-family:${BODY};font-size:14px;color:#ffffff;">${esc(d)}</td><td style="padding:7px 0;border-bottom:1px solid #3a5f9c;font-family:${BODY};font-size:14px;color:${C.lime};text-align:right;white-space:nowrap;font-weight:bold;">${usd(a)}</td></tr>`).join("")}</table>`;
  const after = x.tier === "credit"
    ? (plan.remaining > 0.005 ? `${usd(plan.remaining)} of credit stays on your account for the following statement.` : "")
    : `Your ${usd(x.acct.net)} balance due already counts this credit — applying it settles your oldest charges first, so they no longer show as open.`;
  const btn = x.applyUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:18px;"><tr>
<td height="44" bgcolor="${C.lime}" align="center" valign="middle" style="height:44px;background:${C.lime};padding:0 22px;mso-line-height-rule:exactly;line-height:44px;">
<a href="${esc(x.applyUrl)}" target="_blank" style="color:${C.navy};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:44px;display:block;"><font color="${C.navy}">${esc(applyButtonLabel(x))} &rarr;</font></a>
</td></tr></table>` : "";
  return blueBox(
    boxTitle(x.tier === "credit" ? "Let us apply your credit." : `Apply your ${usd(plan.credit)} credit.`)
    + boxText(x.tier === "credit"
      ? `Click below and we will apply it before ${next} statements go out, so your statement already reflects it:`
      : `Click below and we will apply it to your open charges in our standard order before ${next} statements go out:`)
    + list + (after ? boxText(after) : "") + btn
    + `<div style="font-family:${BODY};font-size:14px;line-height:1.5;color:#dbe4f3;margin-top:14px;">Want it on specific charges instead? Reply to this email and tell us which. You will receive a confirmation either way.</div>`,
  );
}

function callout(x: MonthlyReminderInput): string {
  const plan = creditPlan(x.acct, x.monthlyCharges);
  if (x.tier === "credit") return plan ? creditBox(x, plan) : "";
  // One blue box per email: under a credit box the in-transit note is a plain line.
  if (plan) return creditBox(x, plan) + row(para("Payment already on its way? Please disregard this notice — and thank you."), "22px 36px 0");
  return blueBox(boxTitle("Payment already on its way?") + boxText("Please disregard this notice — and thank you."));
}

/** The notice's frame — logo row, navy hero, colour strip, footer — shared
 *  by every account email (the monthly notice and the credit confirmation). */
export function noticeFrame(f: { propertyCode?: string; tag: string; eyebrow: string; h1: string; h2: string; sub: string; body: string }): string {
  const interplex = INTERPLEX_CODES.has(f.propertyCode ?? "");
  const logo = interplex
    ? `<img src="${ASSET_BASE}/logo-interplex.png" width="200" alt="The Neshaminy Interplex Business Center" style="display:block;width:200px;height:auto;border:0;">`
    : `<img src="${ASSET_BASE}/korman-signature.png" width="220" height="27" alt="Korman Commercial Properties" style="display:block;width:220px;height:27px;border:0;">`;
  const strip = ["#18468b", C.olive, C.lime, C.navy].map((c) => `<td width="150" height="6" style="width:150px;height:6px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;border-collapse:collapse;background:#ffffff;">
<tr><td style="padding:28px 36px 24px;"><table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td valign="middle">${logo}</td>
<td valign="middle" align="right">${cap("Tenant notice")}<div style="height:4px;line-height:4px;font-size:0;">&nbsp;</div>${cap(f.tag, C.olive)}</td></tr></table></td></tr>
<tr><td style="background:${C.navy};padding:34px 36px 30px;">
${cap(f.eyebrow, C.lime)}
<div style="font-family:${FONT};font-size:38px;font-weight:bold;line-height:1.1;color:#ffffff;margin-top:14px;">${esc(f.h1)}<br><span style="color:${C.lime};">${esc(f.h2)}</span></div>
<div style="font-family:${BODY};font-size:15px;line-height:1.5;color:#c9d3e6;margin-top:16px;">${esc(f.sub)}</div>
</td></tr>
<tr><td style="padding:0;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;border-collapse:collapse;"><tr>${strip}</tr></table></td></tr>
${f.body}
<tr><td style="padding:24px 0 0;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;border-collapse:collapse;background:${C.navy};"><tr>
<td valign="middle" style="padding:28px 0 28px 36px;"><img src="${ASSET_BASE}/korman-white.png" width="170" alt="Korman Commercial Properties" style="display:block;width:170px;height:auto;border:0;"><div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>${cap("Accounts Receivable", "#9aa6bd")}</td>
<td valign="middle" align="right" style="padding:28px 36px 28px 0;"><div style="font-family:${BODY};font-size:14px;color:#c9d3e6;">Questions about your account?</div>
<div style="margin-top:4px;"><a href="mailto:${AR_CONTACT_EMAIL}" style="font-family:${FONT};font-size:17px;font-weight:bold;color:${C.lime};text-decoration:none;"><font color="${C.lime}">${AR_CONTACT_EMAIL}</font></a></div></td></tr></table></td></tr>
<tr><td style="padding:14px 36px 24px;font-family:${BODY};font-size:12px;color:${C.muted};">This is an automated account notice from Korman Commercial Properties, 8 Neshaminy Interplex, Suite 400, Trevose, PA 19053.</td></tr>
</table></body></html>`;
}

export function renderMonthlyReminder(x: MonthlyReminderInput, opening: string, closing: string): { html: string; text: string } {
  const sched = x.tier === "credit" ? creditSchedule(-x.acct.net, x.monthlyCharges, x.nextYM) : null;
  const [h1, h2] = headline(x);
  const html = noticeFrame({
    propertyCode: x.propertyCode, tag: TAG[x.tier], eyebrow: `${x.propertyName} · Suite ${x.suite}`, h1, h2,
    sub: `${x.tenantName} · as of ${longDate(x.asOfISO)}`,
    body: [row(para(opening), "28px 36px 0"), keyPanel(x, sched), itemsTable(x), sched && !x.applyUrl ? scheduleTable(sched) : "", callout(x), row(para(closing), "24px 36px 6px")].join("\n"),
  });
  return { html, text: `TENANT NOTICE — ${TAG[x.tier].toUpperCase()}\n${x.propertyName} · Suite ${x.suite}\n\n${h1} ${h2}\n\n${opening}\n\n${tablesText(x, sched)}\n\n${creditPlan(x.acct, x.monthlyCharges) && x.applyUrl ? `${applyButtonLabel(x)}: ${x.applyUrl}\nOr reply to this email to apply it to specific charges.\n\n` : ""}${x.tier === "credit" ? "" : "Payment already on its way? Please disregard this notice."}\n\n${closing}\n\nKorman Commercial Properties · Accounts Receivable · ${AR_CONTACT_EMAIL}\nThis is an automated monthly account notice.` };
}

// ─── Apply-my-credit: the tenant's confirmation ──────────────────────────────

export type CreditApplied = {
  tenantName: string; propertyName: string; propertyCode?: string; suite: string;
  plan: CreditPlan;
  /** The next statement's regular charges, when known. */
  charges: number | null;
  /** Open balance still owed after the credit (0 when the credit covered it). */
  balanceAfter: number;
  /** What is still open after the credit (openAfterCredit) — itemized when any. */
  stillOpen?: { dateISO: string | null; description: string; amount: number }[];
  nextYM: string;
  requestedAtISO: string;
};

/** The confirmation the tenant gets once they ask us to apply their credit. */
export function renderCreditAppliedEmail(x: CreditApplied): { subject: string; html: string; text: string } {
  const next = monthName(x.nextYM);
  const p = x.plan;
  const applied = r2(p.appliedToOpen + p.toNext);
  const nextPay = p.toNext > 0.005 && x.charges != null ? r2(Math.max(0, x.charges - p.toNext)) : null;
  const subject = `Confirmed: your ${usd(applied)} credit has been applied — ${x.propertyName}, Suite ${x.suite}`;
  const lines = [
    `Thank you — we have your request. Your credit of ${usd(applied)} is being applied as shown below, before ${next} statements go out, so the statement you receive will already reflect it.`,
    x.balanceAfter > 0.005 ? `${usd(x.balanceAfter)} remains open on your account, itemized below. Please include it with your ${next} payment.` : "",
    nextPay != null ? `With the credit applied, your ${next} payment is ${usd(nextPay)}.` : "",
    p.remaining > 0.005 ? `The remaining ${usd(p.remaining)} of credit stays on your account for the following statement.` : "",
  ].filter(Boolean).join(" ");
  // Credit still left after the apply leads, and biggest (owner: "if theres
  // still an outstanding credit maybe make that even bigger so they know").
  const left = p.remaining > 0.005;
  const panelLabel = left ? "Credit still on your account" : nextPay != null ? `Your ${next} payment` : x.balanceAfter > 0.005 ? "Balance still open" : "Your open charges";
  const panelFigure = left ? usd(p.remaining) : nextPay != null ? usd(nextPay) : x.balanceAfter > 0.005 ? usd(x.balanceAfter) : "Paid in full";
  const panelSub = left
    ? `${nextPay != null ? `Your ${next} payment is ${usd(nextPay)}. ` : ""}This credit carries to your following statement.`
    : nextPay != null ? `${usd(x.charges!)} of charges less ${usd(p.toNext)} of credit` : `After your ${usd(applied)} credit`;
  const panel = row(`<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;"><tr>
<td width="6" style="width:6px;background:${C.olive};font-size:0;line-height:0;">&nbsp;</td>
<td style="background:${C.oliveTint};padding:${left ? "24px 24px 22px" : "20px 24px"};">${cap(panelLabel, C.oliveDark)}
<div style="font-family:${FONT};font-size:${left ? 46 : 34}px;font-weight:bold;color:${left ? C.green : C.ink};margin-top:6px;line-height:1.1;">${esc(panelFigure)}</div>
<div style="font-family:${BODY};font-size:${left ? 15 : 14}px;color:${C.soft};margin-top:8px;">${esc(panelSub)}</div></td></tr></table>`);
  const td = (t: string, extra = "") => `<td style="padding:11px 8px 11px 0;border-bottom:1px solid ${C.hair};font-family:${BODY};font-size:14px;color:${C.text};${extra}">${t}</td>`;
  const items = [
    ...p.toOpen.map((l) => [`${l.description}${l.dateISO ? ` (${shortDate(l.dateISO)})` : ""}`, l.applied] as [string, number]),
    ...(p.toNext > 0.005 ? [[`${next} statement`, p.toNext] as [string, number]] : []),
  ];
  const table = row(`${cap("Where your credit was applied")}<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;">
${items.map(([d, a]) => `<tr>${td(esc(d))}${td(usd(a), `text-align:right;color:${C.green};white-space:nowrap;`)}</tr>`).join("")}
<tr><td style="padding:12px 0 0;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.ink};">Credit applied</td><td style="padding:12px 0 0;text-align:right;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.green};">${usd(applied)}</td></tr>
${p.remaining > 0.005 ? `<tr><td style="padding:8px 0 0;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.ink};">Credit still on your account</td><td style="padding:8px 0 0;text-align:right;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.green};">${usd(p.remaining)}</td></tr>` : ""}
</table>`);
  // Still owed after the credit: itemized, so the tenant sees exactly what to
  // pay (only when something is — a table of $0 lines is clutter).
  const open = x.balanceAfter > 0.005 ? (x.stillOpen ?? []) : [];
  const stillOpenTable = open.length ? row(`${cap("Still open on your account")}<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
<table role="presentation" width="528" cellpadding="0" cellspacing="0" border="0" style="width:528px;border-collapse:collapse;">
${open.map((o) => `<tr>${td(esc(shortDate(o.dateISO)), `color:${C.muted};white-space:nowrap;`)}${td(esc(o.description))}${td(usd(o.amount), "text-align:right;white-space:nowrap;")}</tr>`).join("")}
<tr><td style="padding:12px 0 0;"></td><td style="padding:12px 0 0;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.ink};">Balance due</td><td style="padding:12px 0 0;text-align:right;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.ink};white-space:nowrap;">${usd(x.balanceAfter)}</td></tr>
</table>`) : "";
  const html = noticeFrame({
    propertyCode: x.propertyCode, tag: "Credit applied", eyebrow: `${x.propertyName} · Suite ${x.suite}`,
    h1: "Your credit", h2: "has been applied.", sub: `${x.tenantName} · requested ${longDate(x.requestedAtISO)}`,
    body: [row(para(lines), "28px 36px 0"), panel, table, stillOpenTable].join("\n"),
  });
  const text = `CREDIT APPLIED — ${x.propertyName} · Suite ${x.suite}\n\n${lines}\n\n${items.map(([d, a]) => `  ${d}: ${usd(a)}`).join("\n")}\n  Credit applied: ${usd(applied)}\n\nKorman Commercial Properties · Accounts Receivable · ${AR_CONTACT_EMAIL}`;
  return { subject, html, text };
}

type Row = { date: string; description: string; amount: number; credit: boolean };
function rowsOf(acct: Account): Row[] {
  return [
    ...acct.charges.map((c) => ({ date: shortDate(c.dateISO), description: c.description, amount: c.amount, credit: false })),
    ...acct.creditLines.map((c) => ({ date: shortDate(c.dateISO), description: c.description, amount: c.amount, credit: true })),
  ];
}

function tablesText(x: MonthlyReminderInput, s: CreditSchedule | null): string {
  const out = [`YOUR ACCOUNT AS OF ${shortDate(x.asOfISO)}`, "",
    ...rowsOf(x.acct).map((r) => `  ${r.date} — ${r.description}: ${r.credit ? `(${usd(r.amount)})` : usd(r.amount)}`),
    "", `  ${x.acct.net < 0 ? "Credit on your account" : "Balance due"}: ${x.acct.net < 0 ? `(${usd(x.acct.net)})` : usd(x.acct.net)}`];
  if (s) {
    out.push("", "HOW TO APPLY YOUR CREDIT", "",
      ...s.months.map((m) => `  ${monthName(m.ym)}: charges ${usd(m.charges)} − credit ${usd(m.credit)} = you pay ${usd(m.pay)}`));
    if (s.creditLeft > 0.005) out.push(`  Credit remaining after that: ${usd(s.creditLeft)}`);
  }
  return out.join("\n");
}
