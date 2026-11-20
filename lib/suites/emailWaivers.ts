// Tenants who need NO email on file (owner, 11/2026: "tesla is not a tenant
// and rite aid is in default so we dont need"). A rent-roll line can be
// something other than a tenant to write to — a charging station, a tenant in
// default whose mail goes through counsel — so Tenant Emails to Add lets a row
// be set aside. The waiver is for THAT tenant in that suite: when the roll
// names someone else there, the suite is asked about again.
//
// Pure decisions here; the store is in emailWaiverStore.ts.

export type EmailWaiver = { unitRef: string; tenant: string; reason: string; by: string | null; at: string };
export type EmailWaiverDoc = { waivers: EmailWaiver[]; /** unit refs whose SEEDED waiver was undone */ cleared: string[] };

/** Known from the start (owner): Tesla's charging stations are on the roll but
 *  are not a tenant; Rite Aid (7010-12311) is in default; the gym fees and
 *  Outfront Media's billboard are charges on the roll, not suites. Matched on
 *  the roll's name, or a suite named GYM. */
export const SEEDED_WAIVERS: { name: RegExp; reason: string }[] = [
  { name: /^tesla\b/i, reason: "Not a tenant" },
  { name: /^rite\s*aid\b/i, reason: "In default" },
  { name: /\bgym\b/i, reason: "Not a suite" },
  { name: /\bout\s*front\b/i, reason: "Not a suite" },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Why this suite's tenant needs no email, or null when it does. */
export function waiverFor(doc: EmailWaiverDoc, unitRef: string, tenant: string): string | null {
  const ref = unitRef.toUpperCase();
  const saved = doc.waivers.find((w) => w.unitRef.toUpperCase() === ref);
  if (saved) return norm(saved.tenant) === norm(tenant) ? saved.reason || "No email needed" : null;
  if (doc.cleared.some((c) => c.toUpperCase() === ref)) return null;
  if (/-GYM$/i.test(ref)) return "Not a suite";
  return SEEDED_WAIVERS.find((s) => s.name.test(tenant.trim()))?.reason ?? null;
}
