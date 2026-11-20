import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSkylineRec } from "@/lib/bank-rec/monthFiles";
import { recAccountOf, recMonth, recsForLedger, laterRec, type RecAccount } from "./bankRecs";
import { computeWorkpapers } from "./compute";

const fx = (n: string) => readFileSync(join(__dirname, "../../bank-rec/__fixtures__", n), "utf8");

describe("reading Marie's Statement Reconcile Report", () => {
  it("takes the book balance, the statement date and the open items", () => {
    const a = recAccountOf(parseSkylineRec(fx("rec-2190-rec2.txt")), "x2190", "rec.pdf")!;
    expect(a.bookBalance).toBe(182129.11);
    expect(a.statementDateISO).toBe("2026-09-30");
    expect(a.unreconciled).toHaveLength(2);
    expect(recMonth(a.statementDateISO!)).toBe("2026-09");
  });
  it("files a money market's 5th-of-the-month statement under the month before", () => {
    expect(recMonth("2026-10-05")).toBe("2026-09");
    expect(recMonth("2026-01-05")).toBe("2025-12");
  });
  it("a later run replaces an earlier one", () => {
    const base = { last4: "x0598", checkingKey: null, statementDateISO: "2026-09-30", bookBalance: 1, inBalance: true, unreconciled: [], file: "a" } as RecAccount;
    expect(laterRec({ ...base, runDateISO: "2026-10-10" }, { ...base, runDateISO: "2026-10-20", bookBalance: 2 }).bookBalance).toBe(2);
  });
});

describe("cash against the recs", () => {
  const m = (sep: number) => { const a = new Array(12).fill(0); a[8] = sep; return a; };
  const acct = (last4: string, bookBalance: number, extra: Partial<RecAccount> = {}): RecAccount =>
    ({ last4, checkingKey: null, statementDateISO: "2026-09-30", runDateISO: "2026-10-14", bookBalance, inBalance: true, unreconciled: [], file: `${last4}.pdf`, ...extra });
  const gl = { beginning: { "0110-0000": 0, "0250-0000": 0, "3200-0000": 0 }, monthly: { "0110-0000": m(50000), "0250-0000": m(8000), "3200-0000": m(-58000) } };
  const run = (accounts: Record<string, RecAccount>) => computeWorkpapers({ key: "4500", year: 2026, asOfMonth: 9, gl, sources: { marieRecs: recsForLedger("4500", "2026-09", accounts) } });

  it("ties when the GL's cash equals Marie's book balance", () => {
    const wp = run({ x0598: acct("x0598", 50000), x8086: acct("x8086", 8000) });
    expect(wp.schedules.find((s) => s.code === "0110-0000")!.support?.ties).toBe(true);
    expect(wp.schedules.find((s) => s.code === "0250-0000")!.support?.ties).toBe(true);
  });
  it("a gap is red, an account still to import is amber", () => {
    const wp = run({ x0598: acct("x0598", 49000) });
    const cash = wp.schedules.find((s) => s.code === "0110-0000")!;
    expect(cash.support?.ties).toBe(false);
    expect(cash.status).toBe("fix");
    const restricted = wp.schedules.find((s) => s.code === "0250-0000")!;
    expect(restricted.support?.ties).toBeNull();
    expect(restricted.flags.some((f) => f.level === "amber" && f.text.includes("x8086"))).toBe(true);
  });
  it("asks about items open more than 90 days", () => {
    const wp = run({ x0598: acct("x0598", 50000, { unreconciled: [{ dateISO: "2026-03-02", ref: "001234", description: "PGW", amount: -312.4 }] }), x8086: acct("x8086", 8000) });
    expect(wp.schedules.find((s) => s.code === "0110-0000")!.flags.some((f) => f.text.includes("open over 90 days"))).toBe(true);
  });
  it("a ledger with no account of its own has no rec to read", () => {
    expect(recsForLedger("3620", "2026-09", {})).toBeNull();
  });
});

import { pickRecFiles } from "./bankRecs";
describe("choosing the rec to import from a month folder", () => {
  it("one per account: a re-run first, then Rec1&2, then Rec2; never a statement", () => {
    const names = [
      "1100 5300 The Korman Co xx9879 30 Sept 2026 Rec1.pdf",
      "1100 5300 The Korman Co xx9879 30 Sept 2026 Rec2.pdf",
      "7200 Elbridge xx1692 30 Sept 2026 Rec2.pdf",
      "7200 Elbridge xx1692 30 Sept 2026 Rec2B.pdf",
      "2070 30 Sept 2026 xx6119 Kosano Assoc Rec1&2.pdf",
      "7200 Elbridge xx1692 30 Sept 2026 Stmt.pdf",
    ].map((name) => ({ name }));
    expect(pickRecFiles(names).map((f) => f.name).sort()).toEqual([
      "1100 5300 The Korman Co xx9879 30 Sept 2026 Rec2.pdf",
      "2070 30 Sept 2026 xx6119 Kosano Assoc Rec1&2.pdf",
      "7200 Elbridge xx1692 30 Sept 2026 Rec2B.pdf",
    ]);
  });
});
