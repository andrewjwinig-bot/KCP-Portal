"use client";

// K-1 distribution for ONE partnership, rendered inside that property's card on
// Investor Info. The batch arrives per property for all its investors, so this
// sits where the roster already is rather than on a page of its own.
//
// Gated by canManageK1 at the call site — NOT canEditOwnership, which includes
// a family member who is herself an owner. The API enforces the same rule
// server-side, so the gate here is about not showing a control, not about
// keeping data safe.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pill, StatPill, TONE_AMBER, TONE_BLUE, TONE_GREEN, TONE_NEUTRAL, TONE_RED } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import type { K1Document, K1MatchConfidence } from "@/lib/investors/k1";

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { textAlign: "left", padding: "9px 10px", fontSize: 14 };

type OwnerRow = {
  id: string; name: string; detailedName: string | null; vendorCode: string | null;
  ownerPct: number | null; sharesName: boolean;
  link: { id: string; createdAt: string; viewCount: number; lastViewedAt: string | null } | null;
};
type Payload = { ok: true; years: number[]; owners: OwnerRow[]; documents: K1Document[]; blockers: string[] };

const CONFIDENCE: Record<K1MatchConfidence, { label: string; tone: typeof TONE_GREEN }> = {
  "vendor-code": { label: "VENDOR CODE", tone: TONE_GREEN },
  "trust-name": { label: "TRUST NAME", tone: TONE_GREEN },
  "name": { label: "NAME", tone: TONE_AMBER },
  "ambiguous": { label: "AMBIGUOUS", tone: TONE_RED },
  "none": { label: "NO MATCH", tone: TONE_NEUTRAL },
};
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function K1Panel({ propertyCode }: { propertyCode: string }) {
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState<{ ownerId: string; ownerName: string; url: string; pin: string; sentTo: string[]; mailError: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await fetch(`/api/investor-k1?property=${propertyCode}&year=${year}`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "Could not load.");
      setData(j);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load."); }
  }, [propertyCode, year]);
  useEffect(() => { void load(); }, [load]);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("property", propertyCode);
      fd.append("year", String(year));
      for (const f of files) fd.append("file", f);
      const j = await fetch("/api/investor-k1", { method: "POST", body: fd }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "Upload failed.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); } finally { setBusy(false); }
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/investor-k1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not update.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update."); } finally { setBusy(false); }
  }

  async function share(owner: OwnerRow, send: boolean) {
    setBusy(true); setError(null); setShared(null);
    try {
      const res = await fetch("/api/investor-k1/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyCode, ownerId: owner.id, send }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not create the link.");
      setShared({ ownerId: owner.id, ownerName: owner.name, url: j.url, pin: j.pin, sentTo: j.sentTo ?? [], mailError: j.mailError ?? null });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the link."); } finally { setBusy(false); }
  }

  const docs = data?.documents ?? [];
  const owners = data?.owners ?? [];
  const confirmed = docs.filter((d) => d.status === "confirmed").length;
  const published = docs.length > 0 && docs.every((d) => d.published);
  const sharedNames = owners.filter((o) => o.sharesName).length;
  const missing = owners.filter((o) => !docs.some((d) => d.ownerId === o.id)).length;

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "rgba(15,118,110,0.03)", padding: "16px 16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...SECTION_LABEL, color: "#0f766e" }}>Schedule K-1s</div>
          <div className="muted small" style={{ marginTop: 3 }}>
            Import the year&rsquo;s batch, confirm who each belongs to, then share a private link with every investor.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ fontSize: 12.5, padding: "5px 9px" }}>
            {Array.from(new Set([...(data?.years ?? []), new Date().getFullYear() - 1, new Date().getFullYear() - 2]))
              .sort((a, b) => b - a).map((y) => <option key={y} value={y}>{y} tax year</option>)}
          </select>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple style={{ display: "none" }}
            onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void upload(f); }} />
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()} style={{ fontSize: 12.5, padding: "5px 11px", fontWeight: 700 }}>
            Import {year} K-1s
          </button>
          <Pill tone={published ? TONE_GREEN : TONE_NEUTRAL}>{published ? "SHAREABLE" : "NOT PUBLISHED"}</Pill>
          <button className={published ? "btn" : "btn primary"} disabled={busy || docs.length === 0}
            onClick={() => patch({ action: published ? "unpublish" : "publish", property: propertyCode, year })}
            style={{ fontSize: 12.5, padding: "5px 11px", fontWeight: 700 }}>
            {published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {error && <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 12.5, fontWeight: 600 }}>{error}</div>}

      <div className="pills" style={{ flexWrap: "wrap", justifyContent: "flex-start", marginTop: 12 }}>
        <StatPill label="Confirmed" value={`${confirmed}/${docs.length}`} sub="matched by a person" accent={docs.length && confirmed === docs.length ? "#15803d" : "#b45309"} />
        <StatPill label="Owners without a K-1" value={missing} sub={`of ${owners.length}`} accent={missing ? "#b45309" : undefined} />
        <StatPill label="Links shared" value={owners.filter((o) => o.link).length} sub={`${owners.filter((o) => (o.link?.viewCount ?? 0) > 0).length} opened`} />
      </div>

      {sharedNames > 0 && (
        <div style={{ marginTop: 12, borderRadius: 10, padding: "10px 13px", background: "rgba(217,119,6,0.07)", border: "1px solid rgba(217,119,6,0.35)", fontSize: 12.5, color: "#7c3d06", lineHeight: 1.6 }}>
          <strong>{sharedNames} owners here share a name with another owner.</strong>{" "}
          A filename with only a name can&rsquo;t tell those interests apart, so nothing is auto-matched for them.
          Ask your accountant to include the vendor code (e.g. <code style={{ fontSize: 11.5 }}>{owners.find((o) => o.sharesName)?.vendorCode ?? "AKGST"}</code>)
          or the full trust name and they&rsquo;ll match unambiguously.
        </div>
      )}

      {data && data.blockers.length > 0 && docs.length > 0 && (
        <div style={{ marginTop: 10, borderRadius: 10, padding: "10px 13px", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.3)", fontSize: 12.5, color: "#b91c1c", fontWeight: 600 }}>
          {data.blockers.map((b, i) => <div key={i} style={{ marginTop: i ? 4 : 0 }}>{b}</div>)}
        </div>
      )}

      {docs.length > 0 && (
        <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 10, overflowX: "auto", background: "var(--card)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
            <thead>
              <tr><th style={th}>File</th><th style={th}>Match</th><th style={th}>Assigned to</th><th style={{ ...th, textAlign: "right" }}>Actions</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const conf = CONFIDENCE[d.match.confidence];
                return (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--border)", background: d.status === "confirmed" ? "rgba(22,163,74,0.04)" : undefined }}>
                    <td style={{ ...td, maxWidth: 230 }}>
                      <a href={`/api/investor-k1/file?id=${d.id}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>{d.filename}</a>
                      <div className="muted" style={{ fontSize: 11.5 }}>{kb(d.size)} · {d.uploadedBy}</div>
                    </td>
                    <td style={td}>
                      <HoverCard title="How this was matched" width={286}
                        rows={[{ label: "Signal", value: conf.label }, ...(d.match.candidates.length ? [{ label: "Candidates", value: String(d.match.candidates.length) }] : [])]}
                        footer={{ label: "Confirmed by", value: d.confirmedBy ?? "Nobody yet" }}>
                        <Pill tone={d.status === "confirmed" ? TONE_GREEN : conf.tone}>{d.status === "confirmed" ? "CONFIRMED" : conf.label}</Pill>
                      </HoverCard>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 3, maxWidth: 260 }}>{d.match.reason}</div>
                    </td>
                    <td style={td}>
                      <select value={d.ownerId ?? ""} disabled={busy}
                        onChange={(e) => e.target.value && patch({ action: "assign", id: d.id, ownerId: e.target.value })}
                        style={{ fontSize: 12.5, padding: "5px 8px", minWidth: 220 }}>
                        <option value="">— pick the owner —</option>
                        {owners.map((o) => (
                          <option key={o.id} value={o.id}>{o.name}{o.detailedName ? ` · ${o.detailedName}` : ""}{o.vendorCode ? ` (${o.vendorCode})` : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {d.status === "confirmed"
                        ? <button className="btn" disabled={busy} onClick={() => patch({ action: "unconfirm", id: d.id })} style={{ fontSize: 12, padding: "4px 9px" }}>Undo</button>
                        : <button className="btn primary" disabled={busy || !d.ownerId} onClick={() => patch({ action: "confirm", id: d.id })} style={{ fontSize: 12, padding: "4px 9px", fontWeight: 700 }}>Confirm</button>}
                      <button className="btn" disabled={busy}
                        onClick={() => { if (confirm(`Delete ${d.filename}? The file is removed permanently.`)) void fetch(`/api/investor-k1?id=${d.id}`, { method: "DELETE" }).then(load); }}
                        style={{ fontSize: 12, padding: "4px 9px", marginLeft: 5 }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 10, overflowX: "auto", background: "var(--card)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>Investor</th><th style={th}>Held as</th>
              <th style={{ ...th, textAlign: "right" }}>Share</th><th style={th}>K-1</th>
              <th style={{ ...th, textAlign: "right" }}>Portal</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => {
              const doc = docs.find((d) => d.ownerId === o.id);
              return (
                <tr key={o.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      {o.name}
                      {o.sharesName && (
                        <HoverCard title="Shared name" width={266}
                          rows={[{ label: "Held as", value: o.detailedName ?? "—" }, { label: "Vendor code", value: o.vendorCode ?? "—" }]}
                          footer={{ label: "Matching", value: "Confirm this one by hand" }}>
                          <Pill tone={TONE_AMBER}>SHARED NAME</Pill>
                        </HoverCard>
                      )}
                    </div>
                    {o.vendorCode && <div className="muted" style={{ fontSize: 11.5 }}><code style={{ fontSize: 11.5 }}>{o.vendorCode}</code></div>}
                  </td>
                  <td style={{ ...td, fontSize: 12.5, color: "var(--muted)", maxWidth: 230 }}>{o.detailedName ?? "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{o.ownerPct != null ? `${(o.ownerPct * 100).toFixed(4)}%` : "—"}</td>
                  <td style={td}>
                    {doc
                      ? <Pill tone={doc.published ? TONE_GREEN : doc.status === "confirmed" ? TONE_BLUE : TONE_NEUTRAL}>{doc.published ? "PUBLISHED" : doc.status === "confirmed" ? "CONFIRMED" : "PENDING"}</Pill>
                      : <Pill tone={TONE_RED}>MISSING</Pill>}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {o.link && (
                      <HoverCard title="Investor link" width={250}
                        rows={[
                          { label: "Shared", value: new Date(o.link.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                          { label: "Opened", value: o.link.viewCount ? `${o.link.viewCount}×` : "Not yet" },
                        ]}
                        footer={{ label: "Last opened", value: o.link.lastViewedAt ? new Date(o.link.lastViewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—" }}>
                        <Pill tone={o.link.viewCount ? TONE_GREEN : TONE_NEUTRAL}>{o.link.viewCount ? `OPENED ${o.link.viewCount}×` : "SHARED"}</Pill>
                      </HoverCard>
                    )}
                    <button className="btn" disabled={busy || !doc?.published} onClick={() => share(o, false)}
                      title={doc?.published ? "Create a private link + PIN" : "Publish the year first"}
                      style={{ fontSize: 12, padding: "4px 9px", marginLeft: 5 }}>{o.link ? "New link" : "Create link"}</button>
                    <button className="btn" disabled={busy || !doc?.published} onClick={() => share(o, true)} style={{ fontSize: 12, padding: "4px 9px", marginLeft: 5 }}>Email it</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shared && (
        <div style={{ marginTop: 12, border: "1.5px solid rgba(11,74,125,0.4)", borderRadius: 10, background: "rgba(11,74,125,0.04)", padding: "13px 15px" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Link for {shared.ownerName}</div>
          <div className="muted small" style={{ marginTop: 3 }}>
            {shared.sentTo.length ? `Emailed to ${shared.sentTo.join(", ")}.` : "Not emailed — copy it below."}{" "}
            Send the PIN separately (a text or a call), never in the same email as the link.
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 11, flexWrap: "wrap", alignItems: "center" }}>
            <input readOnly value={shared.url} onFocus={(e) => e.currentTarget.select()}
              style={{ flex: "1 1 340px", fontSize: 12, padding: "6px 8px", fontFamily: "ui-monospace, monospace" }} />
            <button className="btn" onClick={() => navigator.clipboard?.writeText(shared.url)} style={{ fontSize: 12, padding: "5px 11px" }}>Copy link</button>
            <div style={{ padding: "5px 13px", borderRadius: 8, background: "var(--card)", border: "1px solid var(--border)" }}>
              <div style={SECTION_LABEL}>PIN</div>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "0.14em", fontFamily: "ui-monospace, monospace" }}>{shared.pin}</div>
            </div>
            <button className="btn" onClick={() => setShared(null)} style={{ fontSize: 12, padding: "5px 11px", marginLeft: "auto" }}>Done</button>
          </div>
          {shared.mailError && <div style={{ color: "#b45309", fontSize: 12, fontWeight: 600, marginTop: 9 }}>{shared.mailError}</div>}
        </div>
      )}
    </div>
  );
}
