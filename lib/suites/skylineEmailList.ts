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

export type EmailListEntry = { unitRef: string; emails: string[]; bad: string[] };

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

export function parseSkylineEmailList(rows: unknown[][]): EmailListEntry[] {
  const by = new Map<string, { order: number; emails: Map<string, string>; bad: Set<string> }>();
  rows.forEach((row, i) => {
    const unitRef = String(row[0] ?? "").trim().toUpperCase();
    if (!UNIT.test(unitRef) || unitRef.startsWith("2000-")) return;
    const text = row.slice(1).map((c) => String(c ?? "")).join(" ");
    const inside = [...text.matchAll(/<([^>]*)>/g)].map((m) => m[1]);
    if (!inside.length) return;
    const e = by.get(unitRef) ?? { order: i, emails: new Map<string, string>(), bad: new Set<string>() };
    for (const chunk of inside) {
      for (const raw of chunk.split(/[;,\s]+/)) {
        const s = raw.trim().replace(/^mailto:/i, "").replace(/[.;,]+$/, "");
        if (!s) continue;
        if (!s.includes("@")) { if (!/^\(?p\)?$|^[\d().-]+$|^see$|^main$|^record$/i.test(s)) e.bad.add(s); continue; }
        if (!EMAIL.test(s)) { e.bad.add(s); continue; }
        // Skyline Proper-Cases the main address ("Shears1999@Aol.Com");
        // addresses are case-blind in practice, so keep one lower-case copy.
        e.emails.set(s.toLowerCase(), s.toLowerCase());
      }
    }
    by.set(unitRef, e);
  });
  return [...by.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([unitRef, e]) => ({
      unitRef,
      emails: [...e.emails.values()],
      bad: [...e.bad],
    }))
    .filter((e) => e.emails.length || e.bad.length);
}
