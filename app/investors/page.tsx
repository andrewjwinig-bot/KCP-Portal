"use client";

import { useMemo, useState } from "react";
import { PROPERTY_OWNERSHIP, type PropertyOwner } from "../../lib/properties/ownership";
import { PROPERTY_DEFS, TYPE_STYLE, FUND_LABEL, type PropType, type FundGroup } from "../../lib/properties/data";

type View = "property" | "investor";

type PropertyHolding = {
  propertyCode: string;       // "1100", "7200"…
  propertyName: string;       // PROPERTY_DEFS lookup (or override)
  type: PropType | "Misc";    // for category grouping
  fundGroup?: FundGroup;      // JV III / NI LLC subsection (Office only)
  hasK1Distribution: boolean;
  owners: PropertyOwner[];
};

const TYPES: PropType[] = ["Office", "Retail", "Residential", "Land", "Misc"];

type InvestorAggregate = {
  /** Display name (Title Case as recorded). */
  name: string;
  /** Lower-cased key used for grouping. */
  key: string;
  rows: Array<{
    holding: PropertyHolding;
    investor: PropertyOwner;
  }>;
};

function pct(n: number | undefined | null): string {
  if (n == null) return "—";
  return (n * 100).toFixed(4) + "%";
}

/** Single ownership % for display — profit/loss/capital are equal in the
 *  source data, so we use profit pct (or fall back to overall owner pct). */
function ownershipFor(inv: PropertyOwner): number | undefined {
  return inv.profitPct ?? inv.ownerPct ?? inv.capitalPct ?? inv.lossPct;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

type OwnerGroup = {
  key: string;
  name: string;       // display name of the person
  total: number;      // sum of ownership across all stakes
  owners: PropertyOwner[];
};

/** Group owners by normalized name; sort groups by total ownership desc;
 *  sort within each group by row ownership desc. */
function buildOwnerGroups(owners: PropertyOwner[]): OwnerGroup[] {
  const byKey = new Map<string, PropertyOwner[]>();
  for (const o of owners) {
    const key = normName(o.name);
    let arr = byKey.get(key);
    if (!arr) { arr = []; byKey.set(key, arr); }
    arr.push(o);
  }
  for (const arr of byKey.values()) {
    arr.sort((a, b) => (ownershipFor(b) ?? 0) - (ownershipFor(a) ?? 0));
  }
  const out: OwnerGroup[] = [];
  for (const [k, arr] of byKey.entries()) {
    out.push({
      key: k,
      name: arr[0].name,
      total: arr.reduce((s, o) => s + (ownershipFor(o) ?? 0), 0),
      owners: arr,
    });
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

export default function InvestorInfoPage() {
  const [view, setView] = useState<View>("property");
  const [query, setQuery] = useState("");
  /** Open/closed state for each card. Default = closed everywhere so the page
   *  reads like the rent roll page (PropertyCard pattern). */
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  function toggleOpen(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // ── Holdings list sourced from PROPERTY_OWNERSHIP ──────────────────────
  const holdings: PropertyHolding[] = useMemo(() => {
    return PROPERTY_OWNERSHIP
      .filter((p) => p.owners.length > 0)
      .map((p) => {
        const def = PROPERTY_DEFS.find((d) => d.id.toUpperCase() === p.propertyCode.toUpperCase());
        return {
          propertyCode: p.propertyCode,
          propertyName: p.propertyName ?? def?.name ?? p.propertyCode,
          type: (def?.type ?? "Misc") as PropType,
          fundGroup: def?.fundGroup,
          hasK1Distribution: !!p.hasK1Distribution,
          owners: p.owners,
        };
      })
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode));
  }, []);

  // ── Investor view: group by normalized name across all properties ─────
  const investorIndex: InvestorAggregate[] = useMemo(() => {
    const map = new Map<string, InvestorAggregate>();
    for (const h of holdings) {
      for (const inv of h.owners) {
        const key = normName(inv.name);
        let agg = map.get(key);
        if (!agg) {
          agg = { name: inv.name, key, rows: [] };
          map.set(key, agg);
        }
        agg.rows.push({ holding: h, investor: inv });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [holdings]);

  const filteredHoldings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return holdings;
    return holdings.filter((h) =>
      h.propertyName.toLowerCase().includes(q)
      || h.propertyCode.toLowerCase().includes(q)
      || h.owners.some((inv) =>
        inv.name.toLowerCase().includes(q)
        || (inv.detailedName ?? "").toLowerCase().includes(q)
        || (inv.vendorCode ?? "").toLowerCase().includes(q)),
    );
  }, [holdings, query]);

  const filteredInvestors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return investorIndex;
    return investorIndex.filter((i) =>
      i.name.toLowerCase().includes(q)
      || i.rows.some((r) =>
        r.holding.propertyName.toLowerCase().includes(q)
        || r.holding.propertyCode.toLowerCase().includes(q)
        || (r.investor.detailedName ?? "").toLowerCase().includes(q)
        || (r.investor.vendorCode ?? "").toLowerCase().includes(q)),
    );
  }, [investorIndex, query]);

  const totalInvestors = investorIndex.length;
  const totalHoldings = holdings.length;

  function renderHoldingCard(h: PropertyHolding) {
    const open = !!openIds[h.propertyCode];
    const ts = TYPE_STYLE[h.type as PropType];
    return (
      <div
        key={h.propertyCode}
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          boxShadow: `var(--shadow), inset 0 5px 0 ${ts.text}`,
        }}
      >
        <button
          type="button"
          onClick={() => toggleOpen(h.propertyCode)}
          aria-expanded={open}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", padding: "19px 16px 14px",
            background: "transparent", border: "none", cursor: "pointer",
            textAlign: "left", fontFamily: "inherit",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <code style={{
              background: "#0b1220", color: "#e0f0ff",
              padding: "2px 8px", borderRadius: 5,
              fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
            }}>{h.propertyCode}</code>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{h.propertyName}</span>
            <span className="muted small">· {h.owners.length} {h.owners.length === 1 ? "owner" : "owners"}</span>
            {h.hasK1Distribution && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                padding: "2px 7px", borderRadius: 4,
                background: "rgba(15,118,110,0.08)", color: "#0f766e",
                border: "1px solid rgba(15,118,110,0.25)",
              }}>K-1</span>
            )}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: "2px 9px", borderRadius: 999,
              fontSize: 11, fontWeight: 500, letterSpacing: "0.02em",
              background: ts.bg, color: ts.text,
              border: `1px solid ${ts.border}`,
            }}>{h.type}</span>
            <span style={{ color: "var(--muted)", fontSize: 18 }}>{open ? "▲" : "▼"}</span>
          </span>
        </button>

        {open && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, borderTop: "1px solid var(--border)" }}>
            <thead>
              <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                <th style={{ padding: "10px 16px", fontWeight: 700, width: 140, whiteSpace: "nowrap" }}>VENDOR CODE</th>
                <th style={{ padding: "10px 16px", fontWeight: 700 }}>OWNER</th>
                <th style={{ padding: "10px 16px", fontWeight: 700 }}>ADDRESS</th>
                <th style={{ padding: "10px 16px", fontWeight: 700, textAlign: "right" }}>OWNERSHIP %</th>
              </tr>
            </thead>
            <tbody>
              {buildOwnerGroups(h.owners).flatMap((g) => {
                const multi = g.owners.length > 1;
                if (!multi) {
                  const inv = g.owners[0];
                  return [(
                    <tr key={inv.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 16px" }}>
                        {inv.vendorCode ? (
                          <span style={{
                            fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                            padding: "2px 8px", borderRadius: 999,
                            background: "rgba(15,23,42,0.05)", color: "var(--text)",
                            border: "1px solid var(--border)",
                            display: "inline-block",
                          }}>{inv.vendorCode}</span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600 }}>{inv.name}</div>
                        {inv.detailedName && (
                          <div className="muted small" style={{ marginTop: 2 }}>{inv.detailedName}</div>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--muted)" }}>
                        {[inv.address, inv.city, inv.state, inv.zip].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>{pct(ownershipFor(inv))}</td>
                    </tr>
                  )];
                }
                const rows = [(
                  <tr key={`${g.key}-primary`} style={{ borderTop: "1px solid var(--border)", background: "rgba(15,23,42,0.025)" }}>
                    <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 11 }}>—</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{g.name}</div>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 11 }}>
                      {g.owners.length} stakes
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700 }}>{pct(g.total)}</td>
                  </tr>
                )];
                g.owners.forEach((inv) => {
                  rows.push(
                    <tr key={inv.id} style={{ borderTop: "1px solid rgba(11,74,125,0.08)" }}>
                      <td style={{ padding: "8px 16px", paddingLeft: 36 }}>
                        {inv.vendorCode ? (
                          <span style={{
                            fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
                            padding: "1px 7px", borderRadius: 999,
                            background: "rgba(15,23,42,0.05)", color: "var(--text)",
                            border: "1px solid var(--border)",
                            display: "inline-block",
                          }}>{inv.vendorCode}</span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 16px", fontSize: 12, color: "var(--muted)" }}>
                        {inv.detailedName || <span style={{ fontStyle: "italic" }}>(direct)</span>}
                      </td>
                      <td style={{ padding: "8px 16px", color: "var(--muted)", fontSize: 12 }}>
                        {[inv.address, inv.city, inv.state, inv.zip].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 12 }}>{pct(ownershipFor(inv))}</td>
                    </tr>,
                  );
                });
                return rows;
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Investor Info</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            Ownership detail across properties · {totalInvestors} unique investor{totalInvestors === 1 ? "" : "s"} across {totalHoldings} {totalHoldings === 1 ? "property" : "properties"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div>COMMERCIAL</div><div>PROPERTIES</div>
          </div>
        </div>
      </header>

      {/* ── View toggle + search ───────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div role="tablist" aria-label="View" style={{
            display: "inline-flex", border: "1px solid var(--border)", borderRadius: 999,
            overflow: "hidden", background: "var(--card)",
          }}>
            {[
              { id: "property" as const, label: "By Property" },
              { id: "investor" as const, label: "By Investor" },
            ].map((v) => {
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  role="tab"
                  aria-selected={active}
                  style={{
                    padding: "6px 14px", fontSize: 12, fontWeight: 700,
                    background: active ? "var(--brand)" : "transparent",
                    color: active ? "#fff" : "var(--text)",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search investors, vendor codes, properties…"
            style={{
              flex: 1, minWidth: 220,
              padding: "8px 12px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--card)", color: "var(--text)",
              fontFamily: "inherit", fontSize: 13, outline: "none",
            }}
          />
        </div>

        <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
          Source: <code>lib/properties/ownership.ts</code> — the canonical ownership table. The Filing Tracker K-1 task investors derive from the same data.
        </p>
      </div>

      {/* ── By Property view ───────────────────────────────────────────── */}
      {view === "property" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {filteredHoldings.length === 0 ? (
            <div className="card muted small">No matches.</div>
          ) : (
            TYPES.map((type) => {
              const group = filteredHoldings.filter((h) => h.type === type);
              if (group.length === 0) return null;
              const ts = TYPE_STYLE[type];

              // Office sub-groups by fund (JV III, NI LLC) with the rest in "Other".
              const officeFundSubsections: { fund: FundGroup; items: PropertyHolding[] }[] = [];
              let officeUnaffiliated: PropertyHolding[] = [];
              if (type === "Office") {
                const fundOrder: FundGroup[] = ["JV III", "NI LLC"];
                for (const f of fundOrder) {
                  const items = group.filter((h) => h.fundGroup === f);
                  if (items.length) officeFundSubsections.push({ fund: f, items });
                }
                officeUnaffiliated = group.filter((h) => !h.fundGroup);
              }

              return (
                <div key={type}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 800, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: ts.text,
                      background: ts.bg, border: `1px solid ${ts.border}`,
                      padding: "5px 14px", borderRadius: 999,
                    }}>{type}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{group.length}</span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>

                  {type === "Office" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                      {officeFundSubsections.map(({ fund, items }) => (
                        <div key={fund}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Fund</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{FUND_LABEL[fund]}</span>
                            <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>· {fund} · {items.length}</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            {items.map((h) => renderHoldingCard(h))}
                          </div>
                        </div>
                      ))}
                      {officeUnaffiliated.length > 0 && (
                        <div>
                          {officeFundSubsections.length > 0 && (
                            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>Other</div>
                          )}
                          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            {officeUnaffiliated.map((h) => renderHoldingCard(h))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {group.map((h) => renderHoldingCard(h))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── By Investor view ───────────────────────────────────────────── */}
      {view === "investor" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filteredInvestors.length === 0 ? (
            <div className="card muted small">No matches.</div>
          ) : (
            filteredInvestors.map((agg) => {
              const open = !!openIds[agg.key];
              return (
                <div key={agg.key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <button
                    type="button"
                    onClick={() => toggleOpen(agg.key)}
                    aria-expanded={open}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "14px 16px",
                      background: "transparent", border: "none", cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>{agg.name}</span>
                      <span className="muted small">· {agg.rows.length} {agg.rows.length === 1 ? "property" : "properties"}</span>
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
                  </button>

                  {open && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, borderTop: "1px solid var(--border)" }}>
                      <thead>
                        <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                          <th style={{ padding: "10px 16px", fontWeight: 700, width: 70 }}>PROP</th>
                          <th style={{ padding: "10px 16px", fontWeight: 700 }}>PROPERTY</th>
                          <th style={{ padding: "10px 16px", fontWeight: 700, width: 140, whiteSpace: "nowrap" }}>VENDOR CODE</th>
                          <th style={{ padding: "10px 16px", fontWeight: 700, textAlign: "right" }}>OWNERSHIP %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agg.rows.map((r, i) => (
                          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "12px 16px" }}>{r.holding.propertyCode}</td>
                            <td style={{ padding: "12px 16px" }}>
                              <div style={{ fontWeight: 600 }}>{r.holding.propertyName}</div>
                              {r.investor.detailedName && (
                                <div className="muted small" style={{ marginTop: 2 }}>{r.investor.detailedName}</div>
                              )}
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              {r.investor.vendorCode ? (
                                <span style={{
                                  fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                                  padding: "2px 8px", borderRadius: 999,
                                  background: "rgba(15,23,42,0.05)", color: "var(--text)",
                                  border: "1px solid var(--border)",
                                  display: "inline-block",
                                }}>{r.investor.vendorCode}</span>
                              ) : (
                                <span style={{ color: "var(--muted)" }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right" }}>{pct(ownershipFor(r.investor))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <p className="muted small" style={{ marginTop: 4 }}>
        Source of truth: <code>lib/properties/ownership.ts</code>. Filing Tracker K-1 investors are derived from this file.
      </p>
    </main>
  );
}
