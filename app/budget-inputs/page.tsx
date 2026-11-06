"use client";

// Budget Inputs — Greg's whole view of the budget (he can reach nothing else;
// its API returns the three keyed lines and never rents or NOI). Everyone else
// keys these on the master budget page, Step 3, which renders the SAME table
// (`ExpenseInputsPanel`), so the two cannot drift.

import { useState } from "react";
import { BookMasthead } from "@/app/financials/budgets/draft/BookMasthead";
import { bookById } from "@/lib/financials/budgets/books";
import { ExpenseInputsPanel } from "./ExpenseInputsPanel";

export default function BudgetInputsPage() {
  const thisYear = new Date().getFullYear();
  // Next year's budget by default — the one being built.
  const [year, setYear] = useState(thisYear + 1);
  const [bookId, setBookId] = useState("shopping-centers");
  const [only, setOnly] = useState<string | null>(null);
  const book = bookById(bookId) ?? bookById("shopping-centers")!;

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h1 style={{ marginBottom: 4 }}>Budget Inputs</h1>
        <p className="muted small" style={{ margin: 0 }}>
          The figures a growth percentage can&rsquo;t know, keyed by the person who does. Each sits above this year&rsquo;s budget, actual and forecast.
          Saving one marks it done on the budget&rsquo;s Expenses step and puts it straight into the draft.
        </p>
      </div>

      <BookMasthead book={book} year={year} propertyCode={only}
        onBook={(id) => { setBookId(id); setOnly(null); }} onProperty={setOnly} onYear={setYear}
        years={[thisYear, thisYear + 1, thisYear + 2]} />

      <ExpenseInputsPanel year={year} bookId={bookId} only={only} />
    </main>
  );
}
