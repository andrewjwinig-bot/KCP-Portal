import { describe, it, expect } from "vitest";
import { addressRecipients, reached, selectRecipients } from "./recipients";

const INVESTOR = "larry@example.com";
const ACCOUNTANT = "jhoffman@isdanerllc.com";
const MANAGER = "manager@example.com";

describe("addressRecipients", () => {
  it("Cc's the additional recipients when asked", () => {
    const a = addressRecipients(INVESTOR, [ACCOUNTANT], true);
    expect(a.to).toEqual([INVESTOR]);
    expect(a.cc).toEqual([ACCOUNTANT]);
  });

  it("addresses everyone together when not", () => {
    const a = addressRecipients(INVESTOR, [ACCOUNTANT], false);
    expect(a.to).toEqual([INVESTOR, ACCOUNTANT]);
    expect(a.cc).toEqual([]);
  });

  it("REACHES THE SAME PEOPLE either way", () => {
    // The whole point: this setting changes how the mail reads, never who
    // gets it. Dropping someone here means an investor's accountant silently
    // stops receiving the K-1 link they were nominated for.
    const on = reached(addressRecipients(INVESTOR, [ACCOUNTANT, MANAGER], true));
    const off = reached(addressRecipients(INVESTOR, [ACCOUNTANT, MANAGER], false));
    expect(on.slice().sort()).toEqual(off.slice().sort());
    expect(on).toHaveLength(3);
  });

  it("never Cc's someone onto a mail with no addressee", () => {
    // With no address on file for the investor, a Cc-only message would be a
    // mail to nobody — so whoever we do have is addressed directly.
    const a = addressRecipients(null, [ACCOUNTANT], true);
    expect(a.to).toEqual([ACCOUNTANT]);
    expect(a.cc).toEqual([]);
  });

  it("does not duplicate the investor into their own Cc line", () => {
    const a = addressRecipients(INVESTOR, [INVESTOR, ACCOUNTANT], true);
    expect(a.to).toEqual([INVESTOR]);
    expect(a.cc).toEqual([ACCOUNTANT]);
  });

  it("drops blank and whitespace-only extra rows", () => {
    const a = addressRecipients(INVESTOR, ["", "   ", ACCOUNTANT], true);
    expect(a.cc).toEqual([ACCOUNTANT]);
  });

  it("has nothing to Cc when there are no additional recipients", () => {
    const a = addressRecipients(INVESTOR, [], true);
    expect(a.to).toEqual([INVESTOR]);
    expect(a.cc).toEqual([]);
  });
});

describe("selectRecipients — sending to just one of several contacts", () => {
  const primary = "investor@example.com";
  const secondary = ["accountant@example.com", "manager@example.com"];

  it("sends to everyone when nothing is picked, so an older caller is unchanged", () => {
    const sel = selectRecipients(primary, secondary, undefined);
    expect(sel.primary).toBe(primary);
    expect(sel.secondary).toEqual(secondary);
  });

  it("sends to JUST the accountant — the investor is dropped, not silently re-added", () => {
    // The case this exists for: "my accountant handles my taxes, send it to
    // them." Mailing the investor as well is not what was asked.
    const sel = selectRecipients(primary, secondary, ["accountant@example.com"]);
    expect(sel.primary).toBeNull();
    expect(sel.secondary).toEqual(["accountant@example.com"]);
    // With no primary, the one remaining recipient is the addressee — never
    // Cc'd onto a mail with no To.
    const addressed = addressRecipients(sel.primary, sel.secondary, true);
    expect(addressed.to).toEqual(["accountant@example.com"]);
    expect(addressed.cc).toEqual([]);
    expect(reached(addressed)).toEqual(["accountant@example.com"]);
  });

  it("keeps the investor addressed when they are among the picks", () => {
    const sel = selectRecipients(primary, secondary, [primary, "manager@example.com"]);
    const addressed = addressRecipients(sel.primary, sel.secondary, true);
    expect(addressed.to).toEqual([primary]);
    expect(addressed.cc).toEqual(["manager@example.com"]);
  });

  it("NEVER mails an address that is not on the owner's record", () => {
    // The security property. A selection is a filter, never the list — a
    // client-supplied address must not become a way to mail a K-1 link
    // anywhere. Same reasoning as deriving the person group server-side.
    const sel = selectRecipients(primary, secondary, ["attacker@evil.com", "accountant@example.com"]);
    expect(reached(addressRecipients(sel.primary, sel.secondary, true))).toEqual(["accountant@example.com"]);
  });

  it("matches regardless of case or padding, which is how addresses get typed", () => {
    const sel = selectRecipients(primary, secondary, ["  ACCOUNTANT@Example.com "]);
    expect(sel.secondary).toEqual(["accountant@example.com"]);
  });

  it("selecting nobody reaches nobody — it does not fall back to everyone", () => {
    // An empty pick must not be read as "unset". Falling through to the full
    // list would mail an investor their tax document when staff had chosen not
    // to send it at all.
    const sel = selectRecipients(primary, secondary, []);
    expect(sel.primary).toBeNull();
    expect(sel.secondary).toEqual([]);
    expect(reached(addressRecipients(sel.primary, sel.secondary, true))).toEqual([]);
  });
});
