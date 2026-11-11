// THE portal's abbreviations — one list, so a short form reads the same on
// every page (owner: "abbreviate Year to Date as YTD to prevent wrapping … NOI,
// Bud Ann … Maint. … Op Ex … TI … LC"). Used where space is tight: column
// headers, tile labels, a statement's line column on a narrow window. A title,
// a section heading in full view and every hover keep the full name.
//
// Order matters: a longer phrase goes before a shorter one inside it
// ("Outside Leasing Commissions" before "Leasing Commissions").
export const ABBREVIATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\byear[ -]to[ -]date\b/gi, "YTD"],
  [/\bnet operating income\b/gi, "NOI"],
  [/\bcommon area maintenance\b/gi, "CAM"],
  [/\boperating expenses?\b/gi, "Op Ex"],
  [/\btenant improvements?\b/gi, "TI"],
  [/\bleasing commissions?\b/gi, "LC"],
  [/\bgeneral (?:&|and) administrative\b/gi, "G&A"],
  [/\breal estate tax(?:es)?\b/gi, "RE Taxes"],
  [/\bannual budget\b/gi, "Ann. Bud"],
  [/\breprojection\b/gi, "Reproj"],
  [/\breprojected\b/gi, "Reproj."],
  [/\brevenues?\b/gi, "Rev."],
  [/\btotal\b/gi, "TTL"],
  [/\bvariance\b/gi, "Var"],
  [/\breimburs(?:ements?|able)\b/gi, "Reimb."],
  [/\bmaintenance\b/gi, "Maint."],
  [/\badministrative\b/gi, "Admin"],
  [/\bsquare (?:feet|foot)\b/gi, "SF"],
  [/\baverage\b/gi, "Avg"],
  [/\bdebt service\b/gi, "Debt Svc"],
  [/\band\b/gi, "&"],
];

/** `text` with every abbreviation applied, keeping UPPERCASE text uppercase. */
export function abbrev(text: string): string {
  let out = text;
  for (const [re, short] of ABBREVIATIONS) {
    out = out.replace(re, (m) => (m === m.toUpperCase() && /[A-Z]/.test(m) ? short.toUpperCase() : short));
  }
  return out;
}
