"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type SavedTx = {
  date: string;
  cardMember: string;
  description: string;
  codedDescription: string;
  category: string;
  propertyId: string;
  suite: string;
  amount: number;
};

type StatementMeta = {
  id: string;
  savedAt: string;
  periodText: string;
  statementMonth: string;
  txCount: number;
  total: number;
};

type StatementDetail = StatementMeta & { tx: SavedTx[] };

function toMoney(n: number) {
  return Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportStatement(entry: StatementDetail) {
  const wb = XLSX.utils.book_new();
  const sorted = [...entry.tx].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.propertyId.localeCompare(b.propertyId)));
  const chargesAoa: (string | number | null)[][] = [
    ["Date", "Card Member", "Description", "Invoice Description", "Category", "Property", "Suite", "Amount"],
    ...sorted.map((t) => [t.date, t.cardMember, t.description, t.codedDescription, t.category, t.propertyId, t.suite || "", t.amount]),
  ];
  const chargesSheet = XLSX.utils.aoa_to_sheet(chargesAoa);
  chargesSheet["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 42 }, { wch: 42 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, chargesSheet, "Charges");

  const propCatMap = new Map<string, Map<string, number>>();
  for (const t of entry.tx) {
    const m = propCatMap.get(t.propertyId) ?? new Map<string, number>();
    m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
    propCatMap.set(t.propertyId, m);
  }
  const cats = [...new Set(entry.tx.map((t) => t.category).filter(Boolean))].sort();
  const props = [...propCatMap.keys()].sort();
  const summaryRows = props.map((propId) => {
    const m = propCatMap.get(propId)!;
    const catAmounts = cats.map((c) => m.get(c) ?? null);
    return [propId, ...catAmounts, cats.reduce((a, c) => a + (m.get(c) ?? 0), 0)];
  });
  const catTotals = cats.map((c) => props.reduce((a, p) => a + (propCatMap.get(p)?.get(c) ?? 0), 0));
  const summarySheet = XLSX.utils.aoa_to_sheet([["Property", ...cats, "TOTAL"], ...summaryRows, ["TOTAL", ...catTotals.map((v) => (v === 0 ? null : v)), catTotals.reduce((a, v) => a + v, 0)]]);
  summarySheet["!cols"] = [{ wch: 10 }, ...cats.map(() => ({ wch: 14 })), { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(`${entry.statementMonth || "Statement"} - History Export.xlsx`, new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

export default function ExpenseHistoryPage() {
  const [statements, setStatements] = useState<StatementMeta[]>([]);
  const [details, setDetails] = useState<Record<string, StatementDetail>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/statements")
      .then((r) => r.json())
      .then((data) => { setStatements(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!details[id]) {
      const res = await fetch(`/api/statements/${id}`);
      if (res.ok) { const d = await res.json(); setDetails((prev) => ({ ...prev, [id]: d })); }
    }
  }

  async function deleteStatement(id: string) {
    if (!confirm("Delete this saved statement?")) return;
    await fetch(`/api/statements/${id}`, { method: "DELETE" });
    setStatements((prev) => prev.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  const btnStyle = (red?: boolean): React.CSSProperties => ({
    fontSize: 13, padding: "5px 14px", borderRadius: 7,
    border: `1px solid ${red ? "#b42318" : "#1a1a1a"}`,
    background: "transparent", color: red ? "#b42318" : "#1a1a1a",
    cursor: "pointer", fontWeight: 500,
  });

  return (
    <main>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <h1>Credit Card Expense Coder</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div>COMMERCIAL</div>
            <div>PROPERTIES</div>
          </div>
        </div>
      </header>

      <div className="card">
        <b style={{ fontSize: 15 }}>Statement History</b>
        <div className="small muted" style={{ marginTop: 4, marginBottom: 16 }}>
          Saved statements for reference. Use &ldquo;Save to History&rdquo; on the Expense Coder page to archive each statement.
        </div>

        {loading && <div className="small muted">Loading…</div>}

        {!loading && statements.length === 0 && (
          <div className="small muted" style={{ padding: "20px 0" }}>
            No statements saved yet. Code a statement and click &ldquo;Save to History&rdquo; to start building your archive.
          </div>
        )}

        {statements.map((s) => {
          const isExpanded = expandedId === s.id;
          const detail = details[s.id];
          return (
            <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: isExpanded ? "rgba(11,74,125,0.04)" : "#fff" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.periodText || s.statementMonth}</div>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    Saved {new Date(s.savedAt).toLocaleDateString()} &nbsp;·&nbsp; {s.txCount} transactions &nbsp;·&nbsp; {toMoney(s.total)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button style={btnStyle()} onClick={() => toggleExpand(s.id)}>{isExpanded ? "Close" : "View"}</button>
                  <button style={btnStyle()} onClick={() => detail && exportStatement(detail)} disabled={!detail} title="Export as Excel">Export</button>
                  <button style={btnStyle(true)} onClick={() => deleteStatement(s.id)}>Delete</button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--border)", overflowX: "auto" }}>
                  {!detail ? (
                    <div className="small muted" style={{ padding: 14 }}>Loading…</div>
                  ) : detail.tx.length === 0 ? (
                    <div className="small muted" style={{ padding: 14 }}>No transactions.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
                      <thead>
                        <tr>
                          {["Date", "Card Member", "Description", "Invoice Description", "Category", "Property", "Suite", "Amount"].map((h) => (
                            <th key={h} style={{ padding: "10px", textAlign: h === "Amount" ? "right" : "left", color: "var(--muted)", fontWeight: 800, borderBottom: "1px solid var(--border)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.tx.map((t, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
                            <td style={{ padding: "10px" }}>{t.date}</td>
                            <td style={{ padding: "10px" }}>{t.cardMember}</td>
                            <td style={{ padding: "10px" }}>{t.description}</td>
                            <td style={{ padding: "10px" }}>{t.codedDescription}</td>
                            <td style={{ padding: "10px" }}>{t.category}</td>
                            <td style={{ padding: "10px" }}>{t.propertyId}</td>
                            <td style={{ padding: "10px" }}>{t.suite || "—"}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{toMoney(t.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
