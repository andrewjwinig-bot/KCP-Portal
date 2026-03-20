"use client";
import { useState, useEffect, useMemo, useCallback } from "react";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type TaxCategory = "ret" | "quarterly" | "entity";

const TAX_CATEGORIES: Record<TaxCategory, { label: string; pill: string; dot: string; bg: string; text: string; border: string }> = {
  ret:       { label: "Real Estate Tax",    pill: "RET", dot: "#0b4a7d", bg: "rgba(11,74,125,0.08)",  text: "#0b4a7d", border: "rgba(11,74,125,0.25)"  },
  quarterly: { label: "Net Profits / BIRT", pill: "NP",  dot: "#b45309", bg: "rgba(180,83,9,0.08)",   text: "#b45309", border: "rgba(180,83,9,0.25)"   },
  entity:    { label: "Entity Filings",     pill: "EN",  dot: "#6d28d9", bg: "rgba(109,40,217,0.08)", text: "#6d28d9", border: "rgba(109,40,217,0.25)" },
};

// ─── TAX TASK DEFINITIONS ───────────────────────────────────────────────────

interface TaxTask {
  id: string;
  entity: string;       // full label (may include " — Q1" suffix for quarterly)
  category: TaxCategory;
  retType?: "county" | "school"; // distinguishes within RET for the filing label
  dueMonth: number;     // 1-12
  dueDay: number;       // 1-31
  notes?: string;
}

const TAX_TASKS: TaxTask[] = [

  // ─── COUNTY REAL ESTATE TAX ─────────────────────────────────────────────

  { id: "co-1500", entity: "1500 Eastwick JV I",              category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-4500", entity: "4500 Grays Ferry SC",             category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-4510", entity: "4510 Grays Ferry Partners",       category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-5600", entity: "5600 Hyman Korman Co",            category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-7010", entity: "7010 Parkwood SC",                category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-7200", entity: "7200 Elbridge",                   category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-7300", entity: "7300 Revere",                     category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-8200", entity: "8200 Trust #4",                   category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-9200", entity: "9200 Eastwick JV XI",             category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-1100", entity: "1100 Parkwood Professional Bldg", category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-9800", entity: "9800 Bellaire Ave",               category: "ret", retType: "county", dueMonth: 3,  dueDay: 31 },
  { id: "co-2070", entity: "2070 Nockamixon",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-2300", entity: "2300 Brookwood SC",               category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-0900", entity: "0900 Interplex 2-Acre Land",      category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-piic", entity: "PIIICO Condo",                    category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-3610", entity: "3610 Building 1",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-2620", entity: "2620 Building 1",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-3640", entity: "3640 Building 4",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-4050", entity: "4050 Building 5",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-4060", entity: "4060 Building 6",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-4070", entity: "4070 Building 7",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-4080", entity: "4080 Building 8",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-40a0", entity: "40A0 Kor Center",                 category: "ret", retType: "county", dueMonth: 4,  dueDay: 30 },
  { id: "co-9840", entity: "9840 3044 Joshua Rd",             category: "ret", retType: "county", dueMonth: 5,  dueDay: 1,  notes: "Berkheimer sends bill" },
  { id: "co-9510", entity: "9510 Lafayette Hill SC",          category: "ret", retType: "county", dueMonth: 5,  dueDay: 1,  notes: "Berkheimer sends bill" },

  // ─── SCHOOL REAL ESTATE TAX ─────────────────────────────────────────────

  { id: "sc-2070", entity: "2070 Nockamixon",                 category: "ret", retType: "school", dueMonth: 8,  dueDay: 31 },
  { id: "sc-9800", entity: "9800 Bellaire Ave",               category: "ret", retType: "school", dueMonth: 9,  dueDay: 2  },
  { id: "sc-9840", entity: "9840 3044 Joshua Rd",             category: "ret", retType: "school", dueMonth: 9,  dueDay: 2,  notes: "Berkheimer sends bill" },
  { id: "sc-9510", entity: "9510 Lafayette Hill SC",          category: "ret", retType: "school", dueMonth: 9,  dueDay: 2,  notes: "Berkheimer sends bill" },
  { id: "sc-2300", entity: "2300 Brookwood SC",               category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-0900", entity: "0900 Interplex 2-Acre Land",      category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-piic", entity: "PIIICO Condo",                    category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-3610", entity: "3610 Building 1",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-2620", entity: "2620 Building 1",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-3640", entity: "3640 Building 4",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-4050", entity: "4050 Building 5",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-4060", entity: "4060 Building 6",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-4070", entity: "4070 Building 7",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-4080", entity: "4080 Building 8",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-40a0", entity: "40A0 Kor Center",                 category: "ret", retType: "school", dueMonth: 9,  dueDay: 10 },
  { id: "sc-7200", entity: "7200 Elbridge",                   category: "ret", retType: "school", dueMonth: 9,  dueDay: 15 },
  { id: "sc-7300", entity: "7300 Revere",                     category: "ret", retType: "school", dueMonth: 9,  dueDay: 15 },
  { id: "sc-8200", entity: "8200 Trust #4",                   category: "ret", retType: "school", dueMonth: 9,  dueDay: 15 },

  // ─── NET PROFITS TAX / BIRT ──────────────────────────────────────────────

  { id: "np-0800-q1", entity: "0800 Bellmawr — Q1", category: "quarterly", dueMonth: 2,  dueDay: 1, notes: "Net Profits Tax — pay online" },
  { id: "np-0800-q2", entity: "0800 Bellmawr — Q2", category: "quarterly", dueMonth: 5,  dueDay: 1, notes: "Net Profits Tax — pay online" },
  { id: "np-0800-q3", entity: "0800 Bellmawr — Q3", category: "quarterly", dueMonth: 8,  dueDay: 1, notes: "Net Profits Tax — pay online" },
  { id: "np-0800-q4", entity: "0800 Bellmawr — Q4", category: "quarterly", dueMonth: 11, dueDay: 1, notes: "Net Profits Tax — pay online" },

  // ─── ENTITY / STATUTORY FILINGS ─────────────────────────────────────────

  { id: "ent-nim-jun",  entity: "Neshaminy Interplex, MM, LP (DE)", category: "entity", dueMonth: 6,  dueDay: 1, notes: "File #5404613" },
  { id: "ent-nil-jun",  entity: "Neshaminy Interplex LLC (DE)",     category: "entity", dueMonth: 6,  dueDay: 1, notes: "File #5404612" },
  { id: "ent-0800-nov", entity: "0800 Bellmawr JV, LLP (NJ)",       category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9400392779" },
  { id: "ent-nim-nov",  entity: "Neshaminy Interplex, MM, LP (DE)", category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9401222288" },
  { id: "ent-nil-nov",  entity: "Neshaminy Interplex LLC (DE)",     category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9401231147" },
  { id: "ent-2010-nov", entity: "2010 LIK Management, Inc. (PA)",   category: "entity", dueMonth: 11, dueDay: 1, notes: "LP/LLC/GP Annual Tax — pay online via CT Corp · Acc 9400393039" },
];

// ─── STORAGE ────────────────────────────────────────────────────────────────

function storageKey(year: number) { return `tax-tracker-v1-${year}`; }
function loadChecked(year: number): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(storageKey(year)) ?? "{}"); }
  catch { return {}; }
}
function saveChecked(year: number, data: Record<string, boolean>) {
  localStorage.setItem(storageKey(year), JSON.stringify(data));
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

// Strip " — Q1/Q2/Q3/Q4" so quarterly items group under their property
function baseEntityName(entity: string): string {
  return entity.replace(/ — Q[1-4]$/, "");
}

// Return "Q1" / "Q2" etc. if present, else null
function quarterSuffix(entity: string): string | null {
  const m = entity.match(/ — (Q[1-4])$/);
  return m ? m[1] : null;
}

// Short label shown next to the pill in each filing row
function filingLabel(t: TaxTask): string {
  if (t.category === "ret") {
    return t.retType === "school" ? "School Real Estate Tax" : "County Real Estate Tax";
  }
  if (t.category === "quarterly") {
    const q = quarterSuffix(t.entity);
    return q ? `Net Profits Tax — ${q}` : "Net Profits Tax";
  }
  return "Entity Filing";
}

function isPastDate(year: number, month: number, day: number, today: Date) {
  const dt = new Date(year, month - 1, day);
  dt.setHours(23, 59, 59);
  return dt < today;
}
function isTodayDate(year: number, month: number, day: number, today: Date) {
  return month === today.getMonth() + 1 && day === today.getDate() && year === today.getFullYear();
}
function isSoonDate(year: number, month: number, day: number, today: Date) {
  const dt = new Date(year, month - 1, day);
  const ms = dt.getTime() - today.getTime();
  return ms > 0 && ms <= 3 * 24 * 60 * 60 * 1000;
}

// ─── PAGE ───────────────────────────────────────────────────────────────────

export default function TaxTrackerPage() {
  const today = new Date();
  const [viewYear,    setViewYear]    = useState(today.getFullYear());
  const [checked,     setChecked]     = useState<Record<string, boolean>>({});
  const [filterCat,   setFilterCat]   = useState<TaxCategory | "all">("all");
  const [filterMonth, setFilterMonth] = useState<number | "all">("all");

  useEffect(() => { setChecked(loadChecked(viewYear)); }, [viewYear]);

  const toggle = useCallback((id: string) => {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveChecked(viewYear, next);
      return next;
    });
  }, [viewYear]);

  const visible = useMemo(() =>
    TAX_TASKS.filter(t => {
      if (filterCat   !== "all" && t.category !== filterCat)   return false;
      if (filterMonth !== "all" && t.dueMonth !== filterMonth) return false;
      return true;
    }),
    [filterCat, filterMonth]
  );

  // Build flat property → tasks map (preserving data-defined entity order)
  const byProperty = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, TaxTask[]> = {};
    visible.forEach(t => {
      const base = baseEntityName(t.entity);
      if (!map[base]) { map[base] = []; order.push(base); }
      map[base].push(t);
    });
    // Sort filings within each property by due date
    order.forEach(prop => {
      map[prop].sort((a, b) =>
        a.dueMonth !== b.dueMonth ? a.dueMonth - b.dueMonth : a.dueDay - b.dueDay
      );
    });
    return { order, map };
  }, [visible]);

  // Stats
  const total   = TAX_TASKS.length;
  const done    = TAX_TASKS.filter(t => checked[t.id]).length;
  const overdue = TAX_TASKS.filter(t => !checked[t.id] && isPastDate(viewYear, t.dueMonth, t.dueDay, today)).length;

  // Months that have tasks (for quick filter pills)
  const activeMonths = useMemo(() => {
    const ms = new Set<number>();
    TAX_TASKS.forEach(t => {
      if (filterCat === "all" || t.category === filterCat) ms.add(t.dueMonth);
    });
    return Array.from(ms).sort((a, b) => a - b);
  }, [filterCat]);

  function statusFor(t: TaxTask) {
    if (checked[t.id])
      return { label: "✓ Filed",   color: "#16a34a", bg: "rgba(22,163,74,0.08)",  border: "rgba(22,163,74,0.2)"  };
    if (isPastDate(viewYear, t.dueMonth, t.dueDay, today))
      return { label: "Overdue",   color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.2)" };
    if (isTodayDate(viewYear, t.dueMonth, t.dueDay, today))
      return { label: "Due today", color: "#ea580c", bg: "rgba(234,88,12,0.08)", border: "rgba(234,88,12,0.2)" };
    if (isSoonDate(viewYear, t.dueMonth, t.dueDay, today))
      return { label: "Due soon",  color: "#d97706", bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.2)"  };
    return {
      label: `${MONTH_NAMES[t.dueMonth - 1]} ${t.dueDay}`,
      color: "var(--muted)", bg: "rgba(0,0,0,0.04)", border: "var(--border)",
    };
  }

  return (
    <main>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 4 }}>
            Tax Filing Tracker
          </h1>
          <p className="muted small">County &amp; school RE taxes · net profits / BIRT · entity filings</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </div>

      {/* ── Summary pills ────────────────────────────────────────────────── */}
      <div className="pills" style={{ justifyContent: "flex-start", marginBottom: 16 }}>
        <div className="pill">
          <b>{total}</b>
          <span className="muted small">Total filings</span>
        </div>
        <div className="pill" style={{ borderColor: "#16a34a", background: "rgba(22,163,74,0.06)" }}>
          <b style={{ color: "#16a34a" }}>{done}</b>
          <span className="muted small">Filed</span>
        </div>
        <div className="pill">
          <b>{total - done}</b>
          <span className="muted small">Remaining</span>
        </div>
        {overdue > 0 && (
          <div className="pill" style={{ borderColor: "#dc2626", background: "rgba(220,38,38,0.06)" }}>
            <b style={{ color: "#dc2626" }}>{overdue}</b>
            <span className="muted small">Overdue</span>
          </div>
        )}
        {total > 0 && (
          <div className="pill pill-total">
            <b>{Math.round((done / total) * 100)}%</b>
            <span className="muted small">Complete</span>
          </div>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {total > 0 && (
        <div style={{ height: 6, background: "var(--border)", borderRadius: 999, marginBottom: 22, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${(done / total) * 100}%`,
            background: done === total ? "#16a34a" : "var(--brand)",
            borderRadius: 999, transition: "width 0.3s ease",
          }} />
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 22, alignItems: "flex-start" }}>

        {/* Year nav */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 7 }}>YEAR</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className="btn" onClick={() => setViewYear(y => y - 1)} style={{ padding: "5px 11px", fontWeight: 900 }}>←</button>
            <span style={{ fontWeight: 800, fontSize: 14, minWidth: 42, textAlign: "center" }}>{viewYear}</span>
            <button className="btn" onClick={() => setViewYear(y => y + 1)} style={{ padding: "5px 11px", fontWeight: 900 }}>→</button>
            {viewYear !== today.getFullYear() && (
              <button className="btn" onClick={() => setViewYear(today.getFullYear())} style={{ fontSize: 12, padding: "5px 10px" }}>
                This Year
              </button>
            )}
          </div>
        </div>

        {/* Category filter */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 7 }}>TYPE</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.entries(TAX_CATEGORIES) as [TaxCategory, typeof TAX_CATEGORIES[TaxCategory]][]).map(([key, cat]) => {
              const active = filterCat === key;
              const count  = TAX_TASKS.filter(t => t.category === key).length;
              const catDone = TAX_TASKS.filter(t => t.category === key && checked[t.id]).length;
              return (
                <button key={key} onClick={() => setFilterCat(active ? "all" : key)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 11px",
                  border: `1px solid ${active ? cat.border : "var(--border)"}`,
                  borderRadius: 999, cursor: "pointer",
                  background: active ? cat.bg : "#fff",
                  fontFamily: "inherit", fontSize: 12, fontWeight: active ? 700 : 500,
                  color: active ? cat.text : "var(--text)",
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                    color: active ? cat.text : "#fff",
                    background: active ? "#fff" : cat.dot,
                    border: `1px solid ${cat.border}`,
                    padding: "1px 5px", borderRadius: 999,
                  }}>{cat.pill}</span>
                  {cat.label}
                  <span style={{ fontSize: 11, color: active ? cat.text : "var(--muted)", opacity: 0.8 }}>
                    {catDone}/{count}
                  </span>
                </button>
              );
            })}
            {filterCat !== "all" && (
              <button className="btn" onClick={() => setFilterCat("all")} style={{ fontSize: 12, padding: "5px 11px" }}>Clear</button>
            )}
          </div>
        </div>

        {/* Month filter */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 7 }}>MONTH</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {activeMonths.map(m => {
              const active = filterMonth === m;
              return (
                <button key={m} onClick={() => setFilterMonth(active ? "all" : m)} style={{
                  padding: "5px 11px",
                  border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                  borderRadius: 999, cursor: "pointer",
                  background: active ? "rgba(11,74,125,0.08)" : "#fff",
                  fontFamily: "inherit", fontSize: 12, fontWeight: active ? 700 : 500,
                  color: active ? "var(--brand)" : "var(--text)",
                }}>
                  {MONTHS[m - 1]}
                </button>
              );
            })}
            {filterMonth !== "all" && (
              <button className="btn" onClick={() => setFilterMonth("all")} style={{ fontSize: 12, padding: "5px 11px" }}>Clear</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Flat property list ───────────────────────────────────────────── */}
      {byProperty.order.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>No filings match the current filter</div>
          <div className="muted small">Try clearing the filters above</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {byProperty.order.map((propName, pi) => {
            const propTasks = byProperty.map[propName];
            const propDone  = propTasks.filter(t => checked[t.id]).length;
            const allFiled  = propDone === propTasks.length;
            const isLast    = pi === byProperty.order.length - 1;

            return (
              <div key={propName} style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}>

                {/* Property name row */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 18px",
                  background: allFiled ? "rgba(22,163,74,0.04)" : "rgba(0,0,0,0.025)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <span style={{
                    fontWeight: 700, fontSize: 13,
                    color: allFiled ? "var(--muted)" : "var(--text)",
                    textDecoration: allFiled ? "line-through" : "none",
                  }}>
                    {propName}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                    {propDone}/{propTasks.length}
                  </span>
                </div>

                {/* Filing rows */}
                {propTasks.map((task, ti) => {
                  const cat    = TAX_CATEGORIES[task.category];
                  const status = statusFor(task);
                  const isDone = !!checked[task.id];
                  const isOver = !isDone && isPastDate(viewYear, task.dueMonth, task.dueDay, today);

                  return (
                    <div
                      key={task.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 18px 10px 34px",
                        borderBottom: ti === propTasks.length - 1 ? "none" : "1px solid var(--border)",
                        background: isDone ? "rgba(22,163,74,0.025)" : isOver ? "rgba(220,38,38,0.025)" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggle(task.id)}
                        style={{ width: 15, height: 15, accentColor: cat.dot, flexShrink: 0, cursor: "pointer" }}
                      />

                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
                        color: cat.text, background: cat.bg,
                        border: `1px solid ${cat.border}`,
                        padding: "2px 6px", borderRadius: 999, flexShrink: 0,
                        opacity: isDone ? 0.5 : 1,
                      }}>
                        {cat.pill}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 500,
                          color: isDone ? "var(--muted)" : "var(--text)",
                          textDecoration: isDone ? "line-through" : "none",
                        }}>
                          {filingLabel(task)}
                        </span>
                        {task.notes && (
                          <div className="muted small" style={{ marginTop: 2 }}>{task.notes}</div>
                        )}
                      </div>

                      <span style={{
                        fontSize: 11, fontWeight: 800,
                        color: status.color, background: status.bg,
                        border: `1px solid ${status.border}`,
                        padding: "3px 9px", borderRadius: 999,
                        whiteSpace: "nowrap", flexShrink: 0,
                      }}>
                        {status.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
