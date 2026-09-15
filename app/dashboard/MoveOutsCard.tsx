"use client";

// Dashboard "Move-Out Close-Outs" — the auto-staged queue behind the hands-off
// move-out flow. The daily watcher parks each departing tenant here:
//   • READY  → data's complete, the final statement is computed and the approver
//     was emailed. One click ("Approve & finalize") produces the Skyline GL
//     adjustment + final PDF and emails the post-approval package.
//   • WAITING → the vacate month's expenses aren't posted to the GL yet; it flips
//     to READY on its own once they are.
// Nancy sees office close-outs to approve, Harry sees retail; both see the whole
// queue so nothing slips.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pill, TONE_GREEN, TONE_NEUTRAL } from "@/app/components/Pill";

type Kind = "office" | "retail";
type CloseOut = {
  key: string; property: string; propertyName: string; unitRef: string; suite: string; name: string;
  kind: Kind; year: number; vacateMonth: number; leaseTo: string | null;
  status: "waiting" | "ready" | "approved";
  balance: number; occupiedMonths: number; unpostedMonths: number; maxPosted: number;
  deposit: { amount: number; status: string; net: number | null } | null;
  readyAt: string | null; notifiedAt: string | null;
};
type Send = { key: string; name: string; property: string; balance: number; net: number | null; finalizedAt: string; finalizedBy: string | null };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SECTION: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

function money0(n: number): string {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US");
}
function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric" });
}
function movedOut(c: CloseOut): string {
  return c.leaseTo ? c.leaseTo : `${MONTHS[c.vacateMonth - 1]} ${c.year}`;
}
function interimHref(c: CloseOut): string {
  return `/cam-recon/interim?property=${encodeURIComponent(c.property)}&unitRef=${encodeURIComponent(c.unitRef)}&year=${c.year}&asOf=${c.vacateMonth}`;
}
// The actual move-out date — the lease end when we have it, else the last day
// of the vacate month. Used to keep the dashboard to tenants who've ALREADY
// left (expired), not upcoming move-outs.
function moveOutDate(c: CloseOut): Date {
  if (c.leaseTo) {
    const d = new Date(c.leaseTo);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(c.year, c.vacateMonth, 0); // day 0 of next month = last day of vacate month
}
function hasExpired(c: CloseOut): boolean {
  return moveOutDate(c).getTime() <= Date.now();
}

export default function MoveOutsCard({ order = -1 }: { order?: number }) {
  const [closeOuts, setCloseOuts] = useState<CloseOut[] | null>(null);
  const [sends, setSends] = useState<Send[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch("/api/cam-recon/moveout", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { setCloseOuts(j?.closeOuts ?? []); setSends(j?.sends ?? []); })
      .catch(() => setCloseOuts([]))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = useCallback(async (c: CloseOut) => {
    setBusy(c.key); setMsg((m) => ({ ...m, [c.key]: "" }));
    try {
      const res = await fetch("/api/cam-recon/moveout/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: c.key }),
      });
      const j = await res.json();
      if (!res.ok || j.error) { setMsg((m) => ({ ...m, [c.key]: j.error ?? "Could not finalize." })); }
      else {
        setMsg((m) => ({ ...m, [c.key]: j.emailed ? "✓ Finalized — GL entry + statement sent" : "✓ Finalized (email not configured)" }));
        load();
      }
    } catch (e) { setMsg((m) => ({ ...m, [c.key]: String(e) })); }
    finally { setBusy(null); }
  }, [load]);

  if (!loaded) return null;
  // Only tenants who've actually moved out (expired) — not upcoming move-outs.
  const rows = (closeOuts ?? []).filter(hasExpired);
  const ready = rows.filter((c) => c.status === "ready");
  const waiting = rows.filter((c) => c.status === "waiting");
  // Nothing to show and nothing ever finalized → hide the card entirely.
  if (!ready.length && !waiting.length && !sends.length) return null;

  return (
    <div className="card" style={{ order }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div style={SECTION}>Pending Close-Outs</div>
        <Link href="/cam-recon/interim" style={{ color: "#0b4a7d", fontWeight: 600, fontSize: 12 }}>Open →</Link>
      </div>

      {/* READY — one click to finalize. */}
      {ready.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: waiting.length ? 14 : 4 }}>
          {ready.map((c) => {
            const owed = c.balance >= 0;
            const done = (msg[c.key] ?? "").startsWith("✓");
            return (
              <div key={c.key} style={{ border: "1px solid rgba(22,163,74,0.30)", background: "rgba(22,163,74,0.05)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Pill tone={TONE_GREEN}>Ready</Pill>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{c.property} · <code style={{ fontSize: 11 }}>{c.unitRef}</code> · {c.kind === "retail" ? "Retail" : "Office"}</span>
                  <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>moved out {movedOut(c)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
                  <span style={{ fontSize: 13 }}>
                    Final: <b style={{ color: owed ? "#b45309" : "#15803d" }}>{money0(Math.abs(c.balance))} {owed ? "due" : "credit"}</b>
                  </span>
                  {c.deposit && c.deposit.net != null && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      Deposit {money0(c.deposit.amount)} · net {money0(Math.abs(c.deposit.net))} {c.deposit.net >= 0 ? "refund" : "still due"}
                    </span>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                    <Link href={interimHref(c)} style={{ color: "#0b4a7d", fontWeight: 600, fontSize: 12 }}>Review</Link>
                    <button
                      className="btn primary"
                      disabled={busy === c.key || done}
                      onClick={() => approve(c)}
                      style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700 }}
                    >
                      {busy === c.key ? "Finalizing…" : done ? "✓ Finalized" : "Approve & finalize"}
                    </button>
                  </div>
                </div>
                {msg[c.key] && (
                  <div style={{ fontSize: 12, marginTop: 6, color: msg[c.key].startsWith("✓") ? "#15803d" : "#b91c1c", fontWeight: 600 }}>{msg[c.key]}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* WAITING — flips to ready on its own once the GL posts. Briefly: who,
          which property, and the month we're waiting on to post. */}
      {waiting.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {ready.length > 0 && <div style={{ ...SECTION, fontSize: 11, marginBottom: 4 }}>Waiting on the GL</div>}
          {waiting.map((c) => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontSize: 13, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>{c.property}</span>
              <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
                waiting on {MONTHS[c.vacateMonth - 1]} {c.year} to post
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Recently finalized — the durable record. */}
      {sends.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <div style={{ ...SECTION, fontSize: 11, marginBottom: 6 }}>Recently finalized</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {sends.slice(0, 4).map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "3px 4px" }}>
                <Pill tone={TONE_NEUTRAL}>Done</Pill>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span className="muted">{s.property}</span>
                <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{money0(Math.abs(s.balance))} {s.balance >= 0 ? "due" : "credit"}</span>
                <span className="muted" style={{ minWidth: 90, textAlign: "right" }}>{when(s.finalizedAt)}{s.finalizedBy ? ` · ${s.finalizedBy}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
