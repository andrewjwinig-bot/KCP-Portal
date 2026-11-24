"use client";
// Your password, chosen by you (owner, 11/2026: "let users select and change
// their own passwords"), and — for an admin — issuing someone a one-time
// password. `/api/site/password` and `/api/site/password/reset`.

import { useEffect, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { StatusBanner } from "@/app/components/StatusBanner";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/passwordPolicy";

type Mine = { source: "portal" | "vercel" | "shared"; mustChange: boolean; updatedAt: string | null };
type Row = { id: string; label: string; source: "own" | "one-time" | "vercel" | "shared"; updatedAt: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const FIELD: React.CSSProperties = { display: "grid", gap: 4, fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--muted)" };

export function PasswordCard({ userId, label }: { userId: string | null; label?: string }) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = () => fetch("/api/site/password", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setMine(j)).catch(() => {});
  useEffect(() => { load(); }, []);

  const problem = next ? passwordProblem(next, { userId: userId ?? "", label, current }) : null;
  const mismatch = !!again && again !== next;

  async function save() {
    setBusy(true); setErr(null); setDone(false);
    try {
      const r = await fetch("/api/site/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Couldn't change your password."); return; }
      setDone(true); setCurrent(""); setNext(""); setAgain("");
      // A one-time password confined the session to this page — now it's lifted.
      if (mine?.mustChange) { window.location.assign("/dashboard"); return; }
      load();
    } finally { setBusy(false); }
  }

  const meta = !mine ? "" : mine.mustChange ? "You signed in with a one-time password — choose your own to continue."
    : mine.source === "portal" ? `Your own password, set ${when(mine.updatedAt)}.`
    : mine.source === "vercel" ? "A password an admin set for you. You can replace it with one of your own."
    : "You're signing in with the shared staff password. Set one only you know.";

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <KeyRound size={20} strokeWidth={1.75} aria-hidden style={{ color: "var(--c-0b4a7d)" }} />
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Password</div>
          <div className="muted small" style={{ marginTop: 2 }}>{meta}</div>
        </div>
      </div>

      {mine?.mustChange && <StatusBanner compact tone="warning" title="Choose your own password">The one-time password you were given stops working once you do.</StatusBanner>}
      {done && <StatusBanner compact tone="success" title="Password changed">Use it the next time you sign in.</StatusBanner>}
      {err && <StatusBanner compact tone="danger" title={err} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <label style={FIELD}>{mine?.mustChange ? "One-time password" : "Current password"}
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label style={FIELD}>New password
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label style={FIELD}>New password again
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
      </div>
      <div className="small" style={{ color: problem || mismatch ? "var(--c-b54708)" : "var(--muted)" }}>
        {problem ?? (mismatch ? "The two new passwords don't match." : `At least ${PASSWORD_MIN_LENGTH} characters. A short phrase is easy to remember and hard to guess.`)}
      </div>
      <div>
        <button className="btn primary" disabled={busy || !current || !next || !!problem || next !== again} onClick={save}>
          {busy ? "Saving…" : mine?.mustChange ? "Set My Password" : "Change Password"}
        </button>
      </div>
    </div>
  );
}

/** Admin only — the GET is 401/403 for anyone else and the card hides. */
export function PasswordResetCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pick, setPick] = useState("");
  const [issued, setIssued] = useState<{ label: string; temp: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => fetch("/api/site/password/reset", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setRows(j.users)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!rows) return null;

  const sourceWord = (r: Row) => r.source === "own" ? `Own password · ${when(r.updatedAt)}` : r.source === "one-time" ? "One-time password, not yet changed" : r.source === "vercel" ? "Set in Vercel" : "Shared staff password";

  async function issue() {
    const row = rows!.find((r) => r.id === pick);
    if (!row) return;
    setBusy(true); setErr(null); setIssued(null); setCopied(false);
    try {
      const r = await fetch("/api/site/password/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: pick }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.temp) { setErr(j.error ?? "Couldn't issue a password."); return; }
      setIssued({ label: title(row.label), temp: j.temp });
      load();
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Passwords (admin)</div>
        <div className="muted small" style={{ marginTop: 2 }}>
          Give someone a one-time password — they sign in with it and must choose their own before anything else.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={pick} onChange={(e) => { setPick(e.target.value); setIssued(null); }} style={{ minWidth: 220 }}>
          <option value="">Choose a person…</option>
          {rows.map((r) => <option key={r.id} value={r.id}>{title(r.label)}</option>)}
        </select>
        <button className="btn" disabled={!pick || busy} onClick={issue}>{busy ? "Issuing…" : "Issue One-Time Password"}</button>
      </div>
      {err && <StatusBanner compact tone="danger" title={err} />}
      {issued && (
        <StatusBanner compact tone="success" title={`One-time password for ${issued.label}`}
          actions={<button className="btn sm" onClick={() => { navigator.clipboard?.writeText(issued.temp).then(() => setCopied(true)).catch(() => {}); }}><Copy size={16} strokeWidth={1.75} aria-hidden /> {copied ? "Copied" : "Copy"}</button>}>
          <code style={{ fontSize: "var(--fs-14)" }}>{issued.temp}</code> — shown once. Their old password stops working now.
        </StatusBanner>
      )}
      <div>
        {rows.map((r) => (
          <div key={r.id} className="task-row" style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 2px", borderBottom: "1px solid var(--hairline)", fontSize: "var(--fs-14)" }}>
            <span style={{ fontWeight: 600 }}>{title(r.label)}</span>
            <span className="muted" style={{ color: r.source === "one-time" ? "var(--c-b54708)" : undefined }}>{sourceWord(r)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
