import { describe, it, expect } from "vitest";
import { addressRecipients, reached } from "./recipients";

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
