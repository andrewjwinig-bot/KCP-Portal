"use client";

// Dashboard reminder for the annual Statement of Values run — mirrors the
// payroll / commissions tiles. Ownership circulates statements to investors each
// year; the data needs to be finalized before K-1 financials are due, so the
// tile targets MARCH 1. Seasonal: only appears in the run-up window (early Jan
// through end of March), escalating as March 1 nears, and turns green once this
// season's estimates have been set. Decision logic lives (and is tested) in
// lib/ownership/annualStatement.ts.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { annualStatementReminderState, type ReminderTone } from "@/lib/ownership/annualStatement";

const DISMISS_KEY = "kcp:dash:annualStatement:dismissed";

const TONE: Record<ReminderTone, { border: string; bg: string; dot: string }> = {
  paid:    { border: "rgba(21,128,61,0.30)",  bg: "rgba(21,128,61,0.06)",  dot: "#15803d" },
  soon:    { border: "rgba(217,119,6,0.30)",  bg: "rgba(217,119,6,0.06)",  dot: "#d97706" },
  action:  { border: "rgba(220,38,38,0.35)",  bg: "rgba(220,38,38,0.06)",  dot: "#dc2626" },
  neutral: { border: "rgba(15,23,42,0.12)",   bg: "rgba(15,23,42,0.025)",  dot: "#64748b" },
};

export default function AnnualStatementReminder({ standalone = false }: { standalone?: boolean }) {
  const [asOf, setAsOf] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { const raw = localStorage.getItem(DISMISS_KEY); if (raw) setDismissed(new Set(JSON.parse(raw))); } catch { /* ignore */ }
    fetch("/api/ownership/estimates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.asOf === "string") setAsOf(d.asOf); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const info = useMemo(() => annualStatementReminderState(new Date(), asOf), [asOf]);

  if (!loaded || !info || dismissed.has(info.id)) return null;
  const t = TONE[info.tone];
  const dismiss = () => setDismissed((prev) => {
    const n = new Set(prev); n.add(info.id);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, flex: standalone ? "1 1 100%" : "1 1 260px", minWidth: 0,
      padding: "10px 12px", border: "1px solid", borderColor: t.border, background: t.bg, borderRadius: 8,
      ...(standalone ? { marginBottom: 16 } : {}),
    }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0, background: t.dot }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{info.title}</div>
        <div className="muted small" style={{ marginTop: 2 }}>{info.sub}</div>
      </div>
      <Link href="/investors?view=statement" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", flexShrink: 0, alignSelf: "center" }}>Open →</Link>
      <button onClick={dismiss} aria-label="Dismiss" title="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 15, lineHeight: 1, padding: 0, flexShrink: 0, alignSelf: "center" }}>×</button>
    </div>
  );
}
