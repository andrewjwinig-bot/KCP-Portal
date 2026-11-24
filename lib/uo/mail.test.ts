import { afterEach, describe, expect, it, vi } from "vitest";
const { sent } = vi.hoisted(() => ({ sent: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/mail", () => ({ sendMailDetailed: sent, VERIFIED_FROM: "x@y" }));
import { sendMailDetailed, UO_PAUSED_MESSAGE, uoEmailsPaused } from "./mail";

const msg = { to: "a@b", from: "x@y", subject: "s", htmlBody: "h", textBody: "t" };
afterEach(() => { delete process.env.UO_EMAILS_LIVE; sent.mockClear(); });

describe("U&O emails pause", () => {
  it("sends nothing until UO_EMAILS_LIVE=1, and reports not sent", async () => {
    expect(uoEmailsPaused()).toBe(true);
    const r = await sendMailDetailed(msg);
    expect(r).toEqual({ ok: false, error: UO_PAUSED_MESSAGE });
    expect(sent).not.toHaveBeenCalled();
  });
  it("sends once switched on", async () => {
    process.env.UO_EMAILS_LIVE = "1";
    expect((await sendMailDetailed(msg)).ok).toBe(true);
    expect(sent).toHaveBeenCalledOnce();
  });
});
