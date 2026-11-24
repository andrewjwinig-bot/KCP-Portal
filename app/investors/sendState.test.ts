import { describe, it, expect } from "vitest";
import { sendState, sendStateTone } from "./sendState";

const AT = "2026-09-09T19:47:00.000Z";

describe("sendState", () => {
  it("reports a recorded send", () => {
    expect(sendState({ sentAt: AT, sendCount: 1 })).toBe("sent");
  });

  it("reports a link created but never emailed", () => {
    // The case the old "SHARED" pill hid: a link exists, nothing was sent.
    expect(sendState({ sentAt: null, sendCount: 0 })).toBe("link-only");
  });

  it("will NOT claim 'never emailed' for a link that predates tracking", () => {
    // Saying "never sent" about a K-1 that was sent is the worse error, so an
    // untracked link reports unknown instead.
    expect(sendState({ sentAt: null })).toBe("unknown");
    expect(sendState({ sentAt: null, sendCount: null })).toBe("unknown");
  });

  it("treats an opened link as sent even with no send record", () => {
    // They could only have opened it if it reached them.
    expect(sendState({ viewCount: 3 })).toBe("opened");
    expect(sendState({ viewCount: 1, sendCount: null })).toBe("opened");
  });

  it("prefers opened over sent when both are known", () => {
    expect(sendState({ viewCount: 2, sentAt: AT, sendCount: 1 })).toBe("opened");
  });
});

describe("sendStateTone", () => {
  it("is green only where something is known to have gone out", () => {
    expect(sendStateTone("sent")).toBe("green");
    expect(sendStateTone("opened")).toBe("green");
  });

  it("is amber for an unfinished link and neutral for unknown", () => {
    // Green on a link that was never emailed is exactly what made the old
    // pill misleading; grey is the honest colour for "we can't tell".
    expect(sendStateTone("link-only")).toBe("amber");
    expect(sendStateTone("unknown")).toBe("neutral");
  });
});
