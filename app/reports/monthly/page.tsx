"use client";

// Standalone Monthly Review page — kept as a clean, printable full view.
// The same panel is folded into the Dashboard (embedded) for finance users.
import MonthlyReviewPanel from "./MonthlyReviewPanel";

export default function MonthlyReviewPage() {
  return (
    <main style={{ maxWidth: 1180, width: "100%", margin: "0 auto" }}>
      <MonthlyReviewPanel />
    </main>
  );
}
