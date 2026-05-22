"use client";

import { useEffect, useMemo, useState } from "react";
import {
  OFFICE_BUILDINGS,
  SEED_EXPENSES,
  expenseYears,
  latestExpenseYear,
  reimbursement,
  type PropertyExpenses,
} from "@/lib/rentroll/baseYearExpenses";

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
type RRSnapshot = {
  month: string; // "YYYY-MM"
  byProperty: { propertyCode: string; total: number; occupied: number }[];
};

// ── formatting ───────────────────────────────────────────────────────────────

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
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

const selectStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: 14,
  fontWeight: 700,
};

const NOW_YEAR = new Date().getFullYear();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type TenantMeta = { baseYear?: number | string | null };

export default function BaseYearExpensesPage() {
  const [propCode, setPropCode] = useState("3610");
  const [rrProps, setRrProps] = useState<RRProperty[] | null>(null);
  const [snapshots, setSnapshots] = useState<RRSnapshot[]>([]);
  const [tenantMeta, setTenantMeta] = useState<Record<string, TenantMeta>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/rentroll").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/rentroll/history").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/tenant-meta").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([rrJ, histJ, metaJ]) => {
      setRrProps(rrJ?.rentroll?.properties ?? []);
      setSnapshots(histJ?.snapshots ?? []);
      setTenantMeta(metaJ?.tenantMeta ?? {});
    });
  }, []);

  const expenses: PropertyExpenses | null = SEED_EXPENSES[propCode] ?? null;
  const years = useMemo(() => (expenses ? expenseYears(expenses) : []), [expenses]);

  const rrProp = useMemo(
    () => (rrProps ?? []).find((p) => p.propertyCode.toUpperCase() === propCode.toUpperCase()) ?? null,
    [rrProps, propCode],
  );

  const currentOccPct = useMemo(() => {
    if (!rrProp || rrProp.totalSqft <= 0) return null;
    return (rrProp.occupiedSqft / rrProp.totalSqft) * 100;
  }, [rrProp]);

  // Monthly occupied SF for this building drawn from uploaded rent rolls —
  // fills the occupancy history for 2026 onward.
  const rrMonthly = useMemo(() => {
    const out: Record<string, (number | null)[]> = {};
    for (const snap of snapshots) {
      const m = /^(\d{4})-(\d{2})$/.exec(snap.month ?? "");
      if (!m) continue;
      const bp = snap.byProperty?.find(
        (p) => p.propertyCode.toUpperCase() === propCode.toUpperCase(),
      );
      if (!bp) continue;
      const idx = Number(m[2]) - 1;
      if (idx < 0 || idx > 11) continue;
      if (!out[m[1]]) out[m[1]] = Array(12).fill(null);
      out[m[1]][idx] = bp.occupied;
    }
    return out;
  }, [snapshots, propCode]);

  const meta = OFFICE_BUILDINGS.find((b) => b.code === propCode);

  return (
    <main>
      <h1>Operating Expense History</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
        Office operating-expense and occupancy history by year for the JV III
        and NI LLC buildings.
      </p>

      {/* Building selector — compact dropdown */}
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={SECTION_LABEL}>Building</span>
        <select value={propCode} onChange={(e) => setPropCode(e.target.value)} style={selectStyle}>
          {OFFICE_BUILDINGS.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name} (#{b.code}){SEED_EXPENSES[b.code] ? "" : " — no data"}
            </option>
          ))}
        </select>
        {expenses && (
          <span className="small muted">
            {meta?.fund} · {expenses.rentableSqft.toLocaleString()} SF · workbook updated {expenses.updatedAt}
          </span>
        )}
      </div>

      {!expenses ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ fontWeight: 700 }}>
            {meta?.name ?? propCode} — expense history not loaded yet
          </p>
          <p className="muted" style={{ marginTop: 6 }}>
            Send the historical operating-expense workbook for this building and
            it&rsquo;ll appear here with the same base-year tools as the JV III buildings.
          </p>
        </div>
      ) : (
        <>
          <SummaryTable expenses={expenses} />

          <ExpenseHistory expenses={expenses} years={years} currentOccPct={currentOccPct} />

          <OccupancyHistory expenses={expenses} rrMonthly={rrMonthly} />

          <BaseYearBreakdown rrProp={rrProp} tenantMeta={tenantMeta} expenses={expenses} />
        </>
      )}

      <p className="muted small" style={{ marginTop: 16 }}>
        To model the income impact of resetting a tenant&rsquo;s base year, use{" "}
        <a href="/rentroll/leasing" style={{ color: "var(--brand)", fontWeight: 700 }}>
          Leasing Activity → Base Year Resets
        </a>.
      </p>
    </main>
  );
}

// ── summary ($/SF, last 5 years) ─────────────────────────────────────────────

function SummaryTable({ expenses }: { expenses: PropertyExpenses }) {
  const [mode, setMode] = useState<"total" | "gross" | "psf">("psf");
  const last5 = expenseYears(expenses).slice(-5).reverse();
  const recent3 = last5.slice(0, 3); // most recent 3 years, for the 3-Yr Avg
  const avgBg = "rgba(11,74,125,0.06)";
  const rentable = expenses.rentableSqft;
  const elec = expenses.lines.find((l) => l.separateCharge);

  // CAM is the 95%-grossed-up Op Ex except in "Totals" mode, which uses the
  // as-is total. RET and Electric have no grossed-up variant, so they read
  // the same in every mode. "$ / SF" divides the grossed-up figures by SF.
  const cam = (y: string) =>
    mode === "total" ? expenses.opEx[y] : expenses.opExGrossedUp[y];
  const ret = (y: string) => expenses.ret[y];
  const el = (y: string) => elec?.values[y];

  const fmt = (n: number | undefined) => {
    if (n == null) return "—";
    return mode === "psf" ? "$" + (n / rentable).toFixed(2) : money(n);
  };

  const rows: { label: string; total?: boolean; get: (y: string) => number | undefined }[] = [
    { label: "CAM", get: cam },
    { label: "RET", get: ret },
    {
      label: "Total (CAM + RET)",
      total: true,
      get: (y) => {
        const c = cam(y);
        return c != null ? c + (ret(y) ?? 0) : undefined;
      },
    },
    { label: "Electric", get: el },
  ];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={SECTION_LABEL}>Summary — last 5 years</div>
        <div style={{ display: "flex", gap: 6 }}>
          {([
            ["total", "Totals"],
            ["gross", "Grossed up"],
            ["psf", "$ / SF"],
          ] as ["total" | "gross" | "psf", string][]).map(([val, label]) => (
            <button
              key={val}
              className="btn"
              onClick={() => setMode(val)}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                background: mode === val ? "var(--brand)" : undefined,
                color: mode === val ? "#fff" : undefined,
                borderColor: mode === val ? "var(--brand)" : undefined,
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
              <th>
                {mode === "psf" ? "$ / SF" : mode === "gross" ? "Grossed-up $" : "Total $"}
              </th>
              <th style={{ textAlign: "right", background: avgBg }}>3-Yr Avg</th>
              {last5.map((y) => (
                <th key={y} style={{ textAlign: "right" }}>{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const recent = recent3
                .map((y) => r.get(String(y)))
                .filter((v): v is number => v != null);
              const avg = recent.length
                ? recent.reduce((s, v) => s + v, 0) / recent.length
                : null;
              return (
                <tr key={r.label}>
                  <td style={{ fontWeight: r.total ? 800 : 700 }}>{r.label}</td>
                  <td style={{ textAlign: "right", fontWeight: r.total ? 800 : 700, background: avgBg }}>
                    {avg != null ? fmt(avg) : "—"}
                  </td>
                  {last5.map((y) => (
                    <td key={y} style={{ textAlign: "right", fontWeight: r.total ? 800 : undefined }}>
                      {fmt(r.get(String(y)))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        {mode === "total"
          ? "Totals mode shows CAM as the as-is operating-expense total (not grossed up)."
          : mode === "gross"
            ? "CAM is the 95%-grossed-up operating-expense total."
            : `$ / SF divides the 95%-grossed-up figures by ${rentable.toLocaleString()} rentable SF.`}
        {" "}RET and Electric have no grossed-up variant, so they read the same
        in every mode. Electric is billed separately.
      </p>
    </div>
  );
}

// ── collapsible section header ───────────────────────────────────────────────

function CollapseHeader({
  open,
  onToggle,
  title,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        ...SECTION_LABEL,
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span style={{ fontSize: 13 }}>{open ? "▾" : "▸"}</span>
      {title}
    </button>
  );
}

// ── expense history table (collapsible) ──────────────────────────────────────

function ExpenseHistory({
  expenses,
  years,
  currentOccPct,
}: {
  expenses: PropertyExpenses;
  years: number[];
  currentOccPct: number | null;
}) {
  const [open, setOpen] = useState(false);
  // Newest year first.
  const displayYears = (years.includes(NOW_YEAR) ? years : [...years, NOW_YEAR])
    .slice()
    .reverse();
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
        <CollapseHeader open={open} onToggle={() => setOpen((o) => !o)} title="Operating Expense History" />
        {open && (
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
        )}
      </div>

      {open && (
        <>
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
        </>
      )}
    </div>
  );
}

// ── occupancy history (collapsible) ──────────────────────────────────────────

function OccupancyHistory({
  expenses,
  rrMonthly,
}: {
  expenses: PropertyExpenses;
  rrMonthly: Record<string, (number | null)[]>;
}) {
  const [open, setOpen] = useState(false);

  // Seed years take precedence; rent-roll-derived years (2026+) fill the rest.
  const years = Array.from(
    new Set([...Object.keys(expenses.occupancyMonthly), ...Object.keys(rrMonthly)]),
  )
    .map(Number)
    .sort((a, b) => b - a);

  const rentable = expenses.rentableSqft;
  const hasRR = Object.keys(rrMonthly).length > 0;

  const sticky: React.CSSProperties = {
    position: "sticky",
    left: 0,
    background: "var(--card)",
    zIndex: 1,
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <CollapseHeader open={open} onToggle={() => setOpen((o) => !o)} title="Occupancy History" />

      {open && (
        <>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th style={{ ...sticky, zIndex: 2 }}>Year</th>
                  {MONTHS.map((m) => (
                    <th key={m} style={{ textAlign: "right" }}>{m}</th>
                  ))}
                  <th style={{ textAlign: "right" }}>Avg Occ.</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => {
                  const fromSeed = expenses.occupancyMonthly[String(y)];
                  const monthly: (number | null)[] = fromSeed ?? rrMonthly[String(y)] ?? [];
                  const present = monthly.filter((v): v is number => v != null);
                  const avgPct =
                    present.length && rentable > 0
                      ? (present.reduce((s, v) => s + v, 0) / present.length / rentable) * 100
                      : null;
                  const isRR = !fromSeed;
                  return (
                    <tr key={y}>
                      <td style={{ ...sticky, fontWeight: 700 }}>
                        {y}{isRR ? " *" : ""}
                      </td>
                      {Array.from({ length: 12 }).map((_, i) => {
                        const v = monthly[i];
                        return (
                          <td key={i} style={{ textAlign: "right" }}>
                            {v != null ? v.toLocaleString() : "—"}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: "right", fontWeight: 700 }}>
                        {avgPct != null ? Math.round(avgPct) + "%" : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Monthly occupied square footage; Avg Occ. is the average of the
            reported months over {rentable.toLocaleString()} rentable SF.{" "}
            {hasRR
              ? "Years marked * are filled from uploaded rent rolls."
              : "Rows for 2026 onward fill automatically as monthly rent rolls are uploaded."}
          </p>
        </>
      )}
    </div>
  );
}

// ── Base Year Breakdown ──────────────────────────────────────────────────────
// For the selected building, group occupied tenants by base-year value and
// render a horizontal bar per group (length = % of occupied SF), with the
// tenant names listed under each bar.
// Recovery Analysis: for the selected building, group occupied office
// tenants by base year and compute the CAM + RET reimbursement each
// group owes against the building's latest reported year of expenses.
// Surfaces "who's carrying the recovery" plus the upside of resetting
// a base year (= the difference between today's recoverable and zero
// if reset to the current year).
function BaseYearBreakdown({
  rrProp,
  tenantMeta,
  expenses,
}: {
  rrProp: RRProperty | null;
  tenantMeta: Record<string, { baseYear?: number | string | null }>;
  expenses: PropertyExpenses;
}) {
  const latestYear = useMemo(() => latestExpenseYear(expenses), [expenses]);

  type TenantRow = {
    unitRef: string;
    name: string;
    sqft: number;
    prsPct: number;          // tenant SF / rentable SF * 100
    cam: number;             // recoverable CAM ($/yr)
    ret: number;             // recoverable RET ($/yr)
    total: number;           // cam + ret
    numericBase: number | null;
  };
  type Group = {
    year: string;
    isNumeric: boolean;
    tenants: TenantRow[];
    sqft: number;
    prsPct: number;
    cam: number;
    ret: number;
    total: number;
  };

  const { groups, totals } = useMemo(() => {
    if (!rrProp || !latestYear) {
      return {
        groups: [] as Group[],
        totals: { cam: 0, ret: 0, total: 0, latestOpEx: 0, latestRet: 0 },
      };
    }
    const byYear = new Map<string, TenantRow[]>();
    for (const u of rrProp.units) {
      if (u.isVacant || u.amenity) continue;
      const raw = tenantMeta[u.unitRef]?.baseYear;
      const numericBase = typeof raw === "number"
        ? raw
        : (typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : null);
      const key = raw == null || raw === "" ? "Not set" : String(raw);
      const prsPct = expenses.rentableSqft > 0 ? (u.sqft / expenses.rentableSqft) * 100 : 0;
      const cam = numericBase != null
        ? (reimbursement(expenses, u.sqft, numericBase, latestYear, "opex") ?? 0)
        : 0;
      const total = numericBase != null
        ? (reimbursement(expenses, u.sqft, numericBase, latestYear, "opexRet") ?? 0)
        : 0;
      const row: TenantRow = {
        unitRef: u.unitRef,
        name: u.occupantName || u.unitRef,
        sqft: u.sqft,
        prsPct,
        cam,
        ret: Math.max(0, total - cam),
        total,
        numericBase,
      };
      const list = byYear.get(key) ?? [];
      list.push(row);
      byYear.set(key, list);
    }
    const groups: Group[] = Array.from(byYear.entries()).map(([year, tenants]) => {
      tenants.sort((a, b) => b.total - a.total);
      const sqft = tenants.reduce((s, t) => s + t.sqft, 0);
      return {
        year,
        isNumeric: /^\d+$/.test(year),
        tenants,
        sqft,
        prsPct: expenses.rentableSqft > 0 ? (sqft / expenses.rentableSqft) * 100 : 0,
        cam: tenants.reduce((s, t) => s + t.cam, 0),
        ret: tenants.reduce((s, t) => s + t.ret, 0),
        total: tenants.reduce((s, t) => s + t.total, 0),
      };
    }).sort((a, b) => {
      // Newest numeric year first; "Not set" / non-numeric at the end.
      if (a.isNumeric && b.isNumeric) return Number(b.year) - Number(a.year);
      if (a.isNumeric) return -1;
      if (b.isNumeric) return 1;
      if (a.year === "Not set") return 1;
      if (b.year === "Not set") return -1;
      return a.year.localeCompare(b.year);
    });
    const totals = groups.reduce(
      (acc, g) => ({
        cam: acc.cam + g.cam,
        ret: acc.ret + g.ret,
        total: acc.total + g.total,
        latestOpEx: expenses.opExGrossedUp[String(latestYear)] ?? 0,
        latestRet: expenses.ret[String(latestYear)] ?? 0,
      }),
      { cam: 0, ret: 0, total: 0, latestOpEx: 0, latestRet: 0 },
    );
    return { groups, totals };
  }, [rrProp, tenantMeta, expenses, latestYear]);

  const groupMaxTotal = Math.max(1, ...groups.map((g) => g.total));
  const latestExpenseTotal = totals.latestOpEx + totals.latestRet;
  const camRecoveryPct = totals.latestOpEx > 0 ? (totals.cam / totals.latestOpEx) * 100 : 0;
  const retRecoveryPct = totals.latestRet > 0 ? (totals.ret / totals.latestRet) * 100 : 0;
  const pctOfExpenses = latestExpenseTotal > 0 ? (totals.total / latestExpenseTotal) * 100 : 0;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>Recovery Analysis by Base Year</p>
      <p className="muted small" style={{ marginBottom: 14 }}>
        Pro-rata reimbursement each tenant owes against the building&rsquo;s {latestYear ?? "latest"} CAM + RET,
        grouped by current base year. INS is bundled inside CAM in the workbook,
        so it&rsquo;s captured in the CAM column.
      </p>

      {!rrProp ? (
        <p className="muted small">Loading rent roll…</p>
      ) : !latestYear ? (
        <p className="muted small">No expense history available for this building.</p>
      ) : groups.length === 0 ? (
        <p className="muted small">No occupied tenants in this building.</p>
      ) : (
        <>
          {/* Top summary — each tile shows the recoverable $ plus what
              percentage of that expense category is being recovered. */}
          <div style={{
            display: "flex", flexWrap: "wrap", justifyContent: "center",
            gap: 12, marginBottom: 18,
          }}>
            <SummaryTile
              label={`Recoverable CAM (${latestYear})`}
              value={money(totals.cam)}
              accent="#0b4a7d"
              sub={`${camRecoveryPct.toFixed(1)}% of ${money(totals.latestOpEx)} CAM`}
            />
            <SummaryTile
              label={`Recoverable RET (${latestYear})`}
              value={money(totals.ret)}
              accent="#0b4a7d"
              sub={`${retRecoveryPct.toFixed(1)}% of ${money(totals.latestRet)} RET`}
            />
            <SummaryTile
              label="Total recoverable / yr"
              value={money(totals.total)}
              accent="#16a34a"
              bold
              sub={`${pctOfExpenses.toFixed(1)}% of ${money(latestExpenseTotal)} expenses`}
            />
          </div>

          {/* Group rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {groups.map((g) => {
              const isNotSet = g.year === "Not set";
              const accent = isNotSet || !g.isNumeric ? "#64748b" : "#0b4a7d";
              const accentBg = isNotSet || !g.isNumeric ? "rgba(100,116,139,0.10)" : "rgba(11,74,125,0.10)";
              const accentBd = isNotSet || !g.isNumeric ? "rgba(100,116,139,0.30)" : "rgba(11,74,125,0.30)";
              const groupBarPct = (g.total / groupMaxTotal) * 100;
              return (
                <div key={g.year} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 14, alignItems: "start" }}>
                  <div>
                    <span style={{
                      display: "inline-block",
                      padding: "4px 10px", borderRadius: 6,
                      background: accentBg, color: accent,
                      border: `1px solid ${accentBd}`,
                      fontSize: 13, fontWeight: 800,
                      fontVariantNumeric: "tabular-nums",
                    }}>{g.year}</span>
                    <div className="muted small" style={{ marginTop: 4 }}>
                      {g.tenants.length} tenant{g.tenants.length === 1 ? "" : "s"}
                    </div>
                    <div className="muted small">
                      {g.sqft.toLocaleString()} sf · {g.prsPct.toFixed(1)}% bldg
                    </div>
                    {g.isNumeric && totals.total > 0 && (
                      <div className="muted small" style={{ marginTop: 2 }}>
                        {((g.total / totals.total) * 100).toFixed(1)}% of recoveries
                      </div>
                    )}
                  </div>
                  <div>
                    {/* Group totals row + recovery bar */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: accent, fontVariantNumeric: "tabular-nums" }}>
                        {money(g.total)} / yr
                      </span>
                      <span className="muted small" style={{ fontVariantNumeric: "tabular-nums" }}>
                        CAM {money(g.cam)}
                        {totals.cam > 0 && ` (${((g.cam / totals.cam) * 100).toFixed(1)}%)`}
                        {" · "}
                        RET {money(g.ret)}
                        {totals.ret > 0 && ` (${((g.ret / totals.ret) * 100).toFixed(1)}%)`}
                      </span>
                    </div>
                    <div style={{
                      marginTop: 6, width: "100%", height: 8, borderRadius: 999,
                      background: "rgba(15,23,42,0.06)", overflow: "hidden",
                      border: "1px solid var(--border)",
                    }}>
                      <div style={{ width: `${groupBarPct}%`, height: "100%", background: accent }} />
                    </div>
                    {!g.isNumeric && (
                      <p className="muted small" style={{ marginTop: 6 }}>
                        Recovery $ not computed — base year is {g.year === "Not set" ? "not set" : `non-numeric (${g.year})`}.
                      </p>
                    )}
                    {/* Per-tenant detail */}
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1.6fr) 60px 70px 80px 80px 90px",
                        gap: 10, alignItems: "center",
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                        textTransform: "uppercase", color: "var(--muted)",
                        padding: "0 8px",
                      }}>
                        <span>Tenant</span>
                        <span style={{ textAlign: "right" }} title="Tenant SF / building rentable SF">Bldg %</span>
                        <span style={{ textAlign: "right" }} title="Tenant's share of building-wide recovery $">Rec %</span>
                        <span style={{ textAlign: "right" }}>CAM</span>
                        <span style={{ textAlign: "right" }}>RET</span>
                        <span style={{ textAlign: "right" }}>Total</span>
                      </div>
                      {g.tenants.map((t) => {
                        const recSharePct = totals.total > 0 ? (t.total / totals.total) * 100 : 0;
                        return (
                        <div key={t.unitRef} style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1.6fr) 60px 70px 80px 80px 90px",
                          gap: 10, alignItems: "center",
                          fontSize: 12,
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: "rgba(15,23,42,0.03)",
                        }}>
                          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${t.unitRef} · ${t.sqft.toLocaleString()} sf`}>
                            {t.name}
                          </span>
                          <span className="muted" style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                            {t.prsPct.toFixed(2)}%
                          </span>
                          <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", fontWeight: 600, color: g.isNumeric && recSharePct > t.prsPct ? "#b45309" : "var(--text)" }}
                            title={g.isNumeric && recSharePct > t.prsPct ? "Carries more of recoveries than its building share" : undefined}>
                            {g.isNumeric ? `${recSharePct.toFixed(1)}%` : "—"}
                          </span>
                          <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                            {g.isNumeric ? money(t.cam) : "—"}
                          </span>
                          <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                            {g.isNumeric ? money(t.ret) : "—"}
                          </span>
                          <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", fontWeight: 700, color: accent }}>
                            {g.isNumeric ? money(t.total) : "—"}
                          </span>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  bold,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  bold?: boolean;
  sub?: string;
}) {
  return (
    <div style={{
      flex: "0 1 300px", minWidth: 220,
      padding: "10px 14px",
      borderRadius: 8,
      background: "rgba(15,23,42,0.03)",
      border: "1px solid var(--border)",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase", color: "var(--muted)",
      }}>{label}</div>
      <div style={{
        fontSize: bold ? 22 : 18, fontWeight: 800, color: accent,
        marginTop: 4, fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      {sub && <div className="muted small" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
