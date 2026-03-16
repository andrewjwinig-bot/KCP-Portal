"use client";

import { useMemo, useState } from "react";
import JSZip from "jszip";
import { parseGLExcel, GLParseResult, GLTransaction } from "../../lib/allocated-invoicer/glParser";
import { buildAllocInvoicePdf, makeAllocInvoiceId, AllocLineItem } from "../../lib/allocated-invoicer/invoice";
import { buildAllocExportXlsx, AllocExportRow } from "../../lib/allocated-invoicer/export";
import { toMoney } from "../../lib/expenses/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOC_PROPERTIES = [
  { id: "3610", name: "Building 1" },
  { id: "3620", name: "Building 2" },
  { id: "3640", name: "Building 4" },
  { id: "4050", name: "Building 5" },
  { id: "4060", name: "Building 6" },
  { id: "4070", name: "Building 7" },
  { id: "4080", name: "Building 8" },
  { id: "40A0", name: "Building A" },
  { id: "40B0", name: "Building B" },
  { id: "40C0", name: "Building C" },
  { id: "1100", name: "Parkwood Professional Building" },
  { id: "1500", name: "Eastwick JV I" },
  { id: "2300", name: "Brookwood Shopping Center" },
  { id: "4500", name: "Grays Ferry Shopping Ctr" },
  { id: "5600", name: "Hyman Korman Co" },
  { id: "7010", name: "Parkwood Joint Venture" },
  { id: "7200", name: "Elbridge Shopping Center" },
  { id: "7300", name: "Revere Shopping Center" },
  { id: "8200", name: "Trust # 4" },
  { id: "9510", name: "Shops at Lafayette Hill" },
] as const;

type PropId = (typeof ALLOC_PROPERTIES)[number]["id"];

const ALLOCATION_TABLE: Record<PropId, Record<"9301" | "9302" | "9303", number>> = {
  "3610": { "9301": 0.0779, "9302": 0.0000, "9303": 0.0514 },
  "3620": { "9301": 0.0913, "9302": 0.0000, "9303": 0.0602 },
  "3640": { "9301": 0.0909, "9302": 0.0000, "9303": 0.0600 },
  "4050": { "9301": 0.1006, "9302": 0.0000, "9303": 0.0664 },
  "4060": { "9301": 0.2009, "9302": 0.0000, "9303": 0.1326 },
  "4070": { "9301": 0.1146, "9302": 0.0000, "9303": 0.0756 },
  "4080": { "9301": 0.2381, "9302": 0.0000, "9303": 0.1571 },
  "40A0": { "9301": 0.0281, "9302": 0.0000, "9303": 0.0185 },
  "40B0": { "9301": 0.0242, "9302": 0.0000, "9303": 0.0159 },
  "40C0": { "9301": 0.0335, "9302": 0.0000, "9303": 0.0221 },
  "1100": { "9301": 0.0000, "9302": 0.0299, "9303": 0.0102 },
  "1500": { "9301": 0.0000, "9302": 0.0082, "9303": 0.0028 },
  "2300": { "9301": 0.0000, "9302": 0.2224, "9303": 0.0757 },
  "4500": { "9301": 0.0000, "9302": 0.2992, "9303": 0.1018 },
  "5600": { "9301": 0.0000, "9302": 0.0048, "9303": 0.0016 },
  "7010": { "9301": 0.0000, "9302": 0.2645, "9303": 0.0900 },
  "7200": { "9301": 0.0000, "9302": 0.0535, "9303": 0.0182 },
  "7300": { "9301": 0.0000, "9302": 0.0813, "9303": 0.0276 },
  "8200": { "9301": 0.0000, "9302": 0.0361, "9303": 0.0123 },
  "9510": { "9301": 0.0000, "9302": 0.0000, "9303": 0.0000 },
};

const PIE_COLORS = [
  "#1e3a5f","#2563eb","#0891b2","#059669","#65a30d",
  "#d97706","#dc2626","#9333ea","#db2777","#0d9488",
  "#6366f1","#ca8a04","#0284c7","#16a34a","#7c3aed",
  "#e11d48","#84cc16","#f59e0b",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function todayYYYYMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── DonutChart ────────────────────────────────────────────────────────────────

type PieSlice = { label: string; value: number; color: string };

function DonutChart({ data }: { data: PieSlice[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <div className="small muted">No data.</div>;

  const cx = 120, cy = 120, outerR = 110, innerR = 64;
  const slices: Array<PieSlice & { path: string }> = [];
  let angle = -Math.PI / 2;
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (d.value <= 0) continue;
    const pct = d.value / total;
    const sweep = pct >= 1 ? Math.PI * 2 - 0.0001 : pct * Math.PI * 2;
    const sa = angle, ea = angle + sweep;
    angle += pct * Math.PI * 2;
    const largeArc = sweep > Math.PI ? 1 : 0;
    const ox1 = cx + outerR * Math.cos(sa), oy1 = cy + outerR * Math.sin(sa);
    const ox2 = cx + outerR * Math.cos(ea), oy2 = cy + outerR * Math.sin(ea);
    const ix1 = cx + innerR * Math.cos(sa), iy1 = cy + innerR * Math.sin(sa);
    const ix2 = cx + innerR * Math.cos(ea), iy2 = cy + innerR * Math.sin(ea);
    const path = `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
    slices.push({ ...d, path });
  }

  const hov = hovered !== null ? slices[hovered] : null;
  const trim = (s: string, n = 17) => s.length > n ? s.slice(0, n) + "…" : s;

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <svg width={240} height={240} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={s.label} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2}
            style={{ cursor: "pointer", opacity: hovered !== null && hovered !== i ? 0.45 : 1, transition: "opacity 0.12s" }}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
        ))}
        <text x={cx} y={cy - 16} textAnchor="middle" style={{ fontSize: 11, fill: "#64748b", fontFamily: "inherit" }}>
          {trim(hov ? hov.label : "Total")}
        </text>
        <text x={cx} y={cy + 5} textAnchor="middle" style={{ fontSize: 14, fontWeight: 700, fill: "#0f172a", fontFamily: "inherit" }}>
          {hov ? toMoney(hov.value) : toMoney(total)}
        </text>
        {hov && (
          <text x={cx} y={cy + 22} textAnchor="middle" style={{ fontSize: 12, fill: "#64748b", fontFamily: "inherit" }}>
            {((hov.value / total) * 100).toFixed(1)}%
          </text>
        )}
      </svg>
      <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 5, maxHeight: 240, overflowY: "auto" }}>
        {slices.map((s, i) => (
          <div key={s.label} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "default",
              opacity: hovered !== null && hovered !== i ? 0.45 : 1, transition: "opacity 0.12s" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            <span style={{ color: "var(--muted)", whiteSpace: "nowrap", marginLeft: 4 }}>
              {toMoney(s.value)} · {((s.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AllocatedInvoicerPage() {
  const [glResult, setGlResult] = useState<GLParseResult | null>(null);
  const [acctFilter, setAcctFilter] = useState<"all" | "9301" | "9302" | "9303">("all");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── Derived: allocation rows ────────────────────────────────────────────────

  const allocationRows = useMemo((): AllocExportRow[] => {
    if (!glResult) return [];
    const result: AllocExportRow[] = [];
    for (const [, accData] of glResult.accountTotals.entries()) {
      const suffix = accData.accountSuffix;
      for (const prop of ALLOC_PROPERTIES) {
        const pctVal = ALLOCATION_TABLE[prop.id]?.[suffix] ?? 0;
        if (pctVal === 0) continue;
        result.push({
          propertyId: prop.id,
          propertyName: prop.name,
          accountCode: accData.accountCode,
          accountName: accData.accountName,
          accountSuffix: suffix,
          grossAmount: accData.netTotal,
          allocPct: pctVal,
          allocAmount: roundCents(accData.netTotal * pctVal),
        });
      }
    }
    return result;
  }, [glResult]);

  const perPropertyTotals = useMemo((): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of allocationRows) {
      m.set(r.propertyId, (m.get(r.propertyId) ?? 0) + r.allocAmount);
    }
    return m;
  }, [allocationRows]);

  const allAccountCodes = useMemo((): string[] =>
    [...new Set(allocationRows.map((r) => r.accountCode))].sort(),
    [allocationRows]
  );

  // ── Derived: filtered/sorted GL transactions ────────────────────────────────

  const filteredTx = useMemo((): GLTransaction[] => {
    if (!glResult) return [];
    let list = glResult.transactions;
    if (acctFilter !== "all") list = list.filter((t) => t.accountSuffix === acctFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) =>
        t.accountCode.toLowerCase().includes(q) ||
        t.accountName.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.date.includes(q) ||
        t.jrn.toLowerCase().includes(q) ||
        t.ref.toLowerCase().includes(q)
      );
    }
    return list;
  }, [glResult, acctFilter, search]);

  const displayTx = useMemo((): GLTransaction[] => {
    if (!sortCol) return filteredTx;
    return [...filteredTx].sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if (sortCol === "date")    { av = a.date;        bv = b.date; }
      if (sortCol === "acct")    { av = a.accountCode; bv = b.accountCode; }
      if (sortCol === "name")    { av = a.accountName; bv = b.accountName; }
      if (sortCol === "desc")    { av = a.description; bv = b.description; }
      if (sortCol === "debit")   { av = a.debit;       bv = b.debit; }
      if (sortCol === "credit")  { av = a.credit;      bv = b.credit; }
      if (sortCol === "net")     { av = a.net;         bv = b.net; }
      if (typeof av === "number") {
        return sortDir === "asc" ? av - (bv as number) : (bv as number) - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filteredTx, sortCol, sortDir]);

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  // ── Derived: chart data ────────────────────────────────────────────────────

  const chartDataByProperty = useMemo((): PieSlice[] =>
    ALLOC_PROPERTIES
      .map((p, i) => ({ label: `${p.id} — ${p.name}`, value: perPropertyTotals.get(p.id) ?? 0, color: PIE_COLORS[i % PIE_COLORS.length] }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value),
    [perPropertyTotals]
  );

  const chartDataByAccount = useMemo((): PieSlice[] => {
    if (!glResult) return [];
    return [...glResult.accountTotals.values()]
      .filter((a) => a.netTotal > 0)
      .sort((a, b) => b.netTotal - a.netTotal)
      .map((a, i) => ({ label: `${a.accountCode} — ${a.accountName}`, value: a.netTotal, color: PIE_COLORS[i % PIE_COLORS.length] }));
  }, [glResult]);

  // ── Totals for TX table footer ─────────────────────────────────────────────

  const txTotals = useMemo(() => ({
    debit:  filteredTx.reduce((a, t) => a + t.debit,  0),
    credit: filteredTx.reduce((a, t) => a + t.credit, 0),
    net:    filteredTx.reduce((a, t) => a + t.net,    0),
  }), [filteredTx]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function importFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const result = parseGLExcel(buf);
      setGlResult(result);
      setAcctFilter("all");
      setSearch("");
      setSortCol(null);
    } catch (e: any) {
      alert("Failed to parse GL file: " + (e?.message ?? String(e)));
    }
  }

  function clearAll() {
    if (!confirm("Clear imported General Ledger?")) return;
    setGlResult(null);
    setAcctFilter("all");
    setSearch("");
    setSortCol(null);
  }

  function buildLineItemsForProp(propId: string): AllocLineItem[] {
    return allocationRows
      .filter((r) => r.propertyId === propId)
      .map((r) => ({
        accountCode:  r.accountCode,
        accountName:  r.accountName,
        accountSuffix: r.accountSuffix,
        grossAmount:  r.grossAmount,
        allocPct:     r.allocPct,
        allocAmount:  r.allocAmount,
      }));
  }

  function downloadSinglePdf(propId: string) {
    const prop = ALLOC_PROPERTIES.find((p) => p.id === propId);
    if (!prop || !glResult) return;
    const lineItems = buildLineItemsForProp(propId);
    const grandTotal = lineItems.reduce((a, r) => a + r.allocAmount, 0);
    const blob = buildAllocInvoicePdf({
      propertyId:    prop.id,
      propertyName:  prop.name,
      periodText:    glResult.periodText,
      periodEndDate: glResult.periodEndDate,
      statementMonth: glResult.statementMonth,
      invoiceDate:   glResult.periodEndDate || todayYYYYMMDD(),
      invoiceId:     makeAllocInvoiceId(prop.id),
      lineItems,
      grandTotal,
    });
    const month = glResult.statementMonth || "Statement";
    download(`${month} - ${prop.id} - ${prop.name}.pdf`, blob);
  }

  async function generateAllPdfsZip() {
    if (!glResult) return;
    const activeProps = ALLOC_PROPERTIES.filter((p) => (perPropertyTotals.get(p.id) ?? 0) > 0);
    if (!activeProps.length) return;
    if (!confirm(`Generate ${activeProps.length} property invoice${activeProps.length !== 1 ? "s" : ""} as a ZIP?`)) return;
    const zip = new JSZip();
    const month = glResult.statementMonth || "Statement";
    for (const prop of activeProps) {
      const lineItems = buildLineItemsForProp(prop.id);
      const grandTotal = lineItems.reduce((a, r) => a + r.allocAmount, 0);
      if (grandTotal <= 0) continue;
      const blob = buildAllocInvoicePdf({
        propertyId:    prop.id,
        propertyName:  prop.name,
        periodText:    glResult.periodText,
        periodEndDate: glResult.periodEndDate,
        statementMonth: glResult.statementMonth,
        invoiceDate:   glResult.periodEndDate || todayYYYYMMDD(),
        invoiceId:     makeAllocInvoiceId(prop.id),
        lineItems,
        grandTotal,
      });
      zip.file(`${month} - ${prop.id} - ${prop.name}.pdf`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    download(`${month} - Allocated Invoices.zip`, zipBlob);
  }

  function downloadExcel() {
    if (!glResult) return;
    const blob = buildAllocExportXlsx({
      periodText:    glResult.periodText,
      rows:          allocationRows,
      propertyOrder: ALLOC_PROPERTIES.map((p) => ({ id: p.id, name: p.name })),
      accountCodes:  allAccountCodes,
    });
    const month = glResult.statementMonth || "Statement";
    download(`${month} - Allocated Expenses.xlsx`, blob);
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const stickyTh: React.CSSProperties = { position: "sticky", top: 0, zIndex: 15, background: "#fff" };
  const sortIcon = (col: string) =>
    sortCol === col
      ? sortDir === "asc" ? " ↑" : " ↓"
      : <span style={{ opacity: 0.35, fontSize: 10 }}> ⇅</span>;

  const thBase: React.CSSProperties = {
    ...stickyTh, padding: "10px 8px", textAlign: "left",
    borderBottom: "1px solid var(--border)", color: "var(--muted)",
    fontWeight: 800, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
  };

  const grandAllocTotal = useMemo(
    () => allocationRows.reduce((a, r) => a + r.allocAmount, 0),
    [allocationRows]
  );

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h1>Allocated Expense Invoicer</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </header>

      {/* ── Import GL ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <b>Import General Ledger</b>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn primary large"
              onClick={generateAllPdfsZip}
              disabled={!allocationRows.length}
            >
              Generate All PDFs
            </button>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Upload the monthly General Ledger Excel export (.xlsx or .xls). Accounts ending in <b>9301</b>, <b>9302</b>, and <b>9303</b> will be extracted and allocated.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 999, padding: "6px 14px 6px 6px", background: "#fff", minWidth: 0 }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); (e.target as HTMLInputElement).value = ""; }}
              style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 14 }}
            />
          </div>
          <button className="btn" style={{ borderRadius: 999, fontWeight: 700, whiteSpace: "nowrap" }} onClick={clearAll} disabled={!glResult}>
            Clear
          </button>
        </div>
        {glResult && (
          <div className="pills">
            <div className="pill"><b>{glResult.accountTotals.size}</b><span className="small muted">Accounts</span></div>
            <div className="pill"><b>{glResult.transactions.length}</b><span className="small muted">Transactions</span></div>
            <div className="pill pill-total"><b>{toMoney(grandAllocTotal)}</b><span className="small muted">Total Allocated</span></div>
          </div>
        )}
        {glResult?.periodText && (
          <div className="small muted" style={{ textAlign: "center", marginTop: 6 }}>
            <b>Period:</b> {glResult.periodText}
          </div>
        )}
      </div>

      {/* ── Charts ── */}
      {glResult && allocationRows.length > 0 && (
        <div className="card">
          <b>Charts</b>
          <div style={{ display: "flex", gap: 40, marginTop: 20, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 340 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, color: "var(--muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>By Property</div>
              <DonutChart data={chartDataByProperty} />
            </div>
            <div style={{ width: 1, background: "var(--border)", flexShrink: 0, alignSelf: "stretch" }} />
            <div style={{ flex: 1, minWidth: 340 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, color: "var(--muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>By Account Code</div>
              <DonutChart data={chartDataByAccount} />
            </div>
          </div>
        </div>
      )}

      {/* ── GL Transaction Breakdown ── */}
      {glResult && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div>
              <b>GL Transaction Breakdown</b>
              <div className="small muted">Extracted transactions from accounts ending in 9301, 9302, or 9303.</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Suffix filter pills */}
              {(["all", "9301", "9302", "9303"] as const).map((f) => (
                <button
                  key={f}
                  className="btn"
                  style={{ fontSize: 12, padding: "5px 10px", background: acctFilter === f ? "var(--navy)" : undefined, color: acctFilter === f ? "#fff" : undefined }}
                  onClick={() => setAcctFilter(f)}
                >
                  {f === "all" ? "All" : f}
                </button>
              ))}
              <input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", outline: "none", width: 160 }}
              />
            </div>
          </div>

          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 320px)", borderRadius: 12, border: "1px solid var(--border)" }}>
            <table style={{ minWidth: 900, width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...thBase, minWidth: 100 }} onClick={() => handleSort("acct")}>Account Code{sortIcon("acct")}</th>
                  <th style={{ ...thBase, minWidth: 180 }} onClick={() => handleSort("name")}>Account Name{sortIcon("name")}</th>
                  <th style={{ ...thBase, minWidth: 90 }}  onClick={() => handleSort("date")}>Date{sortIcon("date")}</th>
                  <th style={{ ...thBase, minWidth: 220 }} onClick={() => handleSort("desc")}>Description{sortIcon("desc")}</th>
                  <th style={{ ...thBase, minWidth: 50 }}>Jrn</th>
                  <th style={{ ...thBase, minWidth: 70 }}>Ref</th>
                  <th style={{ ...thBase, minWidth: 100, textAlign: "right" }} onClick={() => handleSort("debit")}>Debit{sortIcon("debit")}</th>
                  <th style={{ ...thBase, minWidth: 100, textAlign: "right" }} onClick={() => handleSort("credit")}>Credit{sortIcon("credit")}</th>
                  <th style={{ ...thBase, minWidth: 100, textAlign: "right" }} onClick={() => handleSort("net")}>Net{sortIcon("net")}</th>
                </tr>
              </thead>
              <tbody>
                {displayTx.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No transactions found.</td></tr>
                )}
                {displayTx.map((tx, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 8px" }}>{tx.accountCode}</td>
                    <td style={{ padding: "8px 8px", color: "var(--muted)", fontSize: 12 }}>{tx.accountName}</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>{tx.date}</td>
                    <td style={{ padding: "8px 8px" }}>{tx.description}</td>
                    <td style={{ padding: "8px 8px", color: "var(--muted)" }}>{tx.jrn}</td>
                    <td style={{ padding: "8px 8px", color: "var(--muted)" }}>{tx.ref}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right" }}>{tx.debit ? toMoney(tx.debit) : "—"}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right" }}>{tx.credit ? toMoney(tx.credit) : "—"}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700 }}>{toMoney(tx.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "#f8fafc" }}>
                  <td colSpan={6} style={{ padding: "8px 8px", fontWeight: 700, fontSize: 12, color: "var(--muted)" }}>
                    {filteredTx.length} transactions
                  </td>
                  <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700 }}>{toMoney(txTotals.debit)}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700 }}>{toMoney(txTotals.credit)}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700 }}>{toMoney(txTotals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Allocation Preview ── */}
      {glResult && allocationRows.length > 0 && (
        <div className="card">
          <b>Allocation Preview</b>
          <div className="small muted" style={{ marginBottom: 14 }}>Property × Account Code allocation amounts.</div>
          <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
            <table style={{ minWidth: 600, width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...stickyTh, padding: "8px 8px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800, whiteSpace: "nowrap", minWidth: 90 }}>Property</th>
                  <th style={{ ...stickyTh, padding: "8px 8px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800, whiteSpace: "nowrap", minWidth: 180 }}>Name</th>
                  {allAccountCodes.map((ac) => (
                    <th key={ac} style={{ ...stickyTh, padding: "8px 6px", textAlign: "right", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800, whiteSpace: "nowrap", minWidth: 110 }}>{ac}</th>
                  ))}
                  <th style={{ ...stickyTh, padding: "8px 8px", textAlign: "right", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800, whiteSpace: "nowrap", minWidth: 110 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {ALLOC_PROPERTIES.map((prop) => {
                  const propTotal = perPropertyTotals.get(prop.id) ?? 0;
                  if (propTotal === 0) return null;
                  return (
                    <tr key={prop.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>{prop.id}</td>
                      <td style={{ padding: "7px 8px", color: "var(--muted)" }}>{prop.name}</td>
                      {allAccountCodes.map((ac) => {
                        const row = allocationRows.find((r) => r.propertyId === prop.id && r.accountCode === ac);
                        return (
                          <td key={ac} style={{ padding: "7px 6px", textAlign: "right" }}>
                            {row ? (
                              <span>
                                {toMoney(row.allocAmount)}
                                <br />
                                <span style={{ fontSize: 10, color: "var(--muted)" }}>{(row.allocPct * 100).toFixed(2)}%</span>
                              </span>
                            ) : "—"}
                          </td>
                        );
                      })}
                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700 }}>{toMoney(propTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "#f8fafc" }}>
                  <td colSpan={2} style={{ padding: "8px 8px", fontWeight: 700 }}>TOTAL</td>
                  {allAccountCodes.map((ac) => {
                    const colTotal = allocationRows.filter((r) => r.accountCode === ac).reduce((a, r) => a + r.allocAmount, 0);
                    return (
                      <td key={ac} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700 }}>{colTotal > 0 ? toMoney(colTotal) : "—"}</td>
                    );
                  })}
                  <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700 }}>{toMoney(grandAllocTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Generate Invoices ── */}
      {glResult && (
        <div className="card">
          <b>Generate Invoices</b>
          <div className="small muted" style={{ marginBottom: 14 }}>One PDF invoice per property. Only properties with allocated amounts greater than $0 are included.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button
              className="btn primary large"
              onClick={generateAllPdfsZip}
              disabled={!allocationRows.length}
            >
              Download All Invoices (ZIP)
            </button>
            <button
              className="btn large"
              onClick={downloadExcel}
              disabled={!allocationRows.length}
            >
              Download Excel Summary
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ALLOC_PROPERTIES.filter((p) => (perPropertyTotals.get(p.id) ?? 0) > 0).map((prop) => (
              <button
                key={prop.id}
                className="btn"
                style={{ fontSize: 12, padding: "5px 10px" }}
                onClick={() => downloadSinglePdf(prop.id)}
              >
                {prop.id} — {prop.name} <span style={{ color: "var(--muted)", marginLeft: 4 }}>({toMoney(perPropertyTotals.get(prop.id) ?? 0)})</span>
              </button>
            ))}
          </div>
        </div>
      )}

    </main>
  );
}
