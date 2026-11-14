import { describe, it, expect } from "vitest";
import { addressRecipients, reached, selectRecipients, addressedAs } from "./recipients";

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

describe("addressedAs — the wording follows who is actually being mailed", () => {
  const names = {
    "investor@example.com": "Jeffrey Honickman",
    "accountant@example.com": "Antoinette Czop",
  };

  it("greets the investor when the mail reaches them", () => {
    const a = addressedAs("Jeffrey Honickman", ["investor@example.com"], names);
    expect(a.greetNames).toEqual(["Jeffrey Honickman"]);
    expect(a.onBehalf).toBe(false);
  });

  it("greets the accountant, and treats the investor as the SUBJECT, when only they are picked", () => {
    // The case this exists for. "Your 6 Schedule K-1s" to someone who holds
    // none of them is what makes a recipient check whether the mail is real.
    const a = addressedAs("Jeffrey Honickman", ["accountant@example.com"], names);
    expect(a.greetNames).toEqual(["Antoinette Czop"]);
    expect(a.onBehalf).toBe(true);
  });

  it("is not on-behalf when the investor is among several recipients", () => {
    const a = addressedAs("Jeffrey Honickman", ["investor@example.com", "accountant@example.com"], names);
    expect(a.greetNames).toEqual(["Jeffrey Honickman", "Antoinette Czop"]);
    expect(a.onBehalf).toBe(false);
  });

  it("decides on-behalf by NAME, not by which address was the primary", () => {
    // An investor whose only address on file is their accountant's is not a
    // recipient of their own mail, even though that address is the primary.
    const a = addressedAs("Jeffrey Honickman", ["investor@example.com"], {
      "investor@example.com": "Antoinette Czop",
    });
    expect(a.onBehalf).toBe(true);
  });

  it("matches the investor's name loosely enough for spacing and case", () => {
    const a = addressedAs("  jeffrey   honickman ", ["investor@example.com"], names);
    expect(a.onBehalf).toBe(false);
  });

  it("greets nobody, and keeps the second-person wording, when no name is on file", () => {
    // Falls back to the bare "Hello," every send used before names existed. It
    // must NOT claim the mail is about somebody else: with no name we cannot
    // tell an accountant's address from the investor's own second one, and
    // "Jeffrey Honickman's K-1s are ready in their portal" sent to Jeffrey is
    // the worse of the two mistakes.
    const a = addressedAs("Jeffrey Honickman", ["someone@example.com"], {});
    expect(a.greetNames).toEqual([]);
    expect(a.onBehalf).toBe(false);
  });
});
