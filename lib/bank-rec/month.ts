// BANK REC — a month, end to end (server). Reads each file the month brings
// (by CONTENT, not name — owner: "will you pull the account number … from the
// bank statement itself?"), reconciles every account on the tracker, checks
// Skyline's cash against the GL by property, carries the open items forward,
// keeps the month as a record and ticks the Bank Acc Tracker.
//
// `ingestFile` is the ONE door every file comes through — today a folder
// dropped on the page, later a reader that pulls the SharePoint folder itself
// (the owner's next ask) — so the two can never read a file differently.

import "server-only";
import * as XLSX from "xlsx";
import { pdfText } from "@/lib/pdf/pdfText";
import { getJSON, storeJSON } from "@/lib/storage";
import { UNIQUE_BANK_ACCOUNTS } from "@/lib/bank-rec/accounts";
import { EXTRA_ACCOUNTS } from "@/lib/financials/bank-balances/entities";
import { bankRecKey, shiftPeriod } from "@/lib/bank-rec/util";
import { assembledGl, assembledTransactions } from "@/lib/financials/operating-statements/statementStore";
import { isCashAccount } from "@/lib/financials/cashAccounts";
import {
  isSkylineRec, kindFromName, last4ForSkylineKey, last4FromName, last4FromStatement,
  parseBankStatement, parseCheckingReport, parseSkylineRec, SKYLINE_KEY_BY_LAST4, normKey,
  type CheckingAccount, type CheckingReport,
} from "./monthFiles";
import { itemizeStatement } from "./statementItems";
import { carryForward, itemId, reconcileAccount, seedFromSkylineRec, type OpenItem } from "./engine";
import {
  allRuns, filesFor, reportFor, resolutions, runFor, saveFile, saveReport, saveRun,
  type AccountRow, type GlCheck, type MonthRun, type StoredFile,
} from "./store";

const r2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: number) => Math.round(n * 100);

export const ROSTER = [...UNIQUE_BANK_ACCOUNTS, ...EXTRA_ACCOUNTS];

export function periodEndOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export type IngestResult = { name: string; kind: StoredFile["kind"]; last4: string | null; account: string | null; ok: boolean; note: string };

/** Read one file into the month. */
export async function ingestFile(period: string, name: string, bytes: Buffer, by: string | null): Promise<IngestResult> {
  const now = new Date().toISOString();
  const isPdf = bytes.subarray(0, 5).toString("latin1").startsWith("%PDF");
  const nameKind = kindFromName(name);
  const accountOf = (l4: string | null) => ROSTER.find((a) => a.last4 === l4)?.accountName ?? null;

  if (!isPdf && (nameKind === "checking-report" || /\.xlsx?$/i.test(name))) {
    const wb = XLSX.read(bytes);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    const rep = parseCheckingReport(rows);
    if (!rep.accounts.length) return { name, kind: "checking-report", last4: null, account: null, ok: false, note: "Not a Skyline Checking Account Report" };
    // File it under the month it is AS OF, whatever month was picked.
    const p = rep.asOfISO?.slice(0, 7) ?? period;
    await saveReport(p, { ...rep, name, uploadedAt: now, by });
    const active = rep.accounts.filter((a) => !a.inactive).length;
    return { name, kind: "checking-report", last4: null, account: null, ok: true, note: `Skyline Checking Account Report as of ${rep.asOfISO ?? "?"} — ${active} active accounts${p !== period ? ` (filed under ${p})` : ""}` };
  }
  if (!isPdf) return { name, kind: "unknown", last4: null, account: null, ok: false, note: "Not a PDF or a Skyline report" };

  let text = "";
  try { text = await pdfText(bytes); } catch (e) {
    return { name, kind: nameKind, last4: last4FromName(name), account: null, ok: false, note: `Could not read the PDF: ${e instanceof Error ? e.message : e}` };
  }

  if (isSkylineRec(text)) {
    const rec = parseSkylineRec(text);
    const fromKey = last4ForSkylineKey(rec.checkingKey);
    const last4 = fromKey ?? last4FromName(name);
    const kind = nameKind === "rec1" || nameKind === "rec2" || nameKind === "rec2b" || nameKind === "rec12" ? nameKind : "rec1";
    await saveFile({ period, name, kind, last4, matchedBy: fromKey ? "content" : last4 ? "name" : null, uploadedAt: now, by, rec, ...(last4 ? {} : { textHead: text.slice(0, 3000) }) });
    return { name, kind, last4, account: accountOf(last4), ok: !!last4, note: `Skyline rec · ${rec.checkingKey ?? "?"} · ${rec.inBalance ? "In Balance" : "NOT in balance"} · ${rec.unreconciled.length} unreconciled` };
  }

  const st = parseBankStatement(text);
  const fromText = last4FromStatement(text, st.bank);
  const last4 = fromText ?? last4FromName(name);
  const st2 = st.bank === "Liberty" ? parseBankStatement(text, last4) : st;
  const it = itemizeStatement(text, st2);
  const failed = !it.ok || st2.ending == null;
  await saveFile({
    period, name, kind: "stmt", last4, matchedBy: fromText ? "content" : last4 ? "name" : null, uploadedAt: now, by,
    statement: st2, items: it.ok ? it.items : null, itemizeError: it.ok ? null : it.reason,
    ...(failed || !last4 ? { textHead: text.slice(0, 3000) } : {}),
  });
  return {
    name, kind: "stmt", last4, account: accountOf(last4), ok: !!last4 && st2.ending != null,
    note: `${st2.bank} statement ${st2.periodStart ?? "?"} – ${st2.periodEnd ?? "?"} · ending ${st2.ending == null ? "unreadable" : `$${st2.ending.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} · ${it.ok ? `${it.items.length} lines` : "not itemized"}`,
  };
}

// ── The month ─────────────────────────────────────────────────────────────

const REC_RANK: Record<string, number> = { rec2b: 4, rec2: 3, rec12: 2, rec1: 1 };
function bestRec(files: StoredFile[], last4: string): StoredFile | null {
  return files.filter((f) => f.last4 === last4 && f.rec)
    .sort((a, b) => (REC_RANK[b.kind] ?? 0) - (REC_RANK[a.kind] ?? 0) || (b.rec!.runDateISO ?? "").localeCompare(a.rec!.runDateISO ?? ""))[0] ?? null;
}

/** Keep only the seeded items that still explain the opening gap (an item Marie
 *  has since cleared in Skyline is no longer on the books). */
function trimSeed(seed: OpenItem[], target: number | null): { kept: OpenItem[]; dropped: OpenItem[] } {
  if (target == null || !seed.length) return { kept: seed, dropped: [] };
  const want = cents(target);
  if (cents(seed.reduce((a, s) => a + s.amount, 0)) === want) return { kept: seed, dropped: [] };
  const xs = seed.slice(0, 16);
  for (let size = xs.length - 1; size >= 0; size--) {
    for (let mask = 0; mask < 1 << xs.length; mask++) {
      let bits = 0, s = 0;
      for (let i = 0; i < xs.length; i++) if (mask & (1 << i)) { bits++; s += cents(xs[i].amount); }
      if (bits === size && s === want) {
        const kept = xs.filter((_, i) => mask & (1 << i));
        return { kept, dropped: seed.filter((x) => !kept.includes(x)) };
      }
    }
  }
  return { kept: seed, dropped: [] };
}

export async function runMonth(period: string, by: string | null, opts: { force?: boolean } = {}): Promise<MonthRun> {
  const existing = await runFor(period);
  if (existing?.signedOff && !opts.force) return existing;

  const periodEnd = periodEndOf(period);
  const prior = shiftPeriod(period, -1);
  const [files, report, priorRun, priorFiles, resolved] = await Promise.all([
    filesFor(period), reportFor(period), runFor(prior), filesFor(prior), resolutions(),
  ]);
  const resolvedIds = new Set(resolved.map((r) => r.id));
  const byKey = new Map<string, CheckingAccount>((report?.accounts ?? []).map((a) => [normKey(a.key), a]));

  const accounts: AccountRow[] = ROSTER.map((a) => {
    const skylineKey = SKYLINE_KEY_BY_LAST4[a.last4] ?? null;
    const mine = files.filter((f) => f.last4 === a.last4);
    const stmt = mine.find((f) => f.kind === "stmt") ?? null;
    const marie = bestRec(files, a.last4);
    const book = skylineKey ? byKey.get(normKey(skylineKey)) ?? null : null;

    // Opening open items: last month's portal rec, else Marie's last Skyline rec.
    let carried: OpenItem[] = [];
    let carriedFrom: AccountRow["carriedFrom"] = "none";
    const priorRow = priorRun?.accounts.find((x) => x.last4 === a.last4);
    if (priorRow?.rec) { carried = carryForward(priorRow.rec, resolvedIds); carriedFrom = "portal"; }
    else {
      const seedRec = bestRec(priorFiles, a.last4);
      if (seedRec?.rec) {
        const seed = seedFromSkylineRec(seedRec.rec.unreconciled, (iso) => iso.slice(0, 7)).filter((s) => !resolvedIds.has(s.id));
        const target = book?.beginning != null && stmt?.statement?.beginning != null && stmt.statement.periodStart?.slice(0, 7) === period
          ? r2(book.beginning - stmt.statement.beginning) : null;
        carried = trimSeed(seed, target).kept;
        carriedFrom = "skyline-rec";
      }
    }

    const files_ = mine.map((f) => ({ name: f.name, kind: f.kind }));
    if (!skylineKey) {
      return { last4: a.last4, bank: a.bank, name: a.accountName, skylineKey: null, files: files_, rec: null, na: true, skylineRec: null, carriedFrom };
    }
    const rec = reconcileAccount({
      period, periodEnd,
      statement: stmt?.statement?.ending != null ? { ending: stmt.statement.ending, beginning: stmt.statement.beginning, periodEnd: stmt.statement.periodEnd, items: stmt.items ?? null, itemizeError: stmt.itemizeError } : null,
      book, carried,
    });
    // Skyline's opening must be last month's closing — a gap means something
    // was posted back into the closed month after its rec.
    if (priorRow?.rec?.checkBookBalance != null && book?.beginning != null && cents(priorRow.rec.checkBookBalance) !== cents(book.beginning)) {
      rec.issues.push(`Skyline's opening $${book.beginning.toFixed(2)} ≠ ${prior}'s closing $${priorRow.rec.checkBookBalance.toFixed(2)} — something was posted back into ${prior} after its rec`);
      if (rec.status === "ok") rec.status = "attention";
    }
    if (carriedFrom === "none" && rec.status === "out") {
      rec.issues.push(`No ${prior} rec in the portal — the gap may be ${prior}'s open items; drop ${prior}'s folder (Marie's recs carry them in)`);
    }
    return {
      last4: a.last4, bank: a.bank, name: a.accountName, skylineKey, files: files_, rec, carriedFrom,
      skylineRec: marie?.rec ? { inBalance: marie.rec.inBalance, unreconciled: marie.rec.unreconciled.length, adjustedCheckBookBalance: marie.rec.adjustedCheckBookBalance, file: marie.name } : null,
    };
  });

  const mapped = new Set(Object.values(SKYLINE_KEY_BY_LAST4).map(normKey));
  const unmappedSkyline = (report?.accounts ?? []).filter((a) => !a.inactive && !mapped.has(normKey(a.key))).map((a) => ({ key: a.key, bankName: a.bankName, balance: a.balance }));
  const unmatchedFiles = files.filter((f) => !f.last4 || !ROSTER.some((a) => a.last4 === f.last4))
    .map((f) => ({ name: f.name, kind: f.kind, reason: f.last4 ? `${f.last4} is not on the account list` : "No account number found in the file or its name" }));

  const gl = report ? await glChecks(report, period) : [];

  const run: MonthRun = { period, computedAt: new Date().toISOString(), by, reportAsOf: report?.asOfISO ?? null, accounts, gl, unmappedSkyline, unmatchedFiles, signedOff: existing?.signedOff ?? null };
  await saveRun(run);
  await tickTracker(run).catch(() => {});
  return run;
}

/** A filed statement ticks "Statement"; an account in balance with nothing to
 *  fix ticks "Reconciled". Additive only — a manual tick is never undone here. */
async function tickTracker(run: MonthRun): Promise<void> {
  const stmts: Record<string, true> = {}, recs: Record<string, true> = {};
  for (const a of run.accounts) {
    const k = bankRecKey(a.last4, run.period);
    if (a.files.some((f) => f.kind === "stmt")) stmts[k] = true;
    if (a.rec?.status === "ok") recs[k] = true;
  }
  for (const [id, patch] of [["statements", stmts], ["checked", recs]] as const) {
    if (!Object.keys(patch).length) continue;
    const stored = ((await getJSON("bank-rec", id, { retryOnMiss: true })) ?? {}) as Record<string, boolean>;
    await storeJSON("bank-rec", id, { ...stored, ...patch });
  }
}

// ── Skyline vs the GL, by property ───────────────────────────────────────
// Skyline splits each checking account's balance by the company that owns the
// money ("Account Ownership by Property/Company"). Summed across every active
// account, that is each company's cash per Skyline, which must equal the cash
// accounts on that company's GL at month end.

const FUND_GL_KEY: Record<string, string> = { FJVIII: "PJV3", FNIPLX: "PNIPLX", FIIICO: "PIIICO" };

async function glChecks(report: CheckingReport, period: string): Promise<GlCheck[]> {
  const [y, m] = period.split("-").map(Number);
  const byCo = new Map<string, { key: string; amount: number }[]>();
  for (const a of report.accounts) {
    if (a.inactive) continue;
    for (const o of a.ownership) {
      if (Math.abs(o.amount) < 0.005) continue;
      const list = byCo.get(o.company) ?? [];
      list.push({ key: a.key, amount: o.amount });
      byCo.set(o.company, list);
    }
  }
  const out: GlCheck[] = [];
  for (const [company, accts] of [...byCo.entries()].sort()) {
    const glKey = FUND_GL_KEY[company] ?? company;
    const skyline = r2(accts.reduce((a, x) => a + x.amount, 0));
    const base: GlCheck = { company, glKey, skyline, gl: null, difference: null, accounts: accts, glAccounts: [], glOnly: [], skylineOnly: [] };
    const g = await assembledGl(glKey, y).catch(() => null);
    if (!g) { out.push({ ...base, note: `No ${y} GL imported for ${glKey}` }); continue; }
    if ((g.coverageEnd ?? g.maxPeriodInFile ?? 0) < m) { out.push({ ...base, note: `${glKey}'s GL runs through month ${g.coverageEnd ?? g.maxPeriodInFile} — import it through ${period}` }); continue; }
    if (!g.beginning) { out.push({ ...base, note: `${glKey}'s GL has no beginning balances — import it with Beginning Balances` }); continue; }
    const codes = Object.keys(g.monthly).filter((c) => isCashAccount(c, g.names?.[c] ?? ""));
    const glAccounts = codes.map((c) => ({
      code: c, name: g.names?.[c] ?? c,
      balance: r2((g.beginning?.[c] ?? 0) + (g.monthly[c] ?? []).slice(0, m).reduce((a, n) => a + (n || 0), 0)),
    })).filter((x) => Math.abs(x.balance) >= 0.005);
    const gl = r2(glAccounts.reduce((a, x) => a + x.balance, 0));
    const difference = r2(skyline - gl);
    const check: GlCheck = { ...base, gl, difference, glAccounts };
    if (Math.abs(difference) >= 0.005) {
      // The detail: this month's GL cash lines vs Skyline register lines, by amount + check #.
      const tx = await assembledTransactions(glKey, y).catch(() => ({} as Record<string, never[]>));
      const glLines = codes.flatMap((c) => ((tx as Record<string, { month: number; date: string; ref: string; vendor?: string; description: string; amount: number }[]>)[c] ?? [])
        .filter((t) => t.month === m).map((t) => ({ dateISO: t.date ?? "", ref: t.ref ?? "", description: t.vendor || t.description, amount: t.amount, code: c })));
      const owned = new Set(accts.map((x) => normKey(x.key)));
      const sole = new Set(report.accounts.filter((a) => owned.has(normKey(a.key)) && a.ownership.filter((o) => Math.abs(o.amount) >= 0.005).length === 1).map((a) => normKey(a.key)));
      const skyLines = report.accounts.filter((a) => owned.has(normKey(a.key)))
        .flatMap((a) => a.txns.map((t) => ({ ...t, key: a.key })))
        .filter((t) => sole.has(normKey(t.key)) || new RegExp(String.raw`Prop/Co\.?\s*${company}\b`, "i").test(t.description));
      const usedSky = new Set<number>();
      for (const gLine of glLines) {
        const i = skyLines.findIndex((s, idx) => !usedSky.has(idx) && cents(s.amount) === cents(gLine.amount));
        if (i >= 0) usedSky.add(i); else check.glOnly.push(gLine);
      }
      check.skylineOnly = skyLines.filter((_, i) => !usedSky.has(i) && sole.has(normKey(skyLines[i].key)))
        .map((s) => ({ dateISO: s.dateISO, ref: s.ref, description: s.description, amount: s.amount, key: s.key }));
    }
    out.push(check);
  }
  return out;
}

export async function history(): Promise<{ period: string; computedAt: string; signedOff: MonthRun["signedOff"]; counts: Record<string, number> }[]> {
  return (await allRuns()).map((r) => {
    const counts: Record<string, number> = { ok: 0, attention: 0, out: 0, incomplete: 0 };
    for (const a of r.accounts) if (a.rec) counts[a.rec.status] = (counts[a.rec.status] ?? 0) + 1;
    return { period: r.period, computedAt: r.computedAt, signedOff: r.signedOff ?? null, counts };
  });
}

export { itemId };
