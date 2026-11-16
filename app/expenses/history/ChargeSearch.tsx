"use client";
// Search every saved credit-card charge at once (owner: "let me sort and filter
// historic charges in periods to help find something specific"). The statement
// cards below show one month at a time; this is the whole archive in one
// table: a period range, a text search, category / property / card member /
// amount filters, every column sortable, and the total of what is showing.

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, Search, X } from "lucide-react";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { newWorkbook, headerBand, FMT, liveSum, titleBlock, freezeAbove, totalEmphasis } from "@/lib/excel/theme";

export type Charge = {
  statementId: string;
  statementMonth: string;
  periodText: string;
  date: string;
  cardMember: string;
  description: string;
  codedDescription: string;
  category: string;
  propertyId: string;
  suite: string;
  amount: number;
};

type SortKey = "statement" | "date" | "cardMember" | "description" | "category" | "propertyId" | "amount";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHOW_MAX = 500;

/** "2026-08" gives "Aug 2026"; anything else falls back to the statement's text. */
export function periodLabel(month: string, text?: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month || "");
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (text || month || "—");
}

/** Figures: no $ in cells, negatives in (parens), zero as an em dash. */
function fig(n: number): string {
  if (!n) return "—";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
}
const dollars = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso || "—";
}

/** The filter logic, pure so it can be tested. */
export function filterCharges(all: Charge[], f: {
  from: string; to: string; q: string; category: string; property: string; member: string; min: string; max: string;
}): Charge[] {
  const q = f.q.trim().toLowerCase();
  const min = f.min.trim() === "" ? null : Number(f.min.replace(/[$,]/g, ""));
  const max = f.max.trim() === "" ? null : Number(f.max.replace(/[$,]/g, ""));
  return all.filter((c) => {
    if (f.from && c.statementMonth && c.statementMonth < f.from) return false;
    if (f.to && c.statementMonth && c.statementMonth > f.to) return false;
    if (f.category && c.category !== f.category) return false;
    if (f.property && c.propertyId !== f.property) return false;
    if (f.member && c.cardMember !== f.member) return false;
    if (min != null && Number.isFinite(min) && Math.abs(c.amount) < min) return false;
    if (max != null && Number.isFinite(max) && Math.abs(c.amount) > max) return false;
    if (q) {
      const hay = `${c.description} ${c.codedDescription} ${c.cardMember} ${c.category} ${c.propertyId} ${c.suite} ${c.amount.toFixed(2)}`.toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export function ChargeSearch({ onlyMember }: { onlyMember?: (c: Charge) => boolean }) {
  const [all, setAll] = useState<Charge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [property, setProperty] = useState("");
  const [member, setMember] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });

  useEffect(() => {
    fetch("/api/statements?charges=1")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load the charges (${r.status}).`))))
      .then((d) => setAll(Array.isArray(d?.charges) ? d.charges : []))
      .catch((e) => setError(e?.message ?? "Could not load the charges."));
  }, []);

  const visible = useMemo(() => (all ?? []).filter((c) => (onlyMember ? onlyMember(c) : true)), [all, onlyMember]);
  const months = useMemo(() => [...new Set(visible.map((c) => c.statementMonth).filter((m) => /^\d{4}-\d{2}/.test(m)))].sort(), [visible]);
  const opts = (k: keyof Charge) => [...new Set(visible.map((c) => String(c[k] ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categories = useMemo(() => opts("category"), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const properties = useMemo(() => opts("propertyId"), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const members = useMemo(() => opts("cardMember"), [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const f = filterCharges(visible, { from, to, q, category, property, member, min, max });
    const val = (c: Charge): string | number => {
      switch (sort.key) {
        case "statement": return c.statementMonth;
        case "date": return c.date;
        case "amount": return c.amount;
        case "description": return (c.codedDescription || c.description).toLowerCase();
        default: return String(c[sort.key] ?? "").toLowerCase();
      }
    };
    return [...f].sort((a, b) => {
      const x = val(a), y = val(b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return r === 0 ? b.date.localeCompare(a.date) : r * sort.dir;
    });
  }, [visible, from, to, q, category, property, member, min, max, sort]);

  const total = rows.reduce((a, c) => a + c.amount, 0);
  const filtered = !!(from || to || q || category || property || member || min || max);
  const clear = () => { setFrom(""); setTo(""); setQ(""); setCategory(""); setProperty(""); setMember(""); setMin(""); setMax(""); };

  const head = (key: SortKey, label: string, left = true) => {
    const on = sort.key === key;
    const Icon = on && sort.dir === 1 ? ChevronUp : ChevronDown;
    return (
      <th style={{ ...(left ? thL : th), cursor: "pointer", userSelect: "none" }}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "amount" || key === "date" || key === "statement" ? -1 : 1 }))}
        aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: on ? "var(--text)" : undefined }}>
          {label}
          <Icon size={16} strokeWidth={1.75} aria-hidden style={{ opacity: on ? 1 : 0.25 }} />
        </span>
      </th>
    );
  };

  async function exportRows() {
    const wb = newWorkbook();
    const ws = wb.addWorksheet("Charges");
    ws.columns = [{ width: 12 }, { width: 12 }, { width: 20 }, { width: 40 }, { width: 40 }, { width: 18 }, { width: 10 }, { width: 8 }, { width: 14 }];
    const range = from || to ? `${periodLabel(from || months[0] || "")} – ${periodLabel(to || months[months.length - 1] || "")}` : "All statements";
    let r = titleBlock(ws, { entity: "Korman Commercial Properties", document: "Credit Card Charges", asOf: range, meta: q ? [`Search: ${q}`] : [], width: 9 });
    r++;
    headerBand(ws, r, ["Statement", "Date", "Card Member", "Description", "Invoice Description", "Category", "Property", "Suite", "Amount"]);
    const first = ++r;
    for (const c of rows) {
      const row = ws.getRow(r++);
      row.values = [periodLabel(c.statementMonth, c.periodText), fmtDate(c.date), c.cardMember, c.description, c.codedDescription, c.category, c.propertyId, c.suite, c.amount];
      row.getCell(9).numFmt = FMT.moneyCents;
    }
    const tr = ws.getRow(r);
    tr.getCell(1).value = "Total";
    tr.getCell(9).value = rows.length ? liveSum(`I${first}:I${r - 1}`, total, rows.map((c) => c.amount)) : 0;
    tr.getCell(9).numFmt = FMT.moneyCents;
    totalEmphasis(tr.getCell(1), { grand: true });
    totalEmphasis(tr.getCell(9), { grand: true });
    freezeAbove(ws, first);
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Credit Card Charges${q ? ` - ${q}` : ""}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const field: React.CSSProperties = { display: "grid", gap: 4, fontSize: "var(--fs-13)", color: "var(--muted)", fontWeight: 600 };

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <b style={{ fontSize: 17 }}>Search Charges</b>
        <div style={{ display: "flex", gap: 8 }}>
          {filtered && <button className="btn sm" onClick={clear}><X size={16} strokeWidth={1.75} aria-hidden /> Clear filters</button>}
          <button className="btn sm" onClick={exportRows} disabled={!rows.length}><Download size={16} strokeWidth={1.75} aria-hidden /> Export</button>
        </div>
      </div>

      {error && <div className="small" style={{ color: "var(--c-b42318)", marginTop: 10 }}>{error}</div>}

      <div className="entry-form" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 14 }}>
        <label style={{ ...field, gridColumn: "span 2" }}>
          Search
          <span style={{ position: "relative", display: "block" }}>
            <Search size={16} strokeWidth={1.75} aria-hidden style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Merchant, description, amount…" style={{ width: "100%", paddingLeft: 36 }} />
          </span>
        </label>
        <label style={field}>From
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Earliest</option>
            {months.map((m) => <option key={m} value={m}>{periodLabel(m)}</option>)}
          </select>
        </label>
        <label style={field}>To
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Latest</option>
            {months.map((m) => <option key={m} value={m}>{periodLabel(m)}</option>)}
          </select>
        </label>
        <label style={field}>Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={field}>Property
          <select value={property} onChange={(e) => setProperty(e.target.value)}>
            <option value="">All</option>
            {properties.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {members.length > 1 && (
          <label style={field}>Card Member
            <select value={member} onChange={(e) => setMember(e.target.value)}>
              <option value="">All</option>
              {members.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        <label style={field}>Min $
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="0" style={{ width: "100%" }} />
        </label>
        <label style={field}>Max $
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="Any" style={{ width: "100%" }} />
        </label>
      </div>

      <div className="small muted" style={{ marginTop: 12 }}>
        {all == null && !error ? "Loading every saved statement…"
          : `${rows.length.toLocaleString()} of ${visible.length.toLocaleString()} charges · ${dollars(total)}`}
      </div>

      {all != null && rows.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                {head("statement", "Statement")}
                {head("date", "Date")}
                {head("cardMember", "Card Member")}
                {head("description", "Description")}
                {head("category", "Category")}
                {head("propertyId", "Property")}
                {head("amount", "Amount", false)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, SHOW_MAX).map((c, i) => (
                <tr key={`${c.statementId}-${i}`} style={{ borderBottom: "1px solid var(--hairline)" }}>
                  <td style={tdL}>{periodLabel(c.statementMonth, c.periodText)}</td>
                  <td style={tdL}>{fmtDate(c.date)}</td>
                  <td style={tdL}>{c.cardMember}</td>
                  <td style={{ ...tdL, whiteSpace: "normal", minWidth: 260 }}>
                    <div style={{ fontWeight: 600 }}>{c.description}</div>
                    {c.codedDescription && c.codedDescription !== c.description && <div className="muted" style={{ fontSize: "var(--fs-13)" }}>{c.codedDescription}</div>}
                  </td>
                  <td style={tdL}>{c.category || "—"}</td>
                  <td style={tdL}><code>{c.propertyId || "—"}</code>{c.suite ? <span className="muted"> · {c.suite}</span> : null}</td>
                  <td style={td}>{fig(c.amount)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdL, fontWeight: 700, borderTop: "2px solid var(--text)" }} colSpan={6}>Total · {rows.length.toLocaleString()} charges</td>
                <td style={{ ...td, fontWeight: 700, borderTop: "2px solid var(--text)" }}>{dollars(total)}</td>
              </tr>
            </tbody>
          </table>
          {rows.length > SHOW_MAX && <div className="small muted" style={{ marginTop: 8 }}>Showing the first {SHOW_MAX} by this sort — narrow the filters, or Export for all {rows.length.toLocaleString()} (the total counts them all).</div>}
        </div>
      )}
      {all != null && rows.length === 0 && visible.length > 0 && <div className="small muted" style={{ marginTop: 10 }}>No charges match these filters.</div>}
    </div>
  );
}
