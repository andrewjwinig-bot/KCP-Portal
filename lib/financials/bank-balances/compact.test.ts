import { describe, expect, it } from "vitest";
import { cell, cellSigned, headline, headlineSigned } from "./compact";

describe("big-picture money", () => {
  it("rounds table figures to K from $10,000", () => {
    expect(cell(1_893_438)).toBe("1,893K");
    expect(cell(11_570_867)).toBe("11,571K");
    expect(cell(7_638)).toBe("7,638");
    expect(cell(-96_563)).toBe("(97K)");
    expect(cell(0)).toBe("—");
    expect(cellSigned(9_516)).toBe("+9,516");
  });
  it("puts headline figures in M from $1M", () => {
    expect(headline(11_570_867)).toBe("$11.57M");
    expect(headline(893_000)).toBe("$893K");
    expect(headlineSigned(-62_419)).toBe("($62K)");
  });
});

import { isLow } from "./compact";
describe("low balance flag", () => {
  it("flags operating accounts under $5K, never deposits or the trust", () => {
    expect(isLow({ balance: 1_019, restricted: false })).toBe(true);
    expect(isLow({ balance: 26_885, restricted: false })).toBe(false);
    expect(isLow({ balance: 1_000, restricted: true })).toBe(false);
    expect(isLow({ balance: 1_000, restricted: false, handsOff: {} })).toBe(false);
    expect(isLow({ balance: null, restricted: false })).toBe(false);
  });
});
