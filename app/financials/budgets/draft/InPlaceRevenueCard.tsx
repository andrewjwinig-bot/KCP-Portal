"use client";

// Step one of budget season: import next year's contracted rent.
//
// The card is deliberately loud about COVERAGE. The 2026 workbook's own margin
// carried "Missing 1100 and 1500" — two centres the export dropped, caught by
// eye, written in a spare cell. A budget built on a schedule that quietly
// omits a property understates revenue by a whole building, so what came
// through and what did not is the first thing the card says.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pill, StatPill, TONE_GREEN, TONE_RED, TONE_AMBER } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { ImportInstructions } from "@/app/components/ImportInstructions";
import { unitsNeedingAssumption, monthlyForProperty } from "@/lib/financials/budgets/inPlaceDerive";
import type { InPlaceRevenueRecord } from "@/lib/financials/budgets/inPlaceStore";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

export function InPlaceRevenueCard({ year, category, propertyCode, editorLabel }: {
  year: number; category: string; propertyCode: string | null; editorLabel: string;
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

  const units = rec && propertyCode ? unitsNeedingAssumption(rec, propertyCode) : [];
  const months = rec && propertyCode ? monthlyForProperty(rec, propertyCode) : null;
  const propTotal = months ? months.reduce((s, n) => s + n, 0) : 0;
  // Units whose rent came through BLANK — a real space with no contracted
  // rent. Named, because a leased anchor entering the budget at nil with
  // nothing saying so is the failure this import exists to prevent.
  const blankUnits = rec ? [...new Set(rec.skipped.map((s) => s.reason))].length : 0;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={secLabel}>Step 1 · In-place revenue</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>Contracted rent for {year}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={() => setShowSteps((s) => !s)} style={{ fontSize: 12, padding: "5px 12px", fontWeight: 700 }}>
            {showSteps ? "Hide steps" : "Skyline steps"}
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}
            style={{ fontSize: 12, padding: "5px 12px", fontWeight: 700 }}>
            {busy ? "Importing…" : rec ? "Re-import" : "Import rent schedule"}
          </button>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </div>
      </div>

      <p className="muted small" style={{ marginTop: 6, marginBottom: 0 }}>
        The rent roll carries <em>today&rsquo;s</em> rate, so it cannot know a step that has not happened yet. This comes from Skyline&rsquo;s forward schedule — <strong>Budget Rent Increase Calculation</strong> — which carries the scheduled charge for every month of {year}.
      </p>

      {showSteps && <ImportInstructions variant="budget-rent" />}

      {msg && (
        <div className="small" style={{ marginTop: 10, fontWeight: 700, color: failed ? "#b91c1c" : "var(--muted)" }}>{msg}</div>
      )}

      {!rec && !busy && (
        <div className="muted small" style={{ marginTop: 12 }}>
          Nothing imported for {year} yet — the draft is holding current rents flat until it is.
        </div>
      )}

      {rec && (
        <>
          <div className="pills" style={{ marginTop: 12 }}>
            <StatPill label="Centres received" value={rec.properties.length} />
            <StatPill label="Scheduled charges" value={rec.charges.length} />
            {propertyCode && months && <StatPill label={`${propertyCode} · ${year} rent`} value={money0(propTotal)} />}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {rec.missing.length === 0 ? (
              <Pill tone={TONE_GREEN}>ALL {expected.length} CENTRES</Pill>
            ) : (
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
              {rec.fileName} · imported {new Date(rec.importedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} by {rec.importedBy}
            </span>
          </div>

          {months && propertyCode && (
            <div style={{ marginTop: 14, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={{ ...secLabel, textAlign: "left", padding: "6px 8px" }}>{propertyCode}</th>
                    {MONTHS.map((m) => <th key={m} style={{ ...secLabel, textAlign: "right", padding: "6px 8px" }}>{m}</th>)}
                    <th style={{ ...secLabel, textAlign: "right", padding: "6px 8px" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "6px 8px", fontSize: 13, fontWeight: 700, borderTop: "1px solid var(--border)" }}>Contracted rent</td>
                    {months.map((v, i) => (
                      <td key={i} style={{ padding: "6px 8px", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", borderTop: "1px solid var(--border)" }}>{money0(v)}</td>
                    ))}
                    <td style={{ padding: "6px 8px", fontSize: 13, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", borderTop: "1px solid var(--border)" }}>{money0(propTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {propertyCode && (
            <div style={{ marginTop: 14 }}>
              <div style={secLabel}>Needs an assumption · {propertyCode}</div>
              {units.length === 0 ? (
                <div className="muted small" style={{ marginTop: 6 }}>
                  Every unit here is contracted for all twelve months — nothing to assume.
                </div>
              ) : (
                <>
                  <p className="muted small" style={{ marginTop: 4, marginBottom: 8 }}>
                    A space with no contracted rent, or a lease that stops inside {year}. These are what Harry and Nancy fill in — the draft holds them at nil until they do.
                  </p>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ ...secLabel, textAlign: "left", padding: "6px 8px" }}>Unit</th>
                        <th style={{ ...secLabel, textAlign: "left", padding: "6px 8px" }}>Tenant</th>
                        <th style={{ ...secLabel, textAlign: "right", padding: "6px 8px" }}>Months contracted</th>
                        <th style={{ ...secLabel, textAlign: "left", padding: "6px 8px" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => (
                        <tr key={u.unitRef}>
                          <td style={{ padding: "6px 8px", fontSize: 13, borderTop: "1px solid var(--border)" }}><code style={{ fontSize: 12 }}>{u.unitRef}</code></td>
                          <td style={{ padding: "6px 8px", fontSize: 13, borderTop: "1px solid var(--border)" }}>{u.tenant || <span className="muted">— vacant</span>}</td>
                          <td style={{ padding: "6px 8px", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", borderTop: "1px solid var(--border)" }}>{u.monthsCovered} of 12</td>
                          <td style={{ padding: "6px 8px", borderTop: "1px solid var(--border)" }}>
                            <Pill tone={u.monthsCovered === 0 ? TONE_RED : TONE_AMBER}>
                              {u.monthsCovered === 0 ? "NO RENT SCHEDULED" : `ENDS ${MONTHS[(u.lastMonth ?? 1) - 1].toUpperCase()}`}
                            </Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
