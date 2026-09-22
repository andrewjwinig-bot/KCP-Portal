"use client";

// Flags to Investigate — built for a REVIEW SESSION.
//
// One property at a time (the dropdown, with ← / → to walk the portfolio),
// its open items YEAR TO DATE in ONE table banded by month, January down. Each row reads
// the way the question is asked in the room: which line, what posted, what was
// budgeted, the variance, and WHY it is on the list — the auto-explain note
// where there is one, the rule's own reason where there isn't. Dismiss it or
// write a note right on the row, and the next row is already in front of you.
//
// It used to be a stack of property cards, each opening to lines, each opening
// to months: three clicks to read one variance, and no sense of how far
// through the portfolio you were. The data is the same (`reviewFlaggedLines`);
// only the shape changed.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import { StatPill, Pill, TONE_RED, TONE_AMBER, TONE_PURPLE, TONE_GREEN } from "@/app/components/Pill";
import { Select, YearSelect } from "@/app/components/YearSelect";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import LoadingState from "@/app/components/LoadingState";
import { AnalyzingBar } from "@/app/components/ai/AiKit";
import { useUser } from "@/app/components/UserProvider";
import { groupByRentRoll, type RentRollGroup } from "@/lib/financials/operating-statements/propertyGroups";

type ReviewMonth = {
  period: number; monthLabel: string; flags: string[]; billing?: string;
  actual: number; budget: number | null; variance: number | null;
  note: string | null; noteSource?: "ai" | "user" | null;
};
type ReviewLine = { lineKey: string; section: string; line: string; months: ReviewMonth[] };
type ReviewIssue = {
  type: "not-posted" | "missing-debt";
  lineKey: string; section: string; line: string; period: number; monthLabel: string; expected: number;
};
type ReviewProperty = {
  key: string; propertyCode: string; propertyName: string; hasData: boolean;
  latestPeriod: number; latestMonthLabel: string; monthsCovered: number;
  lines: ReviewLine[]; flaggedMonthCount: number; issues: ReviewIssue[];
};
type ReviewResult = { year: number; generatedAt: string; properties: ReviewProperty[] };

function money(v: number | null): string {
  if (v == null) return "—";
  const n = Math.round(v);
  const s = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `($${s})` : `$${s}`;
}

function exportPdf(data: ReviewResult, grouped: { group: RentRollGroup; rows: ReviewProperty[] }[]) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const totalMonths = data.properties.reduce((s, p) => s + p.flaggedMonthCount, 0);
  const withFlags = data.properties.filter((p) => p.flaggedMonthCount > 0).length;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(`Flags to Investigate — ${data.year}`, M, y); y += 20;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`Operating Statements · generated ${new Date(data.generatedAt).toLocaleString()} · ${totalMonths} flagged line-months across ${withFlags} properties`, M, y);
  doc.setTextColor(0); y += 20;

  for (const { group, rows } of grouped) {
    if (!rows.some((p) => p.flaggedMonthCount > 0)) continue;
    ensure(30);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(11, 74, 125);
    doc.text(group.toUpperCase(), M, y); y += 5;
    doc.setDrawColor(11, 74, 125); doc.setLineWidth(1.2); doc.line(M, y, W - M, y);
    doc.setLineWidth(0.5); doc.setTextColor(0); y += 14;

    for (const p of rows) {
      if (!p.flaggedMonthCount) continue;
      ensure(28);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11.5);
      doc.text(`${p.propertyCode} — ${p.propertyName} · ${p.flaggedMonthCount} flagged line-month${p.flaggedMonthCount === 1 ? "" : "s"}`, M, y);
      y += 6; doc.setDrawColor(210); doc.line(M, y, W - M, y); y += 12;
      for (const l of p.lines) {
        ensure(16);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0);
        doc.text(`• ${l.line}`, M + 10, y);
        doc.setFont("helvetica", "normal"); doc.setTextColor(120);
        doc.text(`(${l.section})`, M + 12 + doc.getTextWidth(`• ${l.line} `), y);
        y += 12;
        for (const mo of l.months) {
          ensure(24);
          doc.setTextColor(40); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
          doc.text(`${mo.monthLabel}:`, M + 22, y);
          doc.setFont("helvetica", "normal"); doc.setTextColor(90);
          doc.text(`${money(mo.actual)}  ·  Budget ${money(mo.budget)}  ·  Var ${money(mo.variance)}`, M + 22 + doc.getTextWidth(`${mo.monthLabel}:  `), y);
          y += 11;
          for (const wl of doc.splitTextToSize(`Looks off: ${mo.flags.join("; ")}`, W - 2 * M - 36) as string[]) { ensure(11); doc.text(wl, M + 30, y); y += 10; }
          if (mo.note) for (const nl of doc.splitTextToSize(`Note: ${mo.note}`, W - 2 * M - 36) as string[]) { ensure(11); doc.text(nl, M + 30, y); y += 10; }
          y += 3;
        }
        y += 4;
      }
      y += 8;
    }
    y += 6;
  }
  doc.save(`Operating Statements - Flags to Investigate - ${data.year}.pdf`);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PROPERTY_KEY = "kcp.flags.property";

/** One row of the review table: a flagged line-month, or a missing posting. */
type Item = {
  id: string;
  kind: "flag" | "missing";
  lineKey: string; line: string; section: string; period: number;
  actual: number | null; budget: number | null; variance: number | null;
  /** The rule's own reasons (trend), and the tenants billed wrong. */
  reasons: string[]; billing?: string;
  note: string | null; noteSource: "ai" | "user" | null;
  missingType?: ReviewIssue["type"]; expected?: number;
};

function itemsFor(p: ReviewProperty): Item[] {
  const out: Item[] = [];
  for (const iss of p.issues ?? []) {
    out.push({
      id: `m::${iss.lineKey}::${iss.period}`, kind: "missing",
      lineKey: iss.lineKey, line: iss.line, section: iss.section, period: iss.period,
      actual: 0, budget: null, variance: null, reasons: [], note: null, noteSource: null,
      missingType: iss.type, expected: iss.expected,
    });
  }
  for (const l of p.lines) for (const m of l.months) {
    out.push({
      id: `f::${l.lineKey}::${m.period}`, kind: "flag",
      lineKey: l.lineKey, line: l.line, section: l.section, period: m.period,
      actual: m.actual, budget: m.budget, variance: m.variance,
      reasons: m.flags.filter((f) => f !== m.billing), billing: m.billing,
      note: m.note, noteSource: m.note ? (m.noteSource ?? "ai") : null,
    });
  }
  return out;
}

/** Within a month: missing postings, then wrong billing (both errors of FACT),
 *  then the rest by the size of the variance — the order you'd work them in. */
function rank(a: Item, b: Item): number {
  const k = (i: Item) => (i.kind === "missing" ? 0 : i.billing ? 1 : 2);
  return k(a) - k(b) || Math.abs(b.variance ?? b.expected ?? 0) - Math.abs(a.variance ?? a.expected ?? 0);
}

const openCount = (p: ReviewProperty) => p.flaggedMonthCount + (p.issues?.length ?? 0);

export default function OperatingStatementsReviewPage() {
  const { user } = useUser();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propKey, setPropKey] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  // YEAR TO DATE, January down: the list is a backlog to chip away at, and
  // it reads in the order the months happened. Newest-first is one click.
  const [newestFirst, setNewestFirst] = useState(false);
  // Dismissed THIS session: the row stays, dimmed, with an Undo — so a slip of
  // the mouse in a meeting is one click to take back, not a trip to the
  // statement. Leaving the property (or reloading) clears them from view.
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [explaining, setExplaining] = useState<{ done: number; total: number; now: string } | null>(null);
  // Failed calls, named. `fetch` does not throw on a 502, so a run where every
  // call failed used to finish silently and look like it had worked.
  const [explainFailures, setExplainFailures] = useState<string[]>([]);
  const [forceReexplain, setForceReexplain] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    return fetch(`/api/financials/operating-statements/review?year=${year}`)
      .then((r) => r.json())
      .then((j: ReviewResult & { error?: string }) => {
        if (j.error) { setError(j.error); setData(null); }
        else { setData(j); setError(null); }
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [year]);
  useEffect(() => { load(); }, [load]);

  // Properties in rent-roll order — the order the portfolio is always read in.
  const ordered = useMemo(() => {
    const withData = (data?.properties ?? []).filter((p) => p.hasData);
    return groupByRentRoll(withData).map(({ label, items }) => ({
      group: label as RentRollGroup,
      rows: items.slice().sort((a, b) => a.propertyCode.localeCompare(b.propertyCode)),
    }));
  }, [data]);
  const flat = useMemo(() => ordered.flatMap((g) => g.rows), [ordered]);

  // Pick a property: ?key= → the last one you had open → the first with work.
  useEffect(() => {
    if (!flat.length) return;
    if (propKey && flat.some((p) => p.key === propKey)) return;
    let want: string | null = null;
    try { want = new URLSearchParams(window.location.search).get("key") ?? localStorage.getItem(PROPERTY_KEY); } catch { /* storage blocked */ }
    const hit = flat.find((p) => p.key === want) ?? flat.find((p) => openCount(p) > 0) ?? flat[0];
    setPropKey(hit.key);
  }, [flat, propKey]);

  const choose = useCallback((key: string) => {
    setPropKey(key);
    setResolved(new Set());
    setEditing(null);
    setMonthFilter(null);
    try { localStorage.setItem(PROPERTY_KEY, key); } catch { /* storage blocked */ }
  }, []);

  const prop = flat.find((p) => p.key === propKey) ?? null;
  const idx = prop ? flat.indexOf(prop) : -1;
  const nextWithWork = useMemo(() => {
    if (idx < 0) return null;
    for (let i = 1; i <= flat.length; i++) {
      const p = flat[(idx + i) % flat.length];
      if (p.key !== propKey && openCount(p) > 0) return p;
    }
    return null;
  }, [flat, idx, propKey]);

  const items = useMemo(() => (prop ? itemsFor(prop) : []), [prop]);
  const months = useMemo(() => {
    const by = new Map<number, Item[]>();
    for (const it of items) {
      if (monthFilter != null && it.period !== monthFilter) continue;
      const arr = by.get(it.period); if (arr) arr.push(it); else by.set(it.period, [it]);
    }
    return [...by.entries()]
      .sort((a, b) => (newestFirst ? b[0] - a[0] : a[0] - b[0]))
      .map(([period, rows]) => ({ period, rows: rows.sort(rank) }));
  }, [items, monthFilter, newestFirst]);
  const availableMonths = useMemo(() => [...new Set(items.map((i) => i.period))].sort((a, b) => a - b), [items]);

  const openHere = items.filter((i) => !resolved.has(i.id)).length;
  const missingHere = items.filter((i) => i.kind === "missing").length;
  const unexplained = items.filter((i) => i.kind === "flag" && !i.note && !resolved.has(i.id)).length;
  const portfolioOpen = flat.reduce((s, p) => s + openCount(p), 0);

  // Dismiss (or restore) one item — the same dismissal the ✕
  // on the statement writes, so it drops off the statement and the checklist.
  const setDismissed = useCallback(async (it: Item, dismissed: boolean) => {
    if (!prop) return;
    setBusy((s) => new Set(s).add(it.id));
    try {
      const res = await fetch("/api/financials/operating-statements/dismiss-flag", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prop.key, year, period: it.period, lineKey: it.lineKey, dismissed }),
      });
      if (!res.ok) throw new Error("save failed");
      setResolved((s) => { const n = new Set(s); if (dismissed) n.add(it.id); else n.delete(it.id); return n; });
    } catch {
      alert("Couldn't save that — please try again.");
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(it.id); return n; });
    }
  }, [prop, year]);

  // A note written here is a PERSON'S note: auto-explain never overwrites it.
  const saveNote = useCallback(async (it: Item, text: string) => {
    if (!prop) return;
    setBusy((s) => new Set(s).add(it.id));
    try {
      const res = await fetch("/api/financials/operating-statements", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: prop.key, year, period: it.period, lineKey: it.lineKey, note: text, editedBy: user?.label }),
      });
      if (!res.ok) throw new Error("save failed");
      setData((d) => d && {
        ...d,
        properties: d.properties.map((p) => p.key !== prop.key ? p : {
          ...p,
          lines: p.lines.map((l) => l.lineKey !== it.lineKey ? l : {
            ...l,
            months: l.months.map((m) => m.period !== it.period ? m : { ...m, note: text.trim() || null, noteSource: text.trim() ? "user" : null }),
          }),
        }),
      });
      setEditing(null);
    } catch {
      alert("Couldn't save the note — please try again.");
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(it.id); return n; });
    }
  }, [prop, year, user]);

  // Explain a set of (property, month) pairs, one call each, and say which failed.
  const runExplain = useCallback(async (pairs: { key: string; period: number; label: string }[]) => {
    if (!pairs.length) return;
    const failures: string[] = [];
    setExplainFailures([]);
    for (let i = 0; i < pairs.length; i++) {
      const where = `${pairs[i].label} · ${MONTHS[pairs[i].period - 1]}`;
      // Name the property BEFORE the call — the interesting moment is the
      // minute it is being read, not the instant it finishes.
      setExplaining({ done: i, total: pairs.length, now: where });
      try {
        const res = await fetch("/api/financials/operating-statements/analyze", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: pairs[i].key, year, period: pairs[i].period, force: forceReexplain }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) failures.push(`${where}: ${j.error ?? `HTTP ${res.status}`}`);
      } catch (e) {
        failures.push(`${where}: ${e instanceof Error ? e.message : "request failed"}`);
      }
    }
    setExplaining(null);
    setExplainFailures(failures);
    await load(true); // the freshly written notes, without the full-page loader
  }, [year, forceReexplain, load]);

  const pairsFor = (ps: ReviewProperty[]) => ps.flatMap((p) =>
    [...new Set(p.lines.flatMap((l) => l.months.map((m) => m.period)))].map((period) => ({ key: p.key, period, label: p.propertyCode })));

  const emailChecklist = useCallback(async () => {
    setEmailing(true);
    setEmailMsg(null);
    try {
      const j = await fetch("/api/financials/operating-statements/review/email", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year }),
      }).then((r) => r.json());
      setEmailMsg(j.error ? j.error : j.sent ? `Sent — ${j.items} item${j.items === 1 ? "" : "s"} to ${(j.to ?? []).join(", ")}.` : (j.reason ?? "Nothing sent."));
    } catch {
      setEmailMsg("Couldn't send the checklist.");
    } finally {
      setEmailing(false);
    }
  }, [year]);

  const statementHref = (period: number) => prop
    ? `/financials/operating-statements?key=${encodeURIComponent(prop.key)}&year=${year}&period=${period}`
    : "#";

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Flags to Investigate</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Work through one property at a time. Each row is a line that looks off that month — what posted, what was budgeted, and why it&rsquo;s on the list.{" "}
            <b>Dismiss</b> it once you&rsquo;ve checked it, or write a note — the goal is an empty list.{" "}
            <Link href="/financials/operating-statements" style={{ color: "var(--brand)", fontWeight: 600 }}>← Operating Statements</Link>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <YearSelect value={year} years={[thisYear - 2, thisYear - 1, thisYear]} onChange={(y) => { setYear(y); setPropKey(null); setResolved(new Set()); }} suffix="" tone="neutral" aria-label="Year" />
          <button className="btn ai" onClick={() => runExplain(pairsFor(flat))} disabled={!portfolioOpen || !!explaining}
            title="Write an AI note for every flagged line across every property (skips lines already explained unless re-explain is ticked)">
            ✨ Explain all properties
          </button>
          <label className="muted small" style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }} title="Re-run even on lines already explained (uses tokens again). Notes you wrote are never overwritten.">
            <input type="checkbox" checked={forceReexplain} onChange={(e) => setForceReexplain(e.target.checked)} />
            re-explain done
          </label>
          <button className="btn" onClick={emailChecklist} disabled={emailing}
            title="Email the printable checklist — every property's open items, missing postings first. Sent automatically after each import.">
            {emailing ? "Sending…" : "Email checklist"}
          </button>
          <DownloadMenu
            disabled={!portfolioOpen}
            items={[
              { label: "Checklist (Excel)", description: "Every property's open items, with a box to tick — the same file the import emails", href: `/api/financials/operating-statements/review/checklist?year=${year}` },
              { label: "Checklist (PDF)", description: "Every property, grouped like the rent roll", onClick: () => data && exportPdf(data, ordered.map((g) => ({ group: g.group, rows: g.rows }))) },
            ]}
          />
        </div>
      </div>

      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>· {error}</div>}
      {emailMsg && <div className="muted small">{emailMsg}</div>}
      {explainFailures.length > 0 && (
        <div className="small" style={{ color: "#b91c1c" }}>
          {explainFailures.length} could not be explained: {explainFailures.slice(0, 4).join("; ")}{explainFailures.length > 4 ? `; and ${explainFailures.length - 4} more` : ""}
        </div>
      )}
      {explaining && (
        <AnalyzingBar label="Reading the GL behind each flagged line" done={explaining.done} total={explaining.total} sub={explaining.now} />
      )}

      {loading && !data ? (
        <LoadingState status="Scanning every month of every property…" context="Auditing GL lines for anything that looks off" columns={3} rows={4} />
      ) : !flat.length ? (
        <div className="card muted small" style={{ padding: 18 }}>No properties with an uploaded GL for {year}.</div>
      ) : (
        <>
          {/* THE ONE CONTROL THE PAGE IS DRIVEN BY — the property — plus the
              two buttons that make it a walk-through rather than a lookup. */}
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" disabled={idx <= 0} onClick={() => idx > 0 && choose(flat[idx - 1].key)} title="Previous property">←</button>
            <Select value={propKey ?? ""} onChange={choose} aria-label="Property" style={{ flex: "0 1 auto", minWidth: 0, maxWidth: "100%" }}>
              {ordered.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.rows.map((p) => {
                    const n = openCount(p);
                    return <option key={p.key} value={p.key}>{p.propertyCode} — {p.propertyName} · {n ? `${n} open` : "clear"}</option>;
                  })}
                </optgroup>
              ))}
            </Select>
            <button className="btn" disabled={idx < 0 || idx >= flat.length - 1} onClick={() => idx < flat.length - 1 && choose(flat[idx + 1].key)} title="Next property">→</button>
            <span className="muted small">Property {idx + 1} of {flat.length}{prop ? ` · posted through ${prop.latestMonthLabel}` : ""}</span>
            <span style={{ marginLeft: "auto" }} />
            {availableMonths.length > 1 && (
              <Select tone="neutral" small value={monthFilter ?? ""} onChange={(v) => setMonthFilter(v ? Number(v) : null)} aria-label="Month">
                <option value="">Year to date</option>
                {availableMonths.map((m) => <option key={m} value={m}>{MONTHS_LONG[m - 1]}</option>)}
              </Select>
            )}
            <Select tone="neutral" small value={newestFirst ? "new" : "old"} onChange={(v) => setNewestFirst(v === "new")} aria-label="Month order">
              <option value="old">Jan → latest</option>
              <option value="new">Latest → Jan</option>
            </Select>
            {prop && unexplained > 0 && (
              <button className="btn ai" disabled={!!explaining} onClick={() => runExplain(pairsFor([prop]))}
                title="Write an AI note for this property's flagged lines that don't have one yet">
                ✨ Explain {unexplained} line{unexplained === 1 ? "" : "s"}
              </button>
            )}
          </div>

          <div className="pills" style={{ justifyContent: "flex-start" }}>
            <StatPill label="Open here" value={openHere} accent={openHere ? "#b45309" : "#15803d"} />
            <StatPill label="Not posted" value={missingHere} accent={missingHere ? "#b91c1c" : undefined} />
            <StatPill label="Dismissed this session" value={resolved.size} accent={resolved.size ? "#15803d" : undefined} />
            <StatPill label="Portfolio open" value={portfolioOpen - resolved.size} sub={`${flat.filter((p) => openCount(p) > 0).length} properties`} />
          </div>

          {prop && items.length === 0 ? (
            <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Pill tone={TONE_GREEN}>CLEAR</Pill>
              <span><b>{prop.propertyCode} — {prop.propertyName}</b> has nothing to investigate for {year}.</span>
              {nextWithWork && (
                <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => choose(nextWithWork.key)}>
                  Next: {nextWithWork.propertyCode} — {nextWithWork.propertyName} ({openCount(nextWithWork)}) →
                </button>
              )}
            </div>
          ) : prop && (
            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
                <thead>
                  <tr>
                    <th style={thL}>Line</th>
                    <th style={th}>Actual</th>
                    <th style={th}>Budget</th>
                    <th style={th}>Variance</th>
                    <th style={thL}>Why it&rsquo;s flagged</th>
                    <th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {months.map(({ period, rows }, mi) => {
                    const open = rows.filter((r) => !resolved.has(r.id)).length;
                    return (
                      <Fragment key={period}>
                        {/* The month band carries only what is true of the
                            month: how many items, and the way to its statement. */}
                        <tr style={{ background: "rgba(11,74,125,0.07)", borderTop: mi ? "2px solid var(--border)" : "none" }}>
                          <td style={{ ...tdL, paddingTop: 10, paddingBottom: 10 }} colSpan={5}>
                            <span style={{ fontWeight: 800 }}>{MONTHS_LONG[period - 1]} {year}</span>
                            <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>
                              {open === 0 ? "all dismissed" : `${open} open${rows.length !== open ? ` · ${rows.length - open} dismissed` : ""}`}
                            </span>
                          </td>
                          <td style={{ ...td, paddingTop: 10, paddingBottom: 10 }}>
                            <Link href={statementHref(period)} style={{ color: "var(--brand)", fontWeight: 700, fontSize: 12.5, textDecoration: "none" }}>
                              {MONTHS[period - 1]} statement ↗
                            </Link>
                          </td>
                        </tr>
                        {rows.map((it) => (
                          <ItemRow key={it.id} it={it}
                            resolved={resolved.has(it.id)} busy={busy.has(it.id)}
                            editing={editing?.id === it.id ? editing.text : null}
                            onEdit={(text) => setEditing(text == null ? null : { id: it.id, text })}
                            onSaveNote={(text) => saveNote(it, text)}
                            onResolve={(v) => setDismissed(it, v)}
                            href={statementHref(it.period)} />
                        ))}
                      </Fragment>
                    );
                  })}
                  {months.length === 0 && (
                    <tr><td colSpan={6} style={{ ...tdL, padding: "22px 12px", color: "var(--muted)" }}>Nothing flagged in that month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {prop && items.length > 0 && openHere === 0 && nextWithWork && (
            <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Pill tone={TONE_GREEN}>DONE</Pill>
              <span>Everything on <b>{prop.propertyCode}</b> is dismissed.</span>
              <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => choose(nextWithWork.key)}>
                Next: {nextWithWork.propertyCode} — {nextWithWork.propertyName} ({openCount(nextWithWork)}) →
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function ItemRow({ it, resolved, busy, editing, onEdit, onSaveNote, onResolve, href }: {
  it: Item; resolved: boolean; busy: boolean; editing: string | null;
  onEdit: (text: string | null) => void; onSaveNote: (text: string) => void;
  onResolve: (dismissed: boolean) => void; href: string;
}) {
  const missing = it.kind === "missing";
  const varColor = it.variance == null ? undefined : it.variance >= 0 ? "#15803d" : "#b91c1c";
  return (
    <tr style={{ borderTop: "1px solid var(--border)", opacity: resolved ? 0.45 : 1, verticalAlign: "top" }}>
      <td style={{ ...tdL, whiteSpace: "normal", minWidth: 180 }}>
        <Link href={href} style={{ color: "var(--text)", fontWeight: 700, textDecoration: resolved ? "line-through" : "none" }}>{it.line}</Link>
        <div className="muted" style={{ fontSize: 11.5 }}>{it.section}</div>
      </td>
      <td style={td}>{money(it.actual)}</td>
      <td style={{ ...td, color: "var(--muted)" }}>{missing ? <span title="Budgeted or scheduled year to date">~{money(it.expected ?? null)}</span> : money(it.budget)}</td>
      <td style={{ ...td, fontWeight: 700, color: varColor }}>{missing ? "—" : money(it.variance)}</td>
      <td style={{ ...tdL, whiteSpace: "normal", maxWidth: 520, fontSize: 13.5, lineHeight: 1.45 }}>
        {editing != null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea autoFocus value={editing} onChange={(e) => onEdit(e.target.value)} rows={3} style={{ width: "100%" }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSaveNote(editing); if (e.key === "Escape") onEdit(null); }} />
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn primary" disabled={busy} onClick={() => onSaveNote(editing)} style={{ fontSize: 12, padding: "4px 12px" }}>{busy ? "Saving…" : "Save note"}</button>
              <button className="btn" onClick={() => onEdit(null)} style={{ fontSize: 12, padding: "4px 12px" }}>Cancel</button>
              <span className="muted" style={{ fontSize: 11.5, alignSelf: "center" }}>⌘/Ctrl+Enter to save</span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {missing && (
              <div><Pill tone={TONE_RED}>{it.missingType === "missing-debt" ? "DEBT NOT POSTED" : "NOT POSTED"}</Pill>{" "}
                <span>A figure this line should carry reads $0 — post it, or confirm it doesn&rsquo;t apply.</span></div>
            )}
            {it.billing && (
              <div><Pill tone={TONE_AMBER}>BILLING</Pill> <span>{it.billing}</span></div>
            )}
            {it.note ? (
              <div>
                {it.noteSource === "ai" && <span style={{ marginRight: 6 }}><Pill tone={TONE_PURPLE}>✨ AI</Pill></span>}
                <span>{it.note}</span>
              </div>
            ) : !missing && !it.billing && (
              <div className="muted">No note yet.</div>
            )}
            {it.reasons.length > 0 && (
              <div className="muted" style={{ fontSize: 12 }}>Flagged: {it.reasons.join("; ")}</div>
            )}
          </div>
        )}
      </td>
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        {editing == null && (
          <div style={{ display: "inline-flex", gap: 6 }}>
            {!missing && !resolved && (
              <button className="btn" disabled={busy} onClick={() => onEdit(it.note ?? "")} style={{ fontSize: 12, padding: "4px 10px" }}
                title={it.note ? "Edit the note — an edited note is yours, and auto-explain won't overwrite it" : "Write a note"}>
                {it.note ? "Edit" : "Note"}
              </button>
            )}
            {resolved ? (
              <button className="btn" disabled={busy} onClick={() => onResolve(false)} style={{ fontSize: 12, padding: "4px 10px" }}>Undo</button>
            ) : (
              <button className="btn primary" disabled={busy} onClick={() => onResolve(true)} style={{ fontSize: 12, padding: "4px 12px" }}
                title={missing ? "Checked — it doesn't apply this month. Drops it off the list and the checklist" : "Investigated and fine — clears the ? on the statement and drops it off the checklist"}>
                {busy ? "…" : "Dismiss"}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
