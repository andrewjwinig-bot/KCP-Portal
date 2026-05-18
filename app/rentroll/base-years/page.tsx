"use client";

import { useEffect, useMemo, useState } from "react";
import {
  OFFICE_BUILDINGS,
  SEED_EXPENSES,
  expenseYears,
  latestExpenseYear,
  reimbursement,
  type BaseYearBasis,
  type PropertyExpenses,
} from "@/lib/rentroll/baseYearExpenses";
import { StatPill } from "@/app/components/Pill";

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

const selectStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: 14,
  fontWeight: 700,
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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  const [snapshots, setSnapshots] = useState<RRSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const [basis, setBasis] = useState<BaseYearBasis>("opexRet");
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [resetYear, setResetYear] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/rentroll").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/tenant-meta").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/rentroll/history").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([rrJ, tmJ, histJ]) => {
        setRrProps(rrJ?.rentroll?.properties ?? []);
        setTenantMeta(tmJ?.tenantMeta ?? {});
        setSnapshots(histJ?.snapshots ?? []);
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

  return (
    <main>
      <h1>Base Year Expenses</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
        Office operating-expense history by year and the recovery impact of
        resetting a tenant&rsquo;s base year forward.
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

// ── summary ($/SF, last 5 years) ─────────────────────────────────────────────

function SummaryTable({ expenses }: { expenses: PropertyExpenses }) {
  const [mode, setMode] = useState<"total" | "gross" | "psf">("psf");
  const last5 = expenseYears(expenses).slice(-5).reverse();
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
              {last5.map((y) => (
                <th key={y} style={{ textAlign: "right" }}>{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td style={{ fontWeight: r.total ? 800 : 700 }}>{r.label}</td>
                {last5.map((y) => (
                  <td key={y} style={{ textAlign: "right", fontWeight: r.total ? 800 : undefined }}>
                    {fmt(r.get(String(y)))}
                  </td>
                ))}
              </tr>
            ))}
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

// ── reset-impact calculator (single tenant) ──────────────────────────────────

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
  const [selUnit, setSelUnit] = useState("");
  const selected = rows.find((t) => t.unitRef === selUnit) ?? rows[0] ?? null;

  const result = useMemo(() => {
    if (!selected || selected.baseYearNum == null) return null;
    const now = reimbursement(expenses, selected.sqft, selected.baseYearNum, cy, basis);
    const after = reimbursement(expenses, selected.sqft, ry, cy, basis);
    return {
      now,
      after,
      share: (selected.sqft / expenses.rentableSqft) * 100,
      delta: now != null && after != null ? after - now : null,
    };
  }, [selected, expenses, cy, ry, basis]);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={SECTION_LABEL}>Base Year Reset Impact</div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
        <label>
          <div style={{ ...SECTION_LABEL, marginBottom: 5 }}>Tenant</div>
          <select
            value={selected?.unitRef ?? ""}
            onChange={(e) => setSelUnit(e.target.value)}
            style={{ ...selectStyle, maxWidth: 320 }}
            disabled={rows.length === 0}
          >
            {rows.length === 0 && <option value="">No tenants</option>}
            {rows.map((t) => (
              <option key={t.unitRef} value={t.unitRef}>
                {t.name} — Unit {t.unitRef} (base {t.baseYearNum})
              </option>
            ))}
          </select>
        </label>
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

      {/* Result */}
      {loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Loading rent roll…</p>
      ) : !hasRentRoll ? (
        <p className="muted" style={{ marginTop: 16 }}>
          No rent roll loaded for this building — upload a rent roll to pick a tenant.
        </p>
      ) : !selected || !result ? (
        <p className="muted" style={{ marginTop: 16 }}>
          No tenants with a numeric base year found for this building.
        </p>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{selected.name}</div>
          <div className="small muted" style={{ marginTop: 2 }}>
            Unit {selected.unitRef} · {selected.sqft.toLocaleString()} SF ·{" "}
            {pct1(result.share)} pro-rata share · current base year {selected.baseYearNum}
          </div>

          <div className="pills" style={{ marginTop: 12 }}>
            <StatPill
              label={`Reimbursement — base ${selected.baseYearNum}`}
              value={result.now != null ? money(result.now) : "—"}
              sub={`vs ${cy} expenses`}
            />
            <StatPill
              label={`If reset to base ${ry}`}
              value={result.after != null ? money(result.after) : "—"}
              sub={`vs ${cy} expenses`}
            />
            <StatPill
              label="Δ Annual Recovery"
              value={result.delta != null ? signedMoney(result.delta) : "—"}
              accent={
                result.delta == null
                  ? undefined
                  : result.delta < 0
                    ? "#b91c1c"
                    : result.delta > 0
                      ? "#15803d"
                      : undefined
              }
            />
          </div>

          {result.delta != null && result.delta !== 0 && selected.baseYearNum !== ry && (
            <p className="small" style={{ marginTop: 12 }}>
              Resetting {selected.name}&rsquo;s base year from {selected.baseYearNum} to{" "}
              {ry} {result.delta < 0 ? "reduces" : "increases"} annual expense
              recovery by{" "}
              <b style={{ color: result.delta < 0 ? "#b91c1c" : "#15803d" }}>
                {money(Math.abs(result.delta))}
              </b>
              .
            </p>
          )}
          {selected.baseYearNum === ry && (
            <p className="small muted" style={{ marginTop: 12 }}>
              Tenant is already on base year {ry} — no change.
            </p>
          )}
        </div>
      )}

      <p className="small muted" style={{ marginTop: 12 }}>
        Reimbursement is computed per GL line on the{" "}
        {basis === "opexRet" ? "95%-grossed-up Op Ex plus RE taxes" : "95%-grossed-up Op Ex"}:
        the tenant owes its pro-rata share of each line&rsquo;s {cy} amount above
        its base-year amount, each line floored at zero. A negative Δ is
        recovery the landlord gives up.
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
