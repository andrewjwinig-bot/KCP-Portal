// PUBLISH TO BUDGETS — the Budget Draft becomes the budget of record.
//
// The draft (`draft.ts`) is a WORKSPACE: nothing else in the portal reads it.
// The budget of record is the workbook store behind /financials/budgets
// (`storage.ts`), which the operating statements' Budget column and "?" flags,
// the Cash Sheet, management fees and the monthly report all read. Publishing
// writes a BOOK's drafts into that store as one `BudgetWorkbook` — the same
// shape a staff-prepared workbook parses into — so every one of those readers,
// the Budgets page, its downloads and the Skyline import work on it unchanged.
//
// A published budget does NOT take over early. Every reader asks for the
// budget of the YEAR it is looking at (a 2026 statement reads the 2026
// budget), and the few that used to take "the newest year on file" now take
// the year in force (`inForce.ts`) — so a 2027 budget published in October
// sits beside 2026 until January 1st and only then starts being compared
// against.
//
// What the converter must get right is the GL ACCOUNT on every line: the
// statements find a budget by account (`budgetCrosswalk.ts` matches each
// statement line's mask against the budget's accounts), and Skyline imports
// one row per account. In order:
//   1. a line built from several accounts (its GL sub-lines) is published as
//      those accounts — the parent carries none, so nothing counts twice;
//   2. a line the reprojection found on ONE account takes it;
//   3. else last year's budget of record's line of the same name;
//   4. else the line's mask, when it names one exact account;
//   5. else an account in last year's Skyline import that the mask matches.
// Whatever is left is reported as UNMAPPED rather than guessed — it still
// shows on the Budgets page, but no statement line can find it.
//
// Pure: the route builds the drafts and loads last year's budget.

import type { BudgetDraft, BudgetDraftLine, BudgetSubLine } from "./draft";
import type { BudgetLine, BudgetSection, BudgetWorkbook, BudgetCategory, PropertyBudget, SkylineImportLine } from "./types";
import type { BudgetBook } from "./books";
import { priorLineFor } from "./lineItems";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";

const r0 = (n: number) => Math.round(n || 0);
const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);
const zero = () => new Array(12).fill(0) as number[];
const add = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] || 0));
const ACCOUNT = /^\d{4}-\d{4}$/;

/** The workbook id a book's published budget is stored under. Distinct from
 *  the seeded ("shopping-centers-2026") and live ids, so publishing never
 *  overwrites a staff-prepared workbook by accident. */
export const publishedWorkbookId = (bookId: string, year: number) => `published-${bookId}-${year}`;

export function bookCategory(bookId: string): BudgetCategory {
  if (bookId === "shopping-centers") return "Shopping Centers";
  if (bookId === "jv3" || bookId === "ni-llc") return "Office";
  if (bookId === "korman-homes") return "Residential";
  return "Other";
}

/** Revenue is a credit in Skyline's import; everything else a debit. */
const isIncome = (role: string) => role === "revenue" || role === "reimbursement";

export type Unmapped = { propertyCode: string; section: string; label: string; total: number };

type Ctx = {
  prior: PropertyBudget | null;
  notes: BudgetDraft["notes"];
  unmapped: Unmapped[];
  propertyCode: string;
};

/** The GL sub-lines of a line, when it IS its accounts (rule 1). */
function accountSubs(l: BudgetDraftLine): BudgetSubLine[] | null {
  const subs = l.subLines ?? [];
  if (subs.length < 2 || subs.some((s) => s.bucket || !ACCOUNT.test(s.account))) return null;
  // Only when they add up to the line — a split that did not would publish a
  // different figure from the one on the grid.
  return Math.abs(sum(subs.map((s) => s.total)) - l.total) <= 1 ? subs : null;
}

function lineAccount(sectionName: string, l: BudgetDraftLine, ctx: Ctx, claimed: Set<string>): string | null {
  const own = (l.glAccounts ?? []).filter((a) => ACCOUNT.test(a));
  if (own.length === 1) return own[0];
  const prior = priorLineFor(ctx.prior, sectionName, l.label);
  if (prior?.glAccount && ACCOUNT.test(prior.glAccount)) return prior.glAccount;
  const tokens = String(l.mask ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 1 && ACCOUNT.test(tokens[0])) return tokens[0];
  if (own.length > 1) return own[0];
  const fromSkyline = (ctx.prior?.skylineImport ?? []).find((x) => !claimed.has(x.glAccount) && l.mask && accountMatchesMask(l.mask, x.glAccount));
  return fromSkyline?.glAccount ?? null;
}

const base = (label: string, months: number[], glAccount: string | null, extra: Partial<BudgetLine> = {}): BudgetLine => ({
  glAccount, subCategory: null, label, months: months.map(r0), total: r0(sum(months)),
  totalPsf: null, input: null, notes: null, isSubtotal: false, ...extra,
});

/** A bucket / item breakdown, kept as the workbook keeps it: descriptive rows
 *  under the line, carrying no account of their own. */
function descriptive(s: BudgetSubLine): BudgetLine {
  return base(s.label ?? s.name ?? s.account, s.months, null, {
    notes: s.note ?? null,
    subLines: s.items?.length ? s.items.map(descriptive) : undefined,
  });
}

function convertLine(sectionName: string, l: BudgetDraftLine, ctx: Ctx, claimed: Set<string>): BudgetLine {
  const note = ctx.notes?.[`${sectionName}::${l.label}`]?.text ?? null;
  const fee = l.feePct != null ? { feePercent: l.feePct } : {};
  const subs = accountSubs(l);
  if (subs) {
    for (const s of subs) claimed.add(s.account);
    return base(l.label, l.months, null, {
      notes: note, ...fee,
      subLines: subs.map((s) => base(s.name ?? s.account, s.months, s.account)),
    });
  }
  const gl = lineAccount(sectionName, l, ctx, claimed);
  if (gl) claimed.add(gl);
  else if (Math.abs(l.total) >= 0.5) ctx.unmapped.push({ propertyCode: ctx.propertyCode, section: sectionName, label: l.label, total: r0(l.total) });
  return base(l.label, l.months, gl, {
    notes: note, ...fee,
    subLines: l.subLines?.length ? l.subLines.map(descriptive) : undefined,
  });
}

/** Occupancy by month off the draft's own rent: a suite is occupied in a
 *  month it pays rent (the grid's rule). */
function occupancy(d: BudgetDraft) {
  const rows = d.tenantRevenue ?? [];
  const rentable = sum(rows.map((r) => r.sqft || 0));
  const sqft = zero().map((_, i) => r0(sum(rows.filter((r) => (r.rent?.[i] || 0) > 0).map((r) => r.sqft || 0))));
  const pct = sqft.map((s) => (rentable > 0 ? Math.round((s / rentable) * 1000) / 10 : 0));
  return { rentable: r0(rentable), sqft, pct };
}

/** One property's draft as the workbook shape the readers already read. */
export function draftToPropertyBudget(d: BudgetDraft, prior: PropertyBudget | null, code = d.propertyCode): { property: PropertyBudget; unmapped: Unmapped[] } {
  const ctx: Ctx = { prior, notes: d.notes, unmapped: [], propertyCode: code };
  const claimed = new Set<string>();
  const sections: BudgetSection[] = [];
  const sky = new Map<string, SkylineImportLine>();
  let capital = zero(), debt = zero();
  for (const sec of d.sections) {
    const lines = sec.lines.map((l) => convertLine(sec.name, l, ctx, claimed));
    const sign = isIncome(sec.role) ? -1 : 1;
    const visit = (l: BudgetLine) => {
      if (l.glAccount && !l.isSubtotal) {
        const hit = sky.get(l.glAccount);
        const months = l.months.map((v) => sign * v);
        if (hit) { hit.months = add(hit.months, months); hit.total += sign * l.total; }
        else sky.set(l.glAccount, { label: l.label, glAccount: l.glAccount, months, total: sign * l.total });
        return;
      }
      for (const s of l.subLines ?? []) if (s.glAccount) visit(s);
    };
    lines.forEach(visit);
    if (sec.role === "capital") capital = add(capital, sec.subtotal);
    if (sec.role === "debt-service") debt = add(debt, sec.subtotal);
    lines.push(base(`Total ${sec.name}`, sec.subtotal, null, { isSubtotal: true }));
    sections.push({ name: sec.name, lines });
  }
  const noi = d.rollups.netOperatingIncome.months;
  const before = noi.map((v, i) => v - capital[i]);
  const after = before.map((v, i) => v - debt[i]);
  const roll = (name: string, months: number[]) => ({ name, months: months.map(r0), total: r0(sum(months)) });
  const occ = occupancy(d);
  const skylineImport = [...sky.values()].map((x) => ({ ...x, months: x.months.map(r0), total: r0(x.total) }));
  return {
    property: {
      propertyCode: code,
      propertyName: d.propertyName,
      rentableSqft: occ.rentable,
      occupancyPct: occ.pct,
      occupancySqft: occ.sqft,
      sections,
      rollups: [
        roll("TOTAL REVENUES", d.rollups.totalRevenues.months),
        roll("TOTAL OPERATING EXPENSES", d.rollups.totalOperatingExpenses.months),
        roll("NET OPERATING INCOME", noi),
        roll("CASH FLOW BEFORE DEBT SERVICE", before),
        roll("CASH FLOW AFTER DEBT SERVICE", after),
      ],
      skylineImport,
      skylineImportTotal: r0(sum(skylineImport.map((x) => x.total))),
    },
    unmapped: ctx.unmapped,
  };
}

export type PublishInput = {
  book: BudgetBook;
  year: number;
  /** Each property's draft, in the book's order. */
  drafts: BudgetDraft[];
  /** The book's roll-up ("All Shopping Centers"), when it rolls up. */
  consolidated: BudgetDraft | null;
  /** Last year's budget of record, per property code (uppercased). */
  prior: Record<string, PropertyBudget | null>;
  by: string;
  at: string;
};

export function buildPublishedWorkbook(inp: PublishInput): { workbook: BudgetWorkbook; unmapped: Unmapped[] } {
  const unmapped: Unmapped[] = [];
  const properties = inp.drafts.map((d) => {
    const out = draftToPropertyBudget(d, inp.prior[d.propertyCode.toUpperCase()] ?? null);
    unmapped.push(...out.unmapped);
    return out.property;
  });
  const rollup = inp.consolidated ? draftToPropertyBudget(inp.consolidated, null, "CONSOLIDATED").property : undefined;
  const fingerprint = draftFingerprint(inp.consolidated ?? inp.drafts[0]);
  return {
    workbook: {
      id: publishedWorkbookId(inp.book.id, inp.year),
      label: `${inp.book.name} ${inp.year} Operating Budget`,
      kind: "published",
      category: bookCategory(inp.book.id),
      year: inp.year,
      uploadedAt: inp.at,
      uploadedBy: inp.by,
      status: "final",
      statusBy: inp.by,
      statusAt: inp.at,
      source: { book: inp.book.id, publishedFrom: "draft", draftFingerprint: fingerprint, unmapped },
      rollup,
      properties,
    },
    unmapped,
  };
}

/**
 * A fingerprint of what a draft says — every line's months, property by
 * property — so the draft page can tell a published budget from one that has
 * moved since. Read off the tab the Publish card sits on (a book's roll-up
 * carries each property's months in `byProperty`), so the page and the
 * publish compute it from the same thing.
 */
export function draftFingerprint(d: BudgetDraft | null | undefined): string {
  if (!d) return "";
  const parts: string[] = [];
  for (const sec of d.sections) for (const l of sec.lines) {
    const by = l.byProperty?.length ? l.byProperty : [{ code: d.propertyCode, months: l.months }];
    for (const p of by) {
      const m = p.months.map(r0);
      if (m.every((v) => v === 0)) continue;
      parts.push(`${sec.name}|${l.label}|${p.code}|${m.join(",")}`);
    }
  }
  parts.sort();
  // FNV-1a — a change detector, not a security control.
  let h = 0x811c9dc5;
  const s = parts.join("\n");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
