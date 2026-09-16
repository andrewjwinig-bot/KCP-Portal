import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(process.cwd(), "app/api/investor-k1/share/route.ts"), "utf8");
const card = readFileSync(join(process.cwd(), "app/components/ShareLinkCard.tsx"), "utf8");
const hook = readFileSync(join(process.cwd(), "app/investors/useK1.ts"), "utf8");

/**
 * A send releases the WHOLE PERSON, not the partnership it was sent from.
 *
 * Scoped to one partnership, an investor in fifteen of them opened their link
 * and saw the single K-1 that happened to be sent last — the other fourteen
 * uploaded, covered by the link, and invisible. That is the one-link promise
 * broken exactly where it is felt.
 */
describe("a K-1 send releases every K-1 the investor holds that year", () => {
  it("publishes over the person's whole group, not one property's owners", () => {
    expect(route).toContain("group.map((o) => k1sForOwner(o.id))");
    // The old narrowing — owners filtered down to the property sent from.
    expect(route).not.toContain("const inScope = new Set(");
  });

  it("the PREVIEW uses the same scope as the send", () => {
    // A preview narrower than the send would understate what is about to
    // become readable, which is the one thing the confirm exists to prevent.
    expect(route.match(/group\.map\(\(o\) => k1sForOwner\(o\.id\)\)/g) ?? []).toHaveLength(2);
  });

  it("still computes what a send releases, over the scope it publishes", () => {
    // The confirm no longer LISTS the partnerships — the owner asked for it
    // out, and in practice it ran to eleven names on one line for an investor
    // holding eleven interests, pushing the message itself off the screen.
    // What it releases is still computed over exactly the scope the send
    // publishes and still returned by the draft endpoint, so the fact is
    // recoverable rather than gone: this is a decision about how much a
    // confirm should say, not about the send being allowed to widen quietly.
    expect(route).toContain("const releases =");
    expect(hook).toContain("releases: j.releases ?? []");
  });
});

/**
 * Sending to ONE of several contacts.
 *
 * An investor nominates an accountant, and often the reason is that the
 * accountant is the one who needs this copy. The confirm listed every address
 * and sent to all of them — "send it to just my accountant" meant mailing the
 * investor their own tax document too.
 */
describe("a send can be narrowed to some of an investor's contacts", () => {
  it("filters the pick against the owner's own record, never mails from it", () => {
    // The security property, same reasoning as deriving the person group
    // server-side: a client-supplied address must not become a way to mail a
    // K-1 link anywhere. `selectRecipients` takes the addresses ON FILE and
    // keeps the ticked ones, so a pick can only ever narrow.
    expect(route).toContain("selectRecipients(email, resolved.alsoEmail, only)");
    // …and it must run BEFORE addressing, or the To/Cc split would be built
    // from people who aren't being sent to.
    expect(route.indexOf("selectRecipients(email")).toBeLessThan(route.indexOf("addressRecipients(picked"));
    expect(route).toContain("addressRecipients(picked.primary, picked.secondary");
  });

  it("treats an empty pick as a real choice, not as unset", () => {
    // `only: []` must reach nobody. Read as "unset" it would mail everyone
    // precisely when staff had chosen to mail no one.
    expect(route).toContain("Array.isArray(body?.only)");
    expect(route).toContain("No recipients were selected");
  });

  it("ignores a pick on a real batch — one address list cannot describe many owners", () => {
    // Applied across a batch it would match almost nobody's record and send
    // silently to no one. Honoured only for a batch of one, which is the path
    // the single-investor card posts through.
    expect(route).toContain("const pickOnly = ids.length === 1 ? only : undefined;");
  });

  it("records a narrowed send as narrowed, so an omission is not a gap", () => {
    // "emailed accountant@…" alone reads like the investor's address is
    // missing. The audit line says it was 1 of 2 on file.
    expect(route).toContain("on file)");
  });

  it("carries the pick from the confirm through to the request", () => {
    // Ticked by default and held as EXCLUSIONS, so a recipient list that
    // arrives late is included rather than silently dropped.
    expect(card).toContain("const picked = recipients.filter((r) => !excluded.has(r));");
    expect(card).toContain("{ ccSecondary, only: picked }");
    // The Send button follows the SELECTION, not merely whether the investor
    // has any address at all.
    expect(card).toContain("picked.length === 0 || (!!loadDraft");
    // Both send paths post it, or the By Investor card and the property card
    // would behave differently.
    expect(hook.match(/only: opts\?\.only/g)?.length).toBe(2);
  });
});
