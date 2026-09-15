import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const page = read("app/investors/page.tsx");
const hook = read("app/investors/useK1.ts");
const route = read("app/api/investor-k1/share/route.ts");
const modal = read("app/investors/SendAllModal.tsx");

/**
 * Emailing every investor at once is the largest blast radius in the app: one
 * click, forty-five irreversible sends, each releasing somebody's tax document.
 */
describe("email all investors", () => {
  it("goes through the SAME batch endpoint, not a second implementation", () => {
    // The checks that matter live in shareOne — prior link revoked, fresh PIN,
    // PIN as its own message, a LINK and never the K-1 attached. A second path
    // is how those drift.
    expect(hook).toContain('fetch("/api/investor-k1/share"');
    expect(hook).toContain("shareAll");
  });

  it("only offers investors who can actually receive one", () => {
    // No K-1 means nothing to release; no address means the send mints a link
    // and delivers nothing, which reads as success and is not.
    expect(page).toContain("sendableInvestors");
    expect(page).toContain("k1reg.k1Owners!.has(r.investor.id)");
    expect(page).toContain("if (!hit?.email) continue;");
  });

  it("confirms in a real dialog, against a NAMED list", () => {
    // A native confirm() could carry a name and an address and nothing else —
    // and the things worth stopping on are exactly what it could not show.
    expect(page).toContain("<SendAllModal");
    expect(page).not.toContain("const ok = confirm(");
    expect(modal).toContain("{r.name}");
    expect(modal).toContain("{r.email}");
    expect(modal).toContain("cannot be undone");
  });

  it("no CHECK flag — the relaxed matches were reviewed and confirmed", () => {
    // A warning nobody needs to act on trains people past the ones that
    // matter. The resolution is unchanged: resolveOwnerEmail still refuses a
    // name that reaches two different addresses.
    expect(modal).not.toContain("CHECK");
    expect(modal).not.toContain("matched on name");
    expect(page).not.toContain(">CHECK<");
  });

  it("the modal states who is skipped, and who will see fewer K-1s", () => {
    // Silently sending to 15 of 45 and reporting success is the failure this
    // prevents; so is an investor opening a link to 3 of their 11.
    expect(modal).toContain("no address on file");
    expect(modal).toContain("fewer K-1s than they hold");
  });

  it("is dismissable without sending, and cannot be dismissed mid-send", () => {
    expect(modal).toContain("Cancel");
    expect(modal).toContain('if (e.key === "Escape" && !busy)');
  });

  it("chunks SMALL, for progress rather than for the cap", () => {
    // Forty fit under the server's fifty, but the server answers once per
    // request — so twenty-six in one call meant a long silence and then
    // everything at once, with no way to tell a slow send from a stuck one.
    expect(hook).toContain("const CHUNK = 5");
    expect(route).toContain("const MAX_BATCH = 50");
  });

  it("reports progress as it goes, and never closes the dialog to do it", () => {
    expect(hook).toContain("setBatch({ key, sent: send, results: [...results] })");
    expect(page).toContain("results={k1reg.batch?.key");
    expect(page).not.toContain("onSend={(ids) => { setSendAllOpen(false);");
  });

  it("every outcome is on the row, with the REASON when it failed", () => {
    // A batch that reports only a count leaves you re-sending twenty-six to
    // fix three.
    expect(modal).toContain("FAILED");
    expect(modal).toContain("result.error ?? result.mailError");
    expect(modal).toContain("waiting…");
    expect(modal).toContain("SENT");
  });

  it("calls out a link that went without its PIN", () => {
    // The one outcome that leaves someone holding something they cannot open.
    expect(modal).toContain("NO PIN");
    expect(modal).toContain("got a link but NOT their PIN");
  });

  it("surfaces a batch that stopped outright, inside the dialog", () => {
    expect(modal).toContain("The send stopped");
    expect(page).toContain("error={k1reg.errorAll}");
  });

  it("the batch spans partnerships — the server resolves each owner's own", () => {
    // A cross-partnership batch has no single propertyCode to pass, and the
    // email names the partnership, so taking it from the request would label
    // them all with one.
    expect(hook).toContain('propertyCode: ""');
    expect(route).toContain("const ownerProperty = found.code || propertyCode");
    expect(route).toContain("propertyName: propName(ownerProperty)");
  });
});
