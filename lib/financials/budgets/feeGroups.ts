// 2010's MANAGEMENT FEE REVENUE BY BOOK — JV III, NI LLC, Shopping Centers,
// Residential — as the LIK budget workbook lays it out (owner: "break down the
// LIK management revenue into JV III, NI LLC, Shopping Centers, Residential …
// click into each for individual breakdown"). Client-safe: the draft groups
// the buildings' fee rows into the line's sub-rows, and the grid groups the
// same rows for each group's modal, so the two cannot disagree.

import { PROPERTY_DEFS } from "@/lib/properties/data";

export const FEE_GROUPS = ["JV III", "NI LLC", "Shopping Centers", "Residential"] as const;
export type FeeGroup = (typeof FEE_GROUPS)[number] | "Other";

const DEF = new Map(PROPERTY_DEFS.map((p) => [p.id.toUpperCase(), p]));

/** Which of the workbook's revenue rows a fee-paying building sits under. */
export function feeGroupOf(code: string): FeeGroup {
  const d = DEF.get(String(code).toUpperCase());
  if (d?.fundGroup === "JV III") return "JV III";
  if (d?.fundGroup === "NI LLC") return "NI LLC";
  if (d?.allocGroup === "SC") return "Shopping Centers";
  if (d?.type === "Residential") return "Residential";
  return "Other";
}

type Row = { code: string; months: number[] };

/** The groups in the workbook's order, each the sum of its buildings — every
 *  group shown even at $0 (the workbook keeps Residential at zero), and
 *  "Other" only when something lands there. */
export function feeGroups<T extends Row>(rows: T[]): { group: FeeGroup; months: number[]; total: number; rows: T[] }[] {
  const order: FeeGroup[] = [...FEE_GROUPS, "Other"];
  return order.map((group) => {
    const mine = rows.filter((r) => feeGroupOf(r.code) === group);
    const months = Array.from({ length: 12 }, (_, i) => Math.round(mine.reduce((s, r) => s + (r.months[i] || 0), 0)));
    return { group, months, total: months.reduce((s, v) => s + v, 0), rows: mine };
  }).filter((g) => g.group !== "Other" || g.rows.length);
}
