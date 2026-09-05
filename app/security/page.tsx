"use client";

// Two-factor (TOTP) enrollment — admin tier first. Scan the QR (or type the
// key) into Authy / Google Authenticator, then confirm a code to turn it on.

import { useEffect, useState } from "react";

type Status = { user: string | null; enabled: boolean; required: boolean; disabled: boolean };
type Enrollment = { otpauthUri: string; secret: string; manualKey: string; qrDataUrl: string };
type ReqUser = { id: string; label: string; required: boolean };

export default function SecurityPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [enroll, setEnroll] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reqUsers, setReqUsers] = useState<ReqUser[] | null>(null); // admin-only; null = not admin / not loaded
  const loadStatus = () => fetch("/api/2fa/status").then((r) => r.json()).then(setStatus).catch(() => {});
  useEffect(() => {
    loadStatus();
    // Admins get the required-users manager; non-admins get 403 and skip it.
    fetch("/api/2fa/required").then((r) => (r.ok ? r.json() : null)).then((j) => j && setReqUsers(j.users)).catch(() => {});
  }, []);

  async function toggleRequired(id: string, on: boolean) {
    if (!reqUsers) return;
    const next = reqUsers.map((u) => (u.id === id ? { ...u, required: on } : u));
    setReqUsers(next);
    await fetch("/api/2fa/required", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ users: next.filter((u) => u.required).map((u) => u.id) }) }).catch(() => {});
  }

  async function startEnroll() {
    setBusy(true); setMsg(null);
    try {
      const j = await fetch("/api/2fa/enroll", { method: "POST" }).then((r) => r.json());
      if (j.error) setMsg(j.error); else { setEnroll(j); setCode(""); }
    } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setMsg(null);
    try {
      const j = await fetch("/api/2fa/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).then((r) => r.json());
      if (j.ok) {
        setEnroll(null);
        setMsg("Two-factor authentication is on.");
        // The server confirmed enablement — reflect it immediately rather than
        // relying on a status read that can lag the blob write.
        setStatus((s) => (s ? { ...s, enabled: true } : s));
      } else setMsg(j.error ?? "Could not verify the code.");
    } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMsg(null);
    try {
      await fetch("/api/2fa/disable", { method: "POST" });
      setMsg("Two-factor authentication is off.");
      setStatus((s) => (s ? { ...s, enabled: false } : s));
    } finally { setBusy(false); }
  }

  const step: React.CSSProperties = { fontSize: 14, lineHeight: 1.6 };
  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
      <h1>Security</h1>

      {status?.required && !status?.enabled && !status?.disabled && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(180,83,9,0.08)", border: "1px solid rgba(180,83,9,0.35)", fontSize: 14, fontWeight: 600, color: "#b45309" }}>
          Two-factor authentication is required for your account. Set it up below to continue using the portal.
        </div>
      )}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Two-factor authentication</div>
            <div className="muted small" style={{ marginTop: 2 }}>
              A 6-digit code from your authenticator app (Authy, Google/Microsoft Authenticator) at login.
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 999,
            background: status?.enabled ? "rgba(21,128,61,0.12)" : "rgba(100,116,139,0.12)",
            color: status?.enabled ? "#15803d" : "#475569", border: `1px solid ${status?.enabled ? "rgba(21,128,61,0.35)" : "rgba(100,116,139,0.3)"}` }}>
            {status?.enabled ? "ON" : "OFF"}
          </span>
        </div>

        {status?.disabled && (
          <div className="muted small" style={{ padding: "8px 10px", background: "rgba(180,83,9,0.08)", border: "1px solid rgba(180,83,9,0.3)", borderRadius: 8 }}>
            2FA is globally disabled via the <code>SITE_2FA_DISABLED</code> env var — enrollment won&apos;t be enforced until that&apos;s removed.
          </div>
        )}

        {msg && <div className="small" style={{ color: "#15803d", fontWeight: 700 }}>{msg}</div>}

        {!enroll && !status?.enabled && (
          <button className="btn primary" disabled={busy} onClick={startEnroll} style={{ alignSelf: "flex-start", fontSize: 14, padding: "9px 16px", fontWeight: 700 }}>
            Set up two-factor authentication
          </button>
        )}

        {!enroll && status?.enabled && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" disabled={busy} onClick={startEnroll} style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>Re-enroll (new device)</button>
            <button className="btn" disabled={busy} onClick={disable} style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, borderColor: "rgba(180,35,24,0.45)", color: "#b42318" }}>Turn off</button>
          </div>
        )}

        {enroll && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ol style={{ ...step, margin: 0, paddingLeft: 18 }}>
              <li>
                Install <b>Authy</b> on your phone if you don&apos;t have it:{" "}
                <a href="https://apps.apple.com/app/twilio-authy/id494168017" target="_blank" rel="noreferrer">iPhone (App Store)</a>
                {" · "}
                <a href="https://play.google.com/store/apps/details?id=com.authy.authy" target="_blank" rel="noreferrer">Android (Google Play)</a>
              </li>
              <li>Open Authy → <b>＋ Add Account</b> → <b>Scan QR Code</b>.</li>
              <li>Scan the QR code below. (No camera? Tap <b>Enter key manually</b> and type the key shown.)</li>
              <li>Authy now shows a 6-digit code for &ldquo;KCP Portal&rdquo; that changes every 30 seconds.</li>
              <li>Type that current code below and press <b>Confirm &amp; turn on</b>.</li>
            </ol>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enroll.qrDataUrl} alt="2FA QR code" width={180} height={180} style={{ border: "1px solid var(--border)", borderRadius: 8 }} />
              <div>
                <div className="muted small" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Manual key</div>
                <code style={{ fontSize: 14, letterSpacing: 1 }}>{enroll.manualKey}</code>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" placeholder="123456" autoFocus
                style={{ font: "inherit", fontSize: 18, letterSpacing: 4, width: 130, textAlign: "center", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)" }} />
              <button className="btn primary" disabled={busy || code.length !== 6} onClick={confirm} style={{ fontSize: 14, padding: "9px 16px", fontWeight: 700 }}>Confirm & turn on</button>
            </div>
          </div>
        )}
      </div>
      {reqUsers && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Require two-factor (admin)</div>
            <div className="muted small" style={{ marginTop: 2 }}>
              A required user is walked through setup automatically the next time they log in — no manual onboarding.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {reqUsers.map((u) => (
              <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={u.required} onChange={(e) => toggleRequired(u.id, e.target.checked)} />
                <span style={{ fontWeight: 600 }}>{u.label}</span>
                <span className="muted small">{u.id}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <p className="muted small" style={{ margin: 0 }}>Lost your device? An admin can clear 2FA via the <code>SITE_2FA_DISABLED</code> env var to restore password-only login.</p>
    </main>
  );
}
