"use client";

// Which budget you are in, said once and plainly.
//
// There are seven books and a property's budget is a SHEET INSIDE one of them,
// so the book cannot be a filter in a toolbar — a dropdown among equals reads
// as "narrow the list", not as "this is a different document". The book's name
// leads the page at size; switching it is a deliberate act; and the properties
// sit UNDER it as tabs, led by the roll-up, which is how the workbook itself
// is arranged.

import { Pill, TONE_BLUE, TONE_NEUTRAL } from "@/app/components/Pill";
import { budgetBooks, bookProperties, type BudgetBook } from "@/lib/financials/budgets/books";

const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

const tab = (active: boolean): React.CSSProperties => ({
  fontSize: 12.5, fontWeight: 700, padding: "5px 12px", borderRadius: 999,
  border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
  background: active ? "rgba(11,74,125,0.10)" : "var(--card)",
  color: active ? "var(--brand)" : "var(--text)",
  cursor: "pointer", whiteSpace: "nowrap",
});

export function BookMasthead({ book, year, propertyCode, onBook, onProperty, onYear, years }: {
  book: BudgetBook;
  year: number;
  /** Null = the roll-up across the whole book. */
  propertyCode: string | null;
  onBook: (id: string) => void;
  onProperty: (code: string | null) => void;
  onYear: (y: number) => void;
  years: number[];
}) {
  const props = bookProperties(book);

  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={secLabel}>{year} Operating Budget</div>
          <h1 style={{ margin: "2px 0 0", fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>{book.name}</h1>
          <div className="muted small" style={{ marginTop: 3 }}>
            {book.subtitle}
            {book.properties.length > 0 && ` · ${book.properties.length} ${book.properties.length === 1 ? "property" : "properties"}`}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={secLabel}>Budget</span>
            <select value={book.id} onChange={(e) => onBook(e.target.value)} className="select-brand select-sm">
              {budgetBooks().map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={secLabel}>Year</span>
            <select value={year} onChange={(e) => onYear(Number(e.target.value))} className="select-sm">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
      </div>

      {book.properties.length > 0 && (
        <>
          <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0 10px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {/* The roll-up LEADS. It is what the book is for; the properties
                are its parts, which is the order the workbook uses too. */}
            {book.rollsUp && (
              <button type="button" onClick={() => onProperty(null)} style={tab(propertyCode === null)}>
                All {book.name}
              </button>
            )}
            {props.map((p) => (
              <button key={p.code} type="button" onClick={() => onProperty(p.code)} style={tab(propertyCode === p.code)}
                title={p.name}>
                {p.code}
              </button>
            ))}
          </div>
          {propertyCode && (
            <div className="muted small" style={{ marginTop: 7 }}>
              {props.find((p) => p.code === propertyCode)?.name} · a sheet inside the {book.name} budget
            </div>
          )}
        </>
      )}

      {book.feeds && book.feeds.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Pill tone={TONE_BLUE}>FEEDS OTHER BOOKS</Pill>
          <span className="muted small">
            The salaries set here are what {book.feeds.length} other {book.feeds.length === 1 ? "budget allocates" : "budgets allocate"} across their properties.
          </span>
        </div>
      )}

      {book.properties.length === 0 && !book.feeds && (
        <div style={{ marginTop: 10 }}><Pill tone={TONE_NEUTRAL}>NO PROPERTIES MAPPED YET</Pill></div>
      )}
    </div>
  );
}
