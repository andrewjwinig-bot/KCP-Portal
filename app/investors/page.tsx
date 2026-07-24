"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { PROPERTY_OWNERSHIP, type PropertyOwner } from "../../lib/properties/ownership";
import { PROPERTY_DEFS, TYPE_STYLE, FUND_LABEL, type PropType, type FundGroup } from "../../lib/properties/data";
import { structureFor, type InvestorStructure } from "../../lib/investors/structures";
import { ENTITY_VALUES, entityValue, totalEquityValue, STATEMENT_AS_OF } from "../../lib/properties/entityValues";
import { beneficiaryNames, statementForBeneficiary, beneficiaryTotalValue } from "../../lib/properties/beneficiaries";
import type { OwnershipEstimates } from "../../lib/properties/estimateStore";
import { ownerContact } from "../../lib/properties/ownerContacts";
import { buildStatementOfValuesPdf, type StatementPdfRow } from "../../lib/properties/statementPdf";
import { StatPill } from "../components/Pill";
import { DownloadMenu } from "../components/DownloadMenu";

type View = "property" | "investor" | "statement";

const money0 = (n: number | null | undefined): string =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** A date string (yyyy-mm-dd) rendered long-form (e.g. "December 31, 2025"). */
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
/** The frozen year-end statement date, long-form. */
function asOfLong(): string {
  return longDate(STATEMENT_AS_OF);
}
/** Effective "today" estimated equity for an entity: the saved override, or the
 *  year-end equity when none has been entered. */
function estimateFor(code: string, est: OwnershipEstimates): number {
  const ov = est.values[code];
  if (ov != null && Number.isFinite(ov)) return ov;
  return entityValue(code)?.equityValue ?? 0;
}

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
  /** Statement-of-Values owner filter. "" = portfolio (all entities). */
  const [beneficiary, setBeneficiary] = useState("");
  const benNames = useMemo(() => beneficiaryNames(), []);
  /** Current "today" estimated equity per entity + shared as-of date. */
  const [estimates, setEstimates] = useState<OwnershipEstimates>({ asOf: "", values: {} });
  useEffect(() => {
    fetch("/api/ownership/estimates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d === "object") setEstimates({ asOf: d.asOf ?? "", values: d.values ?? {} }); })
      .catch(() => {});
  }, []);
  async function saveEstimates(next: OwnershipEstimates): Promise<boolean> {
    try {
      const res = await fetch("/api/ownership/estimates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) return false;
      const saved = await res.json();
      setEstimates({ asOf: saved.asOf ?? "", values: saved.values ?? {} });
      return true;
    } catch {
      return false;
    }
  }
  // Prefill the search box if the page was opened with ?q=… (used by the
  // global search to deep-link to an owner or vendor code).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setQuery(q);
    // Deep-link into the Statement of Values (?view=statement&owner=Name).
    const v = params.get("view");
    if (v === "statement" || v === "investor" || v === "property") setView(v);
    const owner = params.get("owner");
    if (owner) {
      setView("statement");
      // Match case-insensitively to the canonical beneficiary name.
      const match = beneficiaryNames().find((n) => n.toLowerCase() === owner.toLowerCase());
      if (match) setBeneficiary(match);
    }
  }, []);
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

  function exportToExcel() {
    const fmtPct = (n: number | undefined) => (n == null ? "" : (n * 100).toFixed(4) + "%");

    // Sheet 1: By Property (one row per legal payee).
    const byProperty: Record<string, string | number>[] = [];
    for (const h of holdings) {
      for (const o of h.owners) {
        byProperty.push({
          "Property Code": h.propertyCode,
          "Property Name": h.propertyName,
          "Type": h.type,
          "Fund": h.fundGroup ?? "",
          "K-1": h.hasK1Distribution ? "Yes" : "",
          "Vendor Code": o.vendorCode ?? "",
          "Owner": o.name,
          "Detail / Trust": o.detailedName ?? "",
          "Address": o.address ?? "",
          "City": o.city ?? "",
          "State": o.state ?? "",
          "Zip": o.zip ?? "",
          "Phone": o.phone ?? "",
          "Ownership %": fmtPct(ownershipFor(o)),
        });
      }
    }

    // Sheet 2: By Investor (one row per stake; rows grouped per person).
    const byInvestor: Record<string, string | number>[] = [];
    for (const inv of [...investorIndex].sort((a, b) => a.name.localeCompare(b.name))) {
      for (const r of inv.rows) {
        byInvestor.push({
          "Investor": inv.name,
          "Property Code": r.holding.propertyCode,
          "Property Name": r.holding.propertyName,
          "Type": r.holding.type,
          "Vendor Code": r.investor.vendorCode ?? "",
          "Detail / Trust": r.investor.detailedName ?? "",
          "Address": [r.investor.address, r.investor.city, r.investor.state, r.investor.zip].filter(Boolean).join(", "),
          "Phone": r.investor.phone ?? "",
          "Ownership %": fmtPct(ownershipFor(r.investor)),
        });
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byProperty), "By Property");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byInvestor), "By Investor");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Investor_Info_${stamp}.xlsx`);
  }

  /** Statement of Values export. Totals are written as live SUM formulas over
   *  the exact source cells (per the Excel-totals house rule) with the
   *  JS-computed value cached so the number shows before Excel recalcs. */
  function exportStatement() {
    const stamp = new Date().toISOString().slice(0, 10);
    const wb = XLSX.utils.book_new();

    const estLabel = estimates.asOf ? `Est. Value (${longDate(estimates.asOf)})` : "Est. Value (Today)";

    if (!beneficiary) {
      // Portfolio: one row per entity, TOTAL row sums the money columns.
      const rows = [...ENTITY_VALUES].sort((a, b) => (b.equityValue ?? 0) - (a.equityValue ?? 0));
      const header = ["Entity", "Property / Entity", "NOI", "Cap Rate", "Indicated Value", "Debt Balance", "Cash", "Future Capital", `Equity Value (${asOfLong()})`, estLabel];
      const aoa: (string | number | null)[][] = [
        [`Korman — Statement of Values`],
        header,
        ...rows.map((e) => [e.entity, e.name, e.noi, e.capRate, e.indicatedValue, e.debtBalance, e.cash, e.futureCapital, e.equityValue, estimateFor(e.entity, estimates)]),
        ["", "TOTAL", null, null, null, null, null, null, null, null],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const firstData = 3;                 // Excel row of first entity (title=1, header=2)
      const lastData = firstData + rows.length - 1;
      const totalRow = lastData + 1;
      // Money columns to total: C(NOI) E(Value) F(Debt) G(Cash) H(FutureCap) I(Equity) J(Est)
      const sums: Record<string, number> = {
        C: rows.reduce((s, e) => s + (e.noi ?? 0), 0),
        E: rows.reduce((s, e) => s + (e.indicatedValue ?? 0), 0),
        F: rows.reduce((s, e) => s + (e.debtBalance ?? 0), 0),
        G: rows.reduce((s, e) => s + (e.cash ?? 0), 0),
        H: rows.reduce((s, e) => s + (e.futureCapital ?? 0), 0),
        I: rows.reduce((s, e) => s + (e.equityValue ?? 0), 0),
        J: rows.reduce((s, e) => s + estimateFor(e.entity, estimates), 0),
      };
      for (const [col, val] of Object.entries(sums)) {
        ws[`${col}${totalRow}`] = { t: "n", f: `SUM(${col}${firstData}:${col}${lastData})`, v: val };
      }
      ws["!cols"] = [{ wch: 8 }, { wch: 38 }, { wch: 12 }, { wch: 9 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 13 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, "Statement of Values");
      XLSX.writeFile(wb, `Statement_of_Values_${stamp}.xlsx`);
      return;
    }

    // One owner: one row per entity they hold, value = % × equity, TOTAL sums value.
    const lines = statementForBeneficiary(beneficiary);
    const contact = ownerContact(beneficiary);
    const sendTo = contact ? [contact.address, contact.email].filter(Boolean).join("  ·  ") : "";
    const header = ["Entity", "Property / Entity", "Held Through", "Ownership %", `Value (${asOfLong()})`, estLabel];
    const aoa: (string | number | null)[][] = [
      [`${beneficiary} — Statement of Values`],
      ...(sendTo ? [[`Send to: ${sendTo}`]] : []),
      header,
      ...lines.map((l) => [l.entity, l.entityName, l.partners.join("; "), l.pct, Math.round(l.value), Math.round(l.pct * estimateFor(l.entity, estimates))]),
      ["", "TOTAL", "", null, null, null],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const firstData = sendTo ? 4 : 3;    // title (+ optional send-to) + header
    const lastData = firstData + lines.length - 1;
    const totalRow = lastData + 1;
    ws[`E${totalRow}`] = { t: "n", f: `SUM(E${firstData}:E${lastData})`, v: Math.round(beneficiaryTotalValue(beneficiary)) };
    ws[`F${totalRow}`] = { t: "n", f: `SUM(F${firstData}:F${lastData})`, v: Math.round(lines.reduce((s, l) => s + l.pct * estimateFor(l.entity, estimates), 0)) };
    // Percent column formatting.
    for (let i = 0; i < lines.length; i++) ws[`D${firstData + i}`] = { t: "n", v: lines[i].pct, z: "0.0000%" };
    ws["!cols"] = [{ wch: 8 }, { wch: 34 }, { wch: 44 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
    const safe = beneficiary.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    XLSX.utils.book_append_sheet(wb, ws, "Statement of Values");
    XLSX.writeFile(wb, `Statement_of_Values_${safe}_${stamp}.xlsx`);
  }

  /** Presentation-ready PDF for circulating to ownership. */
  async function exportStatementPdf() {
    const stamp = new Date().toISOString().slice(0, 10);
    const generatedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const asOfEstimate = estimates.asOf ? longDate(estimates.asOf) : "";
    let rows: StatementPdfRow[];
    let totals: { yearEnd: number; estimated: number };
    let ownerName: string | undefined;
    let contact: { address?: string; email?: string } | undefined;
    let filename: string;

    if (!beneficiary) {
      const src = [...ENTITY_VALUES].sort((a, b) => (b.equityValue ?? 0) - (a.equityValue ?? 0));
      rows = src.map((e) => ({ code: e.propertyCode ?? e.entity, name: e.name, yearEnd: e.equityValue, estimated: estimateFor(e.entity, estimates) }));
      totals = {
        yearEnd: src.reduce((s, e) => s + (e.equityValue ?? 0), 0),
        estimated: src.reduce((s, e) => s + estimateFor(e.entity, estimates), 0),
      };
      filename = `Statement_of_Values_${stamp}.pdf`;
    } else {
      ownerName = beneficiary;
      const c = ownerContact(beneficiary);
      if (c && (c.address || c.email)) contact = { address: c.address, email: c.email };
      const lines = statementForBeneficiary(beneficiary);
      rows = lines.map((l) => ({ code: l.propertyCode ?? l.entity, name: l.entityName, pct: l.pct, yearEnd: l.value, estimated: l.pct * estimateFor(l.entity, estimates) }));
      totals = {
        yearEnd: lines.reduce((s, l) => s + l.value, 0),
        estimated: lines.reduce((s, l) => s + l.pct * estimateFor(l.entity, estimates), 0),
      };
      const safe = beneficiary.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
      filename = `Statement_of_Values_${safe}_${stamp}.pdf`;
    }

    const bytes = await buildStatementOfValuesPdf({ ownerName, ownerContact: contact, asOfYearEnd: asOfLong(), asOfEstimate, generatedOn, rows, totals });
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

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

      {/* ── View toggle + search + exports ──────────────────────────────── */}
      <div className="card no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div role="tablist" aria-label="View" style={{
            display: "inline-flex", border: "1px solid var(--border)", borderRadius: 999,
            overflow: "hidden", background: "var(--card)",
          }}>
            {[
              { id: "property" as const, label: "By Property" },
              { id: "investor" as const, label: "By Investor" },
              { id: "statement" as const, label: "Statement of Values" },
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

          {view === "statement" ? (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", whiteSpace: "nowrap" }}>Owner</span>
              <select
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                style={{
                  flex: 1, minWidth: 200,
                  padding: "8px 12px",
                  border: "1px solid var(--border)", borderRadius: 8,
                  background: "var(--card)", color: "var(--text)",
                  fontFamily: "inherit", fontSize: 13, outline: "none",
                }}
              >
                <option value="">All entities (portfolio)</option>
                {benNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          ) : (
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
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {view === "statement" ? (
              <DownloadMenu
                label="Download"
                variant="primary"
                items={[
                  { label: "PDF — presentation", description: beneficiary ? `${beneficiary}'s statement, ready to send` : "Portfolio statement, ready to circulate", onClick: () => { void exportStatementPdf(); } },
                  { label: "Excel — workbook", description: "Live SUM totals; year-end + estimated values", onClick: exportStatement },
                ]}
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={exportToExcel}
                  className="btn"
                  title="Download ownership data as an Excel workbook"
                  style={{ fontSize: 12 }}
                >
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn"
                  title="Print or Save as PDF"
                  style={{ fontSize: 12 }}
                >
                  Print / PDF
                </button>
              </>
            )}
          </div>
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
                    <>
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
                      <InvestorStructureBlock investorName={agg.name} structure={structureFor(agg.name)} />
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Statement of Values view ───────────────────────────────────── */}
      {view === "statement" && <StatementView beneficiary={beneficiary} estimates={estimates} onSaveEstimates={saveEstimates} />}

      <p className="muted small" style={{ marginTop: 4 }}>
        {view === "statement" ? (
          <>Statement of values sourced from <code>lib/properties/entityValues.ts</code> (entity financials, {asOfLong()} snapshot) and <code>lib/properties/beneficiaries.ts</code> (ownership map). Each owner&rsquo;s value = their effective % × the entity&rsquo;s equity value.</>
        ) : (
          <>Source of truth: <code>lib/properties/ownership.ts</code>. Filing Tracker K-1 investors are derived from this file.</>
        )}
      </p>
    </main>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--muted)", transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", flexShrink: 0 }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/** Supplementary partnership / trustee structure shown inside the
 *  investor card. Only renders when the investor has an entry in
 *  lib/investors/structures.ts (e.g. Hyman Korman Co.). */
function InvestorStructureBlock({ investorName, structure }: { investorName: string; structure: InvestorStructure | null }) {
  const [structureOpen, setStructureOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);

  if (!structure) return null;

  const safeName = investorName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  const stamp = new Date().toISOString().slice(0, 10);

  function downloadStructure() {
    const rows = structure!.entries.flatMap((e) =>
      e.trustees.length === 0
        ? [{
            "Entity / Trust": e.entity,
            "Type": e.type,
            "Role": e.role,
            "Trustee / Partner": "",
            "Capacity": "",
          }]
        : e.trustees.map((t) => ({
            "Entity / Trust": e.entity,
            "Type": e.type,
            "Role": e.role,
            "Trustee / Partner": t.trustee,
            "Capacity": t.capacity ?? "",
          })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Structure");
    XLSX.writeFile(wb, `${safeName}_Structure_${stamp}.xlsx`);
  }

  function downloadDirectory() {
    if (!structure!.directory) return;
    const rows = structure!.directory.rows.map((r) => ({
      "Trustee / Partner Name": r.name,
      "Email": r.email ?? "",
      "Address": r.address,
      "City": r.city,
      "State": r.state,
      "Zip": r.zip ?? "",
      "Serving Individually?": r.servingIndividually,
      "Trust(s) / Entity": r.trusts,
      "Source Will / Instrument": r.sourceInstrument,
      "Notes": r.notes ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Trustee Directory");
    XLSX.writeFile(wb, `${safeName}_Trustee_Directory_${stamp}.xlsx`);
  }

  return (
    <>
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setStructureOpen((v) => !v)}
            aria-expanded={structureOpen}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "transparent", border: "none", padding: 0,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}
          >
            <Chevron open={structureOpen} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
              {structure.title}
            </span>
            <span className="muted small">{structure.entries.length}</span>
          </button>
          <button
            type="button"
            onClick={downloadStructure}
            className="btn"
            style={{ fontSize: 12, padding: "5px 10px", fontWeight: 600 }}
          >⤓ Excel</button>
        </div>
        {structureOpen && structure.subtitle && (
          <div className="muted small" style={{ marginTop: 4 }}>{structure.subtitle}</div>
        )}
        {structureOpen && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top" }}>ENTITY / TRUST</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top", width: 180, whiteSpace: "nowrap" }}>TYPE</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top", width: 200 }}>ROLE</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top" }}>TRUSTEE / PARTNER</th>
              </tr>
            </thead>
            <tbody>
              {structure.entries.map((e, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 10px", verticalAlign: "top", fontWeight: 600, lineHeight: 1.4 }}>
                    {e.entity}
                  </td>
                  <td style={{ padding: "10px 10px", verticalAlign: "top", color: "var(--muted)" }}>{e.type}</td>
                  <td style={{ padding: "10px 10px", verticalAlign: "top" }}>{e.role}</td>
                  <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                    {e.trustees.length === 0 ? (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {e.trustees.map((t, j) => (
                          <div key={j} style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontWeight: 600 }}>{t.trustee}</span>
                            {t.capacity && (
                              <span className="muted small">{t.capacity}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {structure.directory && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setDirectoryOpen((v) => !v)}
              aria-expanded={directoryOpen}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "transparent", border: "none", padding: 0,
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
            >
              <Chevron open={directoryOpen} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
                {structure.directory.title}
              </span>
              <span className="muted small">{structure.directory.rows.length}</span>
            </button>
            <button
              type="button"
              onClick={downloadDirectory}
              className="btn"
              style={{ fontSize: 12, padding: "5px 10px", fontWeight: 600 }}
            >⤓ Excel</button>
          </div>
          {directoryOpen && (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top", width: 180 }}>NAME</th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top" }}>ADDRESS</th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top", width: 110, whiteSpace: "nowrap" }}>SERVING INDIVIDUALLY?</th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top" }}>TRUST(S) / ENTITY</th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top", width: 180 }}>SOURCE WILL / INSTRUMENT</th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top" }}>NOTES</th>
                </tr>
              </thead>
              <tbody>
                {structure.directory.rows.map((r, i) => {
                  const cityState = [r.city, r.state, r.zip].filter(Boolean).join(", ").replace(/, ([A-Z]{2}|Canada), (\d{5})/, ", $1 $2");
                  return (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 10px", verticalAlign: "top", fontWeight: 600 }}>
                        <div>{r.name}</div>
                        {r.email && (
                          <a href={`mailto:${r.email}`} className="small" style={{ marginTop: 2, display: "inline-block", color: "var(--brand)", fontWeight: 500, wordBreak: "break-all" }}>{r.email}</a>
                        )}
                      </td>
                      <td style={{ padding: "10px 10px", verticalAlign: "top", lineHeight: 1.4 }}>
                        <div>{r.address}</div>
                        <div className="muted small" style={{ marginTop: 2 }}>{cityState}</div>
                      </td>
                      <td style={{ padding: "10px 10px", verticalAlign: "top" }}>{r.servingIndividually}</td>
                      <td style={{ padding: "10px 10px", verticalAlign: "top", lineHeight: 1.5 }}>
                        {r.trusts.split(/;\s*/).map((s, j, arr) => (
                          <span key={j}>
                            {s}{j < arr.length - 1 ? <span style={{ color: "var(--muted)" }}> · </span> : null}
                          </span>
                        ))}
                      </td>
                      <td style={{ padding: "10px 10px", verticalAlign: "top", color: "var(--muted)" }}>{r.sourceInstrument}</td>
                      <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                        {r.notes ?? <span style={{ color: "var(--muted)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </>
  );
}

/** Δ vs. year-end, shown next to the estimate when it differs. */
function DeltaTag({ base, now }: { base: number; now: number }) {
  if (!base || Math.round(now) === Math.round(base)) return null;
  const d = now - base;
  const pct = (d / base) * 100;
  const up = d > 0;
  return (
    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: up ? "#15803d" : "#b91c1c" }}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/** Statement of Values — portfolio (all entities) when no owner is selected, or
 *  a single owner's holdings + values when one is picked. Year-end values come
 *  from the entityValues snapshot; the "today estimate" is the saved override
 *  (or the year-end value when none). A beneficiary's value is always
 *  effective % × the entity's equity. */
function StatementView({ beneficiary, estimates, onSaveEstimates }: {
  beneficiary: string;
  estimates: OwnershipEstimates;
  onSaveEstimates: (next: OwnershipEstimates) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [asOfDraft, setAsOfDraft] = useState(estimates.asOf);
  const [saving, setSaving] = useState(false);

  const codeChip = (code?: string) =>
    code ? (
      <code style={{
        background: "#0b1220", color: "#e0f0ff",
        padding: "1px 6px", borderRadius: 4,
        fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      }}>{code}</code>
    ) : null;

  const numTd: React.CSSProperties = { padding: "10px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const th: React.CSSProperties = { padding: "10px 16px", fontWeight: 700, color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" };
  const thR: React.CSSProperties = { ...th, textAlign: "right" };
  const estLabel = estimates.asOf ? `EST. (${longDate(estimates.asOf).toUpperCase()})` : "EST. (TODAY)";

  function beginEdit() {
    const d: Record<string, string> = {};
    for (const e of ENTITY_VALUES) {
      const ov = estimates.values[e.entity];
      if (ov != null) d[e.entity] = String(ov);
    }
    setDraft(d);
    setAsOfDraft(estimates.asOf || new Date().toISOString().slice(0, 10));
    setEditing(true);
  }
  async function commit() {
    setSaving(true);
    // Persist only values that differ from year-end (others revert to default).
    const values: Record<string, number> = {};
    for (const e of ENTITY_VALUES) {
      const raw = (draft[e.entity] ?? "").replace(/[$,\s]/g, "");
      if (raw === "") continue;
      const n = Number(raw);
      if (Number.isFinite(n) && Math.round(n) !== Math.round(e.equityValue ?? 0)) values[e.entity] = Math.round(n);
    }
    const ok = await onSaveEstimates({ asOf: asOfDraft, values });
    setSaving(false);
    if (ok) setEditing(false);
  }

  // ── Portfolio (no owner selected) ──────────────────────────────────────
  if (!beneficiary) {
    const rows = [...ENTITY_VALUES].sort((a, b) => (b.equityValue ?? 0) - (a.equityValue ?? 0));
    const sum = (f: (e: typeof ENTITY_VALUES[number]) => number | null | undefined) =>
      rows.reduce((s, e) => s + (f(e) ?? 0), 0);
    const estTotal = rows.reduce((s, e) => s + estimateFor(e.entity, estimates), 0);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="pills">
          <StatPill label="Total equity value" value={money0(totalEquityValue())} sub={`as of ${asOfLong()}`} />
          <StatPill label="Est. value today" value={money0(estTotal)} sub={estimates.asOf ? `as of ${longDate(estimates.asOf)}` : "= year-end (not yet set)"} />
          <StatPill label="Total debt" value={money0(sum((e) => e.debtBalance))} />
          <StatPill label="Entities" value={rows.length} />
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 16px 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Statement of Values</div>
              <div className="muted small" style={{ marginTop: 2 }}>Year-end equity as of {asOfLong()}, with a current estimate. Pick an owner above for a per-beneficiary statement.</div>
            </div>
            {editing ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }} className="no-print">
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                  Est. as of
                  <input type="date" value={asOfDraft} onChange={(e) => setAsOfDraft(e.target.value)}
                    style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)", fontFamily: "inherit", fontSize: 12 }} />
                </label>
                <button type="button" className="btn primary" disabled={saving} onClick={commit} style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700 }}>{saving ? "Saving…" : "Save"}</button>
                <button type="button" className="btn" disabled={saving} onClick={() => setEditing(false)} style={{ fontSize: 12, padding: "6px 12px" }}>Cancel</button>
              </div>
            ) : (
              <button type="button" className="btn no-print" onClick={beginEdit} style={{ fontSize: 12, padding: "6px 12px" }}>Edit estimates</button>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, borderTop: "1px solid var(--border)" }}>
              <thead>
                <tr>
                  <th style={th}>ENTITY</th>
                  <th style={th}>PROPERTY / ENTITY</th>
                  <th style={thR}>NOI</th>
                  <th style={thR}>CAP</th>
                  <th style={thR}>INDICATED VALUE</th>
                  <th style={thR}>DEBT</th>
                  <th style={thR}>EQUITY VALUE</th>
                  <th style={thR}>{estLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const est = estimateFor(e.entity, estimates);
                  return (
                    <tr key={e.entity} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 16px" }}>{codeChip(e.propertyCode ?? e.entity)}</td>
                      <td style={{ padding: "10px 16px", fontWeight: 600 }}>{e.name}</td>
                      <td style={{ ...numTd, color: (e.noi ?? 0) < 0 ? "#b91c1c" : undefined }}>{e.noi == null ? "—" : money0(e.noi)}</td>
                      <td style={numTd}>{e.capRate == null ? "—" : (e.capRate * 100).toFixed(2) + "%"}</td>
                      <td style={numTd}>{money0(e.indicatedValue)}</td>
                      <td style={numTd}>{e.debtBalance ? money0(e.debtBalance) : "—"}</td>
                      <td style={{ ...numTd, fontWeight: 700 }}>{money0(e.equityValue)}</td>
                      <td style={numTd}>
                        {editing ? (
                          <input
                            inputMode="numeric"
                            value={draft[e.entity] ?? ""}
                            placeholder={money0(e.equityValue)}
                            onChange={(ev) => setDraft((p) => ({ ...p, [e.entity]: ev.target.value }))}
                            style={{ width: 120, textAlign: "right", padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)", fontFamily: "inherit", fontSize: 12, fontVariantNumeric: "tabular-nums" }}
                          />
                        ) : (
                          <span style={{ fontWeight: 700 }}>{money0(est)}<DeltaTag base={e.equityValue ?? 0} now={est} /></span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "rgba(15,23,42,0.03)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 800 }} colSpan={2}>TOTAL</td>
                  <td style={{ ...numTd, fontWeight: 800 }}>{money0(sum((e) => e.noi))}</td>
                  <td style={numTd}>—</td>
                  <td style={{ ...numTd, fontWeight: 800 }}>{money0(sum((e) => e.indicatedValue))}</td>
                  <td style={{ ...numTd, fontWeight: 800 }}>{money0(sum((e) => e.debtBalance))}</td>
                  <td style={{ ...numTd, fontWeight: 900 }}>{money0(totalEquityValue())}</td>
                  <td style={{ ...numTd, fontWeight: 900 }}>{money0(estTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Single owner ───────────────────────────────────────────────────────
  const lines = statementForBeneficiary(beneficiary);
  const total = beneficiaryTotalValue(beneficiary);
  const estTotal = lines.reduce((s, l) => s + l.pct * estimateFor(l.entity, estimates), 0);
  const largest = lines[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="pills">
        <StatPill label="Total value" value={money0(total)} sub={`as of ${asOfLong()}`} />
        <StatPill label="Est. value today" value={money0(estTotal)} sub={estimates.asOf ? `as of ${longDate(estimates.asOf)}` : "= year-end"} />
        <StatPill label="Entities held" value={lines.length} />
        {largest && <StatPill label="Largest holding" value={money0(largest.value)} sub={largest.entityName} />}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 16px 12px" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{beneficiary} — Statement of Values</div>
          <div className="muted small" style={{ marginTop: 2 }}>Ownership by partner / trust vehicle. Value = effective % × the entity&rsquo;s equity value ({asOfLong()}).</div>
          {(() => {
            const c = ownerContact(beneficiary);
            if (!c || (!c.address && !c.email)) return null;
            return (
              <div className="small" style={{ marginTop: 8, color: "var(--text)", display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
                <span style={{ fontWeight: 700, color: "var(--muted)", letterSpacing: "0.04em" }}>SEND TO</span>
                {c.address && <span style={{ color: "var(--muted)" }}>{c.address}</span>}
                {c.email && <a href={`mailto:${c.email}`} style={{ color: "var(--brand)" }}>{c.email}</a>}
              </div>
            );
          })()}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, borderTop: "1px solid var(--border)" }}>
            <thead>
              <tr>
                <th style={th}>ENTITY</th>
                <th style={th}>PROPERTY / ENTITY</th>
                <th style={th}>HELD THROUGH</th>
                <th style={thR}>OWNERSHIP %</th>
                <th style={thR}>VALUE</th>
                <th style={thR}>{estLabel}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const est = l.pct * estimateFor(l.entity, estimates);
                return (
                  <tr key={l.entity} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 16px" }}>{codeChip(l.propertyCode ?? l.entity)}</td>
                    <td style={{ padding: "10px 16px", fontWeight: 600 }}>{l.entityName}</td>
                    <td style={{ padding: "10px 16px", color: "var(--muted)", lineHeight: 1.5 }}>
                      {l.partners.length === 0 ? "—" : l.partners.map((p, i) => (
                        <span key={i}>{p}{i < l.partners.length - 1 ? <span style={{ opacity: 0.5 }}> · </span> : null}</span>
                      ))}
                      {l.positions > 1 && <span className="muted small" style={{ marginLeft: 6 }}>({l.positions} stakes)</span>}
                    </td>
                    <td style={numTd}>{(l.pct * 100).toFixed(4)}%</td>
                    <td style={{ ...numTd, fontWeight: 700 }}>{l.value ? money0(l.value) : "—"}</td>
                    <td style={numTd}>{est ? <span style={{ fontWeight: 700 }}>{money0(est)}<DeltaTag base={l.value} now={est} /></span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", background: "rgba(15,23,42,0.03)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 800 }} colSpan={3}>TOTAL — {lines.length} {lines.length === 1 ? "entity" : "entities"}</td>
                <td style={numTd}>—</td>
                <td style={{ ...numTd, fontWeight: 900 }}>{money0(total)}</td>
                <td style={{ ...numTd, fontWeight: 900 }}>{money0(estTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
