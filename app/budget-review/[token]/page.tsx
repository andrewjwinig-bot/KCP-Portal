"use client";

// The Rent Roll Review, opened from the link Harry or Nancy is sent — no
// sign-in and no portal chrome: a landing page of its own. Everything goes
// through `/api/budget-review/[token]`, which checks the signed link on every
// call and refuses any property outside its group.

import { use, useMemo } from "react";
import { RentReviewView, type ReviewApi } from "@/app/financials/budgets/review/RentReviewView";

const BRAND = "#0b4a7d";

async function jsonError(r: Response | null, fallback: string): Promise<string | null> {
  if (r && r.ok) return null;
  const j = r ? await r.json().catch(() => ({})) : {};
  return j?.error ?? fallback;
}

export default function BudgetReviewLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const base = `/api/budget-review/${encodeURIComponent(token)}`;
  const api = useMemo<ReviewApi>(() => ({
    overview: () => fetch(base, { cache: "no-store" }).then((r) => r.json()),
    draft: (key) => fetch(`${base}/draft?key=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => (j.missingBasis || j.error ? null : j)),
    save: async (propertyCode, payload) => jsonError(await fetch(`${base}/leasing`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyCode, ...payload }),
    }).catch(() => null), "Couldn't save that decision."),
    confirm: async (propertyCode, confirmed) => jsonError(await fetch(`${base}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyCode, confirmed }),
    }).catch(() => null), "Couldn't save the sign-off."),
  }), [base]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #f7f9fc)" }}>
      <header style={{ background: BRAND, color: "#fff", padding: "22px clamp(16px, 4vw, 40px)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: "-0.5px" }}>KORMAN</div>
          <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "#bfdbfe" }}>COMMERCIAL PROPERTIES</div>
        </div>
      </header>
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "28px clamp(16px, 4vw, 40px) 72px" }}>
        <RentReviewView api={api} />
      </main>
    </div>
  );
}
