"use client";

// RECOVERIES BY LINE — what each operating-expense line billed back to tenants
// in a reconciled year, in $ and % (owner: "show as a $ and % of each line item
// what the recoveries were … each expense is calculated on its own line
// against the base year"). Figures are the office recon's own
// (lib/cam/office/lineRecovery.ts via /api/cam-recon/office/recoveries).

import { useEffect, useMemo, useState } from "react";
import { HoverCard } from "@/app/components/HoverCard";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import type { LineRecovery } from "@/lib/cam/office/lineRecovery";

type Group = { propertyCode: string; name: string; fund: string; year: number; lines: LineRecovery[]; ret: LineRecovery; opexTotal: LineRecovery };
type Resp = { years: number[]; year: number | null; buildings: Group[]; funds: Group[] };

const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const cell = (n: number) => (Math.abs(n) < 0.5 ? "—" : n < 0 ? `(${whole(-n)})` : whole(n));
const dollars = (n: number) => (n < 0 ? `($${whole(-n)})` : `$${whole(n)}`);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function LineRecoveryCard({ propCode, fund }: { propCode: string; fund?: string }) {
  const [year, setYear] = useState<number | null>(null);
  const [data, setData] = useState<Resp | null>(null);
  const [failed, setFailed] = useState(false);
  const [scope, setScope] = useState<"building" | "fund" | "all">("building");

  useEffect(() => {
    let alive = true;
    fetch(`/api/cam-recon/office/recoveries${year ? `?year=${year}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: Resp) => { if (alive) { setData(j); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [year]);

  const group = useMemo(() => {
    if (!data) return null;
    if (scope === "all") return data.funds.find((f) => f.name === "All Business Parks") ?? null;
    if (scope === "fund") return data.funds.find((f) => f.name === fund) ?? null;
    return data.buildings.find((b) => b.propertyCode === propCode) ?? null;
  }, [data, scope, propCode, fund]);

  if (failed || !data || !data.year) return null;
  const hasBuilding = data.buildings.some((b) => b.propertyCode === propCode);

  const lines = (group?.lines ?? []).filter((l) => Math.abs(l.expense) >= 0.5 || Math.abs(l.recovered) >= 0.5);

  const tip = (l: LineRecovery) => (
    <HoverCard
      title={`${l.label} · ${data.year}`}
      width={300}
      rows={[
        { label: "Under the base years", value: dollars(l.lostToBaseYears) },
        { label: "Vacant & not billed", value: dollars(l.lostToVacancy) },
        ...(l.grossUpGain >= 0.5 ? [{ label: "Gross-up to 95% adds", value: dollars(-l.grossUpGain), color: "var(--c-067647, #067647)" }] : []),
        ...(l.viaTotalStop >= 0.5 ? [{ label: "Recovered via total-stop leases", value: dollars(l.viaTotalStop) }] : []),
      ]}
      footer={{ label: "Tenants paying", value: `${l.tenantsPaying} of ${l.tenantsReconciled}` }}
    >
      {cell(l.expense - l.recovered)}
    </HoverCard>
  );

  const row = (l: LineRecovery, opts: { total?: boolean; ret?: boolean } = {}) => {
    const strong = opts.total ? { fontWeight: 800 } : undefined;
    const rule = opts.total ? { borderTop: "2px solid var(--ink, #101828)" } : opts.ret ? { borderTop: "1px solid var(--hairline)" } : undefined;
    const money = opts.total ? dollars : cell;
    return (
      <tr key={`${l.glAccount}-${l.label}`} style={rule}>
        <td style={{ ...tdL, ...strong }}>
          {!opts.total && l.glAccount && <code style={{ marginRight: 8 }}>{l.glAccount}</code>}
          {l.label}
        </td>
        <td style={{ ...td, ...strong }}>{money(l.expense)}</td>
        <td style={{ ...td, ...strong }}>{money(l.recovered)}</td>
        <td style={{ ...td, ...strong }}>{l.expense > 0 ? pct(l.pct) : "—"}</td>
        <td style={{ ...td, ...strong }}>{tip(l)}</td>
        <td style={{ ...td, color: "var(--muted)" }}>{l.tenantsReconciled ? `${l.tenantsPaying} of ${l.tenantsReconciled}` : "—"}</td>
      </tr>
    );
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Recoveries by Line · {data.year}</div>
          <div className="muted" style={{ fontSize: "var(--fs-14)", marginTop: 2 }}>
            What each expense billed back to tenants through the {data.year} reconciliation, line by line against each tenant&rsquo;s base year.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="select-sm" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} aria-label="Scope">
            {hasBuilding && <option value="building">This building</option>}
            {fund && <option value="fund">{fund}</option>}
            <option value="all">All Business Parks</option>
          </select>
          {data.years.length > 1 && (
            <select className="select-sm" value={data.year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
              {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>
      {!group ? (
        <p className="muted" style={{ marginTop: 12 }}>
          {scope === "building" ? `No ${data.year} reconciliation for this building.` : "Nothing reconciled for this group yet."}
        </p>
      ) : (
        <div className="tableWrap" style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thL}>Expense</th>
                <th style={th}>{data.year} Expense</th>
                <th style={th}>Recovered</th>
                <th style={th}>% Recovered</th>
                <th style={th}>Not Recovered</th>
                <th style={th}>Tenants Paying</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => row(l))}
              {row(group.opexTotal, { total: true })}
              {row(group.ret, { ret: true })}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted" style={{ marginTop: 8 }}>
        Recovered is each tenant&rsquo;s amount due on the line: pro-rata share of (actual less base year), never below $0, prorated for part-year occupancy.
        Hover Not Recovered for the split between the base-year stops and vacant or unbilled space.
      </p>
    </div>
  );
}
