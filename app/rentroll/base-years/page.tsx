"use client";

import { useEffect, useMemo, useState } from "react";
import {
  OFFICE_BUILDINGS,
  SEED_EXPENSES,
  expenseYears,
  expenseBaseFor,
  latestExpenseYear,
  reimbursement,
  type BaseYearBasis,
  type PropertyExpenses,
} from "@/lib/rentroll/baseYearExpenses";
import { Pill, StatPill, TONE_BLUE } from "@/app/components/Pill";

// ── rent-roll shapes (subset of /api/rentroll) ───────────────────────────────

type RRUnit = {
  unitRef: string;
  occupantName: string;
  sqft: number;
  isVacant: boolean;
  amenity?: unknown;
};
type RRProperty = {
  propertyCode: string;
  totalSqft: number;
  occupiedSqft: number;
  units: RRUnit[];
};

// ── formatting ───────────────────────────────────────────────────────────────

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function signedMoney(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US");
}
function pct1(n: number): string {
  return n.toFixed(1) + "%";
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted)",
};

function resolveBaseYear(raw: number | string | null | undefined): {
  num: number | null;
  marker: string | null;
} {
  if (raw == null) return { num: null, marker: null };
  if (typeof raw === "number") return { num: raw, marker: null };
  const s = String(raw).trim();
  if (/^\d{4}$/.test(s)) return { num: Number(s), marker: null };
  return { num: null, marker: s.toUpperCase() };
}

const NOW_YEAR = new Date().getFullYear();

type TenantRow = {
  unitRef: string;
  name: string;
  sqft: number;
  baseYearNum: number | null;
  baseYearMarker: string | null;
};

export default function BaseYearExpensesPage() {
  const [propCode, setPropCode] = useState("3610");
  const [rrProps, setRrProps] = useState<RRProperty[] | null>(null);
  const [tenantMeta, setTenantMeta] = useState<Record<string, { baseYear?: number | string | null }>>({});
  const [loading, setLoading] = useState(true);

  const [basis, setBasis] = useState<BaseYearBasis>("opexRet");
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [resetYear, setResetYear] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/rentroll").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/tenant-meta").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([rrJ, tmJ]) => {
        setRrProps(rrJ?.rentroll?.properties ?? []);
        setTenantMeta(tmJ?.tenantMeta ?? {});
      })
      .finally(() => setLoading(false));
  }, []);

  const expenses: PropertyExpenses | null = SEED_EXPENSES[propCode] ?? null;
  const years = useMemo(() => (expenses ? expenseYears(expenses) : []), [expenses]);

  // Default the year pickers to the latest year with data once expenses load.
  useEffect(() => {
    if (!expenses) {
      setCompareYear(null);
      setResetYear(null);
      return;
    }
    const latest = latestExpenseYear(expenses);
    setCompareYear(latest);
    setResetYear(latest);
  }, [expenses]);

  const rrProp = useMemo(
    () => (rrProps ?? []).find((p) => p.propertyCode.toUpperCase() === propCode.toUpperCase()) ?? null,
    [rrProps, propCode],
  );

  const currentOccPct = useMemo(() => {
    if (!rrProp || rrProp.totalSqft <= 0) return null;
    return (rrProp.occupiedSqft / rrProp.totalSqft) * 100;
  }, [rrProp]);

  // Live tenant roster for this building, with each tenant's base year.
  const tenants: TenantRow[] = useMemo(() => {
    if (!rrProp) return [];
    return rrProp.units
      .filter((u) => !u.isVacant && !u.amenity && u.sqft > 0)
      .map((u) => {
        const { num, marker } = resolveBaseYear(tenantMeta[u.unitRef]?.baseYear);
        return {
          unitRef: u.unitRef,
          name: u.occupantName,
          sqft: u.sqft,
          baseYearNum: num,
          baseYearMarker: marker,
        };
      })
      .sort((a, b) => {
        const ay = a.baseYearNum ?? 9999;
        const by = b.baseYearNum ?? 9999;
        if (ay !== by) return ay - by;
        return a.name.localeCompare(b.name);
      });
  }, [rrProp, tenantMeta]);

  const meta = OFFICE_BUILDINGS.find((b) => b.code === propCode);
  const building = SEED_EXPENSES[propCode];

  return (
    <main>
      <h1>Base Year Expenses</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
        Office operating-expense history by year, the tenants locked to each
        base year, and the recovery impact of resetting a base year forward.
      </p>

      {/* Building selector */}
      <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
        {OFFICE_BUILDINGS.map((b) => {
          const active = b.code === propCode;
          const hasData = !!SEED_EXPENSES[b.code];
          return (
            <button
              key={b.code}
              onClick={() => setPropCode(b.code)}
              className="btn"
              title={hasData ? "" : "Expense history not loaded yet"}
              style={{
                padding: "8px 13px",
                fontSize: 13,
                background: active ? "var(--brand)" : undefined,
                color: active ? "#fff" : undefined,
                borderColor: active ? "var(--brand)" : undefined,
                opacity: hasData || active ? 1 : 0.55,
              }}
            >
              {b.name} <span style={{ opacity: 0.7 }}>#{b.code}</span>
              {!hasData && <span style={{ marginLeft: 6, fontSize: 11 }}>·&nbsp;no data</span>}
            </button>
          );
        })}
      </div>

      {!expenses ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ fontWeight: 700 }}>
            {meta?.name ?? propCode} — expense history not loaded yet
          </p>
          <p className="muted" style={{ marginTop: 6 }}>
            Send the historical operating-expense workbook for this building and
            it&rsquo;ll appear here with the same base-year tools as Building&nbsp;1.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="card" style={{ marginTop: 16 }}>
            <div style={SECTION_LABEL}>
              {meta?.name} (#{propCode}) · {meta?.fund} · workbook updated {expenses.updatedAt}
            </div>
            <div className="pills">
              <StatPill label="Rentable SF" value={expenses.rentableSqft.toLocaleString()} />
              <StatPill
                label={`${latestExpenseYear(expenses)} Op Ex (95%)`}
                value={money(expenses.opExGrossedUp[String(latestExpenseYear(expenses))] ?? 0)}
              />
              <StatPill
                label={`${latestExpenseYear(expenses)} RE Taxes`}
                value={money(expenses.ret[String(latestExpenseYear(expenses))] ?? 0)}
              />
              <StatPill label="Tenants w/ Base Year" value={tenants.filter((t) => t.baseYearNum != null).length} />
              <StatPill
                label="Current Occupancy"
                value={currentOccPct != null ? pct1(currentOccPct) : "—"}
                sub="from rent roll"
              />
            </div>
          </div>

          {/* Expense history — workbook layout */}
          <ExpenseHistory
            expenses={expenses}
            years={years}
            currentOccPct={currentOccPct}
          />

          {/* Reset impact */}
          <ResetImpact
            expenses={expenses}
            tenants={tenants}
            years={years}
            basis={basis}
            setBasis={setBasis}
            compareYear={compareYear}
            setCompareYear={setCompareYear}
            resetYear={resetYear}
            setResetYear={setResetYear}
            loading={loading}
            hasRentRoll={!!rrProp}
          />
        </>
      )}
    </main>
  );
}

// ── reset-impact calculator ──────────────────────────────────────────────────

function ResetImpact({
  expenses,
  tenants,
  years,
  basis,
  setBasis,
  compareYear,
  setCompareYear,
  resetYear,
  setResetYear,
  loading,
  hasRentRoll,
}: {
  expenses: PropertyExpenses;
  tenants: TenantRow[];
  years: number[];
  basis: BaseYearBasis;
  setBasis: (b: BaseYearBasis) => void;
  compareYear: number | null;
  setCompareYear: (y: number) => void;
  resetYear: number | null;
  setResetYear: (y: number) => void;
  loading: boolean;
  hasRentRoll: boolean;
}) {
  const cy = compareYear ?? latestExpenseYear(expenses) ?? years[years.length - 1];
  const ry = resetYear ?? cy;

  const rows = tenants.filter((t) => t.baseYearNum != null);
  const markerRows = tenants.filter((t) => t.baseYearNum == null && t.baseYearMarker);

  let totalNow = 0;
  let totalAfter = 0;
  const computed = rows.map((t) => {
    const now = reimbursement(expenses, t.sqft, t.baseYearNum as number, cy, basis);
    const after = reimbursement(expenses, t.sqft, ry, cy, basis);
    if (now != null) totalNow += now;
    if (after != null) totalAfter += after;
    const lockedBase = expenseBaseFor(expenses, t.baseYearNum as number, basis);
    return { t, now, after, lockedBase, delta: now != null && after != null ? after - now : null };
  });
  const totalDelta = totalAfter - totalNow;

  const selectStyle: React.CSSProperties = {
    padding: "7px 10px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    fontSize: 14,
    fontWeight: 700,
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={SECTION_LABEL}>Base Year Reset Impact</div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
        <label>
          <div style={{ ...SECTION_LABEL, marginBottom: 5 }}>Compare expenses for</div>
          <select value={cy} onChange={(e) => setCompareYear(Number(e.target.value))} style={selectStyle}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>
          <div style={{ ...SECTION_LABEL, marginBottom: 5 }}>Model reset to base year</div>
          <select value={ry} onChange={(e) => setResetYear(Number(e.target.value))} style={selectStyle}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div>
          <div style={{ ...SECTION_LABEL, marginBottom: 5 }}>Basis</div>
          <div style={{ display: "flex", gap: 6 }}>
            {([
              ["opex", "Op Ex only"],
              ["opexRet", "Op Ex + RE Tax"],
            ] as [BaseYearBasis, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setBasis(val)}
                className="btn"
                style={{
                  padding: "7px 12px",
                  fontSize: 13,
                  background: basis === val ? "var(--brand)" : undefined,
                  color: basis === val ? "#fff" : undefined,
                  borderColor: basis === val ? "var(--brand)" : undefined,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Headline */}
      <div className="pills" style={{ marginTop: 16 }}>
        <StatPill label={`Recovery now (base yrs as-is)`} value={money(totalNow)} sub={`${cy} expenses`} />
        <StatPill label={`Recovery if all reset to ${ry}`} value={money(totalAfter)} />
        <StatPill
          label="Annual recovery impact"
          value={signedMoney(totalDelta)}
          accent={totalDelta < 0 ? "#b91c1c" : totalDelta > 0 ? "#15803d" : undefined}
        />
      </div>

      {/* Per-tenant table */}
      {loading ? (
        <p className="muted" style={{ marginTop: 14 }}>Loading rent roll…</p>
      ) : !hasRentRoll ? (
        <p className="muted" style={{ marginTop: 14 }}>
          No rent roll loaded for this building — upload a rent roll to see tenants.
        </p>
      ) : rows.length === 0 ? (
        <p className="muted" style={{ marginTop: 14 }}>
          No tenants with a numeric base year found for this building.
        </p>
      ) : (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th style={{ textAlign: "right" }}>SF</th>
                <th style={{ textAlign: "right" }}>Pro-rata</th>
                <th style={{ textAlign: "center" }}>Base Yr</th>
                <th style={{ textAlign: "right" }}>Locked Base</th>
                <th style={{ textAlign: "right" }}>Reimb. ({cy})</th>
                <th style={{ textAlign: "center" }}>Reset → {ry}</th>
                <th style={{ textAlign: "right" }}>New Reimb.</th>
                <th style={{ textAlign: "right" }}>Δ Recovery</th>
              </tr>
            </thead>
            <tbody>
              {computed.map(({ t, now, after, lockedBase, delta }) => {
                const share = (t.sqft / expenses.rentableSqft) * 100;
                return (
                  <tr key={t.unitRef}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{t.name}</div>
                      <div className="small muted">{t.unitRef}</div>
                    </td>
                    <td style={{ textAlign: "right" }}>{t.sqft.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{pct1(share)}</td>
                    <td style={{ textAlign: "center" }}>
                      <Pill tone={TONE_BLUE}>{t.baseYearNum}</Pill>
                    </td>
                    <td style={{ textAlign: "right" }}>{lockedBase != null ? money(lockedBase) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{now != null ? money(now) : "—"}</td>
                    <td style={{ textAlign: "center" }} className="small muted">
                      {t.baseYearNum === ry ? "no change" : `was ${t.baseYearNum}`}
                    </td>
                    <td style={{ textAlign: "right" }}>{after != null ? money(after) : "—"}</td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 800,
                        color: delta == null ? undefined : delta < 0 ? "#b91c1c" : delta > 0 ? "#15803d" : "var(--muted)",
                      }}
                    >
                      {delta == null ? "—" : delta === 0 ? "—" : signedMoney(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td style={{ textAlign: "right" }}>
                  {rows.reduce((s, t) => s + t.sqft, 0).toLocaleString()}
                </td>
                <td colSpan={3} />
                <td style={{ textAlign: "right" }}>{money(totalNow)}</td>
                <td />
                <td style={{ textAlign: "right" }}>{money(totalAfter)}</td>
                <td
                  style={{
                    textAlign: "right",
                    color: totalDelta < 0 ? "#b91c1c" : totalDelta > 0 ? "#15803d" : undefined,
                  }}
                >
                  {signedMoney(totalDelta)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {markerRows.length > 0 && (
        <p className="small muted" style={{ marginTop: 12 }}>
          Excluded (no numeric base year):{" "}
          {markerRows.map((t) => `${t.name} (${t.baseYearMarker})`).join(", ")}.
          NNN tenants pay expenses directly; gross tenants have no expense stop.
        </p>
      )}
      <p className="small muted" style={{ marginTop: 8 }}>
        Reimbursement is computed per GL line: for each {basis === "opexRet" ? "95%-grossed-up Op Ex line and RE taxes" : "95%-grossed-up Op Ex line"},
        the tenant owes its pro-rata share of the {cy} amount above that
        line&rsquo;s base-year amount, and each line is floored at zero — a line
        below its base year does not offset increases elsewhere. Resetting a
        base year forward raises those floors, so a negative Δ is recovery the
        landlord gives up.
      </p>
    </div>
  );
}

// ── expense history table ────────────────────────────────────────────────────

function ExpenseHistory({
  expenses,
  years,
  currentOccPct,
}: {
  expenses: PropertyExpenses;
  years: number[];
  currentOccPct: number | null;
}) {
  const displayYears = years.includes(NOW_YEAR) ? years : [...years, NOW_YEAR];
  const [psf, setPsf] = useState(false);

  // Format a dollar figure either as a total or as $/SF of rentable area.
  const fmtv = (n: number) =>
    psf ? "$" + (n / expenses.rentableSqft).toFixed(2) : money(n);

  const glLines = expenses.lines.filter((l) => !l.separateCharge);
  const separateLines = expenses.lines.filter((l) => l.separateCharge);

  // First column stays put while the year columns scroll horizontally.
  const sticky: React.CSSProperties = {
    position: "sticky",
    left: 0,
    background: "var(--card)",
    zIndex: 1,
  };

  const valueCells = (vals: Record<string, number>, bold?: boolean) =>
    displayYears.map((y) => {
      const v = vals[String(y)];
      return (
        <td key={y} style={{ textAlign: "right", fontWeight: bold ? 800 : undefined }}>
          {v != null ? fmtv(v) : "—"}
        </td>
      );
    });

  const groupTop: React.CSSProperties = { borderTop: "2px solid var(--border)" };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={SECTION_LABEL}>
          Operating Expense History {psf && `· per SF of ${expenses.rentableSqft.toLocaleString()} rentable`}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {([
            [false, "$ total"],
            [true, "$ / SF"],
          ] as [boolean, string][]).map(([val, label]) => (
            <button
              key={label}
              className="btn"
              onClick={() => setPsf(val)}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                background: psf === val ? "var(--brand)" : undefined,
                color: psf === val ? "#fff" : undefined,
                borderColor: psf === val ? "var(--brand)" : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={{ ...sticky, zIndex: 2, minWidth: 190 }}>GL Account</th>
              {displayYears.map((y) => (
                <th key={y} style={{ textAlign: "right" }}>
                  {y}{y === NOW_YEAR ? " *" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...sticky, fontWeight: 700 }}>Avg. Occupancy</td>
              {displayYears.map((y) => {
                const occ =
                  y === NOW_YEAR && currentOccPct != null
                    ? pct1(currentOccPct)
                    : expenses.occupancyPct[String(y)] != null
                      ? expenses.occupancyPct[String(y)] + "%"
                      : "—";
                return <td key={y} style={{ textAlign: "right" }}>{occ}</td>;
              })}
            </tr>

            {glLines.map((line, i) => (
              <tr key={line.glAccount}>
                <td style={{ ...sticky, ...(i === 0 ? groupTop : {}) }}>
                  <span style={{ fontWeight: 600 }}>{line.label}</span>
                  <span className="small muted" style={{ marginLeft: 8 }}>{line.glAccount}</span>
                </td>
                {displayYears.map((y) => {
                  const v = line.values[String(y)];
                  return (
                    <td key={y} style={{ textAlign: "right", ...(i === 0 ? groupTop : {}) }}>
                      {v != null ? fmtv(v) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}

            <tr style={groupTop}>
              <td style={{ ...sticky, ...groupTop, fontWeight: 700 }}>Total Op Ex (as-is)</td>
              {valueCells(expenses.opEx)}
            </tr>
            <tr>
              <td style={{ ...sticky, fontWeight: 800 }}>Total Op Ex (95%)</td>
              {valueCells(expenses.opExGrossedUp, true)}
            </tr>

            {separateLines.map((line, i) => (
              <tr key={line.glAccount}>
                <td style={{ ...sticky, ...(i === 0 ? groupTop : {}) }}>
                  <span style={{ fontWeight: 600 }}>{line.label}</span>
                  <span className="small muted" style={{ marginLeft: 8 }}>{line.glAccount}</span>
                  <span className="small muted" style={{ marginLeft: 6 }}>(billed separately)</span>
                </td>
                {displayYears.map((y) => {
                  const v = line.values[String(y)];
                  return (
                    <td key={y} style={{ textAlign: "right", ...(i === 0 ? groupTop : {}) }}>
                      {v != null ? fmtv(v) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr style={separateLines.length === 0 ? groupTop : undefined}>
              <td style={{ ...sticky, ...(separateLines.length === 0 ? groupTop : {}), fontWeight: 700 }}>
                RE Taxes
              </td>
              {displayYears.map((y) => {
                const v = expenses.ret[String(y)];
                return (
                  <td key={y} style={{ textAlign: "right", fontWeight: 700, ...(separateLines.length === 0 ? groupTop : {}) }}>
                    {v != null ? fmtv(v) : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        * {NOW_YEAR} occupancy is pulled live from the current rent roll;
        expense figures for {NOW_YEAR} are not yet posted. Op Ex (95%) grosses
        variable costs up to a 95%-occupancy basis — the figure used for
        base-year comparisons.
      </p>
    </div>
  );
}
