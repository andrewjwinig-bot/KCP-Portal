// THE ITEMS BEHIND A BUCKETED LINE — the detail the owner's budget workbook
// carries on its "Building Maint" and "INS RET DEBT" tabs and the Operating
// Budgets page already shows: Building Maintenance is not one number, it is
// Contractual (Sprinkler Inspection, Backflow Inspections, Roof
// Inspections…) + Recurring (Fire Extinguisher Service, Misc Expenses) + Big
// Projects. The draft used to grow the line's total by 3% and lose all of it —
// one hard-coded figure with no context.
//
// So a bucketed line (`lineBuckets.ts`) is SEEDED from last year's budget of
// record, item by item:
//   • every contractual / recurring item carries forward, its months +3%;
//   • BIG PROJECTS START AT $0 — a project is decided each year, and last
//     year's roof or repaving is not assumed to repeat (the owner's call);
//     last year's figure stays visible beside it for reference;
//   • a bucket with no items (Parking Lot Recurring $11,000) is budgeted at
//     the bucket.
// The line is the SUM of its buckets, a bucket the sum of its items. Typed
// months lay over the seed through the same typed-month store the rest of
// the grid uses, keyed `section::label#<bucket>` or `…#<bucket>/<item>` — ONE
// store behind the draft grid and Greg's Budget Inputs page, so the two
// cannot disagree.
//
// Pure: the caller loads the prior budget and the overrides.

import type { BudgetLine, PropertyBudget } from "./types";
import { bucketsFor, type BucketSet } from "./lineBuckets";
import { lineKey, mergeMonths, type LineOverrides } from "./lineOverrides";
import type { SectionRole } from "@/lib/financials/operating-statements/types";

export const ITEM_GROWTH = 1.03;

export type SeedItem = {
  name: string;
  /** Last year's budget, month by month (the reference). */
  prior: number[];
  /** The seed before anything is typed. */
  seed: number[];
  /** The workbook's own note on the row, when it has one. */
  note?: string;
};
export type SeedBucket = {
  name: string;
  prior: number[];
  /** Budgeted at the bucket — only when it has no items. */
  seed?: number[];
  note?: string;
  items: SeedItem[];
};

const r0 = (n: number) => Math.round(n);
const zero = () => new Array(12).fill(0) as number[];
const grown = (m: number[]) => m.map((v) => r0((v || 0) * ITEM_GROWTH));
const isBig = (b: string) => /big project/i.test(b);

/** Which of the line's buckets a workbook sub-line belongs to. */
function bucketOf(set: BucketSet, label: string): string | null {
  const l = label.toLowerCase();
  if (set.buckets.includes("Liability")) {
    if (/propert/.test(l)) return "Property";
    if (/liab|umbrella/.test(l)) return "Liability";
    return "Other";
  }
  if (/contract/.test(l)) return set.buckets.includes("Contractual") ? "Contractual" : null;
  if (/recurring/.test(l)) return "Recurring";
  if (/big\s*project/.test(l)) return "Big Projects";
  if (/vacanc/.test(l)) return "Vacancies";
  if (set.buckets.includes("Cleaning & Supplies")) return "Cleaning & Supplies";
  return null;
}

/**
 * Seed a bucketed line's buckets from last year's budget line. Returns null
 * when that line carries no breakdown to seed from (the draft then keeps its
 * base-bucket behaviour).
 */
export function seedBuckets(set: BucketSet, prior: BudgetLine | null | undefined): SeedBucket[] | null {
  const subs = (prior?.subLines ?? []).filter((s) => !s.isSubtotal);
  if (!subs.length) return null;
  const out = new Map<string, SeedBucket>(set.buckets.map((b) => [b, { name: b, prior: zero(), items: [] }]));
  // Insurance lists its policies directly under the line; the other lines put
  // a bucket row ("Building Maint.-Contractual") with its items beneath.
  for (const s of subs) {
    const b = bucketOf(set, s.label);
    if (!b || !out.has(b)) continue;
    const bucket = out.get(b)!;
    const items = (s.subLines ?? []).filter((x) => !x.isSubtotal);
    const direct = set.buckets.includes("Liability") && !(b === "Property" && /^property$/i.test(s.label.trim()));
    const add = (x: BudgetLine) => {
      const prior = x.months.map((v) => v || 0);
      bucket.items.push({ name: x.label.trim(), prior, seed: isBig(b) ? zero() : grown(prior), note: x.notes ?? undefined });
      bucket.prior = bucket.prior.map((v, i) => v + prior[i]);
    };
    if (items.length) items.forEach(add);
    else if (direct) add(s);
    else {
      const prior = s.months.map((v) => v || 0);
      bucket.prior = bucket.prior.map((v, i) => v + prior[i]);
      bucket.seed = isBig(b) ? zero() : grown(prior);
      if (s.notes) bucket.note = s.notes;
    }
  }
  return set.buckets.map((b) => {
    const x = out.get(b)!;
    if (!x.items.length && !x.seed) x.seed = zero();
    return x;
  });
}

/** Last year's budget line for a draft line — same section and label, else
 *  the same label alone when only one section carries it. */
export function priorLineFor(prior: PropertyBudget | null | undefined, section: string, label: string): BudgetLine | null {
  if (!prior) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  const inSec = prior.sections.find((s) => norm(s.name) === norm(section))?.lines.find((l) => norm(l.label) === norm(label));
  if (inSec) return inSec;
  const all = prior.sections.flatMap((s) => s.lines.filter((l) => norm(l.label) === norm(label)));
  return all.length === 1 ? all[0] : null;
}

export type ResolvedItem = { name: string; months: number[]; typed?: boolean[]; prior: number[]; note?: string; key: string };
export type ResolvedBucket = { name: string; months: number[]; typed?: boolean[]; prior: number[]; note?: string; key: string; items: ResolvedItem[] };

/** The seed with typed months laid over, and the sums rolled up. */
export function resolveBuckets(section: string, label: string, seeds: SeedBucket[], doc: LineOverrides): ResolvedBucket[] {
  const base = lineKey(section, label);
  return seeds.map((b) => {
    const bKey = `${b.name}`;
    const items: ResolvedItem[] = b.items.map((it) => {
      const key = `${b.name}/${it.name}`;
      const { months, typed } = mergeMonths(it.seed, doc[`${base}#${key}`]);
      return { name: it.name, months, typed: typed.some(Boolean) ? typed : undefined, prior: it.prior, note: it.note, key };
    });
    if (items.length) {
      const months = zero();
      for (const it of items) it.months.forEach((v, i) => { months[i] += v; });
      const typed = months.map((_, i) => items.some((it) => it.typed?.[i]));
      return { name: b.name, months, typed: typed.some(Boolean) ? typed : undefined, prior: b.prior, note: b.note, key: bKey, items };
    }
    const { months, typed } = mergeMonths(b.seed ?? zero(), doc[`${base}#${bKey}`]);
    return { name: b.name, months, typed: typed.some(Boolean) ? typed : undefined, prior: b.prior, note: b.note, key: bKey, items: [] };
  });
}

/** Every itemized line of a property: the prior budget's bucketed lines that
 *  carry a breakdown, resolved against the typed months. `roleOf` names each
 *  section's role (the draft's statement mapping). */
export function itemizedLines(
  prior: PropertyBudget | null | undefined,
  sections: { name: string; role: SectionRole; lines: { label: string }[] }[],
  doc: LineOverrides,
): Map<string, ResolvedBucket[]> {
  const out = new Map<string, ResolvedBucket[]>();
  for (const sec of sections) for (const l of sec.lines) {
    const set = bucketsFor(sec.role, l.label);
    if (!set) continue;
    const seeds = seedBuckets(set, priorLineFor(prior, sec.name, l.label));
    if (!seeds) continue;
    out.set(lineKey(sec.name, l.label), resolveBuckets(sec.name, l.label, seeds, doc));
  }
  return out;
}
