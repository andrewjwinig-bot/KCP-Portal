"use client";

// Dashboard reminder for leasing commissions — mirrors the payroll / CC-expenses
// tiles. Surfaces the quarterly commission cycle so it isn't forgotten:
//   • as a quarter nears close → "finalize commissions" (upcoming)
//   • after the quarter's invoices are sent to AvidBill → "sent" (paid)
// State is derived from the commission entries + the AvidBill sent-log, matched
// by quarter (parse-and-compare, robust to label format).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseQuarterLabel, recentQuarterLabels, type CommissionEntry } from "@/lib/commissions";

type SentLog = Record<string, { sentAt: string; count: number; total: number }>;
type Tone = "paid" | "soon" | "action" | "neutral";
type Parsed = ReturnType<typeof parseQuarterLabel>;

const DISMISS_KEY = "kcp:dash:commissions:dismissed";
const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
const sameQ = (a: Parsed, b: Parsed) => !!a && !!b && a.quarter === b.quarter && a.year === b.year;

const TONE: Record<Tone, { border: string; bg: string; dot: string }> = {
  paid:    { border: "rgba(21,128,61,0.30)",  bg: "rgba(21,128,61,0.06)",  dot: "#15803d" },
  soon:    { border: "rgba(217,119,6,0.30)",  bg: "rgba(217,119,6,0.06)",  dot: "#d97706" },
  action:  { border: "rgba(220,38,38,0.35)",  bg: "rgba(220,38,38,0.06)",  dot: "#dc2626" },
  neutral: { border: "rgba(15,23,42,0.12)",   bg: "rgba(15,23,42,0.025)",  dot: "#64748b" },
};

export default function CommissionsReminder({ standalone = false }: { standalone?: boolean }) {
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [log, setLog] = useState<SentLog>({});
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { const raw = localStorage.getItem(DISMISS_KEY); if (raw) setDismissed(new Set(JSON.parse(raw))); } catch { /* ignore */ }
    Promise.all([
      fetch("/api/commissions").then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/commissions/retail").then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/commissions/avidbill-sent").then((r) => r.json()).catch(() => ({ log: {} })),
    ]).then(([o, r, s]) => {
      const office = Array.isArray(o.entries) ? o.entries : [];
      const retail = Array.isArray(r.entries) ? r.entries : [];
      setEntries([...office, ...retail]);
      setLog((s?.log && typeof s.log === "object") ? s.log : {});
    }).finally(() => setLoaded(true));
  }, []);

  const info = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [curLabel, priorLabel] = recentQuarterLabels(2, today);
    const cur = parseQuarterLabel(curLabel), prior = parseQuarterLabel(priorLabel);
    if (!cur || !prior) return null;
    const inQ = (p: Parsed) => entries.filter((e) => sameQ(parseQuarterLabel(e.quarter), p)).length;
    const sentFor = (p: Parsed) => Object.entries(log).find(([k]) => sameQ(parseQuarterLabel(k), p))?.[1] ?? null;
    const dayMs = 86400000;
    const daysToClose = Math.ceil((cur.periodEnd.getTime() - today.getTime()) / dayMs);
    const priorSent = sentFor(prior);
    const priorCount = inQ(prior);
    const curCount = inQ(cur);
    const qLabel = (p: NonNullable<Parsed>) => `Q${p.quarter} ${p.year}`;

    // Paid — the just-closed quarter's invoices have gone out (recent only).
    if (priorSent) {
      const sentAt = new Date(priorSent.sentAt);
      const daysSince = Math.floor((today.getTime() - sentAt.getTime()) / dayMs);
      if (daysSince <= 45) {
        return { id: `paid:${qLabel(prior)}`, tone: "paid" as Tone, title: "Commissions sent",
          sub: `${qLabel(prior)} · ${priorSent.count} invoice${priorSent.count === 1 ? "" : "s"} sent ${fmt(sentAt)}` };
      }
    }
    // Upcoming — current quarter is about to close; finalize before billing.
    if (daysToClose <= 21) {
      return { id: `close:${qLabel(cur)}`, tone: (daysToClose <= 7 ? "soon" : "neutral") as Tone, title: "Finalize commissions",
        sub: `${qLabel(cur)} closes ${fmt(cur.periodEnd)} · in ${daysToClose} day${daysToClose === 1 ? "" : "s"}${curCount ? ` · ${curCount} logged` : ""}` };
    }
    // Action — a completed quarter has commissions still not sent to AvidBill.
    if (priorCount > 0 && !priorSent) {
      return { id: `send:${qLabel(prior)}`, tone: "action" as Tone, title: "Send commissions to AvidBill",
        sub: `${qLabel(prior)} · ${priorCount} to send` };
    }
    return null;
  }, [entries, log]);

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
      <Link href="/commissions" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", flexShrink: 0, alignSelf: "center" }}>Open →</Link>
      <button onClick={dismiss} aria-label="Dismiss" title="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 15, lineHeight: 1, padding: 0, flexShrink: 0, alignSelf: "center" }}>×</button>
    </div>
  );
}
