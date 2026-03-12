"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { buildInvoicePdf, makeInvoiceId, CategoryGroup } from "../../lib/expenses/invoice";
import { buildTopSheetXlsx, TopSheetTx } from "../../lib/expenses/topSheet";
import { groupBy, normalizeAmount, toMoney } from "../../lib/expenses/utils";

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "MARKETING NR",
  "BUILDING MAINT.",
  "TI",
  "OFFICE SUPPLIES",
  "AUTO",
  "TELEPHONE",
  "COMP & IT",
  "MEALS & ENT.",
  "TRAINING & EDU",
  "G&A",
  "LANDSCAPING",
  "EQUIPMENT (CAP)",
  "BUILDINGS (CAP)",
] as const;

const TOP_SHEET_CATEGORIES = [
  "MARKETING NR",
  "BUILDING MAINT.",
  "TI",
  "OFFICE SUPPLIES",
  "AUTO",
  "TRAINING & EDU",
  "G&A",
] as const;

const CATEGORY_ACC: Record<(typeof CATEGORIES)[number], string> = {
  "MARKETING NR": "7110",
  "BUILDING MAINT.": "8220",
  TI: "1440",
  "OFFICE SUPPLIES": "9830",
  AUTO: "8980",
  TELEPHONE: "8940",
  "COMP & IT": "8400",
  "MEALS & ENT.": "8890",
  "TRAINING & EDU": "8330",
  "G&A": "8990",
  LANDSCAPING: "6330",
  "EQUIPMENT (CAP)": "1450",
  "BUILDINGS (CAP)": "1430",
};

const PROPERTIES = [
  { id: "BP & SC", name: "All BP & SC" },
  { id: "BP", name: "All BP" },
  { id: "SC", name: "All SC" },
  { id: "KH", name: "All KH" },
  { id: "PJV3", name: "JV III" },
  { id: "PNIPLX", name: "NI LLC" },
  { id: "PIIICO", name: "JV III Condo" },
  { id: "1100", name: "Parkwood Professional Building" },
  { id: "1500", name: "Eastwick JV I" },
  { id: "2000", name: "Clearing Account" },
  { id: "2010", name: "LIK Management, Inc." },
  { id: "2040", name: "KF Nockamixon LLC" },
  { id: "2070", name: "Kosano Associates LP" },
  { id: "2080", name: "LKF Nock LP" },
  { id: "2300", name: "Brookwood Shopping Center" },
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
  { id: "4500", name: "Grays Ferry Shopping Ctr" },
  { id: "4900", name: "The Office Works" },
  { id: "5600", name: "Hyman Korman Co" },
  { id: "7010", name: "Parkwood Joint Venture" },
  { id: "7200", name: "Elbridge Shopping Center" },
  { id: "7300", name: "Revere Shopping Center" },
  { id: "8200", name: "Trust # 4" },
  { id: "9200", name: "Eastwick JV XII" },
  { id: "9510", name: "Shops at Lafayette Hill" },
  { id: "9800", name: "KH Bellaire" },
  { id: "9820", name: "KH Spring Garden" },
  { id: "9840", name: "KH Joshua" },
  { id: "9860", name: "KH Fort Washington" },
  { id: "0200", name: "TKD - Neshaminy, LLC" },
  { id: "0300", name: "Airport Interplex Two, Inc." },
  { id: "0800", name: "Interstate Business Park" },
] as const;

const PROPERTY_ACC2: Record<(typeof PROPERTIES)[number]["id"], string[]> = {
  "BP & SC": ["9301", "9302"],
  BP: ["9301"],
  SC: ["9302"],
  KH: ["8501"],
  PJV3: ["8501"],
  PNIPLX: ["8501"],
  PIIICO: ["8501"],
  "1100": ["8501"],
  "1500": ["8501"],
  "2000": ["9301", "9302"],
  "2010": ["8501"],
  "2040": ["8501"],
  "2070": ["8501"],
  "2080": ["8501"],
  "2300": ["8501"],
  "3610": ["8501"],
  "3620": ["8501"],
  "3640": ["8501"],
  "4050": ["8501"],
  "4060": ["8501"],
  "4070": ["8501"],
  "4080": ["8501"],
  "40A0": ["8501"],
  "40B0": ["8501"],
  "40C0": ["8501"],
  "4500": ["8501"],
  "4900": ["8501"],
  "5600": ["8501"],
  "7010": ["8501"],
  "7200": ["8501"],
  "7300": ["8501"],
  "8200": ["8501"],
  "9200": ["8501"],
  "9510": ["8501"],
  "9800": ["8501"],
  "9820": ["8501"],
  "9840": ["8501"],
  "9860": ["8501"],
  "0200": ["8501"],
  "0300": ["8501"],
  "0800": ["8501"],
};

const ALLOC_BP_SC: Record<string, number> = {
  "3610": 0.0514,
  "3620": 0.0602,
  "3640": 0.06,
  "4050": 0.0664,
  "4060": 0.1326,
  "4070": 0.0756,
  "4080": 0.1571,
  "40A0": 0.0185,
  "40B0": 0.0159,
  "40C0": 0.0221,
  "1100": 0.0102,
  "1500": 0.0028,
  "2300": 0.0757,
  "4500": 0.1018,
  "5600": 0.0016,
  "7010": 0.09,
  "7200": 0.0182,
  "7300": 0.0276,
  "8200": 0.0123,
  "9510": 0.0,
};

// ── Types ────────────────────────────────────────────────────────────────────

type Tx = {
  id: string;
  date: string;
  cardMember: string;
  description: string;
  amount: number;
  category: string;
  propertyId: string;
  suite: string;
  codedDescription: string;
};

// ── Pure functions ────────────────────────────────────────────────────────────

function newTx(partial: Partial<Tx>): Tx {
  return {
    id: crypto.randomUUID(),
    date: partial.date || "",
    cardMember: partial.cardMember || "",
    description: partial.description || "",
    amount: Number(partial.amount || 0),
    category: partial.category || "",
    propertyId: partial.propertyId || "",
    suite: partial.suite || "",
    codedDescription: partial.codedDescription || "",
  };
}

function isRowCoded(t: Tx) {
  if (!t.category || !t.propertyId) return false;
  if (t.category === "TI" && !String(t.suite || "").trim()) return false;
  return true;
}

function toTitleCaseFirstName(name: string) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  if (!first) return "";
  const low = first.toLowerCase();
  return low.charAt(0).toUpperCase() + low.slice(1);
}

function trimLastTwoChars(s: string) {
  const t = String(s || "");
  return t.length <= 2 ? t : t.slice(0, -2);
}

function parseDateLoose(s: string): Date | null {
  const txt = String(s || "").trim();
  if (!txt) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) {
    const d = new Date(txt + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  const m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    const yy = Number(m[3].length === 2 ? "20" + m[3] : m[3]);
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(txt);
  return isNaN(d.getTime()) ? null : d;
}

function formatPeriod(minD: Date | null, maxD: Date | null) {
  if (!minD || !maxD) return "";
  const fmt = (d: Date) => d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(minD)} to ${fmt(maxD)}`;
}

function cleanPeriodText(raw: any) {
  const txt = String(raw ?? "").trim();
  if (!txt) return "";
  if (txt.includes("/")) return txt.replace(/^.*?\/\s*/, "").trim();
  return txt;
}

function parsePeriodFromCellB1(raw: any): { text: string; start: Date | null; end: Date | null } {
  const txt = cleanPeriodText(raw);
  if (!txt) return { text: "", start: null, end: null };
  const dateMatches =
    txt.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) ??
    txt.match(/\b[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\b/g);
  if (dateMatches && dateMatches.length >= 2) {
    const start = parseDateLoose(dateMatches[0]);
    const end = parseDateLoose(dateMatches[1]);
    return { text: txt, start, end };
  }
  const parts = txt.split(/\s+(?:to)\s+|\s*[-–—]\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const start = parseDateLoose(parts[0]);
    const end = parseDateLoose(parts[parts.length - 1]);
    return { text: txt, start, end };
  }
  return { text: txt, start: null, end: null };
}

function formatDateCompact(d: Date | null): string {
  if (!d) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const y = String(d.getFullYear()).slice(-2);
  return `${m}/${day}/${y}`;
}

function yyyymmFromDate(d: Date | null) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function yyyymmddFromDate(d: Date | null) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getAccountCodes(category: string, propertyId: string): string[] {
  if (category === "EQUIPMENT (CAP)") return ["1450-0000"];
  if (category === "BUILDINGS (CAP)") return ["1430-0000"];
  const catAcc = (CATEGORY_ACC as Record<string, string>)[category];
  const propAcc2 = (PROPERTY_ACC2 as Record<string, string[]>)[propertyId];
  if (!catAcc || !propAcc2 || !propAcc2.length) return [];
  return propAcc2.map((suffix) => `${catAcc}-${suffix}`);
}

function cents(n: number) { return Math.round((Number(n) || 0) * 100); }
function dollars(c: number) { return c / 100; }

function allocateCentsByPercents(totalCents: number, entries: Array<{ key: string; pct: number }>) {
  const nonZero = entries.filter((e) => e.pct > 0);
  if (!nonZero.length) return [] as Array<{ key: string; cents: number }>;
  const exact = nonZero.map((e) => ({ key: e.key, exact: totalCents * e.pct }));
  const floors = exact.map((e) => ({ key: e.key, cents: Math.floor(e.exact), frac: e.exact - Math.floor(e.exact) }));
  let used = floors.reduce((a, e) => a + e.cents, 0);
  let rem = totalCents - used;
  floors.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < floors.length && rem > 0; i++) { floors[i].cents += 1; rem -= 1; }
  return floors.map((e) => ({ key: e.key, cents: e.cents }));
}

function expandForAllocation(t: Tx): Array<Tx & { originalAmount?: number }> {
  if (t.propertyId !== "BP & SC") return [t];
  const totalC = cents(t.amount);
  const entries = Object.entries(ALLOC_BP_SC).map(([key, pct]) => ({ key, pct }));
  const alloc = allocateCentsByPercents(totalC, entries);
  if (!alloc.length) return [t];
  return alloc
    .filter((a) => a.cents !== 0)
    .map((a) => ({ ...t, propertyId: a.key, amount: dollars(a.cents), originalAmount: t.amount }));
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const LS_KEY = "cc-expenses:v1";

// ── Component ────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const categories = useMemo(() => [...CATEGORIES], []);
  const properties = useMemo(() => [...PROPERTIES], []);

  const [tx, setTx] = useState<Tx[]>(() => {
    if (typeof window === "undefined") return [];
    try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r).tx ?? [] : []; } catch { return []; }
  });
  const [showOnlyUncoded, setShowOnlyUncoded] = useState(false);
  const [search, setSearch] = useState("");
  const [statementPeriodText, setStatementPeriodText] = useState(() => {
    if (typeof window === "undefined") return "";
    try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r).statementPeriodText ?? "" : ""; } catch { return ""; }
  });
  const [statementStart, setStatementStart] = useState<Date | null>(null);
  const [statementEnd, setStatementEnd] = useState<Date | null>(null);
  const [showAfterZipModal, setShowAfterZipModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ tx, statementPeriodText })); } catch { /* ignore */ }
  }, [tx, statementPeriodText]);

  useEffect(() => {
    if (statementPeriodText) return;
    if (!tx.length) return;
    const dates = tx.map((t) => parseDateLoose(t.date)).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    if (!dates.length) return;
    const p = formatPeriod(dates[0], dates[dates.length - 1]);
    if (p) setStatementPeriodText(p);
    setStatementStart(dates[0]);
    setStatementEnd(dates[dates.length - 1]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, statementPeriodText]);

  const lastTxDate = useMemo(() => {
    const dates = tx.filter((t) => Number(t.amount) > 0).map((t) => parseDateLoose(t.date)).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    return dates.length ? dates[dates.length - 1] : null;
  }, [tx]);

  const effectiveEnd = statementEnd || lastTxDate;
  const statementMonth = useMemo(() => yyyymmFromDate(effectiveEnd) || "", [effectiveEnd]);
  const invoiceDate = useMemo(() => yyyymmddFromDate(effectiveEnd) || "", [effectiveEnd]);

  const filteredTx = useMemo(() => {
    let arr = tx.filter((t) => Number(t.amount) > 0);
    if (showOnlyUncoded) arr = arr.filter((t) => !isRowCoded(t));
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter((t) => {
        const acct = getAccountCodes(t.category, t.propertyId).join(", ");
        return [t.date, t.cardMember, t.description, t.codedDescription, t.category, t.propertyId, t.suite, acct].join(" ").toLowerCase().includes(q);
      });
    }
    return arr;
  }, [tx, showOnlyUncoded, search]);

  const totals = useMemo(() => {
    const onlyPos = tx.filter((t) => Number(t.amount) > 0);
    return { total: onlyPos.reduce((a, t) => a + Number(t.amount), 0), coded: onlyPos.filter(isRowCoded).length, count: onlyPos.length };
  }, [tx]);

  const expandedCoded = useMemo(() => {
    return tx.filter((t) => Number(t.amount) > 0).filter(isRowCoded).flatMap((t) => expandForAllocation(t));
  }, [tx]);

  const invoiceGroups = useMemo(() => {
    const byProp = groupBy(expandedCoded, (t: any) => t.propertyId);
    const groups: { propId: string; categoryGroups: CategoryGroup[]; total: number; itemCount: number }[] = [];
    for (const [propId, items] of byProp.entries()) {
      const byCat = groupBy(items, (t: any) => t.category);
      const categoryGroups: CategoryGroup[] = [];
      for (const [cat, catItems] of byCat.entries()) {
        categoryGroups.push({ category: cat, items: catItems as Tx[] });
      }
      const total = (items as any[]).reduce((a: number, t: any) => a + Number(t.amount), 0);
      groups.push({ propId, categoryGroups, total, itemCount: (items as any[]).length });
    }
    return groups.sort((a, b) => a.propId.localeCompare(b.propId));
  }, [expandedCoded]);

  function upsertTx(list: Tx[]) { setTx((prev) => [...list, ...prev]); }

  async function importFile(file: File) {
    const name = file.name.toLowerCase();
    if (!(name.endsWith(".xlsx") || name.endsWith(".xls"))) { alert("Upload an Excel (XLSX) file."); return; }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames.includes("Transaction Details") ? "Transaction Details" : wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const b1 = (sheet as any)["B1"]?.v;
    const parsedPeriod = parsePeriodFromCellB1(b1);
    if (parsedPeriod.text) { setStatementPeriodText(parsedPeriod.text); setStatementStart(parsedPeriod.start); setStatementEnd(parsedPeriod.end); }
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const headerRowIdx = rows.findIndex((r) => r.map((x: any) => String(x).toLowerCase()).join(" ").includes("date") && r.map((x: any) => String(x).toLowerCase()).join(" ").includes("amount"));
    if (headerRowIdx < 0) { alert("Could not find the transaction table (header with Date + Amount)."); return; }
    const headers = rows[headerRowIdx].map((h: any) => String(h).trim());
    const dataRows = rows.slice(headerRowIdx + 1).filter((r) => r.some((v: any) => String(v).trim() !== ""));
    const headerLower = headers.map((h: string) => h.toLowerCase());
    const idx = (exact: string) => headerLower.findIndex((h: string) => h === exact.toLowerCase());
    const dateIdx = idx("date"), descIdx = idx("description"), cardIdx = idx("card member"), amtIdx = idx("amount");
    const imported: Tx[] = dataRows.map((r) => {
      const statementCat = String(r[13] ?? "").trim();
      const isTransportation = statementCat.toLowerCase().includes("transportation");
      return newTx({ date: dateIdx >= 0 ? String(r[dateIdx] ?? "") : "", description: descIdx >= 0 ? String(r[descIdx] ?? "") : "", cardMember: cardIdx >= 0 ? String(r[cardIdx] ?? "") : "", amount: normalizeAmount(amtIdx >= 0 ? r[amtIdx] : 0), category: isTransportation ? "AUTO" : "", propertyId: isTransportation ? "BP & SC" : "" });
    }).filter((t) => Number(t.amount) > 0);
    upsertTx(imported);
  }

  function updateTx(id: string, patch: Partial<Tx>) {
    setTx((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function clearAll() {
    if (!confirm("Clear all imported transactions?")) return;
    setTx([]); setStatementPeriodText(""); setStatementStart(null); setStatementEnd(null);
  }

  function propName(propId: string) {
    const p = properties.find((x) => x.id === propId);
    return p ? p.name : propId;
  }

  async function saveStatement() {
    const coded = tx.filter((t) => Number(t.amount) > 0).filter(isRowCoded);
    if (!coded.length) { alert("No coded transactions to save."); return; }
    const label = statementPeriodText || statementMonth || "Unknown period";
    if (!confirm(`Save "${label}" (${coded.length} transactions) to history?`)) return;
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodText: label, statementMonth: statementMonth || "", tx: coded.map((t) => ({ date: t.date, cardMember: t.cardMember, description: t.description, codedDescription: t.codedDescription, category: t.category, propertyId: t.propertyId, suite: t.suite, amount: t.amount })) }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error ?? `Save failed (${res.status})`); }
      alert("Saved to history.");
    } catch (e: any) {
      setSaveError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function generateAllPdfsZip() {
    if (!invoiceGroups.length) return;
    if (!confirm(`Generate ${invoiceGroups.length} property invoice${invoiceGroups.length !== 1 ? "s" : ""} + TOP SHEET as a ZIP?`)) return;
    const zip = new JSZip();
    const filenameMonth = statementMonth || "Statement";
    if (expandedCoded.length) {
      const topBlob = buildTopSheetXlsx({
        statementPeriodText: statementPeriodText || "",
        statementMonth: statementMonth || "",
        tx: expandedCoded.map((t: any) => ({ date: t.date, cardMember: t.cardMember, description: t.description, codedDescription: t.codedDescription, amount: t.amount, originalAmount: t.originalAmount, category: t.category, propertyId: t.propertyId, propertyName: propName(t.propertyId), suite: t.suite } as TopSheetTx)),
        propertyOrder: properties.map((p) => ({ id: p.id, name: p.name })),
        categoryOrder: [...TOP_SHEET_CATEGORIES],
      });
      zip.file(`${filenameMonth} - TOP SHEET.xlsx`, topBlob);
    }
    for (const g of invoiceGroups) {
      const blob = buildInvoicePdf({
        propertyName: propName(g.propId),
        propertyCode: g.propId,
        categoryGroups: g.categoryGroups.map((cg) => ({ category: cg.category, items: cg.items.map((t: any) => ({ date: t.date, description: t.description, amount: t.amount, category: t.category, suite: t.suite, codedDescription: t.codedDescription, originalAmount: t.originalAmount })) })),
        invoiceDate: invoiceDate || "",
        statementMonth: statementMonth || "",
        periodText: statementPeriodText || "",
        periodCompact: (statementStart && effectiveEnd) ? `${formatDateCompact(statementStart)}-${formatDateCompact(effectiveEnd)}` : undefined,
        invoiceId: makeInvoiceId(g.propId),
      });
      zip.file(`${filenameMonth} - ${g.propId}.pdf`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    download(`${filenameMonth} - Invoices.zip`, zipBlob);
    setShowAfterZipModal(true);
  }

  const CODE_TABLE_MAX_HEIGHT = "calc(100vh - 320px)";
  const stickyThStyle: React.CSSProperties = { position: "sticky", top: 0, zIndex: 15, background: "#fff" };

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <header>
        <h1>Credit Card Expense Coder</h1>
      </header>

      {/* Import bar */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <b>Import Credit Card Statement</b>
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              Upload an Amex Excel statement (.xlsx / .xls). Transportation rows auto-code to AUTO / BP &amp; SC.
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <input type="file" accept=".xlsx,.xls" style={{ width: "auto", flex: 1, fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); (e.target as any).value = ""; }} />
              <button className="btn" onClick={clearAll} disabled={!tx.length}>Clear</button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="pill"><b style={{ fontSize: 17, fontWeight: 900 }}>{totals.count}</b><span className="small muted">Transactions</span></div>
              <div className="pill"><b style={{ fontSize: 17, fontWeight: 900 }}>{totals.coded}</b><span className="small muted">Coded</span></div>
              <div className="pill pill-total"><b style={{ fontSize: 17, fontWeight: 900 }}>{toMoney(totals.total)}</b><span className="small muted">Total</span></div>
            </div>
            <div className="small muted"><b>Period:</b> {statementPeriodText || "—"}</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn large" onClick={saveStatement} disabled={!totals.coded || saving}>
                {saving ? "Saving…" : "Save to History"}
              </button>
              <button className="btn primary large" onClick={generateAllPdfsZip} disabled={!invoiceGroups.length}>
                Generate ALL PDFs (ZIP)
              </button>
            </div>
            {saveError && <div style={{ color: "#b42318", fontSize: 13 }}>{saveError}</div>}
          </div>
        </div>
      </div>

      {/* Code Transactions card */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div>
            <b>Code Transactions</b>
            <div className="small muted">Category + Property required. Suite required only if Category = TI.</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={showOnlyUncoded} onChange={(e) => setShowOnlyUncoded(e.target.checked)} />
              Uncoded only
            </label>
            <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", outline: "none", width: 160 }} />
          </div>
        </div>

        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: CODE_TABLE_MAX_HEIGHT, borderRadius: 12, border: "1px solid var(--border)" }}>
          <table style={{ minWidth: 1200, width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...stickyThStyle, minWidth: 110, padding: "10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800 }}>Date</th>
                <th style={{ ...stickyThStyle, minWidth: 140, padding: "10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800 }}>User</th>
                <th style={{ ...stickyThStyle, minWidth: 110, padding: "10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800 }}>Amount</th>
                <th style={{ ...stickyThStyle, minWidth: 260, padding: "10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800 }}>Description</th>
                <th style={{ ...stickyThStyle, minWidth: 170, padding: "10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800 }}>Category</th>
                <th style={{ ...stickyThStyle, minWidth: 160, padding: "10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800 }}>Property</th>
                <th style={{ ...stickyThStyle, minWidth: 180, padding: "10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800 }}>Account Code(s)</th>
                <th style={{ ...stickyThStyle, minWidth: 120, padding: "10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800 }}>Suite (TI)</th>
                <th style={{ ...stickyThStyle, minWidth: 260, padding: "10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800 }}>Invoice Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredTx.map((t) => {
                const acctCodes = getAccountCodes(t.category, t.propertyId);
                const acctText = acctCodes.length ? acctCodes.join(", ") : "—";
                const user = toTitleCaseFirstName(t.cardMember);
                const displayDesc = trimLastTwoChars(String(t.description || ""));
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
                    <td style={{ padding: "10px" }}>{t.date}</td>
                    <td style={{ padding: "10px" }}>{user}</td>
                    <td style={{ padding: "10px" }}>{toMoney(t.amount)}</td>
                    <td style={{ padding: "10px", whiteSpace: "pre-wrap" }}>{displayDesc}</td>
                    <td style={{ padding: "8px" }}>
                      <select value={t.category} onChange={(e) => updateTx(t.id, { category: e.target.value, suite: e.target.value === "TI" ? t.suite : "" })} style={{ fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", width: "100%" }}>
                        <option value="">—</option>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "8px" }}>
                      <select value={t.propertyId} onChange={(e) => updateTx(t.id, { propertyId: e.target.value })} style={{ fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", width: "100%" }}>
                        <option value="">—</option>
                        {properties.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "10px", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                      {acctText}
                      {(!t.category || !t.propertyId) && <div className="small muted">Select category + property</div>}
                    </td>
                    <td style={{ padding: "8px" }}>
                      <input value={t.category === "TI" ? t.suite : ""} disabled={t.category !== "TI"} placeholder={t.category === "TI" ? "Suite (required)" : "—"} onChange={(e) => updateTx(t.id, { suite: e.target.value })} style={{ fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", width: "100%" }} />
                    </td>
                    <td style={{ padding: "8px" }}>
                      <input value={t.codedDescription} placeholder="Line item description…" onChange={(e) => updateTx(t.id, { codedDescription: e.target.value })} style={{ fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", width: "100%" }} />
                    </td>
                  </tr>
                );
              })}
              {!filteredTx.length && (
                <tr><td colSpan={9} className="small muted" style={{ padding: 14 }}>No rows to show.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "14px 0" }} />

        <b>Invoices</b>
        <div className="small muted" style={{ marginTop: 4, marginBottom: 10 }}>
          One invoice per property — summary page + detailed charges. BP &amp; SC expenses are pre-allocated by schedule.
        </div>
        <div style={{ borderRadius: 12, border: "1px solid var(--border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "28%" }} />
              <col />
              <col style={{ width: 80 }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ padding: "10px", textAlign: "left", color: "var(--muted)", fontWeight: 800, borderBottom: "1px solid var(--border)" }}>Property</th>
                <th style={{ padding: "10px", textAlign: "left", color: "var(--muted)", fontWeight: 800, borderBottom: "1px solid var(--border)" }}>Categories</th>
                <th style={{ padding: "10px", textAlign: "left", color: "var(--muted)", fontWeight: 800, borderBottom: "1px solid var(--border)" }}># Items</th>
                <th style={{ padding: "10px", textAlign: "right", color: "var(--muted)", fontWeight: 800, borderBottom: "1px solid var(--border)" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoiceGroups.map((g) => (
                <tr key={g.propId} style={{ borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
                  <td style={{ padding: "10px" }}>{g.propId} — {propName(g.propId)}</td>
                  <td style={{ padding: "10px", color: "var(--muted)", fontSize: 12 }}>{g.categoryGroups.map((cg) => cg.category).join(", ")}</td>
                  <td style={{ padding: "10px" }}>{g.itemCount}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{toMoney(g.total)}</td>
                </tr>
              ))}
              {!invoiceGroups.length && (
                <tr><td colSpan={4} className="small muted" style={{ padding: 14 }}>Code at least one transaction to generate invoices.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* After-ZIP modal */}
      {showAfterZipModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ maxWidth: 520, width: "100%" }}>
            <b style={{ fontSize: 16 }}>Reminder</b>
            <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 8 }}>
              Save files to Accounting drive and send invoices to <b>kormancommercial@avidbill.com</b>.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn primary large" onClick={() => setShowAfterZipModal(false)}>Sent</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
