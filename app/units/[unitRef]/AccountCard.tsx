"use client";

// The tenant's ACCOUNT on their unit page (owner, 11/2026: "we should be able
// to pull the tenant statements from the unit info pages … and the A/R"):
// what they owe and what we hold from the newest Laser Statement (or a newer
// Credit Balance Report — the same `statementOf` Receivables reads), their
// statement as a PDF, every email we sent them, a balance reminder, and the
// way into Receivables to work a payment. Open items only, so a tenant who
// has paid shows less, not wrong. Only for someone who can open Receivables —
// the API refuses everyone else and the card stays hidden.

import { useEffect, useState } from "react";
import { FileText, ChevronRight } from "lucide-react";
import { StatPill } from "@/app/components/Pill";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import { CorrespondencePanel } from "@/app/tenant-statements/Correspondence";
import type { Account } from "@/lib/statements/receiptMatch";

const money = (n: number) => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (n: number) => (n < 0 ? `(${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");
const periodLabel = (p: string) => { const [y, m] = p.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); };

type Detail = { period: string; asOf: string | null; tenant: { unitRef: string; tenantName: string }; account: Account };

export default function AccountCard({ unitRef }: { unitRef: string }) {
  const [state, setState] = useState<"loading" | "none" | "hidden" | "ok">("loading");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await fetch("/api/tenant-statements/receipts", { cache: "no-store" }).catch(() => null);
      if (!r || r.status === 401 || r.status === 403) { if (live) setState("hidden"); return; }
      const j = await r.json().catch(() => null);
      const period: string | undefined = j?.period;
      if (!period) { if (live) setState("none"); return; }
      const r2 = await fetch(`/api/tenant-statements/receipts?period=${period}&unit=${encodeURIComponent(unitRef)}`, { cache: "no-store" }).catch(() => null);
      const d = r2 ? await r2.json().catch(() => null) : null;
      if (!live) return;
      if (d?.ok && d.account) { setDetail(d); setState("ok"); } else setState("none");
    })();
    return () => { live = false; };
  }, [unitRef]);

  if (state === "hidden" || state === "loading") return null;
  if (state === "none" || !detail) {
    return (
      <div className="card" style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Account</div>
        <div className="muted small">Not on the latest Laser Statement, so nothing open for this suite. Import a newer statement on <a className="text-link" href="/tenant-statements">Receivables</a> if that looks wrong.</div>
      </div>
    );
  }

  const a = detail.account;
  const pdf = `/api/tenant-statements/receipts?period=${detail.period}&unit=${encodeURIComponent(unitRef)}&pdf=1`;
  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Account</div>
          <div className="muted small">{periodLabel(detail.period)} Laser Statement{detail.asOf ? ` · as of ${shortDate(detail.asOf)}` : ""} · open charges only</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn sm" href={pdf} target="_blank" rel="noreferrer"><FileText size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px" }} /> Statement PDF</a>
          <a className="btn sm primary" href={`/tenant-statements?period=${detail.period}&unit=${encodeURIComponent(unitRef)}`}>Work a payment <ChevronRight size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px" }} /></a>
        </div>
      </div>

      <div className="pills" style={{ margin: 0 }}>
        <StatPill label="Open charges" value={money(a.gross)} />
        <StatPill label="Credits" value={a.credit > 0.005 ? `(${money(a.credit)})` : "—"} />
        <StatPill label={a.net < 0 ? "Net credit" : "Net due"} value={a.net < 0 ? `(${money(-a.net)})` : money(a.net)} accent={a.net > 0.005 ? "var(--c-b54708)" : a.net < -0.005 ? "var(--c-067647)" : undefined} />
      </div>

      {(a.charges.length > 0 || a.creditLines.length > 0) && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thL}>Date</th><th style={thL}>Charge</th><th style={th}>Amount</th></tr></thead>
            <tbody>
              {a.charges.map((c) => (
                <tr key={`c${c.idx}`} style={{ borderTop: "1px solid var(--hairline)" }}>
                  <td style={tdL}>{shortDate(c.dateISO)}</td><td style={{ ...tdL, whiteSpace: "normal" }}>{c.description}</td><td style={td}>{cell(c.amount)}</td>
                </tr>
              ))}
              {a.creditLines.map((c, i) => (
                <tr key={`k${i}`} style={{ borderTop: "1px solid var(--hairline)" }}>
                  <td style={tdL}>{shortDate(c.dateISO)}</td><td style={{ ...tdL, whiteSpace: "normal" }}>{c.description}</td><td style={td}>{cell(-Math.abs(c.amount))}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid var(--border)" }}>
                <td style={{ ...tdL, fontWeight: 700 }} colSpan={2}>{a.net < 0 ? "Net credit" : "Net due"}</td>
                <td style={{ ...td, fontWeight: 700 }}>{a.net < 0 ? `(${money(-a.net)})` : money(a.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <CorrespondencePanel unitRef={unitRef} period={detail.period} tenantName={detail.tenant.tenantName} owed={a.net} nonce={nonce} onSent={() => setNonce((n) => n + 1)} />
    </div>
  );
}
