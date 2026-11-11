// A Detailed General Ledger run for MANY properties at once — Skyline's "PALL"
// property list (owner: "could I import all the detail general ledgers in one
// file … rather than running each property individually?").
//
// The export is one property after another, each running its accounts from
// 0110-0000 up, but Crystal prints the "Property/Company : …" header ONCE, on
// the first page: every later property is just the next run of accounts. The
// same quirk as the Credit Balance report (`resolveAgingProperties`). So:
//
//   1. SPLIT where the account number goes back down (a new property starts).
//   2. IDENTIFY each section by EVIDENCE, never by position:
//      - its opening balances against the month-end balances the portal already
//        holds for each property (`balanceFingerprint`) — to the cent, across
//        every account, which no two properties share;
//      - the codes in its own activity (`activityCodes`): unit refs on the
//        charges ("RNT to 3610-101"), and our own invoice numbers
//        (PR / AE / TU / CC + property + MMYY);
//      - the first section only: the header Crystal did print.
//      Evidence that disagrees, or two sections claiming one property, leaves
//      the section UNPLACED and says so — never a guess.
//   3. Each placed section becomes a single-property GL (the original preamble
//      with its Property/Company line rewritten), so it goes through exactly
//      the import a one-property file does.
//
// Pure (no I/O); pinned by `pallSplit.test.ts`.

type Cell = string | number | boolean | Date | null | undefined;
export type Row = Cell[];

const ACCOUNT_RE = /^\d{4}-\d{4}$/;
const INVOICE_WEIGHT = 5;
const PROPERTY_LINE_RE = /Property\/Company\s*:/;

/** The account a row opens (its header row), else null. */
function accountOf(row: Row): string | null {
  for (let c = 0; c < Math.min(row.length, 4); c++) {
    const v = row[c];
    if (typeof v === "string" && ACCOUNT_RE.test(v.trim())) return v.trim();
  }
  return null;
}

export type PallSection = {
  /** 0-based position in the file. */
  index: number;
  /** Row the section's first account opens on (for the import report). */
  firstRow: number;
  /** The section's own rows (no preamble). */
  rows: Row[];
  /** Accounts the section lists. */
  accounts: number;
};

export type PallSplit = { preamble: Row[]; sections: PallSection[] };

/** Cut a GL into its property sections. One section = a normal single-property
 *  file; two or more = a multi-property export. */
export function splitPall(rows: Row[]): PallSplit {
  const firstAcct = rows.findIndex((r) => accountOf(r) !== null);
  if (firstAcct < 0) return { preamble: rows, sections: [] };
  const preamble = rows.slice(0, firstAcct);
  const starts: number[] = [];
  let prev = "";
  for (let i = firstAcct; i < rows.length; i++) {
    const a = accountOf(rows[i]);
    if (!a) continue;
    if (!starts.length || a < prev) starts.push(i);
    prev = a;
  }
  const sections = starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : rows.length;
    const body = rows.slice(s, end);
    return { index: k, firstRow: s, rows: body, accounts: body.filter((r) => accountOf(r) !== null).length };
  });
  return { preamble, sections };
}

/** The code the file's one printed header names ("0300"), else null. */
export function headerCode(preamble: Row[]): string | null {
  for (const r of preamble) for (const v of r) {
    if (typeof v !== "string" || !PROPERTY_LINE_RE.test(v)) continue;
    const m = v.match(/Property\/Company\s*:\s*([A-Za-z0-9]+)/);
    if (m) return m[1];
  }
  return null;
}

/** A section as a single-property file: the preamble with its Property/Company
 *  line naming THIS property, then the section's rows. */
export function sectionAsFile(preamble: Row[], section: PallSection, code: string, name: string): Row[] {
  const head = preamble.map((r) => r.map((v) => (typeof v === "string" && PROPERTY_LINE_RE.test(v) ? `Property/Company : ${code} - ${name}` : v)));
  return [...head, ...section.rows];
}

/** Property codes a section's own activity names, with how often: unit refs on
 *  its charges ("RNT to 3610-101", "40A0-A") and our invoice numbers
 *  ("PR080009262", "AE45000726"). An account number ("0110-0000") is not one. */
export function activityCodes(rows: Row[]): Map<string, number> {
  const out = new Map<string, number>();
  const add = (c: string) => out.set(c, (out.get(c) ?? 0) + 1);
  for (const r of rows) {
    for (const v of r) {
      if (typeof v !== "string") continue;
      const unit = /\b(\d{4}|\d{2}[A-C]0)-([A-Z0-9]{1,6})\b/g;
      let m: RegExpExecArray | null;
      while ((m = unit.exec(v))) {
        if (/^\d{4}$/.test(m[2])) continue;           // an account number, not a suite
        add(m[1]);
      }
      // Our own invoice number is billed TO this property — it outweighs a
      // suite ref, which can name a landlord (2010 pays rent on 4080-400).
      const inv = v.trim().match(/^(?:PR|AE|TU|CC)(\d{2}[0-9A-C]0)\d{4}/);
      if (inv) for (let k = 0; k < INVOICE_WEIGHT; k++) add(inv[1]);
    }
  }
  return out;
}

/** Account → balance at the END of `throughMonth` (0 = the year's opening),
 *  from a stored GL: its opening plus its monthly nets. */
export function balancesThrough(gl: { beginning?: Record<string, number>; monthly: Record<string, number[]> }, throughMonth: number): Record<string, number> {
  const out: Record<string, number> = {};
  const accts = new Set([...Object.keys(gl.beginning ?? {}), ...Object.keys(gl.monthly)]);
  for (const a of accts) {
    let v = gl.beginning?.[a] ?? 0;
    const m = gl.monthly[a];
    if (m) for (let i = 0; i < throughMonth; i++) v += m[i] ?? 0;
    out[a] = Math.round(v * 100) / 100;
  }
  return out;
}

/** How a section's opening balances compare with a property's month-end ones:
 *  accounts carrying a balance ($1+) on either side that both list, and how
 *  many agree to the cent. */
export function balanceFingerprint(opening: Record<string, number>, stored: Record<string, number>): { compared: number; matched: number } {
  let compared = 0, matched = 0;
  for (const [a, v] of Object.entries(opening)) {
    if (!(a in stored)) continue;
    const s = stored[a];
    if (Math.abs(v) < 1 && Math.abs(s) < 1) continue;
    compared++;
    if (Math.abs(v - s) < 0.011) matched++;
  }
  return { compared, matched };
}

export type Placement = {
  index: number;
  key: string | null;
  /** What placed it — or, unplaced, why not. */
  how: "balances" | "activity" | "header" | null;
  note: string;
};

export type SectionEvidence = {
  index: number;
  /** Opening balances the section printed. */
  opening: Record<string, number>;
  activity: Map<string, number>;
};

/**
 * Place each section. `candidates` = every statement key with the balances the
 * portal holds for it at the month before the file starts (null = no GL on file,
 * so only activity can place it). `resolve` maps a code to a statement key.
 */
export function placeSections(
  sections: SectionEvidence[],
  candidates: { key: string; balances: Record<string, number> | null }[],
  resolve: (code: string) => string | null,
  firstHeader: string | null,
): Placement[] {
  const out: Placement[] = sections.map((s) => {
    // Balances: the candidate that agrees on the most accounts, if it is
    // decisive (most of what it could compare, ≥2 accounts, and clearly ahead).
    const scored = candidates
      .filter((c) => c.balances)
      .map((c) => ({ key: c.key, ...balanceFingerprint(s.opening, c.balances!) }))
      .sort((a, b) => b.matched - a.matched);
    const [best, second] = scored;
    const byBalance = best && best.matched >= 2 && best.matched >= best.compared * 0.8 && (!second || second.matched * 2 <= best.matched) ? best : null;

    // Activity: the code its own charges and invoices name most, if decisive.
    const codes = [...s.activity].map(([c, n]) => ({ key: resolve(c), n })).filter((x): x is { key: string; n: number } => !!x.key);
    const tally = new Map<string, number>();
    for (const c of codes) tally.set(c.key, (tally.get(c.key) ?? 0) + c.n);
    const ranked = [...tally].sort((a, b) => b[1] - a[1]);
    const byActivity = ranked[0] && ranked[0][1] >= 3 && (!ranked[1] || ranked[1][1] * 2 <= ranked[0][1]) ? ranked[0][0] : null;

    const byHeader = s.index === 0 && firstHeader ? resolve(firstHeader) : null;

    // Balances to the cent are near-proof and win over activity; the printed
    // header is proof too, so the two must agree. Activity alone places a
    // section only when nothing else speaks.
    const strong = [byBalance?.key, byHeader].filter((k): k is string => !!k);
    if (new Set(strong).size > 1) {
      return { index: s.index, key: null, how: null, note: `the evidence disagrees (${[...new Set(strong)].join(" / ")})` };
    }
    const key = strong[0] ?? byActivity;
    if (!key) {
      const note = s.index === 0 && firstHeader && !byHeader ? `the header names ${firstHeader}, which has no operating statement` : "nothing in it names the property";
      return { index: s.index, key: null, how: null, note };
    }
    // Its charges can name a neighbour (a parent paying a subsidiary's card
    // bill). Where the portal holds that property's balances and they plainly
    // do not match, the charges are not enough.
    if (!byBalance && !byHeader) {
      const fp = scored.find((c) => c.key === key);
      if (fp && fp.compared >= 2 && fp.matched < fp.compared * 0.5) {
        return { index: s.index, key: null, how: null, note: `its charges name ${key}, but its balances do not match ${key}'s` };
      }
    }
    if (!byBalance && byHeader && byActivity && byActivity !== byHeader) {
      return { index: s.index, key: null, how: null, note: `the evidence disagrees (${byHeader} / ${byActivity})` };
    }
    const how = byBalance ? "balances" : byHeader ? "header" : "activity";
    const note = byBalance
      ? `opening balances match ${byBalance.matched} of ${byBalance.compared} accounts`
      : how === "header" ? "named in the report header" : `its charges name ${key} ${tally.get(key)} times`;
    return { index: s.index, key, how, note };
  });

  // One property, one section. Two sections claiming one property: if exactly
  // one of them is placed by its BALANCES it keeps it (the other only named it
  // in its charges — 2000's G&A ledger names the properties it bills);
  // otherwise neither is placed.
  const byKey = new Map<string, Placement[]>();
  for (const p of out) if (p.key) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);
  const first = out.map((p) => {
    const rivals = p.key ? byKey.get(p.key)! : [];
    if (rivals.length <= 1) return p;
    const proven = rivals.filter((r) => r.how === "balances");
    if (proven.length === 1 && proven[0] === p) return p;
    return { ...p, key: null, how: null, note: `two sections look like ${p.key}` };
  });

  // Second pass, over what is left: a section whose balances agree with ONE
  // property nobody else took. The first pass asks for 2+ accounts and 80% —
  // a quiet property (one cash account) or a busy clearing ledger with a few
  // late postings to the prior month fell short and went unplaced, though no
  // other property came close (2000 and 9860, October 2026).
  const taken = new Set(first.filter((p) => p.key).map((p) => p.key!));
  const second = first.map((p) => {
    if (p.key) return p;
    const s = sections.find((x) => x.index === p.index)!;
    const scored = candidates
      .filter((c) => c.balances && !taken.has(c.key))
      .map((c) => ({ key: c.key, ...balanceFingerprint(s.opening, c.balances!) }))
      .filter((c) => c.matched > 0)
      .sort((a, b) => b.matched - a.matched);
    const [best, next] = scored;
    if (!best) return p;
    const agrees = best.matched === best.compared || (best.matched >= 3 && best.matched >= best.compared * 0.5);
    const clear = !next || next.matched * 2 <= best.matched;
    if (!agrees || !clear) return p;
    return { index: p.index, key: best.key, how: "balances" as const, note: `opening balances match ${best.matched} of ${best.compared} accounts, and no other property's do` };
  });
  // The second pass can itself land two sections on one property.
  const counts = new Map<string, number>();
  for (const p of second) if (p.key) counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
  return second.map((p, i) => (p.key && counts.get(p.key)! > 1 && !first[i].key
    ? { ...first[i] }
    : p));
}
