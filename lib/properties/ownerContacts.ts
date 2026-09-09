// Contact details (mailing address, email, notes) for the beneficial owners who
// receive Statement of Values documents. Sourced from the Ownership trustee
// workbook (Hyman Korman Co. beneficial-owner sheet + Trustee Directory).
//
// Keyed by the normalized Statement-of-Values beneficiary name (see
// beneficiaries.ts) so the owner statement can attach a send-to block. Not every
// beneficiary has contact info yet — the statement simply omits the block when
// absent.

export interface OwnerContact {
  /** Display name as recorded on the contact source. */
  name: string;
  /** Mailing address (may include "c/o …"), single line. */
  address?: string;
  /** The investor's own address — the one a statement is addressed to. */
  email?: string;
  /**
   * Anyone else who should receive what this investor receives — an
   * accountant, a manager, a trustee. Every one of them gets the same email,
   * so adding an address here lets that person open this investor's K-1.
   * Deliberate and visible: the send confirms the full list first.
   */
  alsoEmail?: string[];
  phone?: string;
  notes?: string;
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const CONTACTS: Record<string, OwnerContact> = {
  "joan sohn": { name: "Joan R. Sohn", address: "110 Bloor St. West, Apt. 1903, Toronto, Ontario M5S 2W7, Canada", email: "joanrsohn@gmail.com" },
  "steven korman": { name: "Steven H. Korman", address: "580 W. Germantown Pike #200, Plymouth Meeting, PA 19462", email: "skorman@kormancommunities.com" },
  "judith langsfeld": { name: "Judith K. Langsfeld", address: "c/o Mark Langsfeld, 1085 Herkness Drive, Meadowbrook, PA 19046", email: "langsfeld@gmail.com" },
  "lynne honickman": { name: "Lynne Honickman", address: "c/o Eric D. Pisauro, 8275 N. Crescent Blvd., Pennsauken, NJ 08110", email: "PisauroE@hongrp.com" },
  "john korman": { name: "John P. Korman", address: "c/o Korman Residential, 410 Lancaster Avenue, Suite 5A, Haverford, PA 19041", email: "john@livekorman.com" },
  "james korman": { name: "James S. Korman", address: "c/o Korman Residential, 410 Lancaster Avenue, Suite 5A, Haverford, PA 19041", email: "james@kormanventures.com" },
  "carolyn jacobs": { name: "Carolyn Korman Jacobs", address: "6114 Butler Pike, Blue Bell, PA 19422", email: "TheSuiteQueen@aol.com" },
  "alison korman feldman": { name: "Alison Korman Feldman", address: "6015 Sheaff Lane, Fort Washington, PA 19034", email: "akorman@kormancommercial.com" },
  "catherine altman": { name: "Catherine K. Altman", address: "241 S. 6th Street, Apt. 1807, Philadelphia, PA 19106", email: "ckaltman@comcast.net" },
  "susan schurr": { name: "Susan Schurr", address: "6100 Sheaff Lane, Fort Washington, PA 19034", email: "susan.schurr@gmail.com" },
  "mark langsfeld": { name: "Mark Langsfeld", address: "1085 Herkness Drive, Meadowbrook, PA 19046", email: "langsfeld@gmail.com" },
  "elizabeth langsfeld": { name: "Elizabeth Langsfeld", address: "Bethesda, MD", email: "elangsfeld@yahoo.com" },
  // Berton E. Korman TUA variants share the trust's address (no email on file).
  "berton e korman tua as amended": { name: "Berton E. Korman TUA", address: "6114 Butler Pike, Blue Bell, PA 19422" },
  "berton e korman tua dtd 02232018": { name: "Berton E. Korman TUA", address: "6114 Butler Pike, Blue Bell, PA 19422" },
  "berton korman": { name: "Berton E. Korman", address: "6114 Butler Pike, Blue Bell, PA 19422" },
};

/** Contact details for a Statement-of-Values beneficiary, if on file. */
export function ownerContact(beneficiary: string): OwnerContact | undefined {
  return ownerContactExact(beneficiary) ?? CONTACTS[SHORT_INDEX.get(shortKey(beneficiary)) ?? ""];
}

/**
 * The name as recorded, with no reduction. Callers that must REPORT how an
 * address was found use this for the confident answer and fall back to
 * `ownerContact` for the relaxed one — a K-1 send says which it got.
 */
export function ownerContactExact(beneficiary: string): OwnerContact | undefined {
  return CONTACTS[normKey(beneficiary)];
}

/**
 * First + last word, punctuation and single letters dropped, so the two naming
 * systems meet: this file is keyed by the Statement-of-Values beneficiary name
 * ("CAROLYN JACOBS") while the ownership roster — and therefore Investor Info —
 * uses the fuller legal name ("Carolyn Korman Jacobs"). Without this the hub
 * offered "+ Add contact info" for people whose details were already on file.
 */
export function shortKey(name: string): string {
  const parts = normKey(name).replace(/[.,]/g, "").split(" ").filter((w) => w.length > 1);
  if (parts.length < 2) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/**
 * Short key → the one contact key it identifies. Built once, and a short key
 * reached by TWO different contacts is dropped rather than resolved to either:
 * these addresses decide where a K-1 link is mailed, so an ambiguous name must
 * identify nobody. Same standard as `resolveOwnerEmail`.
 */
const SHORT_INDEX: Map<string, string> = (() => {
  const byShort = new Map<string, Set<string>>();
  for (const key of Object.keys(CONTACTS)) {
    const k = shortKey(key);
    if (!k) continue;
    const set = byShort.get(k) ?? new Set<string>();
    set.add(key);
    byShort.set(k, set);
  }
  const out = new Map<string, string>();
  for (const [k, keys] of byShort) if (keys.size === 1) out.set(k, [...keys][0]);
  return out;
})();
