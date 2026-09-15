"use client";

// 1099 Register — the worksheet handed to the accountants each January.
//
// It answers the question that is tedious to answer out of Skyline: which
// vendors did each FILING ENTITY pay $600 or more during the calendar year,
// and what were the payments. It is not a filing — no taxpayer IDs, no
// exemption determination, no form. Marking a vendor as not reportable is a
// note for the next pass, not a legal conclusion.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Pill, StatPill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { exportTen99Xlsx } from "@/lib/financials/ten99/export";
import { EXCLUSION_REASONS, type ExclusionReason, type VendorExclusion } from "@/lib/financials/ten99/exclusions";
import type { Ten99Entity, Ten99Vendor } from "@/lib/financials/ten99/register";
import { SELECT_BRAND } from "@/app/components/YearSelect";

const BRAND = "#0b4a7d";
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontSize: 14 };
const numTd: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

const money = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const shortDate = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

type Payload = {
  ok: true;
  year: number;
  years: number[];
  threshold: number;
  entities: Ten99Entity[];
  exclusions: Record<string, VendorExclusion>;
};

export default function Ten99Page() {
  const [data, setData] = useState<Payload | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(600);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openVendor, setOpenVendor] = useState<string | null>(null);
  const [marking, setMarking] = useState<{ entityId: string; vendor: Ten99Vendor } | null>(null);
  const [showBelow, setShowBelow] = useState<Record<string, boolean>>({});
  const [showExcluded, setShowExcluded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (year != null) qs.set("year", String(year));
      qs.set("threshold", String(threshold));
      const j = await fetch(`/api/financials/ten99?${qs}`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "Could not load the register.");
      setData(j);
      if (year == null) setYear(j.year);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the register.");
    } finally { setLoading(false); }
  }, [year, threshold]);
  useEffect(() => { void load(); }, [load]);

  async function exclude(vendor: Ten99Vendor, reason: ExclusionReason) {
    setMarking(null);
    await fetch("/api/financials/ten99", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId: vendor.id, name: vendor.name, reason }),
    });
    await load();
  }
  async function restore(vendorId: string) {
    await fetch(`/api/financials/ten99?vendorId=${encodeURIComponent(vendorId)}`, { method: "DELETE" });
    await load();
  }

  const entities = data?.entities ?? [];
  const totals = useMemo(() => {
    const reportable = entities.reduce((s, e) => s + e.vendors.length, 0);
    const amount = entities.reduce((s, e) => s + e.vendors.reduce((t, v) => t + v.total, 0), 0);
    const unnamed = entities.reduce((s, e) => s + e.unnamed.count, 0);
    const scanned = entities.reduce((s, e) => s + e.scannedTotal, 0);
    return { filers: entities.filter((e) => e.vendors.length > 0).length, reportable, amount, unnamed, scanned };
  }, [entities]);

  const excluded = Object.entries(data?.exclusions ?? {});
  const missingEin = entities.filter((e) => e.vendors.length > 0 && !e.ein);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1200, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>1099 Register</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))}
            className={SELECT_BRAND}>
            {(data?.years ?? []).map((y) => <option key={y} value={y}>{y} tax year</option>)}
            {(data?.years ?? []).length === 0 && <option value="">No GLs uploaded</option>}
          </select>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
            Threshold
            <input type="number" min={0} step={100} value={threshold}
              onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 88, padding: "6px 8px", fontSize: 13, fontVariantNumeric: "tabular-nums" }} />
          </label>
          <DownloadMenu
            items={[{
              label: "Excel workbook",
              description: "Register by filing entity + every payment behind it, with live totals",
              onClick: () => data && exportTen99Xlsx({ year: data.year, threshold: data.threshold, entities: data.entities }),
            }]}
            disabled={!data || totals.reportable === 0}
          />
        </div>
      </div>

      <p className="muted" style={{ marginTop: -6, maxWidth: 860 }}>
        Vendors paid <b>{money0(threshold)} or more</b> during the calendar year, grouped by the entity that
        files the form. Built from <b>cash disbursements</b> in the posted GL — what actually went out the door
        in {data?.year ?? year}, not what was expensed. Taxpayer IDs, addresses and the corporation exemption are
        the accountant&rsquo;s side; this is the payment side.
      </p>

      {error && <div className="card" style={{ borderLeft: "4px solid #b91c1c", color: "#b91c1c", fontWeight: 600, fontSize: 13 }}>{error}</div>}
      {loading && <div className="card muted">Loading…</div>}

      {data && !loading && (
        <>
          <div className="pills">
            <StatPill label="Vendors to report" value={totals.reportable} sub={`at ${money0(threshold)}+`} accent={totals.reportable ? BRAND : undefined} />
            <StatPill label="Filing entities" value={totals.filers} sub="each files its own" />
            <StatPill label="Reportable payments" value={money0(totals.amount)} sub="total to those vendors" />
            <StatPill label="Disbursements scanned" value={money0(totals.scanned)} sub={`all cash out in ${data.year}`} />
          </div>

          {/* The sanity check that matters most: if no money was scanned, the
              register is empty because the GL isn't there — not because nobody
              was paid. Say which, rather than showing a confident empty list. */}
          {totals.scanned === 0 && (
            <div className="card" style={{ borderLeft: "4px solid #d97706", fontSize: 13 }}>
              <b>No cash disbursements found for {data.year}.</b>{" "}
              {data.years.length === 0
                ? "No general ledgers have been uploaded yet — import them on Operating Statements first."
                : "The GLs for this year may have been imported as monthly totals only (transaction detail skipped), which this register needs. Re-import them with detail."}
            </div>
          )}

          {totals.unnamed > 0 && (
            <div className="card" style={{ borderLeft: "4px solid #d97706", fontSize: 13 }}>
              <b>{totals.unnamed} payment{totals.unnamed === 1 ? " carries" : "s carry"} no vendor name</b> in the
              ledger and can&rsquo;t be attributed — {totals.unnamed === 1 ? "it is" : "they are"} counted in the
              scanned total but appear on no vendor&rsquo;s row. Worth a look if a vendor you expect is missing.
            </div>
          )}

          {missingEin.length > 0 && (
            <div className="card" style={{ borderLeft: "4px solid #d97706", fontSize: 13 }}>
              <b>{missingEin.length} {missingEin.length === 1 ? "entity has" : "entities have"} no EIN on file</b> —{" "}
              {missingEin.map((e) => e.name).join(", ")}. The vendors are still listed; add the EIN on Property Info
              so the workbook carries it.
            </div>
          )}

          {entities.map((e) => {
            const subtotal = e.vendors.reduce((s, v) => s + v.total, 0);
            const belowOpen = !!showBelow[e.id];
            return (
              <div key={e.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "14px 16px" }}>
                  <div style={{ display: "inline-flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>{e.name}</span>
                    {e.ein
                      ? <code style={{ fontSize: 12, background: "#0b1220", color: "#e0f0ff", padding: "2px 8px", borderRadius: 5, letterSpacing: "0.04em" }}>{e.ein}</code>
                      : <Pill tone={TONE_AMBER}>NO EIN ON FILE</Pill>}
                    <HoverCard title="What rolls into this filer" width={300}
                      rows={[
                        { label: "Properties", value: e.glKeys.join(", ") || "—" },
                        { label: "Cash out scanned", value: money0(e.scannedTotal) },
                        { label: "Below threshold", value: `${e.below.length} vendor${e.below.length === 1 ? "" : "s"}` },
                      ]}
                      footer={{ label: "Unnamed payments", value: e.unnamed.count ? `${e.unnamed.count} · ${money0(e.unnamed.total)}` : "None" }}>
                      <span className="muted small">· {e.glKeys.length} propert{e.glKeys.length === 1 ? "y" : "ies"}</span>
                    </HoverCard>
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "baseline", gap: 10 }}>
                    <Pill tone={e.vendors.length ? TONE_GREEN : TONE_NEUTRAL}>
                      {e.vendors.length} TO REPORT
                    </Pill>
                    <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money0(subtotal)}</span>
                  </div>
                </div>

                {e.vendors.length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", borderTop: "1px solid var(--border)" }}>
                    <thead>
                      <tr>
                        <th style={th}>Vendor</th>
                        <th style={{ ...th, textAlign: "right", width: 90 }}>Payments</th>
                        <th style={{ ...th, textAlign: "right", width: 130 }}>Total paid</th>
                        <th style={{ ...th, textAlign: "right", width: 150 }}>Not reportable?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.vendors.map((v) => {
                        const key = `${e.id}:${v.id}`;
                        const open = openVendor === key;
                        return (
                          <Fragment key={key}>
                            <tr style={{ borderTop: "1px solid var(--border)", background: open ? "rgba(11,74,125,0.04)" : undefined }}>
                              <td style={td}>
                                <button type="button" onClick={() => setOpenVendor(open ? null : key)}
                                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: BRAND, textAlign: "left" }}>
                                  {v.name} <span className="muted" style={{ fontWeight: 500 }}>{open ? "▲" : "▼"}</span>
                                </button>
                              </td>
                              <td style={numTd}>{v.count}</td>
                              <td style={{ ...numTd, fontWeight: 700 }}>{money(v.total)}</td>
                              <td style={{ ...numTd }}>
                                <button className="btn" onClick={() => setMarking({ entityId: e.id, vendor: v })}
                                  style={{ fontSize: 12, padding: "4px 9px" }}>Mark…</button>
                              </td>
                            </tr>
                            {open && (
                              <tr>
                                <td colSpan={4} style={{ padding: "0 12px 12px", background: "rgba(11,74,125,0.04)" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                    <thead>
                                      <tr>
                                        <th style={{ ...th, padding: "6px 8px" }}>Date</th>
                                        <th style={{ ...th, padding: "6px 8px" }}>Check / ref</th>
                                        <th style={{ ...th, padding: "6px 8px" }}>Property</th>
                                        <th style={{ ...th, padding: "6px 8px" }}>Account</th>
                                        <th style={{ ...th, padding: "6px 8px", textAlign: "right" }}>Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {v.payments.map((p, idx) => (
                                        <tr key={idx} style={{ borderTop: "1px solid var(--border)" }}>
                                          <td style={{ ...td, padding: "6px 8px" }}>{shortDate(p.date)}</td>
                                          <td style={{ ...td, padding: "6px 8px" }}><code style={{ fontSize: 12 }}>{p.ref || "—"}</code></td>
                                          <td style={{ ...td, padding: "6px 8px" }}>{p.propertyName}</td>
                                          <td style={{ ...td, padding: "6px 8px", color: "var(--muted)", fontSize: 12 }}>{p.account}{p.accountName ? ` · ${p.accountName}` : ""}</td>
                                          <td style={{ ...numTd, padding: "6px 8px" }}>{money(p.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {e.below.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px" }}>
                    <button type="button" onClick={() => setShowBelow((s) => ({ ...s, [e.id]: !belowOpen }))}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", ...SECTION_LABEL }}>
                      {belowOpen ? "▲" : "▼"} {e.below.length} vendor{e.below.length === 1 ? "" : "s"} below {money0(threshold)}
                    </button>
                    {belowOpen && (
                      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 13 }}>
                        <tbody>
                          {e.below.map((v) => (
                            <tr key={v.id} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ ...td, padding: "6px 0" }}>{v.name}</td>
                              <td style={{ ...numTd, padding: "6px 0", width: 90 }}>{v.count}</td>
                              <td style={{ ...numTd, padding: "6px 0", width: 130 }}>{money(v.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {excluded.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <button type="button" onClick={() => setShowExcluded((v) => !v)}
                style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={SECTION_LABEL}>{showExcluded ? "▲" : "▼"} Marked not reportable · {excluded.length}</span>
                <span className="muted small">Carried forward to every year</span>
              </button>
              {showExcluded && (
                <table style={{ width: "100%", borderCollapse: "collapse", borderTop: "1px solid var(--border)" }}>
                  <thead>
                    <tr><th style={th}>Vendor</th><th style={th}>Reason</th><th style={th}>Marked</th><th style={{ ...th, textAlign: "right" }} /></tr>
                  </thead>
                  <tbody>
                    {excluded.sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, x]) => (
                      <tr key={id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={td}>{x.name}</td>
                        <td style={td}><Pill tone={TONE_NEUTRAL}>{x.reason.toUpperCase()}</Pill></td>
                        <td style={{ ...td, color: "var(--muted)", fontSize: 12.5 }}>
                          {new Date(x.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {x.by ? ` · ${x.by}` : ""}
                        </td>
                        <td style={{ ...numTd }}>
                          <button className="btn" onClick={() => restore(id)} style={{ fontSize: 12, padding: "4px 9px" }}>Put back</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {entities.length === 0 && totals.scanned === 0 && data.years.length > 0 && (
            <div className="card muted">Nothing to show for {data.year}.</div>
          )}
        </>
      )}

      {marking && (
        <div onClick={() => setMarking(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12vh 16px" }}>
          <div onClick={(ev) => ev.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 460, margin: 0 }}>
            <div style={SECTION_LABEL}>Not reportable</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{marking.vendor.name}</div>
            <p className="muted small" style={{ marginTop: 6 }}>
              Takes them off the register for <b>every</b> year, not just {data?.year}. Use it for the payees that are
              never reportable — corporations, banks, taxing authorities. It records a reason, it doesn&rsquo;t decide
              one: the exemption is still the accountant&rsquo;s call.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
              {EXCLUSION_REASONS.map((r) => (
                <button key={r} className="btn" onClick={() => exclude(marking.vendor, r)}
                  style={{ fontSize: 12.5, padding: "6px 11px", fontWeight: 700 }}>{r}</button>
              ))}
            </div>
            <div style={{ marginTop: 14, textAlign: "right" }}>
              <button className="btn" onClick={() => setMarking(null)} style={{ fontSize: 12.5, padding: "6px 12px" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
