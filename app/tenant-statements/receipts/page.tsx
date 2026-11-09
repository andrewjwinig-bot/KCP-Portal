"use client";

// Receipt Reconciliation — a tenant paid an amount that doesn't line up with
// their statement; work out what they MEANT, tell them how it will be applied,
// and apply it by the hierarchy if they don't answer (owner, 11/2026: "get in
// the brain of the tenant and figure out what charges they meant to apply to
// … provide transparency via email"). Tami's page.
//
// Pick a tenant → their open charges, credit and net due (the laser statement,
// lib/statements) → type what they paid → the explanations, best first
// (lib/statements/receiptMatch.ts) → the standard email, typed in place → send.
// The tenant has two business days to answer; with no answer the plan stands
// and the receipt moves to "Ready to apply" — the entries to key in Skyline.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StatPill, Pill, TONE_AMBER, TONE_BLUE, TONE_GREEN, TONE_NEUTRAL } from "@/app/components/Pill";
import { Calendar } from "@/app/components/Calendar";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import { APPLICATION_LABEL, APPLICATION_ORDER, type Account, type Explanation } from "@/lib/statements/receiptMatch";
import { HoverCard } from "@/app/components/HoverCard";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const periodLabel = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (iso: string | null) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(2, 4)}` : "—");
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const SECTION: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

type DataDates = { dataThrough: string | null; importedOn: string | null; stampRead?: boolean };
const etStamp = (iso: string, withTime: boolean) => new Date(iso).toLocaleString("en-US", {
  timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
});
type TenantRow = { unitRef: string; tenantName: string; propertyCode: string; propertyName: string; gross: number; credit: number; net: number };
type Status = "draft" | "waiting" | "apply" | "posted";
type Receipt = {
  id: string; period: string; unitRef: string; tenantName: string; propertyCode: string; amount: number; receivedISO: string; checkNo: string | null;
  plan: Explanation; email: { to: string[]; subject: string; sentAt: string; sentBy: string | null; from?: string } | null; respondByISO: string | null;
  reply: { at: string; by: string | null; note: string } | null; postedAt: string | null; postedBy: string | null; createdAt: string; createdBy: string | null;
  status: Status;
};
type Detail = {
  period: string; asOf: string | null; dates: DataDates;
  tenant: { unitRef: string; tenantName: string; propertyCode: string; propertyName: string; suite: string; tiesOut: boolean };
  account: Account; explanations: Explanation[]; plan: Explanation | null; recipients: string[];
  draft: { subject: string; body: string } | null; respondBy: string;
};

const STATUS_PILL: Record<Status, React.ReactNode> = {
  apply: <Pill tone={TONE_GREEN}>READY TO APPLY</Pill>,
  waiting: <Pill tone={TONE_AMBER}>WAITING ON TENANT</Pill>,
  draft: <Pill tone={TONE_NEUTRAL}>DRAFT · NOT SENT</Pill>,
  posted: <Pill tone={TONE_BLUE}>POSTED</Pill>,
};
const STATUS_ORDER: Status[] = ["apply", "waiting", "draft", "posted"];
const STATUS_BAND: Record<Status, string> = { apply: "Ready to apply in Skyline", waiting: "Waiting on the tenant", draft: "Drafts", posted: "Posted" };

function confidenceTone(e: Explanation) {
  if (e.fallback) return <Pill tone={TONE_NEUTRAL}>STANDARD ORDER</Pill>;
  if (e.confidence >= 85) return <Pill tone={TONE_GREEN}>MOST LIKELY</Pill>;
  if (e.exact) return <Pill tone={TONE_BLUE}>EXACT MATCH</Pill>;
  return <Pill tone={TONE_AMBER}>CLOSE</Pill>;
}

export default function ReceiptReconciliationPage() {
  const [period, setPeriod] = useState<string | null>(null);
  const [periods, setPeriods] = useState<string[]>([]);
  const [monthDates, setMonthDates] = useState<DataDates | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The payment being worked.
  const [unit, setUnit] = useState<string>("");
  const [amountText, setAmountText] = useState("");
  const [received, setReceived] = useState(todayISO());
  const [checkNo, setCheckNo] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const [custom, setCustom] = useState<{ on: boolean; idx: Set<number>; credit: boolean }>({ on: false, idx: new Set(), credit: false });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attach, setAttach] = useState(true);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answering, setAnswering] = useState<Receipt | null>(null);
  /** A saved draft re-opened: sending it replaces the draft, not a second record. */
  const [draftId, setDraftId] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const amount = Number(amountText.replace(/[$,\s]/g, ""));
  const validAmount = Number.isFinite(amount) && amount > 0;
  const effectivePlan = custom.on && custom.idx.size ? `custom${custom.credit ? "-net" : ""}:${[...custom.idx].sort((a, b) => a - b).join(",")}` : planId;

  const loadList = useCallback(async (p?: string | null) => {
    const r = await fetch(`/api/tenant-statements/receipts${p ? `?period=${p}` : ""}`, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!j?.ok) { setError(j?.error ?? "Could not load the statements."); return; }
    setPeriod(j.period); setPeriods(j.periods); setMonthDates(j.dates ?? null); setTenants(j.tenants); setReceipts(j.receipts);
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  // Re-read the tenant + explanations + draft whenever the inputs move.
  const seq = useRef(0);
  useEffect(() => {
    if (!period || !unit) { setDetail(null); return; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const q = new URLSearchParams({ period, unit, received, ...(validAmount ? { amount: String(amount) } : {}), ...(checkNo ? { check: checkNo } : {}), ...(effectivePlan ? { plan: effectivePlan } : {}), attach: attach ? "1" : "0" });
      const r = await fetch(`/api/tenant-statements/receipts?${q}`, { cache: "no-store" }).catch(() => null);
      const j = r ? await r.json().catch(() => null) : null;
      if (my !== seq.current) return;
      if (!j?.ok) { setError(j?.error ?? "Could not read that tenant."); return; }
      setError(null); setDetail(j);
      if (!edited && j.draft) { setSubject(j.draft.subject); setBody(j.draft.body); }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, unit, amountText, received, checkNo, effectivePlan, attach]);

  // A new reading of the payment resets the wording to the standard one.
  useEffect(() => { setEdited(false); }, [effectivePlan, unit, amountText, attach]);

  const pickTenant = (u: string) => {
    setUnit(u); setPlanId(null); setCustom({ on: false, idx: new Set(), credit: false }); setExcluded(new Set()); setAnswering(null); setDraftId(null); setEdited(false);
  };
  const resetWork = () => { pickTenant(""); setAmountText(""); setCheckNo(""); setReceived(todayISO()); };

  // The tenant dropdown: grouped by property in statement order, A–Z within.
  const byProperty = useMemo(() => {
    const m = new Map<string, TenantRow[]>();
    for (const t of tenants) { const k = `${t.propertyCode} · ${t.propertyName}`; m.set(k, [...(m.get(k) ?? []), t]); }
    return [...m.entries()].map(([k, rows]) => [k, rows.sort((x, y) => x.tenantName.localeCompare(y.tenantName))] as const);
  }, [tenants]);

  const plan = detail?.plan ?? null;
  /** The tenant's own data dates once one is picked, else the month's. */
  const dataDates: DataDates | null = detail?.dates ?? monthDates;
  /** A payment is typed and read — show what it covers. */
  const applying = !!(detail && validAmount && plan);
  const appliedByIdx = useMemo(() => new Map((plan?.lines ?? []).map((l) => [l.idx, l])), [plan]);
  const to = (detail?.recipients ?? []).filter((e) => !excluded.has(e.toLowerCase()));

  async function save(action: "send" | "draft") {
    if (!detail || !plan || !validAmount || !period) return;
    setBusy(true); setError(null);
    const r = await fetch("/api/tenant-statements/receipts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: draftId ?? undefined, period, unitRef: detail.tenant.unitRef, amount, receivedISO: received, checkNo, plan: plan.id, subject, body, exclude: [...excluded], attachStatement: attach }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setBusy(false); setConfirming(false);
    if (!j?.ok) { setError(j?.error ?? "That did not save."); return; }
    resetWork(); await loadList(period);
  }

  async function act(id: string, action: "confirm" | "posted" | "unposted", extra: Record<string, unknown> = {}) {
    setBusy(true);
    const r = await fetch("/api/tenant-statements/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, ...extra }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setBusy(false);
    if (!j?.ok) { setError(j?.error ?? "That did not save."); return; }
    await loadList(period);
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this receipt record? Nothing has been posted from it.")) return;
    await fetch("/api/tenant-statements/receipts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    await loadList(period);
  }

  // "The tenant answered" — open the payment in the worker with that record's
  // tenant and amount, and save the chosen plan as the confirmed one.
  function answer(rec: Receipt, asDraft = false) {
    if (rec.period !== period) setPeriod(rec.period);
    pickTenant(rec.unitRef);
    if (asDraft) setDraftId(rec.id); else setAnswering(rec);
    setAmountText(String(rec.amount)); setReceived(rec.receivedISO); setCheckNo(rec.checkNo ?? "");
    setPlanId(rec.plan.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const counts = useMemo(() => {
    const c: Record<Status, number> = { apply: 0, waiting: 0, draft: 0, posted: 0 };
    for (const r of receipts) c[r.status]++;
    return c;
  }, [receipts]);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0 }}>Receipt Reconciliation</h1>
            {period && (
              <select className="select-brand" value={period} onChange={(e) => { setPeriod(e.target.value); resetWork(); loadList(e.target.value); }} aria-label="Statement month">
                {periods.map((p) => <option key={p} value={p}>{periodLabel(p)} statement</option>)}
              </select>
            )}
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            A payment that doesn&rsquo;t match the statement: find what the tenant meant, tell them how it will be applied, and apply it if they don&rsquo;t answer.
          </div>
        </div>
        <div className="pills" style={{ margin: 0 }}>
          <StatPill label="Ready to apply" value={counts.apply} accent={counts.apply ? "#15803d" : undefined} />
          <StatPill label="Waiting on tenant" value={counts.waiting} accent={counts.waiting ? "#b45309" : undefined} />
        </div>
      </header>

      {error && <div className="card" style={{ color: "#b91c1c", fontWeight: 600, fontSize: 13 }}>{error}</div>}

      {/* The figures are only as current as the laser statement behind them —
          a payment or charge keyed in Skyline since will not be here. The
          tenant's own import date when one is picked, else the month's. */}
      {dataDates && (dataDates.dataThrough || dataDates.importedOn) && (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", border: "1px solid rgba(217,119,6,0.35)", background: "rgba(217,119,6,0.08)", borderRadius: 12, padding: "12px 16px" }}>
          <span aria-hidden style={{ fontSize: 18, lineHeight: 1.2, color: "#b45309" }}>⚠</span>
          <div style={{ display: "grid", gap: 2 }}>
            {dataDates.dataThrough ? (
              <div style={{ fontWeight: 800, color: "#b45309" }}>
                Data through {etStamp(dataDates.dataThrough, true)}{detail ? ` for ${detail.tenant.tenantName}` : ""} — when Skyline ran the laser statement.
              </div>
            ) : (
              <div style={{ fontWeight: 800, color: "#b45309" }}>
                Imported {etStamp(dataDates.importedOn!, false)}{detail ? ` for ${detail.tenant.tenantName}` : ""} — the data is at least this old.
              </div>
            )}
            <div className="small">
              {dataDates.dataThrough
                ? <>Open items as posted in Skyline up to that moment{dataDates.importedOn ? <> (imported into the portal {etStamp(dataDates.importedOn, false)})</> : null}. </>
                : dataDates.stampRead
                  ? <>Skyline&rsquo;s file doesn&rsquo;t record when the report was run, so this is the latest it could be — the run may be earlier. </>
                  : <>This was imported before the portal read the export time — re-import the laser statement to capture when Skyline ran it. </>}
              Anything posted since — a payment, a credit, a new charge — isn&rsquo;t shown here. Check the tenant&rsquo;s <b>Occupant History</b> in Skyline for unposted items before you reconcile or email them.
            </div>
          </div>
        </div>
      )}

      {/* ── 1. The payment ───────────────────────────────────────────── */}
      <section className="card" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{answering ? `The tenant answered — ${answering.tenantName}` : "Work a payment"}</div>
          {(unit || answering) && <button className="btn sm" onClick={resetWork}>Clear</button>}
        </div>
        {answering && (
          <div className="small" style={{ background: "rgba(11,74,125,0.06)", border: "1px solid rgba(11,74,125,0.2)", borderRadius: 10, padding: "8px 12px" }}>
            Pick the application they asked for (or keep ours), add what they said, and confirm. Nothing is emailed.
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4, flex: "1 1 320px", minWidth: 0 }}>
            <span style={SECTION}>Tenant</span>
            {unit && detail ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
                <span style={{ fontWeight: 700 }}>{detail.tenant.tenantName}</span>
                <code className="muted" style={{ fontSize: 12 }}>{detail.tenant.unitRef}</code>
                {!answering && <button className="btn sm" onClick={() => pickTenant("")}>Change</button>}
              </div>
            ) : (
              <select value="" onChange={(e) => { if (e.target.value) pickTenant(e.target.value); }} aria-label="Tenant" style={{ width: "100%" }}>
                <option value="">Select a tenant…</option>
                {byProperty.map(([prop, rows]) => (
                  <optgroup key={prop} label={prop}>
                    {rows.map((t) => <option key={t.unitRef} value={t.unitRef}>{t.tenantName} · {t.unitRef} — {money(t.net)}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
          </label>
          <label style={{ display: "grid", gap: 4, flex: "0 0 160px" }}>
            <span style={SECTION}>Amount paid</span>
            <input inputMode="decimal" placeholder="$0.00" value={amountText} disabled={!!answering} onChange={(e) => { setAmountText(e.target.value); setPlanId(null); setCustom((c) => ({ ...c, on: false })); }} style={{ fontWeight: 700, fontSize: 15 }} />
          </label>
          <div style={{ display: "grid", gap: 4, flex: "0 0 auto" }}>
            <span style={SECTION}>Received</span>
            <Calendar value={received} onChange={setReceived} variant="card" maxISO={todayISO()} />
          </div>
          <label style={{ display: "grid", gap: 4, flex: "0 0 130px" }}>
            <span style={SECTION}>Check #</span>
            <input value={checkNo} onChange={(e) => setCheckNo(e.target.value)} placeholder="optional" />
          </label>
        </div>

        {detail && (
          <>
            <div className="pills" style={{ justifyContent: "flex-start", margin: 0 }}>
              <StatPill label="Open charges" value={money(detail.account.gross)} sub={`${detail.account.charges.length} charge${detail.account.charges.length === 1 ? "" : "s"}`} />
              <StatPill label="Open credit" value={detail.account.credit ? `(${money(detail.account.credit)})` : "—"} accent={detail.account.credit ? "#15803d" : undefined} />
              <StatPill label="Net due" value={money(detail.account.net)} total />
              {validAmount && <StatPill label="They paid" value={money(amount)} sub={amount === detail.account.net ? "exactly the balance" : `${money(amount - detail.account.net)} vs balance`} accent={Math.abs(amount - detail.account.net) < 0.005 ? "#15803d" : "#b45309"} />}
            </div>
            {!detail.tenant.tiesOut && <div className="small" style={{ color: "#b45309", fontWeight: 600 }}>This tenant&rsquo;s statement did not tie out on import — check the charges below against Skyline before sending.</div>}
          </>
        )}
      </section>

      {/* ── 2. What did they mean? ───────────────────────────────────── */}
      {detail && validAmount && (
        <section className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>What they most likely meant</div>
            <label className="small" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={custom.on} onChange={(e) => setCustom((c) => ({ ...c, on: e.target.checked }))} /> Pick the charges myself
            </label>
          </div>
          {!custom.on && (
            <div style={{ display: "grid", gap: 8 }}>
              {detail.explanations.map((e) => {
                const on = (plan?.id ?? null) === e.id;
                return (
                  <button key={e.id} type="button" onClick={() => setPlanId(e.id)} style={{
                    textAlign: "left", cursor: "pointer", borderRadius: 12, padding: "10px 14px", display: "grid", gap: 4,
                    border: `1.5px solid ${on ? "#0b4a7d" : "var(--border)"}`, background: on ? "rgba(11,74,125,0.05)" : "var(--card)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span aria-hidden style={{ width: 14, height: 14, borderRadius: 999, border: `2px solid ${on ? "#0b4a7d" : "var(--muted)"}`, background: on ? "radial-gradient(#0b4a7d 45%, transparent 50%)" : "transparent", flex: "none" }} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{e.title}</span>
                      {confidenceTone(e)}
                    </div>
                    <div className="small" style={{ color: "var(--text)", marginLeft: 22 }}>{e.why}</div>
                    <div className="muted small" style={{ marginLeft: 22 }}>
                      {e.lines.length} charge{e.lines.length === 1 ? "" : "s"}
                      {e.creditUsed > 0 && <> · uses {money(e.creditUsed)} of the credit</>}
                      {e.unapplied > 0.005 && <> · {money(e.unapplied)} held as a credit</>}
                      {" · "}balance after {e.balanceAfter < 0 ? `${money(-e.balanceAfter)} credit` : money(e.balanceAfter)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {custom.on && detail.account.credit > 0 && (
            <label className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={custom.credit} onChange={(e) => setCustom((c) => ({ ...c, credit: e.target.checked }))} /> Use their {money(detail.account.credit)} credit first
            </label>
          )}

        </section>
      )}

      {/* ── Open charges & credits — as soon as a tenant is picked; once a
          payment is typed, what it covers is highlighted line by line. ── */}
      {detail && (
        <section className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Open charges &amp; credits</div>
            {!applying && <div className="muted small">Type what they paid to see how it applies.</div>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {custom.on && applying && <th style={thL} />}
                <th style={thL}>Date</th><th style={thL}>Charge</th>
                <th style={thL}>
                  <HoverCard title="Master order of application" width={300} rows={[]} body={
                    <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.6, textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                      {APPLICATION_ORDER.map((x) => <li key={x.key}>{x.label}{x.code ? <span className="muted"> · {x.code}</span> : null}</li>)}
                      <li style={{ listStyle: "none", marginLeft: -20, marginTop: 4 }} className="muted">Oldest first within each.</li>
                    </ol>
                  }>
                    <span style={{ cursor: "help", borderBottom: "1px dotted currentColor" }}>Order</span>
                  </HoverCard>
                </th><th style={th}>Open</th>
                {applying && <><th style={th}>From payment</th><th style={th}>From credit</th><th style={th}>Still open</th></>}
              </tr></thead>
              <tbody>
                {detail.account.charges.map((ch) => {
                  const a = appliedByIdx.get(ch.idx);
                  const left = ch.amount - (a?.fromPayment ?? 0) - (a?.fromCredit ?? 0);
                  return (
                    <tr key={ch.idx} style={{ borderTop: "1px solid var(--border)", background: a ? "rgba(22,163,74,0.06)" : undefined }}>
                      {custom.on && applying && <td style={tdL}><input type="checkbox" checked={custom.idx.has(ch.idx)} onChange={(e) => setCustom((c) => { const s = new Set(c.idx); if (e.target.checked) s.add(ch.idx); else s.delete(ch.idx); return { ...c, idx: s }; })} /></td>}
                      <td style={tdL}>{dateLabel(ch.dateISO)}</td>
                      <td style={{ ...tdL, whiteSpace: "normal" }}>{ch.description}</td>
                      <td style={tdL}><span className="muted small">{APPLICATION_ORDER.findIndex((x) => x.key === ch.appClass) + 1}. {APPLICATION_LABEL[ch.appClass]}</span></td>
                      <td style={td}>{money(ch.amount)}</td>
                      {applying && <>
                      <td style={{ ...td, fontWeight: a?.fromPayment ? 700 : 400, color: a?.fromPayment ? "#15803d" : "var(--muted)" }}>{a?.fromPayment ? money(a.fromPayment) : "—"}</td>
                      <td style={{ ...td, color: a?.fromCredit ? "#15803d" : "var(--muted)" }}>{a?.fromCredit ? money(a.fromCredit) : "—"}</td>
                      <td style={{ ...td, color: left > 0.005 ? "var(--text)" : "var(--muted)" }}>{left > 0.005 ? money(left) : "—"}</td>
                      </>}
                    </tr>
                  );
                })}
                {detail.account.creditLines.map((cl, i) => (
                  <tr key={`c${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                    {custom.on && applying && <td />}
                    <td style={tdL}>{dateLabel(cl.dateISO)}</td>
                    <td style={tdL}>{cl.description}</td>
                    <td style={tdL}><span className="muted small">Credit</span></td>
                    <td style={{ ...td, color: "#15803d" }}>({money(cl.amount)})</td>
                    {applying && <td colSpan={3} />}
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  {custom.on && applying && <td />}
                  <td style={tdL} /><td style={{ ...tdL, fontWeight: 700 }}>Balance due</td><td style={tdL} />
                  <td style={{ ...td, fontWeight: 800 }}>{money(detail.account.net)}</td>
                  {applying && <td colSpan={3} />}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* The email step is visible from the moment a tenant is picked, so it
          is never a mystery where the draft is — it fills in once a payment is typed. */}
      {detail && !applying && !answering && (
        <section className="card" style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Draft email to the tenant</div>
          <div className="muted small">Type the amount they paid above — the email drafts itself from how the payment applies, ready to edit and send.</div>
        </section>
      )}

      {/* ── 3. Tell the tenant ───────────────────────────────────────── */}
      {detail && validAmount && plan && !answering && (
        <section className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Draft email to the tenant</div>
            <div className="muted small">They have until <b>{longDate(detail.respondBy)}</b> to answer; after that it applies as shown.</div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={SECTION}>To</span>
            {detail.recipients.length ? detail.recipients.map((e) => (
              <label key={e} className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={!excluded.has(e.toLowerCase())} onChange={(ev) => setExcluded((s) => { const n = new Set(s); if (ev.target.checked) n.delete(e.toLowerCase()); else n.add(e.toLowerCase()); return n; })} />
                {e}
              </label>
            )) : <div className="small" style={{ color: "#b45309", fontWeight: 600 }}>No email on file for this suite — add a contact on the <a href={`/units/${detail.tenant.unitRef}`}>unit page</a>, or save it as a draft.</div>}
          </div>
          <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            Attach their {period ? periodLabel(period) : ""} statement (PDF)
            <a href={`/api/tenant-statements/receipts?period=${period}&unit=${encodeURIComponent(detail.tenant.unitRef)}&pdf=1`} target="_blank" rel="noreferrer">Preview</a>
          </label>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <input value={subject} onChange={(e) => { setSubject(e.target.value); setEdited(true); }} aria-label="Subject"
              style={{ width: "100%", border: 0, borderBottom: "1px solid var(--border)", borderRadius: 0, padding: "10px 14px", fontWeight: 700, background: "transparent" }} />
            <textarea value={body} onChange={(e) => { setBody(e.target.value); setEdited(true); }} aria-label="Message" rows={Math.min(34, Math.max(14, body.split("\n").length + 1))}
              style={{ width: "100%", border: 0, borderRadius: 0, padding: "12px 14px", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.55, resize: "vertical", background: "transparent" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="muted small">
              The standard wording, with this tenant&rsquo;s figures. Edit freely{edited && <> · <button className="btn sm" onClick={() => setEdited(false)}>Reset to standard wording</button></>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(`${subject}\n\n${body}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } }}>{copied ? "Copied ✓" : "Copy email"}</button>
              <button className="btn" disabled={busy} onClick={() => save("draft")}>Save draft</button>
              <button className="btn primary" disabled={busy || !to.length} onClick={() => setConfirming(true)} title={!to.length ? "No email on file for this suite" : undefined}>Send email…</button>
            </div>
          </div>
        </section>
      )}

      {answering && detail && plan && validAmount && (
        <AnswerCard rec={answering} plan={plan} busy={busy} onConfirm={async (note) => { await act(answering.id, "confirm", { plan: plan.id, note }); resetWork(); }} />
      )}

      {/* ── Receipts in progress ─────────────────────────────────────── */}
      <section className="card" style={{ padding: 0 }}>
        <div style={{ padding: "14px 18px 6px", fontSize: 17, fontWeight: 800 }}>Receipts</div>
        {!receipts.length ? <div className="muted small" style={{ padding: "6px 18px 16px" }}>None yet — work a payment above.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={thL}>Tenant</th><th style={thL}>Received</th><th style={th}>Paid</th><th style={thL}>Applied as</th><th style={thL}>Status</th><th style={thL} />
              </tr></thead>
              <tbody>
                {STATUS_ORDER.map((s) => {
                  const rows = receipts.filter((r) => r.status === s);
                  if (!rows.length) return null;
                  return (
                    <Fragment key={s}>
                      <tr style={{ background: "rgba(11,74,125,0.07)" }}><td colSpan={6} style={{ ...tdL, fontWeight: 800 }}>{STATUS_BAND[s]} <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>· {rows.length}</span></td></tr>
                      {rows.map((r) => {
                        const isOpen = openRow === r.id;
                        return (
                          <Fragment key={r.id}>
                            <tr style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }} onClick={() => setOpenRow(isOpen ? null : r.id)}>
                              <td style={{ ...tdL, whiteSpace: "normal" }}><span className="muted" style={{ fontSize: 10, marginRight: 6 }}>{isOpen ? "▾" : "▸"}</span><b>{r.tenantName}</b> <code className="muted" style={{ fontSize: 12 }}>{r.unitRef}</code></td>
                              <td style={tdL}>{dateLabel(r.receivedISO)}{r.checkNo ? <span className="muted small"> · #{r.checkNo}</span> : null}</td>
                              <td style={{ ...td, fontWeight: 700 }}>{money(r.amount)}</td>
                              <td style={{ ...tdL, whiteSpace: "normal" }}>{r.plan.title}</td>
                              <td style={tdL}>
                                {STATUS_PILL[r.status]}
                                {r.status === "waiting" && r.respondByISO && <div className="muted small" style={{ marginTop: 2 }}>answer by {longDate(r.respondByISO)}</div>}
                                {r.status === "apply" && <div className="muted small" style={{ marginTop: 2 }}>{r.reply ? `tenant answered ${dateLabel(r.reply.at.slice(0, 10))}` : "no answer — applies as emailed"}</div>}
                              </td>
                              <td style={{ ...td, whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                                {r.status === "waiting" && <button className="btn sm" onClick={() => answer(r)}>Tenant answered…</button>}
                                {r.status === "draft" && <button className="btn sm" onClick={() => answer(r, true)}>Open</button>}{" "}
                                {r.status === "apply" && <button className="btn sm primary" disabled={busy} onClick={() => act(r.id, "posted")}>Mark posted</button>}
                                {r.status === "posted" && <button className="btn sm" disabled={busy} onClick={() => act(r.id, "unposted")}>Undo</button>}
                                {r.status !== "posted" && <> <button className="btn sm" onClick={() => remove(r.id)} title="Delete">✕</button></>}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr><td colSpan={6} style={{ padding: "4px 18px 16px", background: "rgba(11,74,125,0.025)", maxWidth: 0 }}>
                                <div style={{ display: "grid", gap: 8 }}>
                                  <div style={SECTION}>Key in Skyline</div>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead><tr><th style={thL}>Charge date</th><th style={thL}>Charge</th><th style={th}>Payment</th><th style={th}>Credit</th></tr></thead>
                                    <tbody>{r.plan.lines.map((l, i) => (
                                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                                        <td style={tdL}>{dateLabel(l.dateISO)}</td><td style={tdL}>{l.description}</td>
                                        <td style={td}>{l.fromPayment ? money(l.fromPayment) : "—"}</td><td style={td}>{l.fromCredit ? money(l.fromCredit) : "—"}</td>
                                      </tr>
                                    ))}
                                    {r.plan.unapplied > 0.005 && <tr style={{ borderTop: "1px solid var(--border)" }}><td style={tdL} /><td style={tdL}>Held as a credit on account</td><td style={td}>{money(r.plan.unapplied)}</td><td style={td} /></tr>}
                                    </tbody>
                                  </table>
                                  <div className="muted small">
                                    {r.email ? <>Emailed {new Date(r.email.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{r.email.sentBy ? ` by ${r.email.sentBy}` : ""}{r.email.from ? ` from ${r.email.from}` : ""} to {r.email.to.join(", ")}.</> : "Not emailed."}
                                    {r.reply && <> Tenant&rsquo;s answer recorded by {r.reply.by ?? "—"}{r.reply.note ? `: “${r.reply.note}”` : ""}.</>}
                                    {r.postedAt && <> Posted {dateLabel(r.postedAt.slice(0, 10))}{r.postedBy ? ` by ${r.postedBy}` : ""}.</>}
                                  </div>
                                </div>
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
        )}
      </section>

      {confirming && detail && plan && (
        <ConfirmSend to={to} subject={subject} tenant={detail.tenant.tenantName} amount={amount} plan={plan} respondBy={detail.respondBy} busy={busy}
          onCancel={() => setConfirming(false)} onSend={() => save("send")} />
      )}
    </main>
  );
}

function AnswerCard({ rec, plan, busy, onConfirm }: { rec: Receipt; plan: Explanation; busy: boolean; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <section className="card" style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 17, fontWeight: 800 }}>Record the tenant&rsquo;s answer</div>
      <div className="small">Apply {money(rec.amount)} as: <b>{plan.title}</b>{plan.id !== rec.plan.id ? <span className="muted"> (emailed: {rec.plan.title})</span> : null}</div>
      <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What they said, e.g. “Apply it to the September CAM — we dispute the late fee.”" />
      <div><button className="btn primary" disabled={busy} onClick={() => onConfirm(note)}>Confirm — ready to apply</button></div>
    </section>
  );
}

function ConfirmSend({ to, subject, tenant, amount, plan, respondBy, busy, onCancel, onSend }: {
  to: string[]; subject: string; tenant: string; amount: number; plan: Explanation; respondBy: string; busy: boolean; onCancel: () => void; onSend: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)", display: "grid", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Send to {tenant}?</div>
        <div className="pills" style={{ justifyContent: "flex-start", margin: 0 }}>
          <StatPill label="Payment" value={money(amount)} />
          <StatPill label="Applied as" value={plan.lines.length} sub={`charge${plan.lines.length === 1 ? "" : "s"}`} />
          <StatPill label="Answer by" value={longDate(respondBy)} />
        </div>
        <div className="small"><b>{plan.title}</b></div>
        <div style={{ display: "grid", gap: 4 }}>
          <span style={SECTION}>To</span>
          {to.map((e) => <div key={e} className="small">{e}</div>)}
        </div>
        <div className="small"><span style={SECTION}>Subject</span><div>{subject}</div></div>
        <div className="muted small">From Tami Tomlinson (ttomlinson@kormancommercial.com); replies come back to her, and she gets a blind copy for the record. If they don&rsquo;t answer by {longDate(respondBy)}, the receipt moves to Ready to apply.</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={onSend} disabled={busy}>{busy ? "Sending…" : `Send to ${to.length} recipient${to.length === 1 ? "" : "s"}`}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
