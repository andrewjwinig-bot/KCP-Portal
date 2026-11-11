import { describe, it, expect } from "vitest";
import { acceptTypes, pickerId } from "./pickFiles";

describe("pickFiles", () => {
  it("keeps picker ids to what the browser allows", () => {
    expect(pickerId("laser-statement")).toBe("laser-statement");
    expect(pickerId("a b/c")).toBe("a-b-c");
    expect(pickerId("x".repeat(40))).toHaveLength(32);
  });
  it("turns an input's accept into picker types, and none for any file", () => {
    expect(acceptTypes(".pdf,.xls,.xlsx")).toEqual([{ description: "PDF / XLS / XLSX", accept: { "application/octet-stream": [".pdf", ".xls", ".xlsx"] } }]);
    // Bank Balances takes any file name (Chase saves "Accounts - chase.com").
    expect(acceptTypes("")).toBeUndefined();
  });
});
