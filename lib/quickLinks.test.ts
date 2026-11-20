import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { QUICK_LINKS, quickLinksFor } from "./quickLinks";

describe("quick links", () => {
  it("bank logins reach only Drew, Randy, Harry, Alison and admin", () => {
    const banks = ["chase", "mt", "liberty"];
    for (const u of ["drew", "randy", "harry", "alison", "admin"]) {
      expect(quickLinksFor(u).map((l) => l.id)).toEqual(expect.arrayContaining(banks));
    }
    for (const u of ["tami", "nancy", "marie", "greg", "jay", "charles", "maint"]) {
      const ids = quickLinksFor(u).map((l) => l.id);
      expect(ids).toEqual(["skyline", "avid"]);
    }
  });
  it("every icon exists", () => {
    for (const l of QUICK_LINKS) expect(existsSync(join(process.cwd(), "public", l.icon))).toBe(true);
  });
});
