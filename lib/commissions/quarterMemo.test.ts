import { describe, it, expect } from "vitest";
import { buildCommissionMemoPdf } from "./memoPdf";
import { buildJournalEntryXlsx } from "./journalEntryExcel";
import { parseQuarterLabel, type CommissionEntry } from "@/lib/commissions";

// Server-side generation of the quarter-end memo (top sheet) + GL import file.
// Guards that the cron can actually produce these attachments in Node.

const parsed = parseQuarterLabel("Q2 26")!;
const entries: CommissionEntry[] = [
  { id: "1", quarter: "Q2 26", tenant: "Acme Systems LLC", building: "3610", suite: "205", sqft: 2400, leaseFrom: "6/1/2026", leaseTo: "5/31/2031", termYears: 5, incentiveAmount: 720, comments: "", createdAt: 0 },
];

describe("quarter-end memo + GL generation (server-side)", () => {
  it("builds a valid memo PDF for a fund with entries", async () => {
    const bytes = await buildCommissionMemoPdf({ quarter: "Q2 26", entries, parsed, fund: "JV III" });
    expect(bytes).toBeTruthy();
    expect(Buffer.from(bytes!.slice(0, 4)).toString("latin1")).toBe("%PDF");
    expect(bytes!.byteLength).toBeGreaterThan(800);
  });

  it("builds a valid JE .xlsx for a fund with entries", () => {
    const out = buildJournalEntryXlsx({ entries, fund: "JV III", parsed, batchNumber: 97339, uniqueId: 1234567 });
    expect(out).toBeTruthy();
    expect(Buffer.from(out!.buffer.slice(0, 2)).toString("latin1")).toBe("PK"); // xlsx = zip
    expect(out!.filename).toBe("JE_JV_III_Q226.xlsx");
  });

  it("returns null for a fund with no entries that quarter", async () => {
    expect(await buildCommissionMemoPdf({ quarter: "Q2 26", entries: [], parsed, fund: "NI LLC" })).toBeNull();
    expect(buildJournalEntryXlsx({ entries: [], fund: "NI LLC", parsed, batchNumber: 1, uniqueId: 1 })).toBeNull();
  });
});
