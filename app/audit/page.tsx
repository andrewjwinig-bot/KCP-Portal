"use client";

// Admin-only audit log viewer — recent security/action events (logins, GL
// uploads, …). Gated by the admin tier in middleware.

import LoadingState from "@/app/components/LoadingState";
import { useEffect, useState } from "react";

type AuditEvent = { at: string; event: string; user: string | null; ip: string | null; detail?: string };

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}`;
}

const tone = (event: string): string =>
  event.endsWith(".fail") ? "#b91c1c" : event.endsWith(".success") || event.startsWith("login") ? "#15803d" : "var(--text)";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/audit").then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => setEvents(j.events ?? []))
      .catch(() => setErr("Could not load the audit log."));
  }, []);

  const filtered = (events ?? []).filter((e) => {
    if (!q.trim()) return true;
    const s = `${e.event} ${e.user ?? ""} ${e.ip ?? ""} ${e.detail ?? ""}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "8px 10px", borderBottom: "1px solid var(--border)" };
  const td: React.CSSProperties = { padding: "7px 10px", fontSize: 13, borderBottom: "1px solid rgba(15,23,42,0.06)", whiteSpace: "nowrap" };

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Audit Log</h1>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter (user, event, IP…)"
          style={{ font: "inherit", fontSize: 14, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", minWidth: 240 }} />
      </header>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {err ? <div className="muted small" style={{ padding: 16 }}>{err}</div>
          : events == null ? <LoadingState card={false} status="Loading audit log…" rows={4} />
          : filtered.length === 0 ? <div className="muted small" style={{ padding: 16 }}>No events.</div>
          : (
          <div className="tableWrap" style={{ marginTop: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>When</th><th style={th}>Event</th><th style={th}>User</th><th style={th}>IP</th><th style={th}>Detail</th></tr></thead>
              <tbody>
                {filtered.map((e, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{fmt(e.at)}</td>
                    <td style={{ ...td, fontWeight: 700, color: tone(e.event) }}>{e.event}</td>
                    <td style={td}>{e.user ?? "—"}</td>
                    <td style={{ ...td, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{e.ip ?? "—"}</td>
                    <td style={{ ...td, whiteSpace: "normal", color: "var(--muted)" }}>{e.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>Most recent 1,000 events. Records logins, sign-outs, and key actions.</p>
    </main>
  );
}
