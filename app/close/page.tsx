"use client";
import { PageHeader } from "@/app/components/PageHeader";
import { HeaderSelect } from "@/app/components/HeaderSelect";
import { MetaLine } from "@/app/components/LastImported";

// MONTH-END CLOSE (owner, 11/2026: "i like the closing checklist … i like to
// know when i need to import which files … pending close out progress as
// well"). Every line ticks itself from the record the portal already keeps —
// see lib/close/monthClose.ts. Sign-off opens when nothing is left.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ImportStepsButton } from "@/app/components/ImportStepsButton";
import { CLOSE_ITEM_STEPS } from "@/lib/tracker/importSteps";
import Link from "next/link";
import { ChevronDown, ChevronRight, Circle, CircleCheck, LoaderCircle } from "lucide-react";
import type { MonthClose, CloseItem } from "@/lib/close/monthClose";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const label = (m: string) => { const [y, mo] = m.split("-").map(Number); return `${MONTHS[mo - 1]} ${y}`; };
const SECTION: React.CSSProperties = { fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

type ReviewResp = {
  properties: { key: string; propertyCode: string; propertyName: string; lines: { months: { period: number }[] }[]; issues: { period: number }[] }[];
};
type Flags = { open: number; byProperty: { code: string; name: string; n: number }[] } | null;

function recentMonths(): string[] {
  const out: string[] = [];
  const d = new Date(); d.setDate(1);
  for (let i = 0; i < 12; i++) { d.setMonth(d.getMonth() - 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
  return out;
}

export default function MonthClosePage() {
  const months = useMemo(recentMonths, []);
  const [month, setMonth] = useState(months[0]);
  const [data, setData] = useState<MonthClose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flags, setFlags] = useState<Flags | undefined>(undefined);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (m: string) => {
    setData(null); setError(null); setFlags(undefined);
    fetch(`/api/close?month=${m}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error || "Couldn't load the close"); setData(j); })
      .catch((e) => setError(e.message));
    // Flags to Investigate runs its own sweep; counted here for this month only.
    const [y, mo] = m.split("-").map(Number);
    fetch(`/api/financials/operating-statements/review?year=${y}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: ReviewResp | null) => {
        if (!j) { setFlags(null); return; }
        const byProperty = j.properties.map((p) => ({
          code: p.propertyCode, name: p.propertyName,
          n: p.lines.reduce((s, l) => s + l.months.filter((x) => x.period === mo).length, 0) + p.issues.filter((x) => x.period === mo).length,
        })).filter((p) => p.n > 0).sort((a, b) => b.n - a.n);
        setFlags({ open: byProperty.reduce((s, p) => s + p.n, 0), byProperty });
      })
      .catch(() => setFlags(null));
  }, []);
  useEffect(() => { load(month); }, [month, load]);

  // Zero flags means nothing until the month's GLs are in — the review can only
  // flag what has been imported.
  const glIn = !!data?.sections.flatMap((x) => x.items).find((i) => i.id === "gl")?.done;
  const flagItem: CloseItem | null = flags === undefined ? null : {
    id: "flags", label: "Flags to Investigate", owner: "Drew", due: "After the GL import",
    link: "/financials/operating-statements/review",
    done: flags != null && flags.open === 0 && glIn,
    status: flags == null ? "Couldn't count" : flags.open ? `${flags.open} open` : glIn ? "All cleared" : "After every GL is in",
    detail: (flags?.byProperty ?? []).map((p) => ({ text: `${p.code} ${p.name}`, meta: `${p.n} open` })),
  };
  const left = (data?.left ?? 0) + (flagItem && !flagItem.done ? 1 : 0);
  const signed = data?.signedOff ?? null;
  const canSign = !!data && flags !== undefined && left === 0;

  async function sign(on: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/close", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month, signedOff: on, flagsOpen: flags?.open ?? 0 }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Couldn't sign off");
      setData(j);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't sign off"); }
    finally { setBusy(false); }
  }

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <PageHeader title="Month-End Close"
        pickers={
          <HeaderSelect value={month} onChange={setMonth} ariaLabel="Month" displayLabel={label(month)}>
            {months.map((m) => <option key={m} value={m}>{label(m)}</option>)}
          </HeaderSelect>
        }
        actions={data ? (signed
          ? <button className="btn" disabled={busy} onClick={() => sign(false)}>Reopen {MONTHS[Number(month.slice(5)) - 1]}</button>
          : <button className="btn primary" disabled={busy || !canSign} onClick={() => sign(true)}>Sign off {MONTHS[Number(month.slice(5)) - 1]}</button>) : undefined}
        meta={<MetaLine>
          {!data ? "Reading the month…" : signed
            ? `Signed off ${new Date(signed.at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${signed.by ? ` by ${signed.by}` : ""}`
            : left ? `${left} item${left === 1 ? "" : "s"} still open · ticks itself as the work lands` : "Everything is in"}
        </MetaLine>} />

      {error && <div className="card" style={{ color: "var(--c-b42318)" }}>{error}</div>}

      {!data && !error && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)" }}>
          <LoaderCircle size={20} strokeWidth={1.75} className="spin" /> Checking imports, recs and sends…
        </div>
      )}

      {data && data.sections.map((s) => {
        const items = s.flags ? (flagItem ? [flagItem] : []) : s.items;
        return (
          <section key={s.id} className="card" style={{ display: "grid", gap: 0 }}>
            <div style={{ ...SECTION, paddingBottom: 6 }}>{s.label}</div>
            {s.flags && !flagItem && (
              <div className="task-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 2px", color: "var(--muted)" }}>
                <LoaderCircle size={20} strokeWidth={1.75} className="spin" /> Counting this month&apos;s flags…
              </div>
            )}
            {items.map((it) => {
              const isOpen = !!open[it.id];
              const expandable = it.detail.length > 0;
              return (
                <Fragment key={it.id}>
                  <div className="task-row"
                    onClick={expandable ? () => setOpen((o) => ({ ...o, [it.id]: !o[it.id] })) : undefined}
                    style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr) auto 20px", gap: 12, alignItems: "center", padding: "11px 2px", borderBottom: "1px solid var(--hairline)", cursor: expandable ? "pointer" : "default" }}>
                    {it.done
                      ? <CircleCheck size={22} strokeWidth={1.75} color="var(--c-067647)" aria-label="Done" />
                      : <Circle size={22} strokeWidth={1.75} color="var(--c-98a2b3)" aria-label="Open" />}
                    <div style={{ minWidth: 0, display: "grid", gap: 1 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Link href={it.link} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600, fontSize: "var(--fs-14)", color: "inherit", textDecoration: "none" }}>{it.label}</Link>
                        {CLOSE_ITEM_STEPS[it.id] && <ImportStepsButton id={CLOSE_ITEM_STEPS[it.id]} />}
                      </span>
                      <span style={{ color: "var(--muted)", fontSize: "var(--fs-13)" }}>{[it.owner, it.due].filter(Boolean).join(" · ")}</span>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: "var(--fs-14)", color: it.done ? "var(--c-067647)" : "var(--c-b54708)", textAlign: "right" }}>{it.status}</span>
                    {expandable ? (isOpen ? <ChevronDown size={16} strokeWidth={1.75} /> : <ChevronRight size={16} strokeWidth={1.75} />) : <span />}
                  </div>
                  {expandable && isOpen && (
                    <div style={{ padding: "4px 0 10px 36px", display: "grid" }}>
                      {it.detail.map((d, i) => {
                        const row = (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 2px", borderBottom: "1px solid var(--hairline)", fontSize: "var(--fs-14)" }}>
                            <span>{d.text}</span>
                            <span style={{ color: d.tone === "red" ? "var(--c-b42318)" : d.tone === "amber" ? "var(--c-b54708)" : "var(--muted)", fontWeight: d.tone && d.tone !== "neutral" ? 700 : 400 }}>{d.meta}</span>
                          </div>
                        );
                        return d.href ? <Link key={i} href={d.href} style={{ color: "inherit", textDecoration: "none" }}>{row}</Link> : <Fragment key={i}>{row}</Fragment>;
                      })}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}
