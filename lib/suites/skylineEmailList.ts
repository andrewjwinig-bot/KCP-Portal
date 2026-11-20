// SKYLINE'S "EMAIL LIST" REPORT → the unit pages' Contacts (owner, 11/2026:
// "i was able to pull this email list for all our tenants … review and
// populate"). Skyline's occupant email report (it copies the addresses to the
// clipboard for a BCC) exports as a .xls: the unit ref in column A, the
// addresses as "<a@b.com>;" further along the row, one row per address kind
// (the General tab's main address, Correspondence, Other Billing), the main
// one prefixed by the occupant's name and Skyline's Proper-Cased spelling.
//
// Pure: rows in, one entry per unit out — every distinct address, cleaned
// (a cell can hold "a@x.com;b@x.com", a phone after the address, or "See Main
// Record"). The intercompany "tenants" of 2000 (our own entities) are left
// out; anything not on the current rent roll is the route's to refuse.

export type SkylineTag = "general" | "correspondence" | "billing";
export const SKYLINE_TAG_LABEL: Record<SkylineTag, string> = {
  general: "General", correspondence: "Correspondence", billing: "Other Billing",
};
const TAG_ORDER: SkylineTag[] = ["general", "correspondence", "billing"];

/** Skyline's palette colours on the report: black (8, or 0x7FFF "automatic")
 *  is the General tab's address, blue (12) Correspondence, green (17) Other
 *  Billing. */
export function tagOfColor(ci: number | undefined): SkylineTag | null {
  if (ci === 8 || ci === 0x7fff) return "general";
  if (ci === 12) return "correspondence";
  if (ci === 17) return "billing";
  return null;
}

/** One entry per suite; each address ONCE, carrying every kind Skyline lists
 *  it under (owner: "if its the same email for all … add multiple tags to the
 *  one email address"). */
export type EmailListEntry = {
  unitRef: string;
  emails: string[];
  tagged: { email: string; tags: SkylineTag[] }[];
  bad: string[];
};

const EMAIL = /^[^\s@<>;,]+@[^\s@<>;,]+\.[a-z]{2,}$/i;
const UNIT = /^[0-9A-Z]{3,6}-[0-9A-Z]+$/i;

/** Is this sheet Skyline's Email List (rather than our fill-in sheet)? */
export function isSkylineEmailList(rows: unknown[][]): boolean {
  const head = rows.slice(0, 12).map((r) => r.join(" ")).join(" ").toLowerCase();
  if (head.includes("email addresses listed below") || head.includes("correspondance email")) return true;
  let hits = 0;
  for (const r of rows.slice(0, 200)) if (UNIT.test(String(r[0] ?? "").trim()) && /<[^>]+@[^>]+>/.test(r.slice(1).join(" "))) hits++;
  return hits >= 3;
}

/** `colorAt(rowIndex, colIndex)` gives a cell's font colour (xlsFontColors);
 *  without it a row whose address follows the occupant's name is read as
 *  General (that is how the report prints the main address) and the rest go
 *  untagged. */
export function parseSkylineEmailList(
  rows: unknown[][],
  colorAt?: (row: number, col: number) => number | undefined,
): EmailListEntry[] {
  const by = new Map<string, { order: number; emails: Map<string, Set<SkylineTag>>; bad: Set<string> }>();
  rows.forEach((row, i) => {
    const unitRef = String(row[0] ?? "").trim().toUpperCase();
    if (!UNIT.test(unitRef) || unitRef.startsWith("2000-")) return;
    const col = row.findIndex((c, j) => j > 0 && /<[^>]*>/.test(String(c ?? "")));
    if (col < 0) return;
    const text = String(row[col] ?? "");
    const inside = [...text.matchAll(/<([^>]*)>/g)].map((m) => m[1]);
    const tag = colorAt ? tagOfColor(colorAt(i, col)) : (/^\s*</.test(text) ? null : "general");
    const e = by.get(unitRef) ?? { order: i, emails: new Map<string, Set<SkylineTag>>(), bad: new Set<string>() };
    for (const chunk of inside) {
      for (const raw of chunk.split(/[;,\s]+/)) {
        const s = raw.trim().replace(/^mailto:/i, "").replace(/[.;,]+$/, "");
        if (!s) continue;
        if (!s.includes("@")) { if (!/^\(?p\)?$|^[\d().-]+$|^see$|^main$|^record$/i.test(s)) e.bad.add(s); continue; }
        if (!EMAIL.test(s)) { e.bad.add(s); continue; }
        // Skyline Proper-Cases the main address ("Shears1999@Aol.Com");
        // addresses are case-blind in practice, so keep one lower-case copy.
        const k = s.toLowerCase();
        const tags = e.emails.get(k) ?? new Set<SkylineTag>();
        if (tag) tags.add(tag);
        e.emails.set(k, tags);
      }
    }
    by.set(unitRef, e);
  });
  return [...by.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([unitRef, e]) => ({
      unitRef,
      emails: [...e.emails.keys()],
      tagged: [...e.emails.entries()].map(([email, t]) => ({ email, tags: TAG_ORDER.filter((x) => t.has(x)) })),
      bad: [...e.bad],
    }))
    .filter((e) => e.emails.length || e.bad.length);
}
