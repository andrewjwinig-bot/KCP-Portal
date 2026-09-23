"use client";

// Rent roll review, signed in — the same view Harry and Nancy get from their
// emailed link (`/budget-review/[token]`), read through the portal's own
// routes. Drew and admin also get the link to send from here.

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/app/components/UserProvider";
import { ShareLinkCard, type ShareLink } from "@/app/components/ShareLinkCard";
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
    <main style={{ maxWidth: 1360, width: "100%" }}>
      <RentReviewView api={api} headerExtra={staff ? <SendLink group={group} year={year} /> : undefined} />
    </main>
  );
}

/** The link to send Harry / Nancy — opens this page without signing in. */
function SendLink({ group, year }: { group: "SC" | "BP"; year: number }) {
  const person = group === "SC" ? "Harry" : "Nancy";
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    const j = await fetch(`/api/financials/budgets/review-link?year=${year}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    setLinks(((j.links ?? []) as { id: string; group: string; url: string | null; createdAt: string; viewCount: number; lastViewedAt?: string | null }[])
      .filter((l) => l.group === group && l.url)
      .map((l) => ({ id: l.id, url: l.url!, createdAt: l.createdAt, viewCount: l.viewCount, lastViewedAt: l.lastViewedAt ?? null })));
  };
  return (
    <ShareLinkCard
      buttonLabel={`${person}'s link`}
      title="Rent roll review link"
      subject={person}
      description={<>Opens this review for {person} <b>without signing in</b> — every {group === "SC" ? "shopping center" : "business park"}, their leasing calls and sign-off, saved straight into the {year} budget. Copy it into an email to {person}. Anyone holding it can open it, so revoke it when the review is done.</>}
      links={links}
      busy={busy}
      error={error}
      onOpen={load}
      onCreate={async () => {
        setBusy(true); setError(null);
        const r = await fetch("/api/financials/budgets/review-link", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group, year }),
        }).catch(() => null);
        const j = r ? await r.json().catch(() => ({})) : {};
        if (!r || !r.ok) setError(j?.error ?? "Couldn't create the link.");
        await load();
        setBusy(false);
      }}
      onRevoke={async (id) => {
        setBusy(true);
        await fetch("/api/financials/budgets/review-link", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
        await load();
        setBusy(false);
      }}
      pinOptional={false}
      emptyNote={`No link yet — create one to send ${person}.`}
    />
  );
}
