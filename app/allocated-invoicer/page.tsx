"use client";

import { useMemo, useRef, useState } from "react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [glResult, setGlResult] = useState<GLParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [acctFilter, setAcctFilter] = useState<"all" | "9301" | "9302" | "9303">("all");
  const [search, setSearch] = useState("");
  const [txDetailModal, setTxDetailModal] = useState<{ accountCode: string; accountName: string; txList: GLTransaction[]; totalDebit: number; totalCredit: number; totalNet: number } | null>(null);
  const [allocPropModal, setAllocPropModal] = useState<{ propId: string; propName: string; rows: AllocExportRow[] } | null>(null);
  const [chartsOpen, setChartsOpen] = useState(true);
  const [txOpen, setTxOpen] = useState(true);
  const [allocPreviewOpen, setAllocPreviewOpen] = useState(true);
  const [showAllocModal, setShowAllocModal] = useState(false);

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

  // ── Derived: filtered GL transactions ──────────────────────────────────────

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

  // ── Derived: grouped transactions by account code ───────────────────────────

  const groupedTx = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, GLTransaction[]>();
    for (const tx of filteredTx) {
      if (!map.has(tx.accountCode)) { order.push(tx.accountCode); map.set(tx.accountCode, []); }
      map.get(tx.accountCode)!.push(tx);
    }
    return order.map((code) => {
      const txList = map.get(code)!;
      return {
        accountCode:   code,
        accountName:   txList[0].accountName,
        accountSuffix: txList[0].accountSuffix,
        txList,
        totalDebit:  txList.reduce((a, t) => a + t.debit,  0),
        totalCredit: txList.reduce((a, t) => a + t.credit, 0),
        totalNet:    txList.reduce((a, t) => a + t.net,    0),
      };
    });
  }, [filteredTx]);

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
      setFileName(file.name);
      setAcctFilter("all");
      setSearch("");
      setTxDetailModal(null);
      setAllocPropModal(null);
    } catch (e: any) {
      alert("Failed to parse GL file: " + (e?.message ?? String(e)));
    }
  }

  function clearAll() {
    if (!confirm("Clear imported General Ledger?")) return;
    setGlResult(null);
    setFileName("");
    setAcctFilter("all");
    setSearch("");
    setTxDetailModal(null);
    setAllocPropModal(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
            <span style={{ background: "rgba(22, 163, 74, 0.85)", color: "#fff", borderRadius: 999, padding: "12px 18px", fontSize: 15, fontWeight: 700, border: "1px solid transparent", display: "inline-flex", alignItems: "center" }}>Monthly</span>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Upload the monthly General Ledger Excel export (.xlsx or .xls). Accounts ending in <b>9301</b>, <b>9302</b>, and <b>9303</b> will be extracted and allocated.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); }}
          />
          <button
            className="btn large"
            onClick={() => fileInputRef.current?.click()}
            style={{ whiteSpace: "nowrap" }}
          >
            Choose GL File…
          </button>
          {fileName && (
            <span style={{ fontSize: 13, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {fileName}
            </span>
          )}
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn" style={{ padding: "2px 8px", fontSize: 13 }} onClick={() => setChartsOpen((o) => !o)} title={chartsOpen ? "Collapse" : "Expand"}>
              {chartsOpen ? "▲" : "▼"}
            </button>
            <b>Charts</b>
          </div>
          {chartsOpen && (
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
          )}
        </div>
      )}

      {/* ── GL Transaction Breakdown ── */}
      {glResult && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn" style={{ padding: "2px 8px", fontSize: 13 }} onClick={() => setTxOpen((o) => !o)} title={txOpen ? "Collapse" : "Expand"}>
                {txOpen ? "▲" : "▼"}
              </button>
              <div>
                <b>GL Transaction Breakdown</b>
                <div className="small muted">Click an account row to see individual GL line items.</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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

          {txOpen && <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th style={{ textAlign: "right" }}>Debit</th>
                  <th style={{ textAlign: "right" }}>Credit</th>
                  <th style={{ textAlign: "right" }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {groupedTx.length === 0 && (
                  <tr><td colSpan={5} className="muted">No transactions found.</td></tr>
                )}
                {groupedTx.map((group) => (
                  <tr key={group.accountCode}>
                    <td>
                      <button className="linkBtn left" onClick={() => setTxDetailModal(group)}>
                        {group.accountCode}
                      </button>
                    </td>
                    <td className="muted">
                      {group.accountName}
                      <span style={{ marginLeft: 8, fontSize: 11, background: "var(--border)", borderRadius: 999, padding: "1px 6px", color: "var(--muted)", fontWeight: 600 }}>
                        {group.txList.length}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{group.totalDebit ? toMoney(group.totalDebit) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{group.totalCredit ? toMoney(group.totalCredit) : "—"}</td>
                    <td style={{ textAlign: "right" }}><b>{toMoney(group.totalNet)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{groupedTx.length} accounts · {filteredTx.length} transactions</td>
                  <td style={{ textAlign: "right" }}>{toMoney(txTotals.debit)}</td>
                  <td style={{ textAlign: "right" }}>{toMoney(txTotals.credit)}</td>
                  <td style={{ textAlign: "right" }}>{toMoney(txTotals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>}
        </div>
      )}

      {/* ── Allocation Preview ── */}
      {glResult && allocationRows.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn" style={{ padding: "2px 8px", fontSize: 13 }} onClick={() => setAllocPreviewOpen((o) => !o)} title={allocPreviewOpen ? "Collapse" : "Expand"}>
                {allocPreviewOpen ? "▲" : "▼"}
              </button>
              <div>
                <b>Allocation Preview</b>
                <div className="small muted" style={{ marginTop: 4 }}>One row per property. Click a property to see account code detail.</div>
              </div>
            </div>
            <button className="btn" onClick={() => setShowAllocModal(true)}>Allocations</button>
          </div>
          {allocPreviewOpen && <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Accounts</th>
                  <th style={{ textAlign: "right" }}># Accounts</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {ALLOC_PROPERTIES.map((prop) => {
                  const propRows = allocationRows.filter((r) => r.propertyId === prop.id);
                  const propTotal = perPropertyTotals.get(prop.id) ?? 0;
                  if (propTotal === 0) return null;
                  const accountNames = [...new Set(propRows.map((r) => r.accountName))];
                  return (
                    <tr key={prop.id}>
                      <td>
                        <button className="linkBtn left" onClick={() => setAllocPropModal({ propId: prop.id, propName: prop.name, rows: propRows })}>
                          {prop.id} — {prop.name}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {accountNames.map((name) => (
                            <span key={name} style={{ fontSize: 11, background: "#e8f0fe", color: "#1e4976", borderRadius: 999, padding: "2px 8px", fontWeight: 500, whiteSpace: "nowrap" }}>
                              {name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>{propRows.length}</td>
                      <td style={{ textAlign: "right" }}>{toMoney(propTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td style={{ textAlign: "right" }}>{toMoney(grandAllocTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>}
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
              Download All Invoices
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

      {/* Allocations table modal */}
      {showAllocModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowAllocModal(false)}>
          <div className="card" style={{ maxWidth: 620, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <b style={{ fontSize: 15 }}>Allocation Percentages</b>
                <div className="small muted" style={{ marginTop: 2 }}>Per-property breakdown by account suffix</div>
              </div>
              <button className="btn" style={{ padding: "4px 10px" }} onClick={() => setShowAllocModal(false)}>✕</button>
            </div>
            <div className="tableWrap" style={{ overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th style={{ textAlign: "right" }}>9301 (BP)</th>
                    <th style={{ textAlign: "right" }}>9302 (SC)</th>
                    <th style={{ textAlign: "right" }}>9303 (All)</th>
                  </tr>
                </thead>
                <tbody>
                  {ALLOC_PROPERTIES.map((prop) => {
                    const row = ALLOCATION_TABLE[prop.id];
                    const fmt = (v: number) => v === 0 ? <span className="muted">—</span> : `${(v * 100).toFixed(2)}%`;
                    return (
                      <tr key={prop.id}>
                        <td>{prop.id} — {prop.name}</td>
                        <td style={{ textAlign: "right" }}>{fmt(row["9301"])}</td>
                        <td style={{ textAlign: "right" }}>{fmt(row["9302"])}</td>
                        <td style={{ textAlign: "right" }}>{fmt(row["9303"])}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {(["9301", "9302", "9303"] as const).map((sfx) => (
                      <td key={sfx} style={{ textAlign: "right" }}>
                        {(ALLOC_PROPERTIES.reduce((s, p) => s + ALLOCATION_TABLE[p.id][sfx], 0) * 100).toFixed(2)}%
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TX detail modal */}
      {txDetailModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setTxDetailModal(null)}>
          <div className="card" style={{ maxWidth: 820, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <b style={{ fontSize: 15 }}>{txDetailModal.accountCode} — {txDetailModal.accountName}</b>
                <div className="small muted" style={{ marginTop: 2 }}>{txDetailModal.txList.length} transaction{txDetailModal.txList.length !== 1 ? "s" : ""}</div>
              </div>
              <button className="btn" style={{ padding: "4px 10px" }} onClick={() => setTxDetailModal(null)}>✕</button>
            </div>
            <div className="tableWrap" style={{ overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Jrn</th>
                    <th>Ref</th>
                    <th style={{ textAlign: "right" }}>Debit</th>
                    <th style={{ textAlign: "right" }}>Credit</th>
                    <th style={{ textAlign: "right" }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {txDetailModal.txList.map((tx, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: "nowrap" }}>{tx.date}</td>
                      <td>{tx.description}</td>
                      <td className="muted">{tx.jrn}</td>
                      <td className="muted">{tx.ref}</td>
                      <td style={{ textAlign: "right" }}>{tx.debit ? toMoney(tx.debit) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{tx.credit ? toMoney(tx.credit) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{toMoney(tx.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Totals</td>
                    <td style={{ textAlign: "right" }}>{toMoney(txDetailModal.totalDebit)}</td>
                    <td style={{ textAlign: "right" }}>{toMoney(txDetailModal.totalCredit)}</td>
                    <td style={{ textAlign: "right" }}>{toMoney(txDetailModal.totalNet)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Allocation property modal */}
      {allocPropModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setAllocPropModal(null)}>
          <div className="card" style={{ maxWidth: 680, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <b style={{ fontSize: 15 }}>{allocPropModal.propId} — {allocPropModal.propName}</b>
                <div className="small muted" style={{ marginTop: 2 }}>Account code breakdown</div>
              </div>
              <button className="btn" style={{ padding: "4px 10px" }} onClick={() => setAllocPropModal(null)}>✕</button>
            </div>
            <div className="tableWrap" style={{ overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th style={{ textAlign: "right" }}>Gross Amount</th>
                    <th style={{ textAlign: "right" }}>Alloc %</th>
                    <th style={{ textAlign: "right" }}>Allocated</th>
                  </tr>
                </thead>
                <tbody>
                  {allocPropModal.rows.map((r) => (
                    <tr key={r.accountCode}>
                      <td>{r.accountCode}</td>
                      <td className="muted">{r.accountName}</td>
                      <td style={{ textAlign: "right" }}>{toMoney(r.grossAmount)}</td>
                      <td style={{ textAlign: "right" }}>{(r.allocPct * 100).toFixed(2)}%</td>
                      <td style={{ textAlign: "right" }}>{toMoney(r.allocAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total</td>
                    <td style={{ textAlign: "right" }}>{toMoney(allocPropModal.rows.reduce((s, r) => s + r.allocAmount, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
