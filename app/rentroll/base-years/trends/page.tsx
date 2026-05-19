"use client";

import { useMemo, useState } from "react";
import {
  OFFICE_BUILDINGS,
  SEED_EXPENSES,
  expenseYears,
  grossedUpLines,
  type PropertyExpenses,
} from "@/lib/rentroll/baseYearExpenses";

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

const PALETTE = [
  "#0b4a7d", "#d97706", "#16a34a", "#7c3aed", "#db2777", "#0d9488",
  "#b91c1c", "#a16207", "#2563eb", "#65a30d", "#c026d3", "#0891b2",
  "#9333ea", "#ea580c",
];

function moneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

type Series = { label: string; color: string; values: (number | null)[] };

export default function ExpenseTrendsPage() {
  const [propCode, setPropCode] = useState("3610");
  const expenses: PropertyExpenses | null = SEED_EXPENSES[propCode] ?? null;
  const meta = OFFICE_BUILDINGS.find((b) => b.code === propCode);
  const years = useMemo(() => (expenses ? expenseYears(expenses) : []), [expenses]);

  const totalsSeries: Series[] = useMemo(() => {
    if (!expenses) return [];
    const at = (rec: Record<string, number>, y: number) => rec[String(y)] ?? null;
    return [
      { label: "CAM (Op Ex 95%)", color: "#0b4a7d", values: years.map((y) => at(expenses.opExGrossedUp, y)) },
      { label: "RE Taxes", color: "#d97706", values: years.map((y) => at(expenses.ret, y)) },
      {
        label: "Total (CAM + RET)",
        color: "#16a34a",
        values: years.map((y) => {
          const og = expenses.opExGrossedUp[String(y)];
          return og != null ? og + (expenses.ret[String(y)] ?? 0) : null;
        }),
      },
    ];
  }, [expenses, years]);

  const categorySeries: Series[] = useMemo(() => {
    if (!expenses) return [];
    return grossedUpLines(expenses).map((line, i) => ({
      label: line.label,
      color: PALETTE[i % PALETTE.length],
      values: years.map((y) => line.values[String(y)] ?? null),
    }));
  }, [expenses, years]);

  const occupancySeries: Series[] = useMemo(() => {
    if (!expenses) return [];
    return [
      {
        label: "Avg. Occupancy",
        color: "#0d9488",
        values: years.map((y) => expenses.occupancyPct[String(y)] ?? null),
      },
    ];
  }, [expenses, years]);

  return (
    <main>
      <h1>Expense Trends</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
        Operating expenses and occupancy charted over time for the office
        buildings. See the underlying figures on{" "}
        <a href="/rentroll/base-years" style={{ color: "var(--brand)", fontWeight: 700 }}>
          Operating Expense History
        </a>.
      </p>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={SECTION_LABEL}>Building</span>
        <select value={propCode} onChange={(e) => setPropCode(e.target.value)} style={selectStyle}>
          {OFFICE_BUILDINGS.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name} (#{b.code}){SEED_EXPENSES[b.code] ? "" : " — no data"}
            </option>
          ))}
        </select>
      </div>

      {!expenses ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ fontWeight: 700 }}>{meta?.name ?? propCode} — no expense history loaded</p>
          <p className="muted" style={{ marginTop: 6 }}>
            Once this building&rsquo;s workbook is loaded, its trends appear here.
          </p>
        </div>
      ) : (
        <>
          <LineChart
            title="Total Operating Expenses"
            sub="95%-grossed-up Op Ex and RE taxes by year"
            years={years}
            series={totalsSeries}
            fmtY={moneyShort}
          />
          <LineChart
            title="Expenses by Category"
            sub="each grossed-up GL line by year — click a legend item to show / hide"
            years={years}
            series={categorySeries}
            fmtY={moneyShort}
          />
          <LineChart
            title="Average Occupancy"
            sub="annual average occupancy by year"
            years={years}
            series={occupancySeries}
            fmtY={(v) => `${Math.round(v)}%`}
            yMax={100}
          />
        </>
      )}
    </main>
  );
}

// ── SVG line chart ───────────────────────────────────────────────────────────

function LineChart({
  title,
  sub,
  years,
  series,
  fmtY,
  yMax,
}: {
  title: string;
  sub?: string;
  years: number[];
  series: Series[];
  fmtY: (v: number) => string;
  yMax?: number;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const W = 820, H = 300;
  const padL = 62, padR = 16, padT = 16, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const visible = series.filter((s) => !hidden.has(s.label));
  const allVals = visible.flatMap((s) => s.values.filter((v): v is number => v != null));
  const max = yMax ?? Math.max(0.001, ...allVals);

  const xs = (i: number) =>
    years.length <= 1 ? padL + innerW / 2 : padL + (i / (years.length - 1)) * innerW;
  const ys = (v: number) => padT + innerH - (Math.min(Math.max(v, 0), max) / max) * innerH;

  function pathFor(values: (number | null)[]): string {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  }

  const xEvery = Math.max(1, Math.ceil(years.length / 12));

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
        {sub && <div className="small muted">{sub}</div>}
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible", marginTop: 8 }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = max * f;
          return (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={ys(v)} y2={ys(v)} stroke="rgba(15,23,42,0.08)" />
              <text x={padL - 6} y={ys(v) + 4} fontSize={10} fill="var(--muted)" textAnchor="end">
                {fmtY(v)}
              </text>
            </g>
          );
        })}
        {years.map((y, i) =>
          i % xEvery === 0 || i === years.length - 1 ? (
            <text key={y} x={xs(i)} y={H - padB + 16} fontSize={10} fill="var(--muted)" textAnchor="middle">
              {y}
            </text>
          ) : null,
        )}
        {visible.map((s) => (
          <g key={s.label}>
            <path d={pathFor(s.values)} fill="none" stroke={s.color} strokeWidth={2.5} />
            {s.values.map((v, i) =>
              v != null ? (
                <circle key={i} cx={xs(i)} cy={ys(v)} r={3} fill={s.color} stroke="#fff" strokeWidth={1.2}>
                  <title>{`${s.label} · ${years[i]} · ${fmtY(v)}`}</title>
                </circle>
              ) : null,
            )}
          </g>
        ))}
      </svg>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 10 }}>
        {series.map((s) => {
          const off = hidden.has(s.label);
          return (
            <button
              key={s.label}
              onClick={() =>
                setHidden((h) => {
                  const n = new Set(h);
                  if (n.has(s.label)) n.delete(s.label);
                  else n.add(s.label);
                  return n;
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                opacity: off ? 0.4 : 1,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, textDecoration: off ? "line-through" : undefined }}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
