"use client";

// OPEN CREDIT TRACKER — the team's "Open Credits" spreadsheet, kept by the
// portal (owner: "call out the open credits at the top so we can easily see an
// open credit tracker"; "click to apply them to the statements and try to
// widdle them down"). Every tenant carrying a credit on the newest laser
// statement, banded JV III / NI LLC / Shopping Centers / … / Former tenants,
// with how long it has sat there, a follow-up note, and an APPLY step: pick the
// open charges the credit goes against (oldest first by default), record it,
// and the record is the list of entries to key in Skyline. The portal does not
// post to Skyline — the next import shows whether the credit cleared.

import { Fragment, useEffect, useState } from "react";
import { StatPill, Pill, TONE_AMBER, TONE_BLUE, TONE_GREEN, TONE_NEUTRAL } from "@/app/components/Pill";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import type { OpenCreditTracker, OpenCredit, AppliedLine, CreditApplicationPlan } from "@/lib/statements/openCredits";

export type CreditNote = { unitRef: string; text: string; by: string | null; at: string };
export type CreditApplication = { period: string; unitRef: string; lines: AppliedLine[]; applied: number; creditAtApply: number; by: string | null; at: string };

const money2 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const monthLabel = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${String(y).slice(2)}`;
};
const dateLabel = (iso: string | null) => {
  if (!iso) return "Undated";
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
};
const SECTION: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

export function OpenCreditsCard({ tracker, notes, applications, period, readOnly, onChanged }: {
  tracker: OpenCreditTracker;
  notes: Record<string, CreditNote>;
  applications: Record<string, CreditApplication>;
  period: string;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const appliedOf = (r: OpenCredit) => applications[r.unitRef.toUpperCase()]?.applied ?? 0;
  const applied = tracker.groups.reduce((a, g) => a + g.rows.reduce((b, r) => b + appliedOf(r), 0), 0);
  const appliedCount = tracker.groups.reduce((a, g) => a + g.rows.filter((r) => appliedOf(r) > 0.005).length, 0);
  const stale = tracker.groups.reduce((a, g) => a + g.rows.filter((r) => r.months >= 3).length, 0);

  if (tracker.count === 0) {
    return (
      <div className="card">
        <div style={SECTION}>Open Credit Tracker</div>
        <div className="muted small" style={{ marginTop: 6 }}>No tenant carries a credit on this month&rsquo;s laser statement.</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "grid", gap: 12, padding: 0 }}>
      <div style={{ padding: "16px 18px 0", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Open Credit Tracker</div>
          <div className="muted small">Click a tenant for the credit lines and to apply it to their open charges.</div>
        </div>
        <div className="pills" style={{ flexWrap: "wrap", justifyContent: "flex-start", marginTop: 0 }}>
          <StatPill label="Open credits" value={money0(tracker.total)} sub={`${tracker.count} tenant${tracker.count === 1 ? "" : "s"}`} total />
          <StatPill label="More than they owe" value={money0(tracker.netCreditTotal)} sub={`${tracker.netCreditCount} we hold money for`}
            accent={tracker.netCreditCount ? "#b45309" : undefined} />
          <StatPill label="Applied, to key in Skyline" value={money0(applied)} sub={`${appliedCount} recorded`} accent={applied > 0 ? "#15803d" : undefined} />
          <StatPill label="Left to work" value={money0(tracker.total - applied)} sub={stale ? `${stale} open 3+ months` : "none older than 2 months"}
            accent={stale ? "#b91c1c" : undefined} />
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
          <thead>
            <tr>
              <th style={thL}>Unit</th>
              <th style={thL}>Tenant</th>
              <th style={th}>Credit</th>
              <th style={th}>Open charges</th>
              <th style={th}>Net</th>
              <th style={th}>Since</th>
              <th style={th}>Applied</th>
              <th style={thL}>Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {tracker.groups.map((g, gi) => (
              <Fragment key={g.group}>
                <tr style={{ background: "rgba(11,74,125,0.07)", borderTop: gi ? "2px solid var(--border)" : "none" }}>
                  <td style={{ ...tdL, fontWeight: 800 }} colSpan={2}>
                    {g.group} <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>· {g.count} tenant{g.count === 1 ? "" : "s"}</span>
                  </td>
                  <td style={{ ...td, fontWeight: 800 }}>{money2(g.credit)}</td>
                  <td colSpan={5} />
                </tr>
                {g.rows.map((r) => {
                  const k = r.unitRef.toUpperCase();
                  const app = applications[k];
                  const isOpen = open === k;
                  return (
                    <Fragment key={k}>
                      <tr onClick={() => setOpen(isOpen ? null : k)} style={{ cursor: "pointer", borderTop: "1px solid var(--border)", background: isOpen ? "rgba(11,74,125,0.04)" : undefined }}>
                        <td style={tdL}><span aria-hidden className="muted" style={{ fontSize: 10, marginRight: 6 }}>{isOpen ? "▾" : "▸"}</span><code style={{ fontSize: 12 }}>{r.unitRef}</code></td>
                        <td style={{ ...tdL, fontWeight: 600, whiteSpace: "normal" }}>{r.tenantName}</td>
                        <td style={{ ...td, fontWeight: 700, color: "#15803d" }}>{money2(r.credit)}</td>
                        <td style={td}>{r.openCharges > 0.005 ? money2(r.openCharges) : <span className="muted">—</span>}</td>
                        <td style={{ ...td, fontWeight: 700, color: r.net < -0.005 ? "#b45309" : undefined }}>
                          {r.net < -0.005 ? `(${money2(-r.net)})` : money2(r.net)}
                        </td>
                        <td style={td}>
                          {r.months >= 3
                            ? <Pill tone={TONE_AMBER}>{monthLabel(r.since)} · {r.months} MO</Pill>
                            : <span className="muted" style={{ fontSize: 12.5 }}>{monthLabel(r.since)}</span>}
                        </td>
                        <td style={td}>
                          {app ? <Pill tone={TONE_GREEN}>{money0(app.applied)} APPLIED</Pill>
                            : r.openCharges > 0.005 ? <Pill tone={TONE_NEUTRAL}>NOT APPLIED</Pill>
                            : <span className="muted" style={{ fontSize: 12 }}>nothing open</span>}
                        </td>
                        <td style={{ ...tdL, whiteSpace: "normal", maxWidth: 260, fontSize: 13 }} onClick={(e) => e.stopPropagation()}>
                          <NoteCell unitRef={r.unitRef} note={notes[k] ?? null} readOnly={readOnly} />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} style={{ padding: "4px 18px 16px", background: "rgba(11,74,125,0.03)", maxWidth: 0 }}>
                            <CreditDetail r={r} app={app ?? null} period={period} readOnly={readOnly} onChanged={onChanged} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
              <td style={tdL} colSpan={2}>Total — {tracker.count} tenants</td>
              <td style={td}>{money2(tracker.total)}</td>
              <td colSpan={3} />
              <td style={td}>{applied > 0.005 ? money2(applied) : ""}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** The follow-up column — the spreadsheet's notes, saved on blur. */
function NoteCell({ unitRef, note, readOnly }: { unitRef: string; note: CreditNote | null; readOnly: boolean }) {
  const [text, setText] = useState(note?.text ?? "");
  const [saved, setSaved] = useState(note?.text ?? "");
  const [state, setState] = useState<"" | "saving" | "error">("");
  if (readOnly) return note ? <span>{note.text}</span> : <span className="muted">—</span>;
  const save = async () => {
    if (text.trim() === saved.trim()) return;
    setState("saving");
    const r = await fetch("/api/tenant-statements/credit-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitRef, text }) })
      .catch(() => null);
    if (r?.ok) { setSaved(text); setState(""); } else setState("error");
  };
  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="Add a follow-up…" style={{ width: "100%", fontSize: 12.5 }} />
      {state === "saving" && <div className="muted" style={{ fontSize: 11 }}>Saving…</div>}
      {state === "error" && <div style={{ fontSize: 11, color: "#b91c1c" }}>Didn&rsquo;t save — try again</div>}
      {!state && note && text === saved && note.by && (
        <div className="muted" style={{ fontSize: 11 }}>{note.by} · {new Date(note.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
      )}
    </div>
  );
}

type OpenCharge = { idx: number; dateISO: string | null; description: string; amount: number };

function CreditDetail({ r, app, period, readOnly, onChanged }: {
  r: OpenCredit; app: CreditApplication | null; period: string; readOnly: boolean; onChanged: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const onlyAggregate = r.lines.every((l) => !l.dateISO);

  const undo = async () => {
    setBusy(true); setError("");
    const res = await fetch("/api/tenant-statements/credit-apply", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, unitRef: r.unitRef }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) onChanged(); else setError("Couldn’t undo — try again.");
  };

  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(240px, 1fr) minmax(320px, 1.6fr)", alignItems: "start", paddingTop: 8 }}>
      <div>
        <div style={SECTION}>What makes up the credit</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={i} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                <td style={{ ...tdL, fontSize: 13, padding: "5px 8px" }}>{dateLabel(l.dateISO)}</td>
                <td style={{ ...tdL, fontSize: 13, padding: "5px 8px", whiteSpace: "normal" }}>{l.description}</td>
                <td style={{ ...td, fontSize: 13, padding: "5px 8px", color: "#15803d", fontWeight: 600 }}>{money2(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {onlyAggregate && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Skyline prints this credit as one total. The CAM / RET / INS split and what caused it are in the tenant&rsquo;s ledger in Skyline — note it under Follow-up.
          </div>
        )}
      </div>

      <div>
        <div style={SECTION}>Apply to open charges</div>
        {app ? (
          <div style={{ marginTop: 6 }}>
            <AppliedTable lines={app.lines} />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Recorded {app.by ? `by ${app.by} ` : ""}{new Date(app.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
              Key these in Skyline; the next laser statement shows the credit {app.applied >= r.credit - 0.005 ? "gone" : `down to ${money2(r.credit - app.applied)}`}.
            </div>
            {!readOnly && <button className="btn sm" style={{ marginTop: 8 }} disabled={busy} onClick={undo}>{busy ? "Undoing…" : "Undo"}</button>}
          </div>
        ) : r.openCharges < 0.005 ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            No open charges to apply it to — this is money we hold for the tenant. Refund it or let the next charges take it.
          </div>
        ) : readOnly ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Not applied yet.</div>
        ) : applying ? (
          <ApplyPanel r={r} period={period} onDone={() => { setApplying(false); onChanged(); }} onCancel={() => setApplying(false)} />
        ) : (
          <div style={{ marginTop: 6 }}>
            <button className="btn primary sm" onClick={() => setApplying(true)}>
              Apply {money2(Math.min(r.credit, r.openCharges))} to open charges…
            </button>
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  );
}

function AppliedTable({ lines }: { lines: AppliedLine[] }) {
  const total = lines.reduce((a, l) => a + l.applied, 0);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr><th style={{ ...thL, padding: "4px 8px" }}>Charge</th><th style={{ ...thL, padding: "4px 8px" }}>Date</th><th style={{ ...th, padding: "4px 8px" }}>Open</th><th style={{ ...th, padding: "4px 8px" }}>Credit applied</th></tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.idx} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ ...tdL, fontSize: 13, padding: "5px 8px", whiteSpace: "normal" }}>{l.description}</td>
            <td style={{ ...tdL, fontSize: 13, padding: "5px 8px" }}>{dateLabel(l.dateISO)}</td>
            <td style={{ ...td, fontSize: 13, padding: "5px 8px" }}>{money2(l.open)}</td>
            <td style={{ ...td, fontSize: 13, padding: "5px 8px", fontWeight: 700 }}>{money2(l.applied)}{l.applied < l.open - 0.005 ? " (part)" : ""}</td>
          </tr>
        ))}
        <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
          <td style={{ ...tdL, padding: "5px 8px" }} colSpan={3}>Total applied</td>
          <td style={{ ...td, padding: "5px 8px" }}>{money2(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Pick the charges; the server works out the amounts (oldest first, capped). */
function ApplyPanel({ r, period, onDone, onCancel }: { r: OpenCredit; period: string; onDone: () => void; onCancel: () => void }) {
  const [charges, setCharges] = useState<OpenCharge[] | null>(null);
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [plan, setPlan] = useState<CreditApplicationPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = async (sel: number[] | null) => {
    const res = await fetch("/api/tenant-statements/credit-apply", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period, unitRef: r.unitRef, charges: sel, preview: true }) }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    if (!j?.ok) { setError(j?.error ?? "Couldn’t load the charges."); return; }
    setPlan(j.plan);
    if (!charges) {
      setCharges(j.open);
      // Default: the charges the oldest-first plan reaches.
      setPicked(new Set((j.plan as CreditApplicationPlan).lines.map((l) => l.idx)));
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void preview(null); }, []);

  const toggle = (idx: number) => {
    const next = new Set(picked ?? []);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setPicked(next);
    void preview([...next]);
  };
  const record = async () => {
    setBusy(true); setError("");
    const res = await fetch("/api/tenant-statements/credit-apply", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period, unitRef: r.unitRef, charges: [...(picked ?? [])] }) }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (j?.ok) onDone(); else setError(j?.error ?? "Couldn’t record it — try again.");
  };

  if (!charges) return <div className="muted small" style={{ marginTop: 6 }}>{error || "Loading open charges…"}</div>;
  const appliedTo = new Map((plan?.lines ?? []).map((l) => [l.idx, l.applied]));
  return (
    <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr><th style={{ ...thL, padding: "4px 8px", width: 28 }} /><th style={{ ...thL, padding: "4px 8px" }}>Charge</th><th style={{ ...thL, padding: "4px 8px" }}>Date</th><th style={{ ...th, padding: "4px 8px" }}>Open</th><th style={{ ...th, padding: "4px 8px" }}>Applied</th></tr>
        </thead>
        <tbody>
          {charges.map((c) => {
            const on = picked?.has(c.idx) ?? false;
            const a = appliedTo.get(c.idx) ?? 0;
            return (
              <tr key={c.idx} style={{ borderTop: "1px solid var(--border)", opacity: on ? 1 : 0.6 }}>
                <td style={{ ...tdL, padding: "5px 8px" }}><input type="checkbox" checked={on} onChange={() => toggle(c.idx)} aria-label={`Apply to ${c.description}`} /></td>
                <td style={{ ...tdL, fontSize: 13, padding: "5px 8px", whiteSpace: "normal" }}>{c.description}</td>
                <td style={{ ...tdL, fontSize: 13, padding: "5px 8px" }}>{dateLabel(c.dateISO)}</td>
                <td style={{ ...td, fontSize: 13, padding: "5px 8px" }}>{money2(c.amount)}</td>
                <td style={{ ...td, fontSize: 13, padding: "5px 8px", fontWeight: a ? 700 : 400 }}>{a ? money2(a) : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {plan && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Pill tone={TONE_BLUE}>APPLYING {money2(plan.applied)} OF {money2(plan.credit)}</Pill>
          {plan.remaining > 0.005 && <Pill tone={TONE_AMBER}>{money2(plan.remaining)} STAYS ON ACCOUNT</Pill>}
        </div>
      )}
      <div className="muted" style={{ fontSize: 12 }}>Oldest first; the last charge takes part of the credit if it runs out. This records it here — key the same entries in Skyline.</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary sm" disabled={busy || !plan || plan.applied < 0.005} onClick={record}>{busy ? "Recording…" : `Record ${plan ? money2(plan.applied) : ""} applied`}</button>
        <button className="btn sm" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {error && <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div>}
    </div>
  );
}
