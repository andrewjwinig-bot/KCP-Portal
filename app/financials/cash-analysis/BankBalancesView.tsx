"use client";

// Cash Analysis — the bank-balance view (owner: "pivot from our more complex
// cash sheet … current balance and then another column for reserves to show
// net available cash"). Import the three banks' balance exports (Chase,
// Liberty, M&T PDFs); each line shows what its accounts hold, the reserve held
// back against it, and what is left. Security deposits are tenants' money and
// are held back in full. The GL cash-flow view is kept in page.tsx, hidden.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatPill, Pill, TONE_AMBER } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { useFileDrop, byExt } from "@/app/components/useFileDrop";
import { formatImportedAt } from "@/app/components/LastImported";
import { th, thL, td as tdBase, tdL as tdLBase } from "@/app/components/tableStyles";
import { DownloadMenu } from "@/app/components/DownloadMenu";

type Account = { id: string; bank: string; last4: string; name: string; link: string | null; balance: number | null; available: number | null; asOf: string | null; prior: { balance: number; asOf: string } | null };
type Row = {
  key: string; name: string; group: string; restricted: boolean; accounts: Account[];
  balance: number | null; reserves: number; reservesAuto: number; reservesOverridden: boolean; netAvailable: number | null;
  change: number | null; priorBalance: number | null; priorAsOf: string | null;
  debt: number | null;
  loans: { lender: string; balance: number; ratePct: number; maturity: string; status: string; nextDate: string | null; nextOutlay: number | null }[];
};
type View = {
  ym: string; rows: Row[]; groups: string[]; canEdit: boolean; unplacedDebt: number;
  unmatched: { bank: string; last4: string; name: string; balance: number }[];
  byBank: { bank: string; asOf: string | null; importedAt: string | null; importedBy: string | null; accounts: number }[];
};

const BANK_LABEL: Record<string, string> = { "JPM-Chase": "Chase", "Liberty Bank": "Liberty", "M&T": "M&T" };
const money0 = (n: number | null) => {
  if (n == null) return "—";
  const v = Math.round(n);
  const s = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `($${s})` : `$${s}`;
};
const money2 = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));
const dateLabel = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const sum = (rs: Row[], f: (r: Row) => number | null) => rs.reduce((s, r) => s + (f(r) ?? 0), 0);
const shortDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

/** Week over week: green up, red down, an arrow so it reads in black and white too. */
function ChangeCell({ change, prior, priorAsOf, now, bold }: { change: number | null; prior: number | null; priorAsOf: string | null; now: number | null; bold?: boolean }) {
  if (change == null) return <span className="muted">—</span>;
  const rounded = Math.round(change);
  const color = rounded > 0 ? "#15803d" : rounded < 0 ? "#b91c1c" : "var(--muted)";
  const arrow = rounded > 0 ? "▲ " : rounded < 0 ? "▼ " : "";
  const pct = prior ? (change / Math.abs(prior)) * 100 : null;
  return (
    <HoverCard title="Week over week"
      rows={[
        { label: `Balance ${shortDate(priorAsOf)}`, value: money0(prior) },
        { label: "Balance now", value: money0(now) },
      ]}
      footer={{ label: pct != null ? `Change (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)` : "Change", value: money0(change), color }}>
      <span style={{ color, fontWeight: bold ? 700 : 600 }}>{arrow}{money0(Math.abs(change))}</span>
    </HoverCard>
  );
}
/** The rows that can be compared, and their figures. */
function changeOf(rs: Row[]) {
  const c = rs.filter((r) => r.change != null);
  if (!c.length) return { change: null, prior: null, now: null, priorAsOf: null };
  return {
    change: sum(c, (r) => r.change), prior: sum(c, (r) => r.priorBalance), now: sum(c, (r) => r.balance),
    priorAsOf: c.map((r) => r.priorAsOf).filter(Boolean).sort()[0] ?? null,
  };
}

// The Rent Roll's table type (owner: "more like the rent roll … font size and
// styles"): 13px cells, the name at 600, account numbers as 12px <code> the way
// a unit ref reads, muted 12px secondary text, totals at 700 under a 2px rule.
const td: React.CSSProperties = { ...tdBase, fontSize: 13 };
const tdL: React.CSSProperties = { ...tdLBase, fontSize: 13 };
const band: React.CSSProperties = { background: "rgba(15,23,42,0.04)", borderTop: "1px solid var(--border)", cursor: "pointer" };
const bandCell: React.CSSProperties = { ...td, fontWeight: 700 };
const netCol: React.CSSProperties = { ...td, fontWeight: 600, background: "rgba(11,74,125,0.06)" };
const reserveInput: React.CSSProperties = { width: 110, fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", backgroundColor: "var(--input-cell)" };

export default function BankBalancesView() {
  const [data, setData] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => fetch("/api/financials/bank-balances", { cache: "no-store" })
    .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? "Could not load balances"); setData(j); })
    .catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function importFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch("/api/financials/bank-balances", { method: "POST", body: fd });
      const j = await res.json();
      const failed = (j.results ?? []).filter((r: { error?: string }) => r.error);
      if (!res.ok) throw new Error(j?.error ?? "Import failed");
      const ok = (j.results ?? []).filter((r: { error?: string }) => !r.error)
        .map((r: { bank: string; accounts: number; total: number }) => `${BANK_LABEL[r.bank] ?? r.bank} · ${r.accounts} accounts · ${money0(r.total)}`);
      const mailed = j.email?.sent ? `  ·  Cash position emailed to ${j.email.to?.length ?? 0} recipient${j.email.to?.length === 1 ? "" : "s"}` : "";
      setNotice(`Imported ${ok.join("  ·  ")}${mailed}`);
      if (failed.length) setError(failed.map((r: { file: string; error: string }) => `${r.file}: ${r.error}`).join(" "));
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const drop = useFileDrop(importFiles, { accept: byExt([".pdf"]), disabled: !data?.canEdit || busy });

  const saveReserve = (row: Row, raw: string) => {
    const t = raw.replace(/[$,\s]/g, "");
    const value = t === "" ? null : Number(t);
    if (value != null && !Number.isFinite(value)) return;
    if (value === (row.reservesOverridden ? row.reserves : null)) return;
    fetch("/api/financials/cash-sheet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ym: data?.ym, code: row.key, kind: "reserves", value }),
    }).then((r) => { if (r.ok) { setDraft((d) => { const n = { ...d }; delete n[row.key]; return n; }); load(); } }).catch(() => {});
  };

  const rows = data?.rows ?? [];
  const groups = useMemo(() => (data?.groups ?? []).map((g) => ({ g, rows: rows.filter((r) => r.group === g) })).filter((x) => x.rows.length), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const operating = rows.filter((r) => !r.restricted);
  const totalCash = sum(rows, (r) => r.balance);
  const restricted = sum(rows.filter((r) => r.restricted), (r) => r.balance);
  const reserves = sum(operating, (r) => (r.balance == null ? 0 : r.reserves));
  const net = sum(operating, (r) => r.netAvailable);
  const wow = changeOf(rows);
  const debt = sum(rows, (r) => r.debt) + (data?.unplacedDebt ?? 0);
  const asOf = (data?.byBank ?? []).map((b) => b.asOf).filter(Boolean).sort().pop() ?? null;
  const missing = rows.filter((r) => r.balance == null);
  const toggle = (set: Set<string>, k: string, f: (s: Set<string>) => void) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); f(n); };

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Cash Analysis</h1>
        {asOf && <span style={{ fontSize: 20, fontWeight: 700, color: "var(--muted)" }}>Bank balances as of {dateLabel(asOf)}</span>}
      </div>

      <div className="card" {...drop.dropHandlers}
        style={drop.dragging ? { outline: "2px dashed var(--brand)", outlineOffset: -2, background: "rgba(11,74,125,0.04)" } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Bank Balances</div>
            <div className="muted small">Save each bank&apos;s accounts page as a PDF — Chase, Liberty and M&amp;T — and drop them here. Each import updates only that bank&apos;s accounts.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {data && data.byBank.length > 0 && (
            <DownloadMenu variant="default" items={[
              { label: "PDF", description: "The cash position to send ownership", href: "/api/financials/bank-balances/export?format=pdf" },
              { label: "Excel (.xlsx)", description: "Live totals, plus every account behind them", href: "/api/financials/bank-balances/export?format=xlsx" },
            ]} />
          )}
          {data?.canEdit && (
            <>
              <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()} style={{ whiteSpace: "nowrap" }}>
                {busy ? "Importing…" : drop.dragging ? "Drop to import" : "Import balances"}
              </button>
              <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: "none" }}
                onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; importFiles(f); }} />
            </>
          )}
          </div>
        </div>
        {(data?.byBank ?? []).length > 0 && (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10 }}>
            {data!.byBank.map((b) => (
              <span key={b.bank} className="muted small">
                <b style={{ color: "var(--text)" }}>{BANK_LABEL[b.bank] ?? b.bank}</b> · as of {dateLabel(b.asOf)} · imported {b.importedAt ? formatImportedAt(b.importedAt) : "—"}{b.importedBy ? ` by ${b.importedBy}` : ""}
              </span>
            ))}
          </div>
        )}
        {notice && <div className="small" style={{ marginTop: 8, color: "#15803d", fontWeight: 600 }}>{notice}</div>}
        {error && <div className="small" style={{ marginTop: 8, color: "#b91c1c", fontWeight: 600 }}>{error}</div>}
      </div>

      {data && (
        <div className="pills">
          <StatPill label="Cash in bank" value={money0(totalCash)}
            sub={wow.change != null ? `${wow.change >= 0 ? "▲" : "▼"} ${money0(Math.abs(wow.change))} since ${shortDate(wow.priorAsOf)}` : undefined} />
          <StatPill label="Security deposits" value={money0(restricted)} sub="Tenants' money" />
          <StatPill label="Reserves" value={money0(reserves)} sub="Big Projects, next 3 months" />
          <StatPill label="Net available" value={money0(net)} total />
          <StatPill label="Debt outstanding" value={money0(debt)} sub="Debt Tracker · not netted" />
        </div>
      )}

      {data && missing.length > 0 && data.byBank.length > 0 && (
        <div className="small" style={{ color: "#b45309", fontWeight: 600 }}>
          No balance imported yet for {missing.map((r) => r.name).join(", ")}.
        </div>
      )}

      {data && (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={thL}>Property / Entity</th>
              <th style={th}>Current balance</th>
              <th style={th}>Wk / Wk Change</th>
              <th style={th}>Reserves</th>
              <th style={th}>Net available</th>
              <th style={th}>Debt</th>
            </tr></thead>
            <tbody>
              {groups.map(({ g, rows: gr }) => {
                const isOpen = !collapsed.has(g);
                const restrictedGroup = gr.every((r) => r.restricted);
                return (
                  <Fragment key={g}>
                    <tr style={band} onClick={() => toggle(collapsed, g, setCollapsed)}>
                      <td style={{ ...tdL, fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                        <span style={{ display: "inline-block", width: 14 }}>{isOpen ? "▾" : "▸"}</span>{g}
                        <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>{gr.length} {gr.length === 1 ? "line" : "lines"}</span>
                      </td>
                      <td style={bandCell}>{money0(sum(gr, (r) => r.balance))}</td>
                      <td style={td}>{(() => { const g = changeOf(gr); return <ChangeCell change={g.change} prior={g.prior} now={g.now} priorAsOf={g.priorAsOf} bold />; })()}</td>
                      <td style={bandCell}>{money0(sum(gr, (r) => (r.balance == null ? 0 : r.reserves)))}</td>
                      <td style={bandCell}>{restrictedGroup ? "—" : money0(sum(gr, (r) => r.netAvailable))}</td>
                      <td style={{ ...bandCell, color: "var(--muted)" }}>{gr.some((r) => r.debt != null) ? money0(sum(gr, (r) => r.debt)) : "—"}</td>
                    </tr>
                    {isOpen && gr.map((r) => {
                      // One account: nothing to open — the line IS the account.
                      const multi = r.accounts.length > 1;
                      const expanded = multi && open.has(r.key);
                      return (
                        <Fragment key={r.key}>
                          <tr style={{ borderTop: "1px solid var(--border)", opacity: r.balance == null ? 0.55 : 1 }}>
                            <td style={{ ...tdL, fontWeight: 600, cursor: multi ? "pointer" : undefined }} onClick={multi ? () => toggle(open, r.key, setOpen) : undefined}>
                              <span style={{ display: "inline-block", width: 14, color: "var(--muted)" }}>{multi ? (expanded ? "▾" : "▸") : ""}</span>{r.name}
                              <span style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2, paddingLeft: 14, fontWeight: 400 }} onClick={(e) => e.stopPropagation()}>
                                {r.accounts.map((a) => (
                                  <a key={a.id} href={a.link ?? undefined} target="_blank" rel="noreferrer"
                                    style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
                                    {BANK_LABEL[a.bank] ?? a.bank} <code style={{ fontSize: 12 }}>{a.last4}</code>{a.link ? <span aria-hidden style={{ fontSize: 10, opacity: 0.7 }}> ↗</span> : null}
                                  </a>
                                ))}
                              </span>
                            </td>
                            <td style={td}>{money0(r.balance)}</td>
                            <td style={td}><ChangeCell change={r.change} prior={r.priorBalance} now={r.balance} priorAsOf={r.priorAsOf} /></td>
                            <td style={td}>
                              {r.restricted ? (
                                <HoverCard title="Held in full" rows={[{ label: "Tenant security deposits", value: money0(r.balance) }]} footer={{ label: "Not available to operations", value: "" }}>
                                  <span>{money0(r.balance)}</span>
                                </HoverCard>
                              ) : data.canEdit ? (
                                <HoverCard title="Reserve"
                                  rows={[
                                    { label: "Budget Big Projects (this month + next 2)", value: money0(r.reservesAuto) },
                                    ...(r.reservesOverridden ? [{ label: "Typed over", value: money0(r.reserves), color: "#0b4a7d" }] : []),
                                  ]}
                                  footer={{ label: "Blank it to go back to the budget", value: "" }}>
                                  <input value={draft[r.key] ?? (r.reserves ? Math.round(r.reserves).toLocaleString("en-US") : "")} placeholder="—"
                                    onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                                    onBlur={(e) => saveReserve(r, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    style={{ ...reserveInput, fontWeight: r.reservesOverridden ? 700 : 400, color: r.reservesOverridden ? "var(--input-typed)" : undefined }} />
                                </HoverCard>
                              ) : money0(r.reserves)}
                            </td>
                            <td style={netCol}>{r.restricted ? "—" : money0(r.netAvailable)}</td>
                            <td style={{ ...td, color: "var(--muted)" }}>
                              {r.debt == null ? "—" : (
                                <HoverCard title={`${r.name} — debt`} width={320}
                                  rows={r.loans.flatMap((l) => [
                                    { label: `${l.lender} · ${l.ratePct}% · matures ${dateLabel(l.maturity)}`, value: money0(l.balance) },
                                    ...(l.nextDate && l.nextOutlay != null ? [{ label: `  Next payment ${dateLabel(l.nextDate)} (incl. escrow)`, value: money0(l.nextOutlay) }] : []),
                                  ])}
                                  footer={{ label: "Principal outstanding today", value: money0(r.debt) }}>
                                  <span>{money0(r.debt)}</span>
                                </HoverCard>
                              )}
                            </td>
                          </tr>
                          {expanded && r.accounts.map((a) => (
                            <tr key={a.id} style={{ background: "rgba(15,23,42,0.02)" }}>
                              <td style={{ ...tdL, paddingLeft: 40, fontSize: 12 }}>
                                {a.name}<span className="muted"> · {BANK_LABEL[a.bank] ?? a.bank} <code style={{ fontSize: 12 }}>{a.last4}</code> · as of {dateLabel(a.asOf)}</span>
                              </td>
                              <td style={{ ...td, fontSize: 12 }}>
                                {a.balance != null && a.available != null && Math.abs(a.available - a.balance) >= 0.01 ? (
                                  <HoverCard title={`${BANK_LABEL[a.bank] ?? a.bank} ${a.last4}`}
                                    rows={[{ label: "Balance", value: money2(a.balance) }, { label: "Available", value: money2(a.available) }]}
                                    footer={{ label: "Difference (holds / float)", value: money2(a.balance - a.available) }}>
                                    <span>{money2(a.balance)}</span>
                                  </HoverCard>
                                ) : money2(a.balance)}
                              </td>
                              <td style={{ ...td, fontSize: 12 }}>
                                <ChangeCell change={a.balance != null && a.prior ? a.balance - a.prior.balance : null} prior={a.prior?.balance ?? null} now={a.balance} priorAsOf={a.prior?.asOf ?? null} />
                              </td>
                              <td style={td} /><td style={td} /><td style={td} />
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                <td style={{ ...tdL, fontSize: 12, color: "var(--muted)" }}>Total</td>
                <td style={{ ...td, fontWeight: 700 }}>{money0(totalCash)}</td>
                <td style={td}><ChangeCell change={wow.change} prior={wow.prior} now={wow.now} priorAsOf={wow.priorAsOf} bold /></td>
                <td style={{ ...td, fontWeight: 700 }}>{money0(reserves + restricted)}</td>
                <td style={{ ...netCol, fontWeight: 700 }}>{money0(net)}</td>
                <td style={{ ...td, fontWeight: 700, color: "var(--muted)" }}>{money0(debt)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data && data.unmatched.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Pill tone={TONE_AMBER}>NOT MAPPED</Pill>
            <span style={{ fontWeight: 700 }}>Imported accounts that match no property</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <tbody>
              {data.unmatched.map((u) => (
                <tr key={`${u.bank}${u.last4}`}>
                  <td style={tdL}>{BANK_LABEL[u.bank] ?? u.bank} {u.last4}</td>
                  <td style={tdL}>{u.name}</td>
                  <td style={td}>{money2(u.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted small" style={{ marginTop: 6 }}>Not counted in the totals above until the account is added to the bank account list.</div>
        </div>
      )}
    </main>
  );
}
