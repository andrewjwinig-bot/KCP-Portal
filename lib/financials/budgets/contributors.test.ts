import { describe, it, expect } from "vitest";
import { ownerFor, canEdit, outstandingFor, progressByOwner, isComplete, contributionId, visibleRoles, canSeeRole, type Contribution } from "./contributors";

const item = (o: Partial<Contribution> & { id: string; owner: Contribution["owner"] }): Contribution => ({
  year: 2027, kind: "vacancy", propertyCode: "9510", filledAt: null, filledBy: null, ...o,
});

describe("who owns which part of a budget", () => {
  it("splits vacancies and renewals by portfolio — Harry retail, Nancy office", () => {
    expect(ownerFor("vacancy", "SC")).toBe("harry");
    expect(ownerFor("renewal", "SC")).toBe("harry");
    expect(ownerFor("vacancy", "BP")).toBe("nancy");
    expect(ownerFor("renewal", "BP")).toBe("nancy");
  });

  it("keeps the rest with one owner across the book", () => {
    expect(ownerFor("ret", "SC")).toBe("drew");
    expect(ownerFor("insurance", "BP")).toBe("drew");
    expect(ownerFor("building-maintenance", "SC")).toBe("greg");
    expect(ownerFor("building-maintenance", "BP")).toBe("greg");
  });
});

describe("who may edit", () => {
  it("lets the owner fill their own part", () => {
    expect(canEdit("harry", "vacancy", "SC")).toBe(true);
    expect(canEdit("greg", "building-maintenance", "SC")).toBe(true);
  });

  it("keeps one contributor out of another's", () => {
    expect(canEdit("harry", "vacancy", "BP")).toBe(false);   // Nancy's parks
    expect(canEdit("nancy", "vacancy", "SC")).toBe(false);   // Harry's centres
    expect(canEdit("greg", "ret", "SC")).toBe(false);
    expect(canEdit("harry", "insurance", "SC")).toBe(false);
  });

  it("lets Drew fill ANYTHING — he hosts the review and the gaps close there", () => {
    expect(canEdit("drew", "vacancy", "BP")).toBe(true);
    expect(canEdit("drew", "building-maintenance", "SC")).toBe(true);
    expect(canEdit("admin", "renewal", "SC")).toBe(true);
  });
});

describe("what is still outstanding", () => {
  const items = [
    item({ id: "a", owner: "harry" }),
    item({ id: "b", owner: "harry", filledAt: "2026-10-01T00:00:00Z", filledBy: "harry" }),
    item({ id: "c", owner: "nancy" }),
    item({ id: "d", owner: "greg", kind: "building-maintenance" }),
  ];

  it("prompts each person with only their own", () => {
    expect(outstandingFor(items, "harry").map((c) => c.id)).toEqual(["a"]);
    expect(outstandingFor(items, "nancy").map((c) => c.id)).toEqual(["c"]);
    expect(outstandingFor(items, "greg").map((c) => c.id)).toEqual(["d"]);
  });

  it("shows Drew everything still open", () => {
    expect(outstandingFor(items, "drew").map((c) => c.id)).toEqual(["a", "c", "d"]);
  });

  it("says whose part is missing, so the review is not where you find out", () => {
    expect(progressByOwner(items)).toEqual({
      harry: { total: 2, done: 1 },
      nancy: { total: 1, done: 0 },
      greg: { total: 1, done: 0 },
    });
  });

  it("is finalisable only when every part is in", () => {
    expect(isComplete(items)).toBe(false);
    expect(isComplete(items.map((c) => ({ ...c, filledAt: "2026-10-01T00:00:00Z" })))).toBe(true);
    expect(isComplete([])).toBe(false); // nothing assigned is not "done"
  });

  it("keeps the OWNER when Drew fills it in during the review", () => {
    // "Harry still owes six" has to stay true on the roster; who actually
    // typed it is `filledBy`.
    const filled: Contribution = { ...item({ id: "a", owner: "harry" }), filledAt: "2026-10-02T00:00:00Z", filledBy: "drew" };
    expect(filled.owner).toBe("harry");
    expect(progressByOwner([filled])).toEqual({ harry: { total: 1, done: 1 } });
  });
});

describe("ids", () => {
  it("are stable per year, kind, property and unit", () => {
    expect(contributionId(2027, "vacancy", "9510", "9510-406")).toBe("2027|vacancy|9510|9510-406");
    expect(contributionId(2027, "ret", "9510")).toBe("2027|ret|9510|");
  });
});

describe("what a contributor may SEE", () => {
  it("shows Greg the whole EXPENSE budget — he needs the context to judge his own line", () => {
    // $900/month on 4500's building maintenance only means something next to
    // what is on landscaping and parking lot maintenance.
    expect(canSeeRole("greg", "reimbursable-expense")).toBe(true);
    expect(canSeeRole("greg", "non-reimbursable-expense")).toBe(true);
  });

  it("keeps the revenue side out of it", () => {
    expect(canSeeRole("greg", "revenue")).toBe(false);
    expect(canSeeRole("greg", "reimbursement")).toBe(false);
    expect(canSeeRole("greg", "debt-service")).toBe(false);
  });

  it("applies to the other service logins too, since they share one profile", () => {
    for (const u of ["charles", "jay", "maint"] as const) {
      expect(canSeeRole(u, "revenue")).toBe(false);
      expect(canSeeRole(u, "reimbursable-expense")).toBe(true);
    }
  });

  it("does not restrict anyone else", () => {
    for (const u of ["drew", "admin", "harry", "nancy"] as const) {
      expect(visibleRoles(u)).toBeNull();
      expect(canSeeRole(u, "revenue")).toBe(true);
    }
  });
});
