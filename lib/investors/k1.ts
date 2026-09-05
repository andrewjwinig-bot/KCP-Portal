// K-1 delivery — matching an uploaded K-1 PDF to the owner it belongs to.
//
// This is the part that must not be clever. A tenant statement sent to the
// wrong tenant is embarrassing; a K-1 sent to the wrong investor discloses
// someone's taxpayer ID, income allocation and capital account. So the matcher
// only ever *suggests*, a human confirms every file, and where the evidence is
// genuinely ambiguous it says so rather than picking.
//
// Ambiguity is not hypothetical here. Parkwood (7010) has 21 owner records and
// six of them share a name with another record — Alison Korman Feldman holds
// both a GST trust interest and a personal one. A filename carrying only
// "Feldman" cannot distinguish them, and guessing would put the trust's K-1 in
// the individual's hands. Only the vendor code or the trust name separates them.

import type { PropertyOwner } from "@/lib/properties/ownership";

export type K1MatchConfidence = "vendor-code" | "trust-name" | "name" | "ambiguous" | "none";

export type K1Match = {
  /** The owner we think this file belongs to — null when we won't guess. */
  ownerId: string | null;
  confidence: K1MatchConfidence;
  /** Owner ids the evidence can't separate. Non-empty only when ambiguous. */
  candidates: string[];
  /** Why, in words a person can check against the filename. */
  reason: string;
};

/** Lower-case, strip punctuation, collapse whitespace. */
export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

const tokens = (s: string) => normalize(s).split(" ").filter((t) => t.length > 1);

/** Words that appear in every filename and carry no identifying signal.
 *
 *  Note what is deliberately NOT here: the family surname. In a family
 *  partnership most owners are Kormans and some are not, so "Korman" is
 *  identifying, not noise. Treating it as noise collapsed "Lawrence M. Korman"
 *  to "lawrence" and made him collide with Lawrence Isard — a wrong-recipient
 *  bug of exactly the kind this module exists to prevent. Only the property and
 *  form boilerplate belongs in here. */
const NOISE = new Set([
  "k1", "k", "1", "schedule", "form", "1065", "federal", "state", "copy", "final",
  "pdf", "tax", "return", "partnership", "llc", "lp", "inc", "co", "company",
  "parkwood", "shopping", "center", "office", "building",
  "20", "19", "trust", "tr", "fbo", "irr", "gst", "tua", "uw", "ui",
]);

/** A filename's identifying tokens: numbers and boilerplate removed. */
export function signalTokens(filename: string): string[] {
  return tokens(filename.replace(/\.[a-z0-9]+$/i, ""))
    .filter((t) => !NOISE.has(t) && !/^\d+$/.test(t));
}

/**
 * Suggest the owner an uploaded K-1 belongs to.
 *
 * Evidence in descending strength:
 *   1. the owner's vendor code appears in the filename — unique by construction
 *   2. the owner's trust / detailed name matches distinctively
 *   3. the owner's plain name matches — but only when ONE owner bears it
 *
 * Anything weaker returns no suggestion. `candidates` carries the tie so the
 * page can show the person exactly what it couldn't separate.
 */
export function matchK1ToOwner(filename: string, owners: PropertyOwner[]): K1Match {
  const hay = normalize(filename);
  const sig = signalTokens(filename);
  const none = (reason: string): K1Match => ({ ownerId: null, confidence: "none", candidates: [], reason });
  if (owners.length === 0) return none("No owners on file for this property.");

  // 1 — vendor code. Matched on the raw haystack because codes like "TRU/3"
  // normalize to "tru 3"; a bare code is unique across the roster.
  const byCode = owners.filter((o) => {
    const code = normalize(o.vendorCode ?? "");
    return code.length >= 4 && hay.includes(code);
  });
  if (byCode.length === 1) {
    return { ownerId: byCode[0].id, confidence: "vendor-code", candidates: [], reason: `Vendor code ${byCode[0].vendorCode} appears in the filename.` };
  }
  if (byCode.length > 1) {
    return { ownerId: null, confidence: "ambiguous", candidates: byCode.map((o) => o.id), reason: "More than one vendor code matches this filename." };
  }

  // 2 — trust / detailed name. Requires every distinctive token of the trust
  // name to be present, which is what separates a GST trust from the person.
  const byTrust = owners.filter((o) => {
    const t = signalTokens(o.detailedName ?? "");
    return t.length >= 2 && t.every((x) => hay.includes(x));
  });
  if (byTrust.length === 1) {
    return { ownerId: byTrust[0].id, confidence: "trust-name", candidates: [], reason: `Matches "${byTrust[0].detailedName}".` };
  }
  if (byTrust.length > 1) {
    return { ownerId: null, confidence: "ambiguous", candidates: byTrust.map((o) => o.id), reason: "Several trust names match this filename." };
  }

  // 3 — plain name, only when the roster bears it once.
  const byName = owners.filter((o) => {
    const t = signalTokens(o.name);
    return t.length > 0 && t.every((x) => sig.includes(x));
  });
  if (byName.length === 1) {
    return { ownerId: byName[0].id, confidence: "name", candidates: [], reason: `Matches ${byName[0].name}.` };
  }
  if (byName.length > 1) {
    return {
      ownerId: null, confidence: "ambiguous", candidates: byName.map((o) => o.id),
      reason: `${byName.length} owners are named ${byName[0].name} — the filename can't tell them apart. Pick the right interest.`,
    };
  }
  return none("Nothing in the filename matches an owner. Assign it by hand.");
}

export type K1Status = "unassigned" | "suggested" | "confirmed";

export type K1Document = {
  id: string;
  /** Property whose partnership issued it, e.g. "7010". */
  propertyCode: string;
  taxYear: number;
  filename: string;
  size: number;
  /** Private storage pointer — never a public URL. */
  ref: string;
  local: boolean;
  uploadedAt: string;
  uploadedBy: string | null;
  /** Who it belongs to. Null until assigned. */
  ownerId: string | null;
  ownerName: string;
  match: K1Match;
  status: K1Status;
  confirmedAt: string | null;
  confirmedBy: string | null;
  /** Visible to the investor. Only ever set on a confirmed document. */
  published: boolean;
  publishedAt: string | null;
  /** Access trail — a K-1 is worth knowing the reads of. */
  views: { at: string; ip?: string }[];
  viewCount: number;
  lastViewedAt: string | null;
};

/**
 * The publish gate: every uploaded file must be confirmed against a named owner,
 * and no owner may hold two K-1s for the same year. Both failures mean somebody
 * is about to receive the wrong document.
 */
export function publishBlockers(docs: K1Document[]): string[] {
  const out: string[] = [];
  const unconfirmed = docs.filter((d) => d.status !== "confirmed");
  if (unconfirmed.length) {
    out.push(`${unconfirmed.length} ${unconfirmed.length === 1 ? "file is" : "files are"} not confirmed against an owner yet.`);
  }
  const byOwner = new Map<string, number>();
  for (const d of docs) if (d.ownerId) byOwner.set(d.ownerId, (byOwner.get(d.ownerId) ?? 0) + 1);
  const doubled = [...byOwner.entries()].filter(([, n]) => n > 1);
  for (const [ownerId, n] of doubled) {
    const name = docs.find((d) => d.ownerId === ownerId)?.ownerName ?? ownerId;
    out.push(`${name} has ${n} K-1s assigned for this year — only one can be right.`);
  }
  return out;
}
