import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, type UserId } from "@/lib/users";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { loadReprojection } from "@/lib/financials/reprojections/load";
import { bookById, bookProperties } from "@/lib/financials/budgets/books";
import { canEdit } from "@/lib/financials/budgets/contributors";
import { getExpenseInputs, setExpenseInput } from "@/lib/financials/budgets/expenseInputStore";
import { getLineOverrides, editLineOverride } from "@/lib/financials/budgets/lineOverrideStore";
import { lineKey } from "@/lib/financials/budgets/lineOverrides";
import { itemizedLines, type ResolvedBucket } from "@/lib/financials/budgets/lineItems";
import { priorBudgetProperty } from "@/lib/financials/budgets/draft";
import {
  EXPENSE_INPUT_KINDS, expenseInputKindOf, resolveKind, defaultMonths,
  type ExpenseInputKind, type ExpenseInput,
} from "@/lib/financials/budgets/expenseInputs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// The Expenses step's data: for each property in a book, the three keyed
// figures (real estate taxes, insurance, building maintenance) with what they
// are measured against — this year's budget, actual and forecast — the
// default, and what has been keyed.
//
// Only these three expense lines leave this route. Greg reaches it (it is his
// page), and a maintenance contributor has no business with rents or NOI; see
// `visibleRoles` in contributors.ts.

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production" ? "admin" : null;
  try {
    const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
    return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
  } catch { return null; }
}

const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);
const add = (acc: number[], xs: number[]) => { for (let i = 0; i < 12; i++) acc[i] += xs[i] || 0; };

export type BudgetInputKindRow = {
  kind: ExpenseInputKind;
  /** The statement lines this figure lands on. */
  lines: string[];
  editable: boolean;
  /** This year (the basis year): budget, actual posted so far, forecast. */
  basisBudget: number[];
  basisActual: number[];
  basisForecast: number[];
  /** Through which month the actuals are real. */
  actualThrough: number;
  defaultMonths: number[];
  input: ExpenseInput | null;
  /** What the draft will carry. */
  months: number[];
  entered: boolean;
  /** Set when the line is ITEMIZED (`lineItems.ts`) — budgeted contract by
   *  contract through the same typed-month store the draft grid writes, and
   *  the figure above is their sum. */
  items?: { section: string; label: string; buckets: ResolvedBucket[] }[];
};

export type BudgetInputProperty = {
  code: string;
  name: string;
  /** No forecast to measure against — the property's GL/budget isn't loaded. */
  missingBasis: boolean;
  kinds: BudgetInputKindRow[];
};

// GET ?year=&book=&growth= → the book's properties and their three figures.
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear() + 1;
  const book = bookById(url.searchParams.get("book") ?? "shopping-centers");
  if (!book) return NextResponse.json({ error: "Unknown book." }, { status: 400 });
  const g = Number(url.searchParams.get("growth"));
  const growthPct = Number.isFinite(g) ? g : 3;

  const statements = await availableStatements();
  const keyFor = (code: string) =>
    statements.find((s) => s.key === code)?.key ?? statements.find((s) => s.propertyCode === code)?.key ?? null;

  const properties: BudgetInputProperty[] = await Promise.all(bookProperties(book).map(async (p) => {
    const allocGroup = PROPERTY_DEFS.find((d) => d.id === p.code)?.allocGroup;
    const key = keyFor(p.code);
    const [loaded, inputs, prior, typedDoc] = await Promise.all([
      key ? loadReprojection(key, year - 1).catch(() => null) : Promise.resolve(null),
      getExpenseInputs(year, p.code).catch(() => ({})),
      priorBudgetProperty(p.code, year - 1).catch(() => null),
      getLineOverrides(year, p.code).catch(() => ({})),
    ]);
    const itemized = itemizedLines(prior, loaded?.reprojection.sections ?? [], typedDoc);
    const kinds: BudgetInputKindRow[] = [];
    for (const kind of EXPENSE_INPUT_KINDS) {
      const lines: string[] = [];
      const budget = new Array(12).fill(0), actual = new Array(12).fill(0), forecast = new Array(12).fill(0);
      for (const sec of loaded?.reprojection.sections ?? []) {
        for (const l of sec.lines) {
          if (expenseInputKindOf(sec.role, l.label) !== kind) continue;
          lines.push(l.label);
          add(budget, l.budget); add(actual, l.actual); add(forecast, l.blended);
        }
      }
      // A property with no line of this kind has nothing to budget for it.
      if (loaded && !lines.length) continue;
      const input = (inputs as Record<string, ExpenseInput | undefined>)[kind] ?? null;
      const res = resolveKind(kind, forecast, growthPct, input);
      // Itemized lines of this kind — and, when every line of it is, the
      // figure IS the sum of the items (what the draft grid carries).
      const items: NonNullable<BudgetInputKindRow["items"]> = [];
      let allItemized = lines.length > 0;
      for (const sec of loaded?.reprojection.sections ?? []) for (const l of sec.lines) {
        if (expenseInputKindOf(sec.role, l.label) !== kind) continue;
        const b = itemized.get(lineKey(sec.name, l.label));
        if (b) items.push({ section: sec.name, label: l.label, buckets: b }); else allItemized = false;
      }
      const itemMonths = new Array(12).fill(0);
      for (const it of items) for (const b of it.buckets) add(itemMonths, b.months);
      kinds.push({
        kind, lines: [...new Set(lines)],
        editable: canEdit(user, kind, allocGroup),
        basisBudget: budget, basisActual: actual, basisForecast: forecast,
        actualThrough: loaded?.reprojection.actualThroughMonth ?? 0,
        defaultMonths: defaultMonths(kind, forecast, growthPct),
        input, months: allItemized ? itemMonths : res.months, entered: allItemized || res.entered,
        items: items.length ? items : undefined,
      });
    }
    return { code: p.code, name: p.name, missingBasis: !loaded, kinds };
  }));

  return NextResponse.json({ year, basisYear: year - 1, book: book.id, growthPct, user, properties });
}

// POST { year, propertyCode, kind, annual?, months?, note?, clear? }
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const b = await req.json();
    const year = Number(b?.year);
    const code = String(b?.propertyCode ?? "").trim().toUpperCase();
    const kind = b?.kind as ExpenseInputKind;
    if (!year || !code || !EXPENSE_INPUT_KINDS.includes(kind)) {
      return NextResponse.json({ error: "year, propertyCode and a valid kind are required" }, { status: 400 });
    }
    const def = PROPERTY_DEFS.find((d) => d.id.toUpperCase() === code);
    if (!def) return NextResponse.json({ error: "Unknown property." }, { status: 400 });
    // The server decides who may key what — the page only hides the cells.
    if (!canEdit(user, kind, def.allocGroup)) {
      return NextResponse.json({ error: "That figure belongs to someone else." }, { status: 403 });
    }
    // An ITEM of an itemized line (a contract, a policy, a Big Project):
    // saved to the typed-month store the draft grid reads, under the same key.
    if (b?.item) {
      const it = b.item as { section?: unknown; label?: unknown; key?: unknown; month?: unknown; value?: unknown };
      const section = String(it.section ?? ""), label = String(it.label ?? ""), key = String(it.key ?? "");
      if (!section || !label || !key) return NextResponse.json({ error: "section, label and key are required" }, { status: 400 });
      if (expenseInputKindOf("reimbursable-expense", label) !== kind) return NextResponse.json({ error: "That line is not this kind." }, { status: 400 });
      const month = it.month === "all" ? "all" : Number(it.month);
      if (month !== "all" && !(Number.isInteger(month) && month >= 0 && month < 12)) return NextResponse.json({ error: "month must be 0–11 or \"all\"" }, { status: 400 });
      const value = it.value === null || it.value === "" || it.value === undefined ? null : Math.round(Number(it.value));
      if (value != null && (!Number.isFinite(value) || value < 0)) return NextResponse.json({ error: "A non-negative amount is required." }, { status: 400 });
      await editLineOverride(year, def.id, `${lineKey(section, label)}#${key}`, month, value, user);
      return NextResponse.json({ ok: true });
    }
    if (b?.clear) {
      await setExpenseInput(year, def.id, kind, null);
      return NextResponse.json({ ok: true });
    }
    const note = typeof b?.note === "string" ? b.note.slice(0, 500) : undefined;
    // Any line takes either twelve months (taken as typed) or an annual figure
    // (taxes and insurance spread like this year, maintenance evenly).
    let input: ExpenseInput;
    if (Array.isArray(b?.months)) {
      const months = b.months.map((v: unknown) => Math.round(Number(v) || 0));
      if (months.length !== 12 || months.some((v: number) => v < 0)) {
        return NextResponse.json({ error: "Twelve non-negative monthly amounts are required." }, { status: 400 });
      }
      input = { months, note, by: user };
    } else {
      const annual = Math.round(Number(b?.annual));
      if (!Number.isFinite(annual) || annual < 0) {
        return NextResponse.json({ error: "A non-negative annual amount is required." }, { status: 400 });
      }
      input = { annual, note, by: user };
    }
    await setExpenseInput(year, def.id, kind, input);
    return NextResponse.json({ ok: true, total: input.months ? sum(input.months) : input.annual });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
