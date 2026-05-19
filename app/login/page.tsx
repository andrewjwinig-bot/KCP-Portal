"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ALL_USERS, USERS } from "../../lib/users";

const LAST_USER_KEY = "kcp:loginUser";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill with whoever signed in last on this browser.
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_USER_KEY);
      if (last && (ALL_USERS as readonly string[]).includes(last)) setUser(last);
    } catch { /* ignore */ }
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!user) {
      setError("Select your name.");
      return;
    }
    if (!password) {
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/site/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Login failed");
      }
      try {
        localStorage.setItem(LAST_USER_KEY, user);
        localStorage.setItem("kcp:activeUser", user);
      } catch { /* ignore */ }
      window.location.assign(nextPath);
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
      setBusy(false);
    }
  }

  const isAdmin = user === "admin";

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
          Select your name and enter the portal password to sign in.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>User</span>
          <select
            name="user"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            disabled={busy}
            autoFocus
            style={fieldStyle}
          >
            <option value="">Select your name…</option>
            {[...ALL_USERS]
              .sort((a, b) => USERS[a].label.localeCompare(USERS[b].label))
              .map((id) => (
                <option key={id} value={id}>{USERS[id].label}</option>
              ))}
          </select>
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
            disabled={busy}
            style={fieldStyle}
          />
        </label>

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
          {busy ? "Signing in…" : "Sign In"}
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
