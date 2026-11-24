"use client";

// Website Leads — every inquiry from the website's space pages
// (lib/site/spaceInquiry.ts; owner, 11/2026, #8): who asked about which
// space, how they found us, and whether the contact and the auto-reply went.

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { HeaderSelect } from "@/app/components/HeaderSelect";
import { MetaLine } from "@/app/components/LastImported";
import { StatusBanner } from "@/app/components/StatusBanner";
import { StatPill } from "@/app/components/Pill";
import LoadingState from "@/app/components/LoadingState";
import { thL, tdL } from "@/app/components/tableStyles";
import type { Lead } from "@/lib/site/spaceInquiry";

const ICON = { size: 16, strokeWidth: 1.75 } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const TYPES: Record<string, string> = { all: "All leads", office: "Office", retail: "Retail" };
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export default function WebsiteLeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState("");
  const [type, setType] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/website-leads").then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not load the leads.");
      setLeads(j.leads ?? []);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const shown = useMemo(() => (leads ?? []).filter((l) => type === "all" || l.category === type), [leads, type]);
  const last30 = shown.filter((l) => Date.now() - Date.parse(l.at) < 30 * 864e5).length;
  const top = (key: (l: Lead) => string) => {
    const m = new Map<string, number>();
    for (const l of shown) m.set(key(l), (m.get(key(l)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  };
  const topSpace = top((l) => `${l.space} · ${l.propertyName}`);
  const topSource = top((l) => l.source || "direct");
  const failed = shown.filter((l) => !l.delivered);

  const header = (
    <PageHeader
      title="Website Leads"
      info={<>Every inquiry sent from a space page on kormancommercial.com: who asked about which space, how they found us, and whether the leasing contact and the prospect&apos;s auto-reply went out.</>}
      pickers={
        <HeaderSelect value={type} onChange={setType} displayLabel={TYPES[type]} ariaLabel="Type">
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </HeaderSelect>
      }
      meta={leads && (
        <MetaLine>
          <span>{shown.length} lead{shown.length === 1 ? "" : "s"}</span>
          {shown[0] && <span>· Latest {day(shown[0].at)}</span>}
        </MetaLine>
      )}
    />
  );

  if (!leads) return <main className="page">{header}{error ? <StatusBanner tone="danger" title="Something went wrong">{error}</StatusBanner> : <LoadingState status="Loading leads…" columns={6} rows={8} />}</main>;

  return (
    <main className="page">
      {header}
      {failed.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <StatusBanner tone="danger" title={`${failed.length} inquir${failed.length === 1 ? "y" : "ies"} did not reach the leasing contact`}>
            The email to the contact failed. The prospect was shown a message to call instead. Follow up with {failed.slice(0, 3).map((l) => l.name).join(", ")}{failed.length > 3 ? " and others" : ""}.
          </StatusBanner>
        </div>
      )}
      <div className="pills" style={{ marginTop: 16 }}>
        <StatPill label="Leads" value={String(shown.length)} total />
        <StatPill label="Last 30 days" value={String(last30)} />
        <StatPill label={topSpace ? `Most asked · ${topSpace[0]}` : "Most asked"} value={topSpace ? String(topSpace[1]) : "—"} />
        <StatPill label={topSource ? `Top source · ${title(topSource[0])}` : "Top source"} value={topSource ? String(topSource[1]) : "—"} />
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: "auto" }}>
        {shown.length === 0 ? (
          <div style={{ padding: 16, color: "var(--muted)" }}>No inquiries yet. They arrive from the Ask About This Space form on each space&apos;s page.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr>
                <th style={thL}>Received</th>
                <th style={thL}>Prospect</th>
                <th style={thL}>Space</th>
                <th style={thL}>Source</th>
                <th style={thL}>Sent to</th>
                <th style={thL}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const isOpen = open === l.id;
                return (
                  <Fragment key={l.id}>
                    <tr className="task-row" style={{ cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : l.id)}>
                      <td style={tdL}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {isOpen ? <ChevronDown {...ICON} /> : <ChevronRight {...ICON} />}
                          {day(l.at)}
                        </span>
                      </td>
                      <td style={{ ...tdL, fontWeight: 600 }}>{l.name}{l.company && <div style={{ fontWeight: 400, color: "var(--muted)", fontSize: "var(--fs-13)" }}>{l.company}</div>}</td>
                      <td style={tdL}>{l.space}<div style={{ color: "var(--muted)", fontSize: "var(--fs-13)" }}>{l.propertyName} · {l.size}</div></td>
                      <td style={tdL}>{title(l.source || "direct")}</td>
                      <td style={tdL}>{l.sentTo ?? "—"}</td>
                      <td style={{ ...tdL, color: l.delivered ? "var(--green-text, #067647)" : "var(--red-text, #B42318)", fontWeight: 600 }}>
                        {l.delivered ? (l.autoReplied ? "Sent" : "Sent · no auto-reply") : "Not delivered"}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ padding: "4px 12px 16px 32px", maxWidth: 0 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px 24px", padding: "8px 0" }}>
                            <Field label="Email"><a className="text-link" href={`mailto:${l.email}?subject=${encodeURIComponent(`Re: ${l.space} at ${l.propertyName}`)}`}>{l.email}</a></Field>
                            <Field label="Phone">{l.phone ? <a className="text-link" href={`tel:${l.phone}`}>{l.phone}</a> : "—"}</Field>
                            <Field label="Needs it">{l.timing || "—"}</Field>
                            <Field label="Received">{day(l.at)} at {time(l.at)}</Field>
                            <Field label="Came from">{l.referrer ? l.referrer.replace(/^https?:\/\//, "").slice(0, 60) : "Direct"}</Field>
                            <Field label="Space page">
                              <a className="text-link" href={`https://kormancommercial.com/space/${l.slug}`} target="_blank" rel="noreferrer">
                                Open <ExternalLink {...ICON} />
                              </a>
                            </Field>
                          </div>
                          {l.message && <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", color: "var(--text)" }}>{l.message}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "var(--fs-13)", color: "var(--muted)", fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  );
}
