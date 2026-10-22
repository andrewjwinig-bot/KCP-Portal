// Email the "not posted to the GL" summary to the controller the moment a GL is
// imported, so Marie (cc Drew) immediately knows what's still missing without
// opening the portal. Deduped by content: re-importing the IDENTICAL statement
// won't resend, but any change to the missing set (e.g. after something is
// posted and re-imported) sends a fresh summary.

import "server-only";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { getJSON, storeJSON } from "@/lib/storage";
import crypto from "node:crypto";
import { significantNotPosted, type NotPostedSummary } from "./notPosted";

const TO = "mjaster@kormancommercial.com";
const CC = "dwinig@kormancommercial.com";
const FROM = "dwinig@kormancommercial.com"; // verified sender
const PREFIX = "not-posted-emailed";

function money0(n: number): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

export async function emailNotPostedSummary(
  np: NotPostedSummary,
  opts: { key: string; propertyName: string; year: number; importedBy?: string | null },
): Promise<{ sent: boolean; reason?: string }> {
  if (!np.items.length) return { sent: false, reason: "nothing-missing" };
  // Only alert on the big, easy-to-miss postings (management fees, insurance,
  // real estate taxes, debt service) — not routine monthly CAM lines briefly
  // reading $0, which would just be noise.
  const items = significantNotPosted(np.items);
  if (!items.length) return { sent: false, reason: "nothing-significant" };
  if (!isMailConfigured()) return { sent: false, reason: "mail-not-configured" };

  // Content signature — skip only an exact-duplicate re-send.
  const sig = crypto
    .createHash("sha1")
    .update(JSON.stringify({
      key: opts.key, year: opts.year,
      items: items.map((i) => `${i.period}|${i.section}|${i.line}|${i.type}|${Math.round(i.expected)}`).sort(),
    }))
    .digest("hex")
    .slice(0, 16);
  const id = `${opts.key}-${opts.year}`.replace(/[^0-9A-Za-z]+/g, "-") || "unknown";
  const prev = (await getJSON(PREFIX, id)) as { sig?: string } | null;
  if (prev?.sig === sig) return { sent: false, reason: "unchanged" };

  const monthLabel = items[0]?.monthLabel ?? "";
  const labelW = Math.max(0, ...items.map((i) => `${i.section} · ${i.line}`.length));
  const rows = items
    .map((i) => `  ${`${i.section} · ${i.line}`.padEnd(labelW)}   ${money0(i.expected).padStart(12)}${i.type === "missing-debt" ? "  (debt service)" : ""}`)
    .join("\n");
  const total = items.reduce((s, i) => s + (Number(i.expected) || 0), 0);

  const ok = await sendMail({
    to: TO,
    cc: CC,
    from: FROM,
    subject: `Not posted to the GL — ${opts.propertyName} ${monthLabel} ${opts.year} (${items.length})`,
    textBody:
      `${items.length} line${items.length === 1 ? "" : "s"} still not posted to the GL for ${opts.propertyName} (${monthLabel} ${opts.year})` +
      `${opts.importedBy ? `, from the GL just imported by ${opts.importedBy}` : ""}:\n\n` +
      `${rows}\n  ${"— expected total".padEnd(labelW)}   ${money0(total).padStart(12)}\n\n` +
      `These are budgeted or scheduled figures still reading $0 — post them or confirm they don't apply for this month.\n\n` +
      `— KCP Portal`,
  });
  if (ok) await storeJSON(PREFIX, id, { sig, sentAt: new Date().toISOString() });
  return { sent: ok };
}
