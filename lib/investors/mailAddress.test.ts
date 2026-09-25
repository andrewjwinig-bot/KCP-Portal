import { describe, it, expect } from "vitest";
import { formatAddress, formatAddressList, nameFor, pruneNames } from "./mailAddress";

describe("formatAddress — naming a recipient in a mail header", () => {
  it("names the recipient when we know who they are", () => {
    expect(formatAddress("c@x.com", "Claire Borgmann")).toBe('"Claire Borgmann" <c@x.com>');
  });

  it("falls back to the bare address, which is what actually delivers", () => {
    expect(formatAddress("c@x.com")).toBe("c@x.com");
    expect(formatAddress("c@x.com", "")).toBe("c@x.com");
    expect(formatAddress("c@x.com", "   ")).toBe("c@x.com");
  });

  it("quotes a name containing a comma, so a joined header cannot split on it", () => {
    // "Borgmann, Claire" unquoted would read as TWO recipients, and the second
    // would be an invalid address — the whole send fails, or worse, silently
    // drops someone.
    expect(formatAddress("c@x.com", "Borgmann, Claire")).toBe('"Borgmann, Claire" <c@x.com>');
    expect(formatAddressList(["a@x.com", "c@x.com"], { "c@x.com": "Borgmann, Claire" }))
      .toBe('a@x.com, "Borgmann, Claire" <c@x.com>');
  });

  it("escapes quotes and backslashes inside the name", () => {
    expect(formatAddress("c@x.com", 'Claire "CB" Borgmann')).toBe('"Claire \\"CB\\" Borgmann" <c@x.com>');
    expect(formatAddress("c@x.com", "A\\B")).toBe('"A\\\\B" <c@x.com>');
  });

  it("strips CR and LF, which would otherwise inject a header", () => {
    // A header value is newline-delimited: a name carrying one lets whatever
    // follows become a header of its own (a Bcc, a different Reply-To).
    expect(formatAddress("c@x.com", "Claire\r\nBcc: attacker@evil.com"))
      .toBe('"Claire Bcc: attacker@evil.com" <c@x.com>');
    expect(formatAddress("c@x.com", "Claire\nBorgmann")).toBe('"Claire Borgmann" <c@x.com>');
  });

  it("drops an empty address rather than emitting a nameless bracket pair", () => {
    expect(formatAddress("", "Claire")).toBe("");
    expect(formatAddressList(["", "a@x.com"], undefined)).toBe("a@x.com");
  });
});

describe("nameFor / pruneNames", () => {
  const names = { "c@x.com": "Claire Borgmann" };

  it("looks a name up regardless of how the address was cased or padded", () => {
    expect(nameFor("C@X.com", names)).toBe("Claire Borgmann");
    expect(nameFor("  c@x.com ", names)).toBe("Claire Borgmann");
    expect(nameFor("other@x.com", names)).toBeNull();
    expect(nameFor("c@x.com", undefined)).toBeNull();
  });

  it("drops a name whose address is no longer a recipient", () => {
    // Otherwise removing an accountant and adding a different one would leave
    // the first one's name sitting on the second one's address.
    expect(pruneNames(["c@x.com"], names)).toEqual({ "c@x.com": "Claire Borgmann" });
    expect(pruneNames(["someone@else.com"], names)).toEqual({});
    expect(pruneNames([], names)).toEqual({});
  });

  it("normalises keys on the way in, so a re-cased address still matches", () => {
    expect(pruneNames(["c@x.com"], { "C@X.COM": " Claire Borgmann " })).toEqual({ "c@x.com": "Claire Borgmann" });
  });

  it("drops a blank name rather than storing an empty label", () => {
    expect(pruneNames(["c@x.com"], { "c@x.com": "   " })).toEqual({});
  });
});
