"use client";

// Weekly Cash Position — the "available cash" snapshot (modeled on the legacy
// month-end CASH REPORT) refreshed weekly. Per entity: Operating Cash, A/P,
// escrows, reserves, money market → Net Available Cash. Deductions are entered
// as negative numbers (matching the spreadsheet); Net Available is the row sum.
// Balances carry forward from the prior week until updated. Edit access mirrors
// the Cash Sheet (admin/Drew edit; Alison is view-only).

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatPill } from "@/app/components/Pill";
import { BANK_ACCOUNTS } from "@/lib/properties/data";
import {
  CASH_POSITION_BUCKETS, CASH_POSITION_GROUPS, netAvailable,
  weekEndingFriday, shiftWeek,
  type CashPositionBucket, type CashPositionEntry, type CashPositionGroup,
} from "@/lib/financials/cash-position/model";

function money0(n: number | null): string {
  if (n == null) return "—";
  const v = Math.round(n);
  const s = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `($${s})` : `$${s}`;
}
function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function parseNum(s: string): number | null {
  const t = s.replace(/[$,\s]/g, "");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const numCell: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const cashInput: React.CSSProperties = {
  width: 92, textAlign: "right", fontVariantNumeric: "tabular-nums",
  border: "1px solid transparent", borderRadius: 6, padding: "3px 6px", background: "transparent",
  font: "inherit", color: "inherit",
};
const groupHeaderCell: React.CSSProperties = {
  textAlign: "left", fontSize: 13, fontWeight: 800, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--text)", background: "rgba(15,23,42,0.04)",
  padding: "10px 12px", borderTop: "2px solid var(--border)",
};

type Payload = {
  week: string;
  entries: Record<string, CashPositionEntry>;
  updatedAt: string | null;
  updatedBy: string | null;
  weeks: string[];
  canEdit: boolean;
};

function bankLink(code?: string, last4?: string) {
  if (!code) return null;
  const acct = (BANK_ACCOUNTS[code.toUpperCase()] ?? []).find((a) => !last4 || a.last4 === last4);
  if (!acct) return null;
  return (
    <a href={acct.link} target="_blank" rel="noreferrer" title={`${acct.bank} · ${acct.label}`}
      style={{ fontSize: 11, fontWeight: 700, color: "#0b4a7d", textDecoration: "none", marginLeft: 8 }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>
      {acct.bank} {acct.last4}<span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>↗</span>
    </a>
  );
}

export default function CashPositionPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [week, setWeek] = useState<string>(weekEndingFriday());
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Draft cell values keyed "code:bucket" and notes keyed "code:note".
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const canEdit = data?.canEdit ?? false;

  const load = useCallback((w: string) => {
    setLoading(true);
    fetch(`/api/financials/cash-position?week=${encodeURIComponent(w)}`)
      .then((r) => r.json())
      .then((j: Payload & { error?: string }) => {
        if (j.error) { setError(j.error); return; }
        setData(j);
        setError(null);
        // Seed drafts from entries.
        const d: Record<string, string> = {};
        for (const [code, e] of Object.entries(j.entries)) {
          for (const b of CASH_POSITION_BUCKETS) {
            const v = e.values[b.key];
            if (v != null) d[`${code}:${b.key}`] = String(v);
          }
          if (e.note) d[`${code}:note`] = e.note;
        }
        setDrafts(d);
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(week); }, [week, load]);

  const entries = data?.entries ?? {};

  function entryFor(code: string): CashPositionEntry {
    return entries[code] ?? { values: {} };
  }

  async function saveCell(code: string, bucket: CashPositionBucket | "note", raw: string) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { week, code };
      if (bucket === "note") body.note = raw;
      else body.value = parseNum(raw);
      const res = await fetch("/api/financials/cash-position", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setData((prev) => prev ? { ...prev, entries: j.entries, updatedAt: j.updatedAt } : prev);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      load(week); // re-sync on failure
    } finally {
      setSaving(false);
    }
  }

  // ── totals ──
  const groupTotals = useMemo(() => {
    const out: Record<string, { byBucket: Record<string, number>; net: number }> = {};
    for (const g of CASH_POSITION_GROUPS) {
      const byBucket: Record<string, number> = {};
      let net = 0;
      for (const r of g.rows) {
        const e = entryFor(r.code);
        for (const b of CASH_POSITION_BUCKETS) byBucket[b.key] = (byBucket[b.key] ?? 0) + (e.values[b.key] ?? 0);
        net += netAvailable(e);
      }
      out[g.id] = { byBucket, net };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const grand = useMemo(() => {
    const byBucket: Record<string, number> = {};
    let net = 0;
    for (const g of CASH_POSITION_GROUPS) {
      const t = groupTotals[g.id];
      if (!t) continue;
      for (const b of CASH_POSITION_BUCKETS) byBucket[b.key] = (byBucket[b.key] ?? 0) + (t.byBucket[b.key] ?? 0);
      net += t.net;
    }
    return { byBucket, net };
  }, [groupTotals]);

  const colCount = 2 + CASH_POSITION_BUCKETS.length + 2; // entity + buckets + net + notes (+1 spare)

  function cell(code: string, b: CashPositionBucket, deduction: boolean) {
    const key = `${code}:${b}`;
    const saved = entryFor(code).values[b];
    if (canEdit) {
      return (
        <input
          style={{ ...cashInput, ...(saved != null && saved < 0 ? { color: "#b91c1c" } : {}) }}
          className="cs-edit" inputMode="decimal"
          placeholder={deduction ? "(0)" : "0"}
          value={drafts[key] ?? ""}
          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
          onBlur={() => saveCell(code, b, drafts[key] ?? "")}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      );
    }
    return saved == null ? <span className="muted">—</span> : <span style={saved < 0 ? { color: "#b91c1c" } : undefined}>{money0(saved)}</span>;
  }

  const Outer = (embedded ? "section" : "main") as "section";
  return (
    <Outer style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          {embedded ? (
            <div style={{ fontSize: 15, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Available Cash <span style={{ fontWeight: 600, color: "var(--muted)", textTransform: "none", letterSpacing: 0 }}>· weekly snapshot</span>
            </div>
          ) : (
            <>
              <h1 style={{ marginBottom: 4 }}>Cash Position</h1>
              <p className="muted small" style={{ margin: 0 }}>
                Available cash by entity, refreshed weekly. Operating + A/P + escrows + reserves + money market = Net Available. Enter deductions as negatives; balances carry forward each week.{" "}
                <Link href="/financials/cash-sheet" style={{ color: "var(--brand)", fontWeight: 600 }}>Cash Sheet (weekly bills) →</Link>
              </p>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={() => setWeek((w) => shiftWeek(w, -1))} style={{ padding: "6px 12px", fontWeight: 900 }}>←</button>
          <span style={{ fontWeight: 800, fontSize: 14, minWidth: 150, textAlign: "center" }}>Week ending {prettyDate(week)}</span>
          <button className="btn" onClick={() => setWeek((w) => shiftWeek(w, 1))} style={{ padding: "6px 12px", fontWeight: 900 }}>→</button>
          <button className="btn" onClick={() => setWeek(weekEndingFriday())} style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700 }}>This week</button>
        </div>
      </div>

      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>· {error}</div>}

      <div className="pills" style={{ justifyContent: "flex-start" }}>
        <StatPill label="Net Available · Portfolio" value={money0(grand.net)} accent={grand.net >= 0 ? "#15803d" : "#b91c1c"} />
        <StatPill label="Operating Cash" value={money0(grand.byBucket.operatingCash ?? 0)} />
        <StatPill label="Money Market" value={money0(grand.byBucket.moneyMarket ?? 0)} accent="#0b4a7d" />
        {data?.updatedAt && <StatPill label="Updated" value={new Date(data.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />}
      </div>

      {!canEdit && data && <div className="muted small">View-only — balances are maintained by the finance team.</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="tableWrap" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Entity</th>
                {CASH_POSITION_BUCKETS.map((b) => <th key={b.key} style={numCell}>{b.label}</th>)}
                <th style={numCell}>Net Available</th>
                <th style={{ textAlign: "left" }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={colCount} className="muted small" style={{ padding: 18 }}>Loading…</td></tr>
              ) : CASH_POSITION_GROUPS.map((g: CashPositionGroup) => {
                const gt = groupTotals[g.id];
                return (
                  <Fragment key={g.id}>
                    <tr><td colSpan={colCount} style={groupHeaderCell}>{g.label}</td></tr>
                    {g.rows.map((r) => {
                      const e = entryFor(r.code);
                      const net = netAvailable(e);
                      const noteKey = `${r.code}:note`;
                      return (
                        <tr key={r.code}>
                          <td style={{ textAlign: "left" }}>
                            <code style={{ fontSize: 12 }}>{r.code}</code>
                            <span style={{ marginLeft: 8 }}>{r.name}</span>
                            {bankLink(r.bankCode, r.bankLast4)}
                          </td>
                          {CASH_POSITION_BUCKETS.map((b) => (
                            <td key={b.key} style={numCell}>{cell(r.code, b.key, b.deduction)}</td>
                          ))}
                          <td style={{ ...numCell, fontWeight: 800, color: net >= 0 ? "#15803d" : "#b91c1c" }}>{money0(net)}</td>
                          <td style={{ textAlign: "left", minWidth: 160 }}>
                            {canEdit ? (
                              <input
                                style={{ ...cashInput, width: 200, textAlign: "left" }}
                                className="cs-edit"
                                placeholder="—"
                                value={drafts[noteKey] ?? ""}
                                onChange={(ev) => setDrafts((d) => ({ ...d, [noteKey]: ev.target.value }))}
                                onBlur={() => saveCell(r.code, "note", drafts[noteKey] ?? "")}
                                onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                              />
                            ) : <span className="muted small">{e.note || ""}</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Group subtotal */}
                    <tr style={{ fontWeight: 700, color: "var(--muted)", background: "rgba(11,74,125,0.04)" }}>
                      <td style={{ textAlign: "left", fontSize: 12 }}>{g.label} subtotal</td>
                      {CASH_POSITION_BUCKETS.map((b) => (
                        <td key={b.key} style={numCell}>{money0(gt?.byBucket[b.key] ?? 0)}</td>
                      ))}
                      <td style={{ ...numCell, fontWeight: 800, color: (gt?.net ?? 0) >= 0 ? "#15803d" : "#b91c1c" }}>{money0(gt?.net ?? 0)}</td>
                      <td />
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            {data && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "rgba(11,74,125,0.05)" }}>
                  <td style={{ textAlign: "left" }}>Portfolio Total</td>
                  {CASH_POSITION_BUCKETS.map((b) => (
                    <td key={b.key} style={numCell}>{money0(grand.byBucket[b.key] ?? 0)}</td>
                  ))}
                  <td style={{ ...numCell, color: grand.net >= 0 ? "#15803d" : "#b91c1c" }}>{money0(grand.net)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="muted small" style={{ margin: 0 }}>
        {saving ? "Saving…" : "Deductions (A/P, escrows, reserves) are entered as negative amounts; Money Market and Operating as positive. Net Available = the row total."}
      </p>
    </Outer>
  );
}
