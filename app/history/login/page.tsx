"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/history";
  const personaParam = params.get("persona") || "admin";
  // Whitelist personas that may be set via the login redirect.
  const targetPersona = ["admin", "marie"].includes(personaParam) ? personaParam : "admin";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/history/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Login failed");
      }
      // Successful login implies the user wants to assume the admin persona.
      try { localStorage.setItem("kcp:activeUser", targetPersona); } catch { /* ignore */ }
      router.replace(next);
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <form onSubmit={submit} className="card" style={{ width: 360, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Admin login</h2>
        <p className="muted small" style={{ margin: 0 }}>The admin account requires a password.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{ padding: "8px 10px", fontSize: 14, borderRadius: 7, border: "1px solid var(--border)" }}
        />
        {error && <div style={{ color: "#b42318", fontSize: 13 }}>{error}</div>}
        <button type="submit" className="btn" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function HistoryLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
