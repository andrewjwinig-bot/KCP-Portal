"use client";
import { pickInto } from "@/app/components/pickFiles";
import { PageHeader } from "@/app/components/PageHeader";
import { HeaderSelect } from "@/app/components/HeaderSelect";
import { MetaLine } from "@/app/components/LastImported";
import { FilePath } from "@/app/components/FilePath";
import LoadingState from "@/app/components/LoadingState";
import { Check, ChevronDown, ChevronRight, CircleCheck, Upload } from "lucide-react";
import { InfoPopover } from "@/app/components/InfoPopover";

// Bank Recs — every bank account, every month, reconciled by the portal
// (owner: "build an automated bank rec to let me know if all are in balance
// and call out inbalances … track any open items from prior periods to carry
// through to the next months bank rec … store the history").
//
// Drop the month's folder: the bank statements, Marie's Skyline recs (if
// filed) and Skyline's Checking Account Report. Each file is read for its
// account number — the name does not matter. Every account is reconciled line
// by line (lib/bank-rec/engine.ts) and laid out as the Skyline Statement
// Reconcile Report reads, the open items carry into the next month, Skyline's
// cash is checked against the GL by property, and the month is kept as the
// record once signed off. Exceptions lead; an account in balance is one line.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/app/components/UserProvider";
import { useImport } from "@/app/components/import/ImportProvider";
import { StatPill, Pill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL, TONE_RED, TONE_BLUE } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import type { MonthRun, AccountRow, GlCheck, Resolution } from "@/lib/bank-rec/store";
import type { OpenItem, RecStatus } from "@/lib/bank-rec/engine";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const periodLabel = (p: string) => { const [y, m] = p.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
const shortPeriod = (p: string) => { const [y, m] = p.split("-").map(Number); return `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`; };
const money = (n: number | null | undefined) => n == null ? "—" : (n < 0 ? "($" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (n < 0 ? ")" : "");
const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const dateLabel = (iso: string) => { const [y, m, d] = iso.split("-"); return y && m && d ? `${Number(m)}/${Number(d)}/${y.slice(2)}` : iso; };
const ageDays = (iso: string, periodEnd: string) => Math.round((Date.parse(periodEnd) - Date.parse(iso)) / 86400000);
const SECTION: React.CSSProperties = { fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const BANKS = ["M&T", "JPM-Chase", "Liberty Bank"];
const BANK_LABEL: Record<string, string> = { "M&T": "M&T", "JPM-Chase": "Chase", "Liberty Bank": "Liberty" };

function priorMonth(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function periodEndOf(p: string) { const [y, m] = p.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }

type FileRow = { name: string; kind: string; last4: string | null; matchedBy: string | null; uploadedAt: string; by: string | null; itemizeError: string | null; ending: number | null };
type HistoryRow = { period: string; computedAt: string; signedOff: MonthRun["signedOff"]; counts: Record<string, number> };
type Data = { history: HistoryRow[]; run: MonthRun | null; files: FileRow[]; report: { name: string; asOf: string | null; uploadedAt: string } | null; resolutions: Resolution[] };

function statusPill(a: AccountRow) {
  if (a.na) return <Pill tone={TONE_NEUTRAL}>NOT ON SKYLINE</Pill>;
  const r = a.rec;
  if (!r) return <Pill tone={TONE_NEUTRAL}>NO REC</Pill>;
  const s: RecStatus = r.status;
  if (s === "ok") return <Pill tone={TONE_GREEN}>IN BALANCE</Pill>;
  if (s === "out") return <Pill tone={TONE_RED}>OUT {money0(Math.abs(r.difference ?? 0))}</Pill>;
  if (s === "incomplete") return <Pill tone={TONE_NEUTRAL}>{r.issues[0]?.startsWith("No bank statement") ? "NO STATEMENT" : "NOT IN SKYLINE REPORT"}</Pill>;
  return <Pill tone={TONE_AMBER}>REVIEW</Pill>;
}
const rank = (a: AccountRow) => a.na ? 5 : !a.rec ? 4 : ({ out: 0, attention: 1, incomplete: 2, ok: 3 } as Record<RecStatus, number>)[a.rec.status];

/** Every file inside a dropped folder (and its sub-folders). */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) { out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))); return; }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e);
    }
  };
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (!entries.length) return [...dt.files];
  for (const e of entries) await walk(e);
  return out;
}
const wanted = (f: File) => /\.(pdf|xls|xlsx)$/i.test(f.name) && !f.name.startsWith("~$") && !f.name.startsWith(".");

export default function BankRecPage() {
  const { user } = useUser();
  const { startImport } = useImport();
  const [period, setPeriod] = useState(priorMonth());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (p = period) => {
    setError(null);
    const r = await fetch(`/api/bank-rec/month?period=${p}`, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!j?.ok) { setError(j?.error ?? "Could not load the bank rec."); return; }
    setData(j);
  }, [period]);
  useEffect(() => { setData(null); load(period); }, [period, load]);

  const run = useCallback(async (force = false) => {
    setReconciling(true); setError(null);
    const r = await fetch("/api/bank-rec/month", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, force }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setReconciling(false);
    if (!j?.ok) { setError(j?.error ?? "The rec did not run."); return; }
    await load();
  }, [period, load]);

  async function importFiles(list: File[]) {
    const files = list.filter(wanted);
    if (!files.length) { setError("No PDFs or Skyline report in what was dropped."); return; }
    await startImport({
      kind: "bank-rec",
      title: (n) => `Reading ${n} bank rec file${n === 1 ? "" : "s"} for ${periodLabel(period)}`,
      subtitle: "Bank statements · Skyline recs · Checking Account Report — matched by the account number inside each",
      files, by: user?.label, concurrency: 3,
      upload: async (file, { signal }) => {
        const fd = new FormData(); fd.append("period", period); fd.append("file", file);
        const r = await fetch("/api/bank-rec/month/files", { method: "POST", body: fd, signal });
        const j = await r.json().catch(() => ({}));
        const res = j?.result;
        if (!r.ok || !res) return { status: "failed", error: j?.error ?? "Could not read" };
        return {
          status: res.ok ? "done" : "failed", error: res.ok ? undefined : res.note,
          entity: res.account ? `${res.account} · ${res.last4}` : res.kind === "checking-report" ? "Skyline Checking Account Report" : res.last4 ?? file.name,
          detail: res.note,
        };
      },
      report: (rows) => ({ stats: [
        { value: String(rows.filter((r) => r.status === "done").length), label: "files read" },
        { value: String(rows.filter((r) => r.status === "failed").length), label: "need a look" },
      ] }),
    });
    await run();
  }

  async function signOff(on: boolean) {
    setBusy(on ? "Signing off…" : "Reopening…");
    await fetch("/api/bank-rec/month/signoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, signedOff: on }) }).catch(() => null);
    setBusy(null); await load();
  }

  async function resolve(item: OpenItem, note: string | null) {
    setBusy(note ? "Clearing the item…" : "Restoring the item…");
    await fetch("/api/bank-rec/month/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, id: item.id, ...(note ? { note } : { clear: true }) }) }).catch(() => null);
    setBusy(null); await load();
  }

  const r = data?.run ?? null;
  const signed = !!r?.signedOff;
  const accounts = useMemo(() => (r?.accounts ?? []).filter((a) => !onlyIssues || (a.rec && a.rec.status !== "ok") || (!a.rec && !a.na) || (a.skylineRec?.vs && !a.skylineRec.vs.agrees)), [r, onlyIssues]);
  const counts = useMemo(() => {
    const c = { ok: 0, attention: 0, out: 0, incomplete: 0, total: 0, openItems: 0, openAmt: 0, stale: 0, marie: 0, marieAgree: 0 };
    for (const a of r?.accounts ?? []) {
      if (!a.rec || a.na) continue;
      c.total++; c[a.rec.status]++;
      if (a.skylineRec?.vs) { c.marie++; if (a.skylineRec.vs.agrees) c.marieAgree++; }
      c.openItems += a.rec.openBook.length; c.openAmt += a.rec.openBook.reduce((s, x) => s + x.amount, 0);
      c.stale += a.rec.openBook.filter((x) => ageDays(x.dateISO, periodEndOf(period)) > 60).length;
    }
    return c;
  }, [r, period]);
  const glOff = (r?.gl ?? []).filter((g) => g.difference != null && Math.abs(g.difference) >= 0.005);
  const glCompared = (r?.gl ?? []).filter((g) => g.difference != null).length;
  const months = useMemo(() => {
    // The last twelve months, so a back month (catching up, or seeding the first
    // one) can be run — not only last month and the months already on file.
    const recent: string[] = [];
    const d = new Date(); d.setDate(1);
    for (let i = 0; i < 12; i++) { d.setMonth(d.getMonth() - 1); recent.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
    const s = new Set<string>([...recent, period, ...(data?.history ?? []).map((h) => h.period)]);
    return [...s].sort().reverse();
  }, [data, period]);
  const resolvedById = useMemo(() => new Map((data?.resolutions ?? []).map((x) => [x.id, x])), [data]);

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <PageHeader title="Bank Reconciliation"
        // The month's folder can be dropped anywhere on the header, as on every
        // import page (owner: "the drop … folder here is different than the
        // other import buttons on other pages").
        dropHandlers={signed ? undefined : {
          onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); },
          onDragLeave: () => setDragOver(false),
          onDrop: async (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); importFiles(await filesFromDrop(e.dataTransfer)); },
        }}
        dragging={dragOver}
        pickers={<>
          <HeaderSelect value={period} onChange={setPeriod} ariaLabel="Month" displayLabel={periodLabel(period)}>
            {months.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </HeaderSelect>
        </>}
        actions={<>
          {!signed && <>
            <button className="btn import" disabled={!!busy || reconciling} onClick={() => pickInto(fileInput.current, "bank-recs")}><Upload size={16} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0 }} /> Import Bank Rec Files</button>
            <InfoPopover>
              <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
                <div style={{ fontWeight: 700 }}>The {periodLabel(period)} folder</div>
                <div className="small">The bank statements, Marie&rsquo;s Skyline recs and Skyline&rsquo;s Checking Account Report (.xls). Each file is matched by the account number inside it, so names don&rsquo;t matter. Import again any time as the month fills in, or drop the folder on the header.</div>
                <FilePath label="Find them in" path={`Data\\Accounting\\!${period.slice(0, 4)} Year End\\Bank Account Reconciliations\\${period.slice(5)} ${MONTHS[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}`} />
                <div><button className="btn sm" onClick={() => folderInput.current?.click()}>Choose the whole folder instead</button></div>
              </div>
            </InfoPopover>
            <input ref={folderInput} type="file" hidden multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              onChange={(e) => { importFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
            <input ref={fileInput} type="file" hidden multiple accept=".pdf,.xls,.xlsx"
              onChange={(e) => { importFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
          </>}
          {r && !signed && <button className="btn" disabled={!!busy || reconciling} onClick={() => run()}>Re-run</button>}
          {r && (signed
            ? <button className="btn" disabled={!!busy || reconciling} onClick={() => signOff(false)}>Reopen month</button>
            : <button className="btn primary" disabled={!!busy || reconciling || counts.out > 0 || counts.incomplete > 0} onClick={() => signOff(true)}
                title={counts.out || counts.incomplete ? "Every account must be filed and in balance first" : undefined}>Sign off {shortPeriod(period)}</button>)}
        </>}
        meta={(signed || data) ? <MetaLine>
          {signed && <><span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--c-067647)" }}>
            <CircleCheck size={16} strokeWidth={1.75} aria-hidden />Signed off{r?.signedOff?.by ? ` by ${r.signedOff.by}` : ""} {new Date(r!.signedOff!.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span></>}
          {data && <><span>{data.files.filter((f) => f.kind === "stmt").length} statements · {data.files.filter((f) => f.kind.startsWith("rec")).length} Skyline recs on file</span>
            <span>{data.report ? <>Checking Account Report as of {data.report.asOf ? dateLabel(data.report.asOf) : "?"}</> : <b style={{ color: "var(--c-b45309)" }}>No Checking Account Report for {periodLabel(period)} yet</b>}</span>
            {r && <span>Last run {new Date(r.computedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{r.by ? ` · ${r.by}` : ""}</span>}</>}
        </MetaLine> : undefined} />

      {(r || busy || error) && <div className="card" style={{ display: "grid", gap: 14 }}>

        {r && (
          <div className="pills" style={{ flexWrap: "wrap", justifyContent: "flex-start", marginTop: 0 }}>
            <StatPill label="In balance" value={`${counts.ok} of ${counts.total}`} total />
            <StatPill label="Out of balance" value={counts.out} accent={counts.out ? "var(--c-b91c1c)" : undefined} onClick={counts.out ? () => setOnlyIssues(true) : undefined} />
            <StatPill label="To review" value={counts.attention} accent={counts.attention ? "var(--c-b45309)" : undefined} sub="items to fix or record" onClick={counts.attention ? () => setOnlyIssues(true) : undefined} />
            <StatPill label="Open items" value={counts.openItems} sub={`${money0(counts.openAmt)} · ${counts.stale} over 60 days`} accent={counts.stale ? "var(--c-b45309)" : undefined} />
            {counts.marie > 0 && <StatPill label="Agree with Marie's recs" value={`${counts.marieAgree} of ${counts.marie}`} accent={counts.marieAgree < counts.marie ? "var(--c-b45309)" : "var(--c-15803d)"} sub="same balances & open items" onClick={counts.marieAgree < counts.marie ? () => setOnlyIssues(true) : undefined} />}
            <StatPill label="Not filed" value={counts.incomplete} sub="statement or Skyline missing" />
            {glCompared > 0
              ? <StatPill label="Skyline vs GL" value={glOff.length ? `${glOff.length} off` : "Ties"} accent={glOff.length ? "var(--c-b45309)" : "var(--c-15803d)"} sub={`${glCompared} properties compared`} />
              : r.gl.length > 0 && <StatPill label="Skyline vs GL" value="—" sub="no GL through this month yet" />}
          </div>
        )}
        {busy && <div className="muted small">{busy}</div>}
        {error && <div style={{ color: "var(--c-b91c1c)", fontWeight: 600, fontSize: "var(--fs-13)" }}>{error}</div>}
      </div>}

      {!reconciling && !data && !error && <LoadingState status="Loading bank recs…" context={periodLabel(period)} columns={5} rows={6} />}

      {reconciling && <ReconcilingCard period={period} accounts={[...new Set((data?.files ?? []).map((f) => f.last4).filter(Boolean) as string[])].sort()} />}

      {!reconciling && data && !r && (
        <div className="card muted small">Nothing reconciled for {periodLabel(period)} yet — Import Bank Rec Files above, or drop the month&rsquo;s folder on the header.
          {data.files.length > 0 && <> {data.files.length} files are on file — <button className="btn sm" onClick={() => run()}>Run the rec</button></>}
        </div>
      )}

      {!reconciling && r && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 18px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Accounts</div>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: "var(--fs-13)", cursor: "pointer" }}>
              <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only accounts needing attention
            </label>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead>
                <tr>
                  <th style={thL}>Account</th>
                  <th style={th}>Bank statement</th>
                  <th style={th}>Skyline book</th>
                  <th style={th}>Open items</th>
                  <th style={th}>Difference</th>
                  <th style={thL}>Status</th>
                  <th style={thL}>Marie&rsquo;s rec</th>
                </tr>
              </thead>
              <tbody>
                {BANKS.map((bank) => {
                  const rows = accounts.filter((a) => a.bank === bank).sort((x, y) => rank(x) - rank(y));
                  if (!rows.length) return null;
                  return (
                    <Fragment key={bank}>
                      <tr style={{ background: "var(--tint-brand-bg, rgba(11,74,125,0.07))" }}>
                        <td style={{ ...tdL, fontWeight: 800 }} colSpan={7}>{BANK_LABEL[bank]} <span className="muted" style={{ fontWeight: 500, fontSize: "var(--fs-12)" }}>· {rows.length} accounts</span></td>
                      </tr>
                      {rows.map((a) => {
                        const isOpen = open === a.last4;
                        const rc = a.rec;
                        const openSum = rc ? rc.openBook.reduce((s, x) => s + x.amount, 0) : 0;
                        return (
                          <Fragment key={a.last4}>
                            <tr onClick={() => setOpen(isOpen ? null : a.last4)} style={{ cursor: "pointer", borderTop: "1px solid var(--border)", background: isOpen ? "var(--tint-brand-bg, rgba(11,74,125,0.04))" : undefined }}>
                              <td style={{ ...tdL, whiteSpace: "normal" }}>
                                <span aria-hidden className="muted" style={{ fontSize: "var(--fs-10)", marginRight: 6 }}>{isOpen ? <ChevronDown size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px", flexShrink: 0 }} /> : <ChevronRight size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px", flexShrink: 0 }} />}</span>
                                <span style={{ fontWeight: 600 }}>{a.name}</span>{" "}
                                <code className="muted" style={{ fontSize: "var(--fs-12)" }}>{a.last4}</code>
                                {rc?.issues.length && rc.status !== "ok" ? <div className={rc.status === "incomplete" ? "muted" : undefined} style={{ fontSize: "var(--fs-12)", color: rc.status === "out" ? "var(--c-b91c1c)" : rc.status === "incomplete" ? undefined : "var(--c-b45309)", marginTop: 2, marginLeft: 16 }}>{rc.issues[0]}</div> : null}
                              </td>
                              <td style={td}>{money(rc?.statementBalance ?? null)}</td>
                              <td style={td}>{money(rc?.checkBookBalance ?? null)}</td>
                              <td style={td}>{rc && rc.openBook.length ? <span>{rc.openBook.length} · {money(openSum)}</span> : <span className="muted">—</span>}</td>
                              <td style={{ ...td, fontWeight: 700, color: rc?.difference ? "var(--c-b91c1c)" : undefined }}>{rc?.difference != null ? money(rc.difference) : "—"}</td>
                              <td style={tdL}>{statusPill(a)}</td>
                              <td style={tdL}>{marieCell(a)}</td>
                            </tr>
                            {isOpen && (
                              <tr><td colSpan={7} style={{ padding: "6px 18px 18px", background: "var(--tint-brand-faint, rgba(11,74,125,0.025))", maxWidth: 0 }}>
                                <AccountDetail a={a} period={period} signed={signed} resolvedById={resolvedById} onResolve={resolve} />
                              </td></tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {r && r.gl.length > 0 && <GlCard gl={r.gl} period={period} />}

      {r && (r.unmappedSkyline.length > 0 || r.unmatchedFiles.length > 0) && (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          {r.unmappedSkyline.length > 0 && (
            <div>
              <div style={SECTION}>In Skyline, not on the account list</div>
              {r.unmappedSkyline.map((u) => <div key={u.key} style={{ fontSize: "var(--fs-13)", marginTop: 4 }}><code style={{ fontSize: "var(--fs-12)" }}>{u.key}</code> {u.bankName} · {money(u.balance)}</div>)}
            </div>
          )}
          {r.unmatchedFiles.length > 0 && (
            <div>
              <div style={SECTION}>Files that matched no account</div>
              {r.unmatchedFiles.map((u) => <div key={u.name} style={{ fontSize: "var(--fs-13)", marginTop: 4 }}>{u.name} <span className="muted">— {u.reason}</span></div>)}
            </div>
          )}
        </div>
      )}

      {data && data.history.length > 0 && (
        <div className="card">
          <div style={SECTION}>History</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 8, paddingBottom: 4 }}>
            {data.history.map((h) => {
              const on = h.period === period;
              const bad = (h.counts.out ?? 0) > 0;
              return (
                <button key={h.period} type="button" onClick={() => setPeriod(h.period)}
                  style={{ flexShrink: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: "9px 14px", borderRadius: 10, border: `1px solid ${on ? "var(--tint-brand-line, rgba(11,74,125,0.45))" : "var(--border)"}`, background: on ? "var(--tint-brand-bg, rgba(11,74,125,0.07))" : "var(--card)" }}>
                  <div style={{ fontSize: "var(--fs-13-5)", fontWeight: 800, color: on ? "var(--c-0b4a7d)" : "var(--text)" }}>{periodLabel(h.period)}</div>
                  <div style={{ fontSize: "var(--fs-11-5)", marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="muted">{h.counts.ok ?? 0} in balance</span>
                    {bad ? <Pill tone={TONE_RED}>{h.counts.out} OUT</Pill> : h.signedOff ? <Pill tone={TONE_GREEN}>SIGNED OFF</Pill> : <Pill tone={TONE_BLUE}>OPEN</Pill>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

/** One account's rec, laid out as Marie's Skyline Statement Reconcile Report reads. */
function AccountDetail({ a, period, signed, resolvedById, onResolve }: {
  a: AccountRow; period: string; signed: boolean; resolvedById: Map<string, Resolution>; onResolve: (item: OpenItem, note: string | null) => void;
}) {
  const [showCleared, setShowCleared] = useState(false);
  const rc = a.rec;
  const end = periodEndOf(period);
  if (a.na) return <div className="muted small" style={{ paddingTop: 8 }}>Not kept in Skyline (not managed by LIK) — the statement is on file{a.files.length ? `: ${a.files.map((f) => f.name).join(", ")}` : ""}.</div>;
  if (!rc) return null;
  const sum = (xs: OpenItem[]) => xs.reduce((s, x) => s + x.amount, 0);
  const deposits = rc.openBook.filter((x) => x.amount > 0), checks = rc.openBook.filter((x) => x.amount < 0);
  const Line = ({ label, value, strong, tone }: { label: string; value: number | null; strong?: boolean; tone?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "var(--fs-13)", padding: "3px 0", fontWeight: strong ? 800 : 400, borderTop: strong ? "1px solid var(--border)" : undefined, color: tone }}>
      <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(value)}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 14, paddingTop: 8 }}>
      {rc.issues.length > 0 && (
        <div style={{ display: "grid", gap: 3 }}>
          {rc.issues.map((s, i) => <div key={i} style={{ fontSize: "var(--fs-13)", color: rc.status === "out" && i === 0 ? "var(--c-b91c1c)" : "var(--c-b45309)", fontWeight: 600 }}>• {s}</div>)}
        </div>
      )}
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div>
          <div style={SECTION}>Statement Balance</div>
          <Line label={`Bank, ${dateLabel(end)}`} value={rc.statementBalance} />
          {deposits.length > 0 && <Line label={`+ Deposits in transit (${deposits.length})`} value={sum(deposits)} />}
          {checks.length > 0 && <Line label={`− Outstanding checks & debits (${checks.length})`} value={sum(checks)} />}
          <Line label="Adjusted Statement Balance" value={rc.adjustedStatementBalance} strong />
        </div>
        <div>
          <div style={SECTION}>Check Book Balance</div>
          <Line label={`Skyline, ${dateLabel(end)}`} value={rc.checkBookBalance} />
          {rc.openBank.length > 0 && <Line label={`± On the bank, not on the books (${rc.openBank.length})`} value={sum(rc.openBank)} />}
          <Line label="Adjusted Check Book Balance" value={rc.adjustedCheckBookBalance} strong />
          <div style={{ marginTop: 8 }}>
            {Math.abs(rc.difference ?? 0) < 0.005
              ? <Pill tone={TONE_GREEN}>IN BALANCE</Pill>
              : <Pill tone={TONE_RED}>OUT OF BALANCE · {money(rc.difference)}</Pill>}
            {a.skylineRec && (
              <span className="muted" style={{ fontSize: "var(--fs-12)", marginLeft: 8 }}>
                Marie&rsquo;s Skyline rec: {a.skylineRec.inBalance ? "In Balance" : "NOT in balance"} · {a.skylineRec.unreconciled} unreconciled
              </span>
            )}
          </div>
        </div>
      </div>

      {a.skylineRec?.vs && !a.skylineRec.vs.agrees && <MarieDiff vs={a.skylineRec.vs} file={a.skylineRec.file} />}

      {rc.mismatches.length > 0 && (
        <ItemTable title="Amounts that don't agree" tone="var(--c-b91c1c)"
          head={["Date", "Check #", "Payee", "Skyline", "Bank", "Difference"]}
          rows={rc.mismatches.map((m) => [dateLabel(m.dateISO), m.checkNo, m.description, money(m.book), money(m.bank), money(m.book - m.bank)])} />
      )}

      <OpenTable title="Unreconciled Transactions" note="On Skyline's books, not yet cleared by the bank — carried to next month."
        items={rc.openBook} end={end} period={period} signed={signed} resolvedById={resolvedById} onResolve={onResolve} empty="None — everything on the books cleared the bank." />
      {rc.openBank.length > 0 && (
        <OpenTable title="On the Bank, Not on the Books" note="Fees, interest, ACH or deposits Skyline has not recorded — post them, or clear them here with the reason."
          items={rc.openBank} end={end} period={period} signed={signed} resolvedById={resolvedById} onResolve={onResolve} tone="var(--c-b45309)" />
      )}
      {rc.deferredBank.length > 0 && (
        <ItemTable title="On the statement after month end (carried to next month)"
          head={["Date", "Description", "Amount"]} rows={rc.deferredBank.map((x) => [dateLabel(x.dateISO), x.description, money(x.amount)])} />
      )}

      <div>
        <button className="btn sm" onClick={() => setShowCleared((v) => !v)}>{showCleared ? "Hide" : "Show"} the {rc.cleared.length} cleared match{rc.cleared.length === 1 ? "" : "es"}</button>
        {showCleared && (
          <ItemTable title="" head={["How", "Skyline", "Bank", "Amount"]}
            rows={rc.cleared.map((c) => [
              c.how === "check" ? "Check #" : c.how === "amount" ? "Amount" : "Group",
              c.book.map((b) => `${dateLabel(b.dateISO)} ${b.ref} ${b.description}`).join("; "),
              c.bank.map((b) => `${dateLabel(b.dateISO)} ${b.description}`).join("; "),
              money(c.book.reduce((s, b) => s + b.amount, 0)),
            ])} />
        )}
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-12)" }}>
        Files: {a.files.length ? a.files.map((f) => f.name).join(" · ") : "none"}
        {a.carriedFrom === "skyline-rec" && " · Opening open items taken from Marie's prior-month Skyline rec"}
        {!rc.itemized && " · The statement could not be itemized, so only balances were compared"}
      </div>
    </div>
  );
}

function OpenTable({ title, note, items, end, period, signed, resolvedById, onResolve, empty, tone }: {
  title: string; note: string; items: OpenItem[]; end: string; period: string; signed: boolean;
  resolvedById: Map<string, Resolution>; onResolve: (item: OpenItem, note: string | null) => void; empty?: string; tone?: string;
}) {
  const [clearing, setClearing] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  return (
    <div>
      <div style={{ ...SECTION, color: tone ?? SECTION.color }}>{title}</div>
      <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 2 }}>{note}</div>
      {!items.length ? <div className="muted small" style={{ marginTop: 6 }}>{empty}</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
          <thead><tr>
            <th style={thL}>Date</th><th style={thL}>Check # / Ref</th><th style={thL}>Payee / Description</th><th style={th}>Amount</th><th style={th}>Age</th><th style={thL}>From</th><th style={thL} />
          </tr></thead>
          <tbody>
            {items.map((x) => {
              const age = ageDays(x.dateISO, end);
              return (
                <Fragment key={x.id}>
                  <tr style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdL}>{dateLabel(x.dateISO)}</td>
                    <td style={tdL}><code style={{ fontSize: "var(--fs-12)" }}>{x.ref || "—"}</code></td>
                    <td style={{ ...tdL, whiteSpace: "normal" }}>{x.description}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{money(x.amount)}</td>
                    <td style={td}>{age > 60 ? <Pill tone={TONE_AMBER}>{age} DAYS</Pill> : <span className="muted">{age}d</span>}</td>
                    <td style={tdL}>{x.origin === period ? <span className="muted">this month</span> : <Pill tone={TONE_BLUE}>{shortPeriod(x.origin)}</Pill>}</td>
                    <td style={tdL}>{!signed && <button className="btn sm" onClick={() => { setClearing(clearing === x.id ? null : x.id); setWhy(""); }}>Clear…</button>}</td>
                  </tr>
                  {clearing === x.id && (
                    <tr><td colSpan={7} style={{ padding: "4px 10px 10px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why it is cleared — e.g. check voided 11/3, reversed in Skyline" style={{ flex: "1 1 320px" }} />
                        <button className="btn primary sm" disabled={!why.trim()} onClick={() => { onResolve(x, why.trim()); setClearing(null); }}>Clear it</button>
                        <span className="muted" style={{ fontSize: "var(--fs-12)" }}>It stops carrying forward; the note is kept.</span>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
              <td style={tdL} colSpan={3}>Total · {items.length}</td>
              <td style={td}>{money(items.reduce((s, x) => s + x.amount, 0))}</td><td colSpan={3} />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function ItemTable({ title, head, rows, tone }: { title: string; head: string[]; rows: string[][]; tone?: string }) {
  return (
    <div>
      {title && <div style={{ ...SECTION, color: tone ?? SECTION.color }}>{title}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={i >= head.length - 1 || /Skyline$|Bank$|Amount|Difference/.test(h) ? th : thL}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            {r.map((c, j) => <td key={j} style={{ ...(j >= r.length - 1 || /Skyline$|Bank$|Amount|Difference/.test(head[j]) ? td : tdL), whiteSpace: "normal", fontSize: "var(--fs-13)" }}>{c}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Skyline's cash by property against the GL's cash accounts at month end. */
function GlCard({ gl, period }: { gl: GlCheck[]; period: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const off = gl.filter((g) => g.difference != null && Math.abs(g.difference) >= 0.005);
  const sorted = [...gl].sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0) || a.company.localeCompare(b.company));
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 18px 8px" }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Skyline vs the GL, by Property</div>
        <div className="muted small" style={{ marginTop: 3 }}>
          Each property&rsquo;s share of every checking account (Skyline&rsquo;s &ldquo;Account Ownership by Property/Company&rdquo;) against the cash accounts on its GL at {dateLabel(periodEndOf(period))}.
          {off.length ? ` ${off.length} do not tie — open one for the lines behind it.` : " Every property with a GL ties."}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead><tr><th style={thL}>Property</th><th style={th}>Skyline</th><th style={th}>GL cash</th><th style={th}>Difference</th><th style={thL}>Note</th></tr></thead>
          <tbody>
            {sorted.map((g) => {
              const bad = g.difference != null && Math.abs(g.difference) >= 0.005;
              const isOpen = open === g.company;
              return (
                <Fragment key={g.company}>
                  <tr onClick={() => bad && setOpen(isOpen ? null : g.company)} style={{ borderTop: "1px solid var(--border)", cursor: bad ? "pointer" : "default" }}>
                    <td style={tdL}><b>{g.company}</b>{g.glKey !== g.company && <span className="muted" style={{ fontSize: "var(--fs-12)" }}> · GL {g.glKey}</span>}</td>
                    <td style={td}>
                      <HoverCard title={`${g.company} in Skyline`} rows={g.accounts.slice(0, 9).map((a) => ({ label: a.key, value: money(a.amount) }))}>{money(g.skyline)}</HoverCard>
                    </td>
                    <td style={td}>{g.gl == null ? "—" : <HoverCard title={`${g.glKey} GL cash`} rows={g.glAccounts.slice(0, 9).map((a) => ({ label: `${a.code} ${a.name}`, value: money(a.balance) }))}>{money(g.gl)}</HoverCard>}</td>
                    <td style={{ ...td, fontWeight: 700, color: bad ? "var(--c-b91c1c)" : undefined }}>{g.difference == null ? "—" : bad ? money(g.difference) : <Pill tone={TONE_GREEN}>TIES</Pill>}</td>
                    <td style={{ ...tdL, whiteSpace: "normal", fontSize: "var(--fs-12-5)" }} className="muted">{g.note ?? (bad ? `${g.glOnly.length + g.skylineOnly.length} lines don't match — open` : "")}</td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={5} style={{ padding: "6px 18px 16px", maxWidth: 0, background: "var(--tint-brand-faint, rgba(11,74,125,0.025))" }}>
                      {g.glOnly.length > 0 && <ItemTable title={`On the GL, not in Skyline's register (${shortPeriod(period)})`} head={["Date", "Ref", "Vendor / Description", "Account", "Amount"]}
                        rows={g.glOnly.map((x) => [dateLabel(x.dateISO), x.ref, x.description, x.code, money(x.amount)])} />}
                      {g.skylineOnly.length > 0 && <ItemTable title="In Skyline's register, not on the GL" head={["Date", "Ref", "Description", "Checking", "Amount"]}
                        rows={g.skylineOnly.map((x) => [dateLabel(x.dateISO), x.ref, x.description, x.key, money(x.amount)])} />}
                      {!g.glOnly.length && !g.skylineOnly.length && <div className="muted small">Every line this month agrees — the gap is from an earlier month (check the opening balances).</div>}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// While the month runs (one request, up to a couple of minutes): an animated
// card so a long run reads as WORKING, not stuck — a sweep across the
// accounts on file, the stage it is likely on, and a running clock. The stages
// advance on time, not on the server's progress (the run is one request), so
// the last one HOLDS rather than looping back to the start.
const REC_STAGES = [
  "Reading Skyline's checking register",
  "Matching checks by number",
  "Matching deposits and receipt batches",
  "Carrying open items from last month",
  "Checking Skyline against the GL",
  "Writing the month's record",
];
function ReconcilingCard({ period, accounts }: { period: string; accounts: string[] }) {
  // The portal's one loader (owner, 11/2026: "bank rec loading state is
  // different… should it be"), with the stage it is likely on and a clock —
  // the run is one long request, so the stages advance on time and the last
  // one holds.
  const [t, setT] = useState(0);
  useEffect(() => { const start = Date.now(); const id = setInterval(() => setT((Date.now() - start) / 1000), 500); return () => clearInterval(id); }, []);
  const stage = Math.min(REC_STAGES.length - 1, Math.floor(t / 3.5));
  const secs = Math.floor(t);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <LoadingState
      status={`${REC_STAGES[stage]}${stage === REC_STAGES.length - 1 && t > 30 ? " — big month, still going" : ""}…`}
      context={`Reconciling ${accounts.length ? `${accounts.length} accounts` : "every account"} for ${periodLabel(period)} · ${clock} · usually under a minute`}
      columns={5} rows={6} />
  );
}

// Marie's Skyline rec is the answer key for a month she has reconciled. The
// column flags only where the portal DISAGREES with her — an agreeing row says
// so quietly, so the exceptions are what the eye lands on.
function marieCell(a: AccountRow) {
  const vs = a.skylineRec?.vs;
  if (!a.skylineRec) return <span className="muted small">—</span>;
  if (!vs) return <span className="muted small">other month</span>;
  if (vs.agrees) return <span className="small" style={{ color: "var(--c-067647, #067647)", display: "inline-flex", alignItems: "center", gap: 4 }}><CircleCheck size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px", flexShrink: 0 }} />Agrees</span>;
  const n = vs.onlyMarie.length + vs.onlyPortal.length;
  return <Pill tone={TONE_AMBER}>DIFFERS{n ? ` · ${n}` : ""}</Pill>;
}

function MarieDiff({ vs, file }: { vs: NonNullable<NonNullable<AccountRow["skylineRec"]>["vs"]>; file: string }) {
  const off = (x: { marie: number | null; portal: number | null }) => x.marie != null && x.portal != null && Math.round(x.marie * 100) !== Math.round(x.portal * 100);
  const row = (it: OpenItem) => [dateLabel(it.dateISO), it.ref || "—", it.description, money(it.amount)];
  return (
    <div style={{ border: "1px solid #f3d19c", background: "var(--tint-amber-bg, rgba(245,158,11,0.06))", borderRadius: 10, padding: "12px 14px", display: "grid", gap: 10 }}>
      <div style={{ ...SECTION, color: "var(--c-b45309)" }}>Against Marie&rsquo;s rec <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· {file}</span></div>
      {(off(vs.statement) || off(vs.checkBook)) && (
        <ItemTable title="" head={["", "Marie", "Portal", "Difference"]} rows={[
          ...(off(vs.statement) ? [["Statement balance", money(vs.statement.marie), money(vs.statement.portal), money((vs.statement.portal ?? 0) - (vs.statement.marie ?? 0))]] : []),
          ...(off(vs.checkBook) ? [["Check book (Skyline) balance", money(vs.checkBook.marie), money(vs.checkBook.portal), money((vs.checkBook.portal ?? 0) - (vs.checkBook.marie ?? 0))]] : []),
        ]} />
      )}
      {vs.onlyMarie.length > 0 && <ItemTable title={`Open on Marie's rec, cleared by the portal (${vs.onlyMarie.length})`} head={["Date", "Check #", "Description", "Amount"]} rows={vs.onlyMarie.map(row)} />}
      {vs.onlyPortal.length > 0 && <ItemTable title={`Open in the portal, not on Marie's rec (${vs.onlyPortal.length})`} head={["Date", "Ref", "Description", "Amount"]} rows={vs.onlyPortal.map(row)} />}
    </div>
  );
}
