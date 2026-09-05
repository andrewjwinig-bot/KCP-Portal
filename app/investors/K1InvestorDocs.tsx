"use client";

// One investor's K-1s, shown inside their card on the By Investor view.
//
// Read-only on purpose: importing and confirming happen per property (that's how
// the batch arrives), so this is the "what does this person have, and can they
// get to it" view. One person can hold several interests in the same
// partnership — a trust and a personal one — so each interest is listed
// separately rather than merged, because they receive separate K-1s.

import { useEffect, useState } from "react";
import { Pill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL, TONE_RED } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";

type Interest = {
  ownerId: string; propertyCode: string; propertyName: string; filesK1: boolean;
  heldAs: string | null; vendorCode: string | null;
  documents: { id: string; taxYear: number; filename: string; published: boolean; status: string; viewCount: number }[];
  link: { id: string; createdAt: string; viewCount: number; lastViewedAt: string | null } | null;
};

export function K1InvestorDocs({ investor }: { investor: string }) {
  const [interests, setInterests] = useState<Interest[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/investor-k1?investor=${encodeURIComponent(investor)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setInterests(j?.ok ? (j.interests ?? []) : []); })
      .catch(() => { if (alive) setInterests([]); });
    return () => { alive = false; };
  }, [investor]);

  // Only the partnerships that actually distribute — a wholly-owned building
  // issues nobody a K-1, and listing it as "missing" would be noise.
  const relevant = (interests ?? []).filter((i) => i.filesK1);
  if (!interests || relevant.length === 0) return null;

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "rgba(15,118,110,0.03)", padding: "13px 16px 15px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#0f766e" }}>
        Schedule K-1s
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 9 }}>
        {relevant.map((i) => (
          <div key={i.ownerId} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--card)" }}>
            <div style={{ minWidth: 0, flex: "1 1 240px" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                <code style={{ fontSize: 11.5 }}>{i.propertyCode}</code> {i.propertyName}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {i.heldAs ? <span style={{ fontStyle: "italic" }}>{i.heldAs}</span> : "Held personally"}
                {i.vendorCode ? ` · ${i.vendorCode}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {i.documents.length === 0
                ? <Pill tone={TONE_RED}>NO K-1 YET</Pill>
                : i.documents.map((d) => (
                    <HoverCard key={d.id} title={`${d.taxYear} Schedule K-1`} width={280}
                      rows={[
                        { label: "File", value: d.filename },
                        { label: "Status", value: d.published ? "Published" : d.status === "confirmed" ? "Confirmed, not published" : "Awaiting confirmation" },
                        { label: "Downloaded", value: d.viewCount ? `${d.viewCount}×` : "Not yet" },
                      ]}
                      footer={{ label: "Open", value: "Click to preview" }}>
                      <a href={`/api/investor-k1/file?id=${d.id}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                        <Pill tone={d.published ? TONE_GREEN : d.status === "confirmed" ? TONE_AMBER : TONE_NEUTRAL}>{d.taxYear}</Pill>
                      </a>
                    </HoverCard>
                  ))}
            </div>
            <div style={{ marginLeft: "auto", flexShrink: 0 }}>
              {i.link ? (
                <HoverCard title="Investor link" width={250}
                  rows={[
                    { label: "Shared", value: new Date(i.link.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                    { label: "Opened", value: i.link.viewCount ? `${i.link.viewCount}×` : "Not yet" },
                  ]}
                  footer={{ label: "Manage", value: "On the property, By Property" }}>
                  <Pill tone={i.link.viewCount ? TONE_GREEN : TONE_NEUTRAL}>{i.link.viewCount ? `OPENED ${i.link.viewCount}×` : "SHARED"}</Pill>
                </HoverCard>
              ) : (
                <Pill tone={TONE_NEUTRAL}>NO LINK</Pill>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 9 }}>
        Importing and sharing happen on the property — K-1s arrive as one batch per partnership.
      </div>
    </div>
  );
}
