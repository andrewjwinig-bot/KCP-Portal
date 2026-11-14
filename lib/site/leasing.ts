// The Neshaminy Interplex Business Center website's leasing inquiry form. The
// handoff only built a copyable summary; it now posts to /api/website/leasing
// (honeypot + per-IP rate limit, as the tour and Contact forms), which emails
// Nancy Fox. Pure, so it is tested alone.

import { tourRecipients } from "./tour";

export type LeasingValue = {
  size: string; building: string; name: string; company: string;
  email: string; phone: string; notes: string;
};
export type LeasingCheck =
  | { ok: true; spam: boolean; value: LeasingValue }
  | { ok: false; error: string };

/** Nancy Fox answers the business park's leasing inquiries, as she does The
 *  Office Works' tours. INTERPLEX_LEASING_TO (comma-separated) overrides. */
export const leasingRecipients = (env: string | undefined = process.env.INTERPLEX_LEASING_TO) => tourRecipients(env);

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function checkLeasing(body: Record<string, unknown>): LeasingCheck {
  const value: LeasingValue = {
    size: clean(body.size, 80),
    building: clean(body.building, 80),
    name: clean(body.name, 200),
    company: clean(body.company, 200),
    email: clean(body.email, 200),
    phone: clean(body.phone, 60),
    notes: clean(body.notes, 4000),
  };
  if (clean(body.website, 200)) return { ok: true, spam: true, value };
  if (!value.name) return { ok: false, error: "Please enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email)) return { ok: false, error: "Please enter a valid email address." };
  return { ok: true, spam: false, value };
}

export function leasingEmailText(v: LeasingValue): string {
  return [
    "Leasing inquiry from the Neshaminy Interplex Business Center website.",
    "",
    `Space needed:  ${v.size || "Not given"}`,
    `Building:      ${v.building || "No preference"}`,
    "",
    `Name:     ${v.name}`,
    ...(v.company ? [`Company:  ${v.company}`] : []),
    `Email:    ${v.email}`,
    ...(v.phone ? [`Phone:    ${v.phone}`] : []),
    ...(v.notes ? ["", "Notes:", v.notes] : []),
  ].join("\n");
}
