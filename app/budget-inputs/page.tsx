"use client";

// Budget Inputs — Greg's whole view of the budget (he can reach nothing else;
// its API returns the three keyed lines and never rents or NOI). Everyone else
// keys these on the master budget page, Step 3, which renders the SAME table
// (`ExpenseInputsPanel`), so the two cannot drift.

import { useState } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { HeaderSelect, propertyLabel } from "@/app/components/HeaderSelect";
import { bookById, bookProperties, budgetBooks } from "@/lib/financials/budgets/books";
import { ExpenseInputsPanel } from "./ExpenseInputsPanel";

export default function BudgetInputsPage() {
  const thisYear = new Date().getFullYear();
  // Next year's budget by default — the one being built.
  const [year, setYear] = useState(thisYear + 1);
  const [bookId, setBookId] = useState("shopping-centers");
  const [only, setOnly] = useState<string | null>(null);
  const book = bookById(bookId) ?? bookById("shopping-centers")!;
  const props = bookProperties(book);
  const current = only ? props.find((p) => p.code === only) : undefined;
  const years = [thisYear, thisYear + 1, thisYear + 2];

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PageHeader title="Budget Inputs"
        info={<>The figures a growth percentage can&rsquo;t know, keyed by the person who does. Each sits above this year&rsquo;s budget, actual and forecast.
          Saving one marks it done on the budget&rsquo;s Expenses step and puts it straight into the draft.</>}
        pickers={<>
          <HeaderSelect value={book.id} ariaLabel="Budget" maxWidth={320}
            onChange={(id) => { setBookId(id); setOnly(null); }} displayLabel={book.name}>
            {budgetBooks().map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </HeaderSelect>
          {props.length > 0 && (
            <HeaderSelect value={only ?? ""} ariaLabel="Property" maxWidth={420}
              onChange={(v) => setOnly(v || null)}
              displayLabel={current ? propertyLabel(current.code, current.name) : `All ${book.name}`}>
              {(book.rollsUp || only === null) && <option value="">All {book.name}</option>}
              {props.map((p) => <option key={p.code} value={p.code}>{propertyLabel(p.code, p.name)}</option>)}
            </HeaderSelect>
          )}
          <HeaderSelect value={String(year)} muted ariaLabel="Year" onChange={(v) => setYear(Number(v))} displayLabel={`${year} Budget`}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </HeaderSelect>
        </>} />

      <ExpenseInputsPanel year={year} bookId={bookId} only={only} />
    </main>
  );
}
