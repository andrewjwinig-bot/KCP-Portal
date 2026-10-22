"use client";

// PUBLISH TO BUDGETS — one quiet line on a book's roll-up tab (or a one-
// property book's own tab): whether this book's draft is the budget of record
// for its year, and the button that makes it so. Publishing a future year
// changes nothing today — the statements, flags and Cash Sheet ask for the
// budget of the year they are looking at, so a 2027 budget takes effect on
// January 1, 2027 and the 2026 budget stays in force until then.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { draftFingerprint } from "@/lib/financials/budgets/publish";
import type { BudgetDraft } from "@/lib/financials/budgets/draft";
import type { BudgetBook } from "@/lib/financials/budgets/books";

type Status = {
  published: { id: string; at: string; by: string | null; fingerprint: string | null; unmapped: { propertyCode: string; section: string; label: string; total: number }[]; properties: string[] } | null;
  conflicts: { id: string; label: string; kind: string }[];
  canPublish: boolean;
};

const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export function PublishCard({ book, draft }: { book: BudgetBook; draft: BudgetDraft }) {
  const year = draft.budgetYear;
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/financials/budgets/publish?book=${encodeURIComponent(book.id)}&year=${year}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setStatus(j)).catch(() => setStatus(null));
  }, [book.id, year]);
  useEffect(() => { load(); }, [load]);

  const now = useMemo(() => draftFingerprint(draft), [draft]);
  const published = status?.published ?? null;
  const changed = !!published && !!published.fingerprint && published.fingerprint !== now;
  const inForceNow = year <= new Date().getFullYear();

  async function publish(replace = false) {
    const what = `${book.name} ${year}`;
    const when = inForceNow
      ? `It becomes the ${year} budget the statements, flags and Cash Sheet compare against right away.`
      : `It takes effect on January 1, ${year}; the ${year - 1} budget stays in force until then.`;
    if (!replace && !window.confirm(`Publish the ${what} draft as the budget of record?\n\n${when}\n\nYou can republish or unpublish it later.`)) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/financials/budgets/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book: book.id, year, replace }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 && j?.conflicts?.length) {
        const names = j.conflicts.map((c: { label: string }) => `• ${c.label}`).join("\n");
        if (window.confirm(`Another ${year} budget already covers these properties:\n\n${names}\n\nReplace it with this draft? It is deleted from Budgets.`)) {
          setBusy(false);
          return publish(true);
        }
      } else if (!r.ok) setError(j?.error ?? "Couldn't publish.");
    } catch { setError("Couldn't publish."); }
    setBusy(false);
    load();
  }

  async function unpublish() {
    if (!window.confirm(`Take the ${book.name} ${year} budget down? The draft stays as it is.`)) return;
    setBusy(true); setError(null);
    const r = await fetch(`/api/financials/budgets/publish?book=${encodeURIComponent(book.id)}&year=${year}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setError("Couldn't unpublish.");
    setBusy(false);
    load();
  }

  if (!status) return null;
  const pill = !published
    ? <Pill tone={TONE_NEUTRAL}>Not published</Pill>
    : changed
      ? <Pill tone={TONE_AMBER}>Changed since published</Pill>
      : <Pill tone={TONE_GREEN}>Published</Pill>;
  const unmapped = published?.unmapped ?? [];

  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px" }}>
      <span style={secLabel}>Budget of record</span>
      {pill}
      <span className="small muted" style={{ flex: 1, minWidth: 220 }}>
        {published
          ? <>Published {stamp(published.at)}{published.by ? ` by ${published.by}` : ""} · {inForceNow ? `the ${year} budget in force` : `takes effect Jan 1, ${year} — ${year - 1} stays in force until then`}</>
          : <>Publishing makes this draft the {year} budget the statements, flags and Cash Sheet compare against{inForceNow ? "" : ` — from Jan 1, ${year}`}.</>}
        {unmapped.length > 0 && (
          <HoverCard title="Lines with no GL account" width={360}
            rows={unmapped.slice(0, 10).map((u) => ({ label: `${u.propertyCode} · ${u.label}`, value: money0(u.total) }))}
            footer={{ label: "On Budgets, not on the statements' Budget column", value: `${unmapped.length}` }}>
            <span style={{ marginLeft: 8 }}><Pill tone={TONE_AMBER}>{unmapped.length} unmapped</Pill></span>
          </HoverCard>
        )}
      </span>
      {published && (
        <a className="btn sm" href={`/financials/budgets?property=${encodeURIComponent(published.properties[0] ?? "")}&year=${year}`}>Open in Budgets →</a>
      )}
      {status.canPublish && (
        <>
          {published && <button type="button" className="btn sm" disabled={busy} onClick={unpublish}>Unpublish</button>}
          <button type="button" className="btn sm primary" disabled={busy} onClick={() => publish()}>
            {busy ? "Publishing…" : published ? "Republish" : "Publish to Budgets"}
          </button>
        </>
      )}
      {error && <span className="small" style={{ color: "#b91c1c", width: "100%" }}>{error}</span>}
    </div>
  );
}
