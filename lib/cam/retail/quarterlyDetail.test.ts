import { describe, expect, it } from "vitest";
import { QUARTERLY_BILLINGS, emptyQuarterlyData } from "./quarterly";
import { buildQuarterlyDetailPdf, quarterDetail } from "./quarterlyDetail";

const def = QUARTERLY_BILLINGS["9510-WAWA-Q"];
const lot = "Parking Lot Maintenance/Repairs";

describe("quarterly GL detail", () => {
  it("lists the quarter's charges per line, tied to the statement figure", () => {
    const acct = def.camAccounts[lot] ?? Object.values(def.camAccounts)[0];
    const label = def.camAccounts[lot] ? lot : Object.keys(def.camAccounts)[0];
    const tx = {
      [acct]: [
        { month: 7, date: "2026-07-14", vendor: "Paving Co", description: "Lot repair", ref: "123", amount: 21750 },
        { month: 6, date: "2026-06-02", vendor: "X", description: "June — not Q3", ref: "1", amount: 99 },
      ],
      [def.retAccount]: [{ month: 8, date: "2026-08-01", description: "School tax", ref: "9", amount: 5000 }],
    };
    const eff = emptyQuarterlyData();
    eff.camCosts[label] = { Q3: 21750 };
    eff.retCosts.Q3 = 5000;
    const d = quarterDetail(def, "Q3", 2026, tx, eff);
    const g = d.groups.find((x) => x.label === label)!;
    expect(g.txns).toHaveLength(1);
    expect(g.glTotal).toBe(21750);
    expect(g.billed).toBe(21750);
    expect(d.groups.at(-1)!.kind).toBe("ret");
    const pdf = buildQuarterlyDetailPdf(def, d);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});
