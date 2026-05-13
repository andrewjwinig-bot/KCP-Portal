"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginFormInner() {
  const params = useSearchParams();
  const nextPath = params.get("next") || "/dashboard";

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
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
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Login failed");
      }
      window.location.assign(nextPath);
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
      setBusy(false);
    }
  }

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
          Sign in to access the portal.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Password</span>
          <input
            ref={inputRef}
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            disabled={busy}
            style={{
              padding: "10px 12px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--card)", color: "var(--text)",
              fontFamily: "inherit", fontSize: 14, outline: "none",
            }}
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
