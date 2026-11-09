import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import {
  kindFromName, last4FromName, last4FromStatement, last4ForSkylineKey,
  parseBankStatement, parseCheckingReport, parseSkylineRec, amountOf,
} from "./monthFiles";
import { itemizeStatement } from "./statementItems";

// Fixtures are the text of Marie's real September 2026 files, as the
// SharePoint reader returned it, and the owner's October Checking Account Report.
const fx = (n: string) => readFileSync(join(__dirname, "__fixtures__", n), "utf8");

describe("file names (a fallback only)", () => {
  it("reads the last four however the x-number is written", () => {
    expect(last4FromName("7200 Elbridge xx1692 30 Sept 2026 Stmt.pdf")).toBe("x1692");
    expect(last4FromName("3600 JV III xz5631 30 Sept 2026 Rec1.pdf")).toBe("x5631");
    expect(last4FromName("2010 LIK OP xx09629 30 Sept 2026 Stmt.pdf")).toBe("x9629");
    expect(last4FromName("Temp XX0613 30 Sept 2026 Stmt.pdf")).toBe("x0613");
    expect(last4FromName("05 Oct 2026 LIK MM X8276 Rec1.pdf")).toBe("x8276");
  });
  it("tells the kinds apart", () => {
    expect(kindFromName("x Rec1&2.pdf")).toBe("rec12");
    expect(kindFromName("x Rec2B.pdf")).toBe("rec2b");
    expect(kindFromName("x Rec2.pdf")).toBe("rec2");
    expect(kindFromName("x Rec1.pdf")).toBe("rec1");
    expect(kindFromName("x Stmt .pdf")).toBe("stmt");
    expect(kindFromName("30 Sept 2026 Chase X5623 Hyman Korman Co.pdf")).toBe("stmt");
    expect(kindFromName("October_Checking_Account_Report.xls")).toBe("checking-report");
  });
  it("reads money the way the reports print it", () => {
    expect(amountOf("(16,252.55)")).toBe(-16252.55);
    expect(amountOf("−$381.46")).toBe(-381.46);
    expect(amountOf("$1,450.00")).toBe(1450);
  });
});

describe("bank statements — account read from the statement, then itemized", () => {
  it("Chase: ending balance, account and every line, proved by the section totals", () => {
    const t = fx("chase-1692.txt");
    const st = parseBankStatement(t);
    expect(st).toMatchObject({ bank: "Chase", periodStart: "2026-09-01", periodEnd: "2026-09-30", beginning: 312781.22, ending: 328191.18 });
    expect(last4FromStatement(t, st.bank)).toBe("x1692");
    const it = itemizeStatement(t, st);
    expect(it.ok).toBe(true);
    expect(it.items.map((i) => [i.dateISO, i.amount, i.checkNo])).toEqual([
      ["2026-09-01", 20452.29, null],
      ["2026-09-04", -849.81, "22950"],
      ["2026-09-16", -855.52, "22951"],
      ["2026-09-23", -1091, "22952"],
      ["2026-09-24", -2246, null],
    ]);
    expect(it.items[0].description).toMatch(/Leevers Supermar/);
  });

  it("M&T: signed by the running balance, check numbers from AvidPay lines", () => {
    const t = fx("mt-3777.txt");
    const st = parseBankStatement(t);
    expect(st).toMatchObject({ bank: "M&T", periodEnd: "2026-09-30", beginning: 48080.78, ending: 39647.9 });
    expect(last4FromStatement(t, st.bank)).toBe("x3777");
    const it = itemizeStatement(t, st);
    expect(it.ok).toBe(true);
    expect(it.items).toHaveLength(24);
    expect(it.items.find((i) => i.checkNo === "100992")?.amount).toBe(-15918);
    expect(it.items.find((i) => i.checkNo === "100990")?.amount).toBe(-4352.35);
    expect(it.items.find((i) => i.kind === "fee")?.amount).toBe(-318.31);
  });

  it("Liberty checking: sections rebuilt from the columns", () => {
    const t = fx("liberty-4756.txt");
    const st = parseBankStatement(t, "x4756");
    expect(st).toMatchObject({ bank: "Liberty", periodEnd: "2026-09-30", beginning: 148289.25, ending: 179924.36 });
    expect(last4FromStatement(t, st.bank)).toBe("x4756");
    const it = itemizeStatement(t, st);
    expect(it.ok).toBe(true);
    expect(it.items.map((i) => i.amount).sort((a, b) => a - b)).toEqual([-3167, -1299.07, -1290.39, -450, -44.93, 37886.5]);
  });

  it("Liberty money market: off-cycle (5th to 5th), interest found by the gap", () => {
    const t = fx("liberty-7216.txt");
    const st = parseBankStatement(t, "x7216");
    expect(st).toMatchObject({ periodStart: "2026-09-05", periodEnd: "2026-10-05", beginning: 154189.55, ending: 152766.63 });
    const it = itemizeStatement(t, st);
    expect(it.ok).toBe(true);
    expect(it.items.map((i) => [i.amount, i.kind])).toEqual([[-1475, "check"], [52.08, "interest"]]);
  });

  it("a list that does not add up is NOT trusted", () => {
    const t = fx("chase-1692.txt").replace("22951   ^   09/16   855.52", "");
    const it = itemizeStatement(t, parseBankStatement(t));
    expect(it.ok).toBe(false);
  });
});

describe("Marie's Skyline recs", () => {
  it("reads the open items and the key that names the account", () => {
    const r = parseSkylineRec(fx("rec-2190-rec2.txt"));
    expect(r).toMatchObject({ checkingKey: "JPM 2010 ESCROW", statementDateISO: "2026-09-30", statementBalance: 317589.63, adjustedCheckBookBalance: 182129.11, inBalance: true, user: "MARIE" });
    expect(last4ForSkylineKey(r.checkingKey)).toBe("x2190");
    expect(r.unreconciled).toEqual([
      { dateISO: "2025-12-31", ref: "CREDIT", description: "YE Variance Adjusment 2025", amount: -135410.52 },
      { dateISO: "2026-09-23", ref: "001674", description: "Bensalem Township", amount: -50 },
    ]);
    const g = parseSkylineRec(fx("rec-0598-rec2.txt"));
    expect(last4ForSkylineKey(g.checkingKey)).toBe("x0598");
    expect(g.unreconciled).toHaveLength(1);
  });
});

describe("Skyline Checking Account Report", () => {
  const wb = XLSX.read(readFileSync(join(__dirname, "__fixtures__", "checking-report-2026-10.xls")));
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const rep = parseCheckingReport(rows);
  it("reads every account, its balance, ownership and transactions", () => {
    expect(rep.asOfISO).toBe("2026-10-31");
    expect(rep.accounts.filter((a) => !a.inactive)).toHaveLength(36);
    const elb = rep.accounts.find((a) => a.key === "JPM 7200")!;
    expect(elb).toMatchObject({ beginning: 328191.18, balance: 237506.09 });
    // the register carries itself from beginning to balance
    const moved = elb.txns.reduce((a, t) => a + t.amount, 0);
    expect(Math.round((elb.beginning! + moved) * 100) / 100).toBe(237506.09);
    const ni = rep.accounts.find((a) => a.key === "JPM 2010 ESCROW")!;
    expect(ni.ownership.find((o) => o.company === "4060")?.amount).toBe(4117784.25);
    expect(Math.round(ni.ownership.reduce((a, o) => a + o.amount, 0) * 100) / 100).toBe(ni.balance);
  });
  it("every active account maps to a tracker account except the sold-properties one", () => {
    const unmapped = rep.accounts.filter((a) => !a.inactive && !last4ForSkylineKey(a.key)).map((a) => a.key);
    expect(unmapped).toEqual(["JPM 6010"]);
  });
});
