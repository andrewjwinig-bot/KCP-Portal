// Shared shape for "this vendor never gets a 1099" — the client page needs the
// reason list and the record type, and the store that persists them is
// server-only, so the vocabulary lives here rather than being retyped.

/** Why a vendor gets no 1099. These track the real exemptions, so the reason is
 *  a note the accountant can check rather than a shrug. */
export const EXCLUSION_REASONS = [
  "Corporation",
  "Bank / financial",
  "Government / taxes",
  "Utility",
  "Insurance",
  "Internal transfer",
  "Employee / payroll",
  "Other",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export type VendorExclusion = {
  /** The spelling it was marked under, for display. */
  name: string;
  reason: ExclusionReason;
  by: string | null;
  at: string;
};

export function isReason(v: unknown): v is ExclusionReason {
  return typeof v === "string" && (EXCLUSION_REASONS as readonly string[]).includes(v);
}
