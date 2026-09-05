"use client";

// Investor portal — the destination of a K-1 share link.
//
// Deliberately narrow: it delivers this investor's own Schedule K-1s and
// nothing else. No ownership percentages, no co-owners, no capital accounts —
// a link that exists to hand someone a document shouldn't also disclose the
// shape of the partnership around them.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Centered, BRAND } from "@/app/statement/[token]/StatementView";

type Doc = { id: string; taxYear: number; filename: string; size: number; publishedAt: string | null };
type Payload = {
  ok: true;
  owner: { name: string; heldAs: string | null };
  property: { code: string; name: string };
  documents: Doc[];
};

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default function InvestorPortalPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token ?? "";
  const [gate, setGate] = useState<{ satisfied: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/investor/${token}/verify-pin`)
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      .then(({ ok, j }) => { if (!alive) return; if (ok) setGate({ satisfied: !!j.satisfied }); else setErr(j.error ?? "This link is invalid or has expired."); })
      .catch(() => { if (alive) setErr("This link is invalid or has expired."); });
    return () => { alive = false; };
  }, [token]);

  if (err) return <Shell><p className="muted" style={{ marginTop: 8 }}>{err}</p></Shell>;
  if (!gate) return <Shell><p className="muted" style={{ marginTop: 8 }}>Loading…</p></Shell>;
  if (!gate.satisfied) return <PinGate token={token} onUnlocked={() => setGate({ satisfied: true })} />;
  return <Documents token={token} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Centered>
      <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 19, color: BRAND, letterSpacing: "-0.5px" }}>KORMAN</div>
      <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--muted)", marginBottom: 10 }}>COMMERCIAL PROPERTIES</div>
      {children}
    </Centered>
  );
}

function PinGate({ token, onUnlocked }: { token: string; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !pin.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/investor/${token}/verify-pin`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "That PIN doesn't match.");
      onUnlocked();
    } catch (e) { setErr(e instanceof Error ? e.message : "That PIN doesn't match."); setPin(""); } finally { setBusy(false); }
  }
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg, #f7f9fc)" }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 380, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow)", padding: "34px 28px", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, margin: "0 auto 14px", borderRadius: "50%", background: "rgba(11,74,125,0.09)", color: BRAND, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </div>
        <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 19, color: BRAND, letterSpacing: "-0.5px" }}>KORMAN</div>
        <h1 style={{ fontSize: 22, lineHeight: 1.15, margin: "12px 0 6px" }}>Enter your access PIN</h1>
        <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
          Your Schedule K-1 is protected. Enter the 6-digit PIN we sent you separately.
        </p>
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoFocus placeholder="••••••"
          style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 26, letterSpacing: "0.4em", fontWeight: 800, padding: "12px 10px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg, #fff)", color: "var(--text)", outline: "none", fontFamily: "inherit" }} />
        {err && <div style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 12 }}>{err}</div>}
        <button type="submit" disabled={busy || !pin.trim()} style={{ marginTop: 18, width: "100%", background: BRAND, color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: busy || !pin.trim() ? "default" : "pointer", opacity: busy || !pin.trim() ? 0.6 : 1, fontFamily: "inherit" }}>
          {busy ? "Checking…" : "View my K-1"}
        </button>
      </form>
    </div>
  );
}

function Documents({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/investor/${token}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      .then(({ ok, j }) => { if (!alive) return; if (ok && j.ok) setData(j); else setErr(j.error ?? "Could not load."); })
      .catch(() => { if (alive) setErr("Could not load."); });
    return () => { alive = false; };
  }, [token]);

  if (err) return <Shell><p className="muted" style={{ marginTop: 8 }}>{err}</p></Shell>;
  if (!data) return <Shell><p className="muted" style={{ marginTop: 8 }}>Loading your documents…</p></Shell>;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #f7f9fc)" }}>
      <header style={{ background: BRAND, color: "#fff", padding: "26px clamp(18px, 5vw, 48px)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: "-0.5px" }}>KORMAN</div>
          <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "#bfdbfe" }}>COMMERCIAL PROPERTIES</div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "34px clamp(18px, 5vw, 48px) 72px" }}>
        <h1 style={{ margin: 0 }}>Your Schedule K-1</h1>
        <div className="muted" style={{ fontSize: 15, marginTop: 8 }}>
          {data.owner.name}
          {data.owner.heldAs && data.owner.heldAs !== data.owner.name ? <> · <span style={{ fontStyle: "italic" }}>{data.owner.heldAs}</span></> : null}
        </div>
        <div className="muted" style={{ fontSize: 14, marginTop: 3 }}>{data.property.code} — {data.property.name}</div>

        {data.documents.length === 0 ? (
          <div style={{ marginTop: 28, border: "1px dashed var(--border)", borderRadius: 12, padding: "40px 16px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            No K-1 has been published for you yet.
          </div>
        ) : (
          <div style={{ marginTop: 26, border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--card)", boxShadow: "var(--shadow)" }}>
            {data.documents.map((d, i) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 9, background: "rgba(11,74,125,0.09)", color: BRAND, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{d.taxYear} Schedule K-1</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                    PDF · {kb(d.size)}
                    {d.publishedAt ? ` · available since ${new Date(d.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}
                  </div>
                </div>
                <a href={`/api/investor/${token}/file?id=${d.id}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, background: BRAND, color: "#fff", textDecoration: "none", borderRadius: 9, padding: "9px 15px", fontSize: 13.5, fontWeight: 700 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  Download
                </a>
              </div>
            ))}
          </div>
        )}

        <p className="muted" style={{ fontSize: 12.5, marginTop: 22, lineHeight: 1.6 }}>
          This link is private to you and your access is logged. Please don&rsquo;t forward it — if you need a copy sent
          to your accountant, reply to the email and we&rsquo;ll arrange it. Questions on anything here should go to your
          tax adviser; we can&rsquo;t give tax advice.
        </p>
      </main>
    </div>
  );
}
