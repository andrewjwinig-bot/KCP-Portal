"use client";

// Rent roll review, signed in — the same view Harry and Nancy get from their
// emailed link (`/budget-review/[token]`), read through the portal's own
// routes. Drew and admin also get the link to send from here.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/app/components/UserProvider";
import { RentReviewView, type ReviewApi } from "./RentReviewView";

export default function RentReviewPage() {
  return <Suspense fallback={null}><RentReview /></Suspense>;
}

async function jsonError(r: Response | null, fallback: string): Promise<string | null> {
  if (r && r.ok) return null;
  const j = r ? await r.json().catch(() => ({})) : {};
  return j?.error ?? fallback;
}

function RentReview() {
  const params = useSearchParams();
  const { user } = useUser();
  const group = params.get("group") === "BP" ? "BP" : params.get("group") === "SC" ? "SC" : user.id === "nancy" ? "BP" : "SC";
  const year = Number(params.get("year")) || new Date().getFullYear() + 1;

  const api = useMemo<ReviewApi>(() => ({
    overview: () => fetch(`/api/financials/budgets/rent-review?year=${year}&group=${group}`, { cache: "no-store" }).then((r) => r.json()),
    draft: (key) => fetch(`/api/financials/budgets/draft?key=${encodeURIComponent(key)}&year=${year}&growth=3`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => (j.missingBasis || j.error ? null : j)),
    save: async (propertyCode, payload) => jsonError(await fetch("/api/financials/budgets/leasing-assumptions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, propertyCode, ...payload }),
    }).catch(() => null), "Couldn't save that decision."),
    confirm: async (propertyCode, confirmed) => jsonError(await fetch("/api/financials/budgets/rent-review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, propertyCode, confirmed }),
    }).catch(() => null), "Couldn't save the sign-off."),
  }), [year, group]);

  const staff = user.id === "drew" || user.id === "admin";
  return (
    <main style={{ maxWidth: "none", width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      {staff && <SendLink group={group} year={year} />}
      <RentReviewView api={api} />
    </main>
  );
}

/**
 * The link to send Harry / Nancy — shown IN FULL at the top of the page, with
 * Copy and Open, because the page you are on is the signed-in one (it has the
 * sidebar) and the link is the thing to send. It opens the same review with no
 * sign-in and no portal chrome — the leasing decisions and the sign-off only.
 * The first visit creates it; after that the same link is reused until revoked.
 */
function SendLink({ group, year }: { group: "SC" | "BP"; year: number }) {
  const person = group === "SC" ? "Harry" : "Nancy";
  type L = { id: string; group: string; url: string | null; viewCount: number; lastViewedAt?: string | null };
  const [link, setLink] = useState<L | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async (create: boolean) => {
    setError(null);
    if (create) {
      const r = await fetch("/api/financials/budgets/review-link", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group, year }),
      }).catch(() => null);
      if (!r || !r.ok) { const j = r ? await r.json().catch(() => ({})) : {}; setError(j?.error ?? "Couldn't create the link."); }
    }
    const j = await fetch(`/api/financials/budgets/review-link?year=${year}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    const mine = ((j.links ?? []) as L[]).find((l) => l.group === group && l.url) ?? null;
    if (!mine && !create) return load(true);
    setLink(mine);
  };
  useEffect(() => { load(false); }, [group, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const revoke = async () => {
    if (!link || !confirm(`Revoke ${person}'s link? It stops working at once; a new one can be created.`)) return;
    await fetch("/api/financials/budgets/review-link", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: link.id }) }).catch(() => null);
    setLink(null);
  };

  return (
    <div className="card" style={{ borderColor: "rgba(11,74,125,0.35)", background: "rgba(11,74,125,0.04)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
        Link to send {person}
      </div>
      <div className="muted small">
        Opens this review <b>without signing in</b> and <b>without the portal sidebar</b> — only {person}&rsquo;s leasing decisions and sign-off. Copy it into an email.
      </div>
      {link === undefined ? <div className="muted small">Getting the link…</div>
        : link === null ? (
          <div><button type="button" className="btn primary" style={{ fontSize: 13, fontWeight: 700 }} onClick={() => load(true)}>Create {person}&rsquo;s link</button></div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input readOnly value={link.url ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label={`${person}'s link`}
                style={{ flex: "1 1 420px", minWidth: 0, fontSize: 12.5 }} />
              <button type="button" className="btn primary" style={{ fontSize: 13, fontWeight: 700 }}
                onClick={() => { navigator.clipboard?.writeText(link.url ?? "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); }}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <a className="btn" href={link.url ?? "#"} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                Open it as {person} sees it ↗
              </a>
            </div>
            <div className="muted" style={{ fontSize: 12, display: "flex", gap: 12, alignItems: "center" }}>
              <span>{link.viewCount ? `Opened ${link.viewCount}×${link.lastViewedAt ? ` · last ${new Date(link.lastViewedAt).toLocaleDateString("en-US")}` : ""}` : "Not opened yet"}</span>
              <button type="button" onClick={revoke} style={{ background: "none", border: "none", padding: 0, color: "#b91c1c", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Revoke</button>
            </div>
          </>
        )}
      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div>}
    </div>
  );
}
