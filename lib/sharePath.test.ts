import { describe, it, expect } from "vitest";
import { fullSharePath } from "./sharePath";

describe("fullSharePath", () => {
  it("shows a share path from the C: drive, for Drew by name", () => {
    expect(fullSharePath("Data\\Accounting\\!2026 Year End\\Bank Account Reconciliations\\10 October 2026", "drew"))
      .toBe("C:\\Users\\Drew Winig\\OneDrive - Korman Commercial Properties\\KCP - Documents\\Data\\Accounting\\!2026 Year End\\Bank Account Reconciliations\\10 October 2026");
  });
  it("uses %USERPROFILE% for anyone else, and leaves other paths alone", () => {
    expect(fullSharePath("Data\\Shared", "tami")).toBe("%USERPROFILE%\\OneDrive - Korman Commercial Properties\\KCP - Documents\\Data\\Shared");
    expect(fullSharePath("Billings\\x", "drew")).toBe("Billings\\x");
  });
});
