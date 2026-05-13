"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TAX_TASKS, type K1Investor } from "../tracker/tax-data";
import { PROPERTY_DEFS } from "../../lib/properties/data";

type View = "property" | "investor";

type PropertyHolding = {
  taxTaskId: string;          // e.g. "k1-7200"
  entity: string;             // display label from the K-1 task
  propertyCode: string;       // best-guess property code parsed from entity ("7200")
  propertyName: string;       // PROPERTY_DEFS lookup (or entity fallback)
  investors: K1Investor[];
};

type InvestorAggregate = {
  /** Display name (Title Case as recorded). */
  name: string;
  /** Lower-cased key used for grouping. */
  key: string;
  rows: Array<{
    holding: PropertyHolding;
    investor: K1Investor;
  }>;
  totalProfitPct: number;  // sum of profitPct across properties (sanity-check column)
};

function pct(n: number | undefined | null): string {
  if (n == null) return "—";
  return (n * 100).toFixed(4).replace(/\.?0+$/, "") + "%";
}

function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export default function InvestorInfoPage() {
  const [view, setView] = useState<View>("property");
  const [query, setQuery] = useState("");

  // ── Pull K-1 tasks and resolve a property code for each ────────────────
  const holdings: PropertyHolding[] = useMemo(() => {
    return TAX_TASKS
      .filter((t) => t.category === "k1" && t.investors && t.investors.length > 0)
      .map((t) => {
        // Entity strings look like "7200 Elbridge Partnership" — first token = code
        const firstToken = (t.entity ?? "").trim().split(/\s+/)[0] ?? "";
        const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === firstToken.toUpperCase());
        return {
          taxTaskId: t.id,
          entity: t.entity,
          propertyCode: firstToken,
          propertyName: def?.name ?? t.entity,
          investors: t.investors as K1Investor[],
        };
      })
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode));
  }, []);

  // ── Investor view: group by normalized name across all properties ─────
  const investorIndex: InvestorAggregate[] = useMemo(() => {
    const map = new Map<string, InvestorAggregate>();
    for (const h of holdings) {
      for (const inv of h.investors) {
        const key = normName(inv.name);
        let agg = map.get(key);
        if (!agg) {
          agg = { name: inv.name, key, rows: [], totalProfitPct: 0 };
          map.set(key, agg);
        }
        agg.rows.push({ holding: h, investor: inv });
        agg.totalProfitPct += inv.profitPct ?? 0;
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [holdings]);

  const filteredHoldings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return holdings;
    return holdings.filter((h) =>
      h.entity.toLowerCase().includes(q)
      || h.propertyName.toLowerCase().includes(q)
      || h.propertyCode.toLowerCase().includes(q)
      || h.investors.some((inv) => inv.name.toLowerCase().includes(q) || (inv.detailedName ?? "").toLowerCase().includes(q)),
    );
  }, [holdings, query]);

  const filteredInvestors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return investorIndex;
    return investorIndex.filter((i) =>
      i.name.toLowerCase().includes(q)
      || i.rows.some((r) =>
        r.holding.entity.toLowerCase().includes(q)
        || r.holding.propertyCode.toLowerCase().includes(q)
        || (r.investor.detailedName ?? "").toLowerCase().includes(q)),
    );
  }, [investorIndex, query]);

  const totalInvestors = investorIndex.length;
  const totalHoldings = holdings.length;

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
            placeholder="Search investors, properties, codes…"
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
          Source: K-1 distributions on the Filing Tracker. Investors are matched by name across properties — minor name variants (e.g. "Cathy Altman" vs "Catherine Altman") may show as separate entries until names are normalized.
        </p>
      </div>

      {/* ── By Property view ───────────────────────────────────────────── */}
      {view === "property" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filteredHoldings.length === 0 ? (
            <div className="card muted small">No matches.</div>
          ) : (
            filteredHoldings.map((h) => (
              <div key={h.taxTaskId} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{
                  display: "flex", alignItems: "baseline", justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "rgba(11,74,125,0.05)",
                  borderBottom: "1px solid var(--border)",
                  gap: 12, flexWrap: "wrap",
                }}>
                  <div style={{ display: "inline-flex", alignItems: "baseline", gap: 10 }}>
                    <code style={{
                      background: "#0b1220", color: "#e0f0ff",
                      padding: "2px 8px", borderRadius: 5,
                      fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                    }}>{h.propertyCode}</code>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{h.propertyName}</span>
                    <span className="muted small">· {h.investors.length} investor{h.investors.length === 1 ? "" : "s"}</span>
                  </div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                      <th style={{ padding: "8px 14px", fontWeight: 700 }}>INVESTOR</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700 }}>DETAIL</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700, textAlign: "right" }}>PROFIT %</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700, textAlign: "right" }}>LOSS %</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700, textAlign: "right" }}>CAPITAL %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.investors.map((inv) => (
                      <tr key={inv.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 600 }}>{inv.name}</td>
                        <td style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 12 }}>
                          {inv.detailedName ?? ""}
                          {(inv.address || inv.city) && (
                            <div className="muted small" style={{ marginTop: 2 }}>
                              {[inv.address, inv.city, inv.state, inv.zip].filter(Boolean).join(", ")}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{pct(inv.profitPct)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{pct(inv.lossPct)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{pct(inv.capitalPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── By Investor view ───────────────────────────────────────────── */}
      {view === "investor" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filteredInvestors.length === 0 ? (
            <div className="card muted small">No matches.</div>
          ) : (
            filteredInvestors.map((agg) => (
              <div key={agg.key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{
                  display: "flex", alignItems: "baseline", justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "rgba(11,74,125,0.05)",
                  borderBottom: "1px solid var(--border)",
                  gap: 12, flexWrap: "wrap",
                }}>
                  <div style={{ display: "inline-flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{agg.name}</span>
                    <span className="muted small">· {agg.rows.length} {agg.rows.length === 1 ? "property" : "properties"}</span>
                  </div>
                  <span className="muted small">
                    Aggregate Profit: <span style={{ fontWeight: 700, color: "var(--text)" }}>{pct(agg.totalProfitPct || null)}</span>
                  </span>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                      <th style={{ padding: "8px 14px", fontWeight: 700, width: 70 }}>PROP</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700 }}>PROPERTY</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700 }}>DETAIL</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700, textAlign: "right" }}>PROFIT %</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700, textAlign: "right" }}>LOSS %</th>
                      <th style={{ padding: "8px 14px", fontWeight: 700, textAlign: "right" }}>CAPITAL %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agg.rows.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 14px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                          {r.holding.propertyCode}
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                          {r.holding.propertyName}
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 12 }}>
                          {r.investor.detailedName ?? ""}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{pct(r.investor.profitPct)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{pct(r.investor.lossPct)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{pct(r.investor.capitalPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      <p className="muted small" style={{ marginTop: 4 }}>
        Need to update or add ownership data?{" "}
        <Link href="/tracker/taxes" style={{ color: "var(--brand)", fontWeight: 600 }}>Filing Tracker → K-1</Link>{" "}
        is the current source.
      </p>
    </main>
  );
}
