"use client";

// Step one of budget season: import next year's contracted rent.
//
// The card is deliberately loud about COVERAGE. The 2026 workbook's own margin
// carried "Missing 1100 and 1500" — two centres the export dropped, caught by
// eye, written in a spare cell. A budget built on a schedule that quietly
// omits a property understates revenue by a whole building, so what came
// through and what did not is the first thing the card says.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pill, TONE_RED, TONE_AMBER } from "@/app/components/Pill";
import { STEP_LABEL } from "./stepStyles";
import { HoverCard } from "@/app/components/HoverCard";
import { ImportInstructions } from "@/app/components/ImportInstructions";
import type { InPlaceRevenueRecord } from "@/lib/financials/budgets/inPlaceStore";

const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

export function InPlaceRevenueCard({ year, category, propertyCode, editorLabel, children }: {
  year: number; category: string; propertyCode: string | null; editorLabel: string;
  /** The property's suites by what the year holds for them — from the same
   *  rows as "Rent by tenant", so the tiles and the table agree. */
  /** The rest of the RENT step — the leasing decisions and Rent by tenant —
   *  rendered inside this card, full-bleed below the import. One step, one card. */
  children?: React.ReactNode;
}) {
  const [rec, setRec] = useState<InPlaceRevenueRecord | null>(null);
  const [expected, setExpected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    fetch(`/api/financials/budgets/in-place?year=${year}&category=${encodeURIComponent(category)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setRec(j.record ?? null); setExpected(j.expected ?? []); })
      .catch(() => {});
  }, [year, category]);

  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setBusy(true); setMsg(null); setFailed(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("year", String(year));
      fd.append("category", category);
      fd.append("importedBy", editorLabel);
      const j = await fetch("/api/financials/budgets/in-place", { method: "POST", body: fd }).then((r) => r.json());
      if (j.error) { setMsg(j.error); setFailed(true); return; }
      setRec(j.record); setExpected(j.expected ?? []);
      setMsg(null);
    } catch {
      setMsg("The import failed."); setFailed(true);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // The heading sits OUTSIDE the card, as Step 2's does — a chapter break in
  // the page rather than a title inside a box — with the import actions on
  // its right. The card holds only what the import says and the table.
  const status = !!(showSteps || msg || (!rec && !busy) || rec);
  return (
    <>
      <div id="step-rent" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
        <div style={STEP_LABEL}>Revenues — {year}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn sm" onClick={() => setShowSteps((s) => !s)}>
            {showSteps ? "Hide steps" : "Skyline steps"}
          </button>
          <button type="button" className="btn sm primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Importing…" : rec ? "Re-import rent schedule" : "Import rent schedule"}
          </button>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {status && (
          <div style={{ display: "grid", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
            {showSteps && <ImportInstructions variant="budget-rent" />}

            {msg && (
              <div className="small" style={{ fontWeight: 700, color: failed ? "#b91c1c" : "var(--muted)" }}>{msg}</div>
            )}

            {!rec && !busy && (
              <div className="muted small">
                Nothing imported for {year} yet — the draft is holding current rents flat until it is.
              </div>
            )}

            {rec && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {rec.missing.length > 0 && (
                  <HoverCard
                    title="Centres missing from the export"
                    rows={rec.missing.map((m) => ({ label: m, value: "no rows" }))}
                    footer={{ label: "What to do", value: "Re-run the Skyline report across every centre and import again — a centre with no rows is not a centre with no rent." }}
                  >
                    <div><Pill tone={TONE_RED}>MISSING {rec.missing.join(", ")}</Pill></div>
                  </HoverCard>
                )}
                {rec.skipped.length > 0 && (
                  <HoverCard
                    title="Rows with no readable amount"
                    rows={rec.skipped.slice(0, 8).map((s) => ({ label: `Row ${s.row}`, value: s.reason }))}
                    footer={{ label: "Why it matters", value: "A blank rent is a real space with no contracted charge — it belongs on the vacancy list, not in the budget at nil." }}
                  >
                    <div><Pill tone={TONE_AMBER}>{rec.skipped.length} ROWS WITHOUT AN AMOUNT</Pill></div>
                  </HoverCard>
                )}
                <span className="muted small">
                  Rent schedule imported {new Date(rec.importedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} by {rec.importedBy}
                </span>
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
