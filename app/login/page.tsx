"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ALL_USERS, USERS, type UserId } from "../../lib/users";

/** Resolve a typed username (user id or display label, any case) to a user id. */
function resolveUserId(input: string): UserId | null {
  const t = input.trim().toLowerCase();
  if (!t) return null;
  return (ALL_USERS as readonly UserId[]).find(
    (id) => id.toLowerCase() === t || USERS[id].label.toLowerCase() === t,
  ) ?? null;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "var(--muted)",
  letterSpacing: "0.06em", textTransform: "uppercase",
};
const fieldStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--card)", color: "var(--text)",
  fontFamily: "inherit", fontSize: 14, outline: "none",
};

function LoginFormInner() {
  const params = useSearchParams();
  const nextPath = params.get("next") || "/dashboard";

  const inputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [twoFactor, setTwoFactor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const resolvedId = resolveUserId(user);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!resolvedId) {
      setError("Enter your username (e.g. DREW).");
      return;
    }
    if (!password) {
      inputRef.current?.focus();
      return;
    }
    if (twoFactor && code.length !== 6) {
      codeRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/site/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: resolvedId, password, code: twoFactor ? code : undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j?.twoFactorRequired) {
          // Password OK — now ask for the authenticator code.
          setTwoFactor(true);
          setBusy(false);
          setError(j?.error ?? null); // e.g. "Incorrect code" on a retry
          setTimeout(() => codeRef.current?.focus(), 0);
          return;
        }
        throw new Error(j?.error ?? "Login failed");
      }
      // First login of the day lands on the dashboard (to see the day's tasks),
      // ignoring any deep-link `next`; later logins the same day honor `next`.
      let dest = nextPath;
      try {
        localStorage.setItem("kcp:activeUser", resolvedId);
        const today = new Date().toDateString();
        if (localStorage.getItem("kcp:lastLoginDay") !== today) dest = "/dashboard";
        localStorage.setItem("kcp:lastLoginDay", today);
      } catch { /* ignore */ }
      window.location.assign(dest);
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
      setBusy(false);
    }
  }

  const isAdmin = resolvedId === "admin";

  return (
    <main style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, background: "var(--bg)",
    }}>
      <form
        onSubmit={submit}
        style={{
          width: "100%", maxWidth: 380,
          padding: 28,
          border: "1px solid var(--border)", borderRadius: 14,
          background: "var(--card)",
          boxShadow: "var(--shadow)",
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" }}>KCP Portal</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 18, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          </div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Enter your username and the portal password to sign in.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>Username</span>
          <input
            name="user"
            type="text"
            autoComplete="username"
            autoCapitalize="characters"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            disabled={busy}
            autoFocus
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>{isAdmin ? "Admin password" : "Password"}</span>
          <input
            ref={inputRef}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy || twoFactor}
            style={fieldStyle}
          />
        </label>

        {twoFactor && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={labelStyle}>Authenticator code</span>
            <input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={busy}
              style={{ ...fieldStyle, fontSize: 18, letterSpacing: 6, textAlign: "center" }}
            />
            <span className="muted small">Enter the 6-digit code from your authenticator app.</span>
          </label>
        )}

        {error && (
          <div style={{
            fontSize: 13, color: "#b91c1c",
            padding: "8px 10px",
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.25)",
            borderRadius: 6,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn primary large"
          disabled={busy}
          style={{ width: "100%" }}
        >
          {busy ? "Signing in…" : twoFactor ? "Verify & Sign In" : "Sign In"}
        </button>
      </form>
    </main>
  );
}

export default function SiteLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginFormInner />
    </Suspense>
  );
}
