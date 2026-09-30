"use client";

// Insurance — the broker's Statement of Values, filled from the portal.
//
// Each year the broker sends the SOV back to be updated for the insurance
// applications. Import it here and the page reads every location on it,
// matches each to a property, and shows what the portal would write into it:
// the building facts kept on each property's page, and the rent roll's area,
// suite count and (opt-in) annualised billings for BI. The download is the
// broker's OWN workbook with those cells written in — their layout, their
// formulas, their Vacant Land tab — so it goes back as the form they sent.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pill, StatPill, TONE_AMBER, TONE_BLUE, TONE_NEUTRAL } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { LastImported } from "@/app/components/LastImported";
import { useFileDrop, byExt } from "@/app/components/useFileDrop";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import { FILLABLE, type CellPlan, type RowStatus } from "@/lib/insurance/sov";

type Row = {
  row: number;
  locationName: string;
  address: string;
  code: string | null;
  propertyName: string | null;
  status: RowStatus;
  siblings: number;
  cells: CellPlan[];
};

type Payload = {
  ok: boolean;
  error?: string;
  stored: { fileName: string; uploadedAt: string; uploadedBy: string | null; builtIn?: boolean } | null;
  sheetName?: string;
  otherSheets?: string[];
  columns?: string[];
  totalInsuredValue?: number | null;
  rows?: Row[];
  seed?: { properties: number; fields: number };
};

const money0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const LABEL = Object.fromEntries(FILLABLE.map((f) => [f.key, f.label]));
const NUMERIC = new Set(FILLABLE.filter((f) => f.numeric).map((f) => f.key));

function show(key: string, v: string | number | null): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") {
    if (key === "pctSprinklered") return `${Math.round(v * (v <= 1 ? 100 : 1))}%`;
    if (key === "biValues") return money0(v);
    if (key === "yearBuilt" || key === "yearUpgrade") return String(v);
    return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return v.replace(/\s+/g, " ").trim();
}

const SHORT_CELL: React.CSSProperties = { maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis" };

export default function InsurancePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updateBi, setUpdateBi] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const j = (await fetch(`/api/insurance/sov?bi=${updateBi ? 1 : 0}`, { cache: "no-store" }).then((r) => r.json())) as Payload;
      if (!j.ok) throw new Error(j.error ?? "Could not load the Statement of Values.");
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the Statement of Values.");
    } finally { setLoading(false); }
  }, [updateBi]);
  useEffect(() => { void load(); }, [load]);

  async function upload(file: File) {
    setBusy("upload"); setError(null); setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const j = await fetch("/api/insurance/sov", { method: "POST", body: fd }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "Upload failed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally { setBusy(null); }
  }
  const drop = useFileDrop((files) => void upload(files[0]), { accept: byExt([".xlsx"]), disabled: !!busy });

  async function revert() {
    if (!confirm("Stop using the imported form and go back to the broker's 2026 form kept in the portal?")) return;
    setBusy("revert");
    try {
      await fetch("/api/insurance/sov", { method: "DELETE" });
      await load();
    } finally { setBusy(null); }
  }

  async function seedFacts() {
    const s = data?.seed;
    if (!s || !s.fields) return;
    if (!confirm(`Copy ${s.fields} answers from this sheet into ${s.properties} properties' Building Facts?\n\nOnly EMPTY facts are filled — nothing already keyed on a property page is changed.`)) return;
    setBusy("seed"); setNotice(null);
    try {
      const j = await fetch("/api/insurance/sov/seed-facts", { method: "POST" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "Could not fill property info.");
      setNotice(`Filled ${j.fields} facts on ${j.properties} properties. Property info is now the source for next year's form.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fill property info.");
    } finally { setBusy(null); }
  }

  const rows = data?.rows ?? [];
  const cols = FILLABLE.filter((f) => data?.columns?.includes(f.key));
  const changedCells = rows.reduce((n, r) => n + r.cells.filter((c) => c.changed).length, 0);
  const changedRows = rows.filter((r) => r.cells.some((c) => c.changed)).length;
  const unmatched = rows.filter((r) => r.status === "unmatched");
  const shared = rows.filter((r) => r.status === "shared");
  const biSheet = rows.reduce((s, r) => s + (Number(r.cells.find((c) => c.key === "biValues")?.sheet) || 0), 0);
  // `next` is the sheet's figure wherever nothing changes, so this is the
  // form's BI total as it will go back.
  const biNext = rows.reduce((s, r) => s + (Number(r.cells.find((c) => c.key === "biValues")?.next) || 0), 0);
  const shown = onlyChanged ? rows.filter((r) => r.cells.some((c) => c.changed)) : rows;

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1400, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Insurance — Schedule of Values</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            {busy === "upload" ? "Importing…" : "Import broker's new form"}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          <DownloadMenu
            disabled={!data?.stored}
            items={[{
              label: "Schedule of Values (Excel)",
              description: updateBi
                ? "The broker's workbook with property info, rent-roll area / suites and BI written in"
                : "The broker's workbook with property info and rent-roll area / suites written in",
              href: `/api/insurance/sov/download?bi=${updateBi ? 1 : 0}`,
            }]}
          />
        </div>
      </div>

      <p className="muted" style={{ marginTop: -6, maxWidth: 900 }}>
        The broker&rsquo;s Statement of Values for the insurance applications, filled with today&rsquo;s data —
        construction, occupancy, stories, sprinklers and the rest from each property&rsquo;s <b>Building Facts</b>,
        floor area and units from the <b>rent roll</b>. <b>Download</b> gives you the broker&rsquo;s own workbook
        with those cells written in, ready to send; addresses, insured values and notes are left as they sent them.
        Only import a form if the broker sends a new or changed one.
      </p>

      {error && <div className="card" style={{ borderLeft: "4px solid #b91c1c", color: "#b91c1c", fontWeight: 600, fontSize: 13 }}>{error}</div>}
      {notice && <div className="card" style={{ borderLeft: "4px solid #15803d", color: "#15803d", fontWeight: 600, fontSize: 13 }}>{notice}</div>}
      {loading && !data && <div className="card muted">Loading…</div>}

      {data && !data.stored && (
        <div className="card" {...drop.dropHandlers}
          style={{
            textAlign: "center", padding: "36px 20px",
            ...(drop.dragging ? { outline: "2px dashed var(--brand)", outlineOffset: -2, background: "rgba(11,74,125,0.04)" } : null),
          }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{drop.dragging ? "Drop to import" : "No Statement of Values imported yet"}</div>
          <div className="muted small">Drag the broker&rsquo;s .xlsx here, or use <b>Import SOV</b> above.</div>
        </div>
      )}

      {data?.stored && (
        <>
          <div className="pills">
            <StatPill label="Locations" value={rows.length} sub={`${rows.length - unmatched.length} matched to a property`} />
            <StatPill label="Cells to update" value={changedCells} sub={`on ${changedRows} locations`} accent={changedCells ? "var(--brand)" : undefined} />
            <StatPill label="Total insured value" value={data.totalInsuredValue != null ? money0(data.totalInsuredValue) : "—"} sub="as the form carries it" />
            <StatPill label="BI values" value={money0(biNext)} sub={updateBi ? `with the rent roll · form had ${money0(biSheet)}` : "as the form carries it"} />
          </div>

          <div className="card" {...drop.dropHandlers}
            style={drop.dragging ? { outline: "2px dashed var(--brand)", outlineOffset: -2, background: "rgba(11,74,125,0.04)" } : undefined}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{data.stored.fileName}</div>
                {data.stored.builtIn ? (
                  <p className="muted small" style={{ margin: "2px 0 0", fontStyle: "italic" }}>The broker&rsquo;s 2026 form, kept in the portal — no upload needed</p>
                ) : (
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <LastImported at={data.stored.uploadedAt} by={data.stored.uploadedBy} style={{ margin: "2px 0 0" }} />
                    <button className="btn sm" disabled={!!busy} onClick={() => void revert()}>Use the built-in form</button>
                  </div>
                )}
                {!!data.otherSheets?.length && (
                  <div className="muted small" style={{ marginTop: 2 }}>
                    Reads the <b>{data.sheetName}</b> tab; {data.otherSheets.join(", ")} {data.otherSheets.length === 1 ? "is" : "are"} passed through unchanged.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={updateBi} onChange={(e) => setUpdateBi(e.target.checked)} />
                  <HoverCard title="BI values from the rent roll" width={300}
                    rows={[
                      { label: "Figure", value: "12 × this month's billed rent + CAM + tax + other" },
                      { label: "Default", value: "Off — BI is a coverage call" },
                    ]}
                    footer={{ label: "Note", value: "An 18-month or percentage-rent BI needs the broker's basis" }}>
                    <span>Update BI values from the rent roll</span>
                  </HoverCard>
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
                  Only locations that change
                </label>
                {!!data.seed?.fields && (
                  <button className="btn" disabled={!!busy} onClick={() => void seedFacts()}>
                    {busy === "seed" ? "Filling…" : `Fill property info from this sheet (${data.seed.fields})`}
                  </button>
                )}
              </div>
            </div>
          </div>

          {(unmatched.length > 0 || shared.length > 0) && (
            <div className="card" style={{ borderLeft: "4px solid #d97706", fontSize: 13 }}>
              {unmatched.length > 0 && (
                <div><b>{unmatched.length} location{unmatched.length === 1 ? "" : "s"} match no property</b> and {unmatched.length === 1 ? "is" : "are"} left as the form has {unmatched.length === 1 ? "it" : "them"}: {unmatched.map((r) => r.address || r.locationName).join("; ")}.</div>
              )}
              {shared.length > 0 && (
                <div style={{ marginTop: unmatched.length ? 6 : 0 }}>
                  <b>{shared.length} rows share a property</b> ({[...new Set(shared.map((r) => r.propertyName ?? r.code))].join(", ")}) — a
                  property-wide figure can&rsquo;t be split across its buildings, so those rows are left as the form has them.
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thL}>Location</th>
                  <th style={thL}>Property</th>
                  {cols.map((c) => <th key={c.key} style={NUMERIC.has(c.key) ? th : thL}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.row} style={{ borderTop: "1px solid var(--border)", opacity: r.status === "matched" ? 1 : 0.7 }}>
                    <td style={{ ...tdL, whiteSpace: "normal", minWidth: 200, maxWidth: 260 }}>
                      <div style={{ fontWeight: 600 }}>{r.address || "—"}</div>
                      <div className="muted small" style={{ ...SHORT_CELL, maxWidth: 260, whiteSpace: "nowrap" }}>{r.locationName}</div>
                    </td>
                    <td style={tdL}>
                      {r.code ? (
                        <Link href={`/properties/${encodeURIComponent(r.code)}`} style={{ textDecoration: "none" }}>
                          <code style={{ fontSize: 12 }}>{r.code}</code>{" "}
                          <span className="small">{r.propertyName}</span>
                        </Link>
                      ) : <Pill tone={TONE_AMBER}>NO MATCH</Pill>}
                      {r.status === "shared" && <div style={{ marginTop: 3 }}><Pill tone={TONE_NEUTRAL}>{r.siblings} ROWS</Pill></div>}
                    </td>
                    {cols.map((c) => {
                      const cell = r.cells.find((x) => x.key === c.key);
                      const num = NUMERIC.has(c.key);
                      const base: React.CSSProperties = { ...(num ? td : tdL), ...SHORT_CELL };
                      if (!cell) return <td key={c.key} style={base}>—</td>;
                      if (!cell.changed) {
                        const agrees = !!cell.source && r.status === "matched" && (c.key !== "biValues" || updateBi);
                        return (
                          <td key={c.key} style={base}>
                            {agrees ? (
                              <HoverCard title={LABEL[c.key]} rows={[{ label: "Form", value: show(c.key, cell.sheet) }, { label: "Source", value: cell.source! }]}
                                footer={{ label: "Status", value: "Already matches" }}>
                                {show(c.key, cell.sheet)}
                              </HoverCard>
                            ) : show(c.key, cell.sheet)}
                          </td>
                        );
                      }
                      return (
                        <td key={c.key} style={{ ...base, background: "var(--input-cell)", color: "var(--input-typed)", fontWeight: 700 }}>
                          <HoverCard title={LABEL[c.key]} width={300}
                            rows={[
                              { label: "Form had", value: show(c.key, cell.sheet) },
                              { label: "Writes", value: show(c.key, cell.next), color: "#1d4ed8" },
                              { label: "Source", value: cell.source ?? "—" },
                            ]}
                            footer={num && typeof cell.sheet === "number" && typeof cell.next === "number"
                              ? { label: "Change", value: `${cell.next - cell.sheet >= 0 ? "+" : ""}${(cell.next - cell.sheet).toLocaleString("en-US", { maximumFractionDigits: 0 })}` }
                              : undefined}>
                            {show(c.key, cell.next)}
                          </HoverCard>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={cols.length + 2} style={{ ...tdL, textAlign: "center" }} className="muted">Nothing on the form changes — it already matches the portal.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="muted small" style={{ margin: 0 }}>
            <Pill tone={TONE_BLUE}>Blue</Pill>{" "}
            cells are what the download writes; hover one for what the form had and where the new figure comes from.
            Keep the answers current on each property&rsquo;s page under <b>Building Facts</b> — next
            year&rsquo;s form fills from there.
          </p>
        </>
      )}
    </main>
  );
}
