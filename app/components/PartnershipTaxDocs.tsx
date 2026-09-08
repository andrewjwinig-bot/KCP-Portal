"use client";

// The rest of the partnership return — Client Copy, Government Copy, Estimated
// Tax Vouchers, Partner K-1 Copy — kept with the property whose partnership
// filed it.
//
// These are NOT circulated to investors: they carry every partner's allocation
// and the return as filed. They live in their own store with no owner on the
// record and are served only by a staff route, so no investor link can address
// them (see lib/investors/taxDocs.ts).
//
// Rendered in two places on purpose — the property card on Investor Info, where
// the batch arrives, and Property Info, where you'd go looking for a building's
// paperwork. Same component, same store, ONE gate: both call sites check
// canManageK1, which is Drew and Harry. Property Info itself is reachable by
// the whole company, so this card must never inherit that page's access.

import { useCallback, useEffect, useState } from "react";
import { Pill, TONE_GREEN, TONE_NEUTRAL } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { DocChip } from "@/app/components/DocChip";
import { YearSelect } from "@/app/components/YearSelect";
import { TAX_DOC_KINDS, type TaxDocKind } from "@/lib/investors/taxDocs";

const TEAL = "#0f766e";
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};

type Doc = {
  id: string; propertyCode: string; taxYear: number; kind: TaxDocKind;
  filename: string; size: number; uploadedAt: string; uploadedBy: string | null;
};

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const thisYear = new Date().getFullYear();

export function PartnershipTaxDocs({ propertyCode, defaultOpen = false }: {
  propertyCode: string;
  /** Investor Info shows it expanded with the K-1s; Property Info folds it. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [year, setYear] = useState(thisYear - 1);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [busy, setBusy] = useState<TaxDocKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragKind, setDragKind] = useState<TaxDocKind | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await fetch(`/api/property-tax-docs?property=${propertyCode}&year=${year}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null));
      setDocs(j?.ok ? (j.documents ?? []) : []);
      setYears(j?.ok ? (j.years ?? []) : []);
    } catch { setDocs([]); }
  }, [propertyCode, year]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  async function upload(kind: TaxDocKind, file: File) {
    setBusy(kind); setError(null);
    try {
      const fd = new FormData();
      fd.append("property", propertyCode);
      fd.append("year", String(year));
      fd.append("kind", kind);
      fd.append("file", file);
      const res = await fetch("/api/property-tax-docs", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Upload failed (HTTP ${res.status})`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); } finally { setBusy(null); }
  }

  async function remove(doc: Doc, label: string) {
    if (!confirm(`Remove the ${doc.taxYear} ${label} (${doc.filename})? The file is deleted permanently.`)) return;
    setBusy(doc.kind); setError(null);
    try {
      const res = await fetch(`/api/property-tax-docs?id=${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not delete.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete."); } finally { setBusy(null); }
  }

  const held = docs?.length ?? 0;
  const yearOptions = Array.from(new Set([...years, thisYear - 1, thisYear - 2])).sort((a, b) => b - a);

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "rgba(15,23,42,0.02)" }} className="no-print">
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left",
        }}>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <span style={{ ...SECTION_LABEL, color: TEAL }}>{open ? "▲" : "▼"} Partnership tax documents</span>
          <span className="muted small">Not circulated to investors</span>
        </span>
        {open ? null : <span className="muted small">{held ? `${held} on file` : ""}</span>}
      </button>

      {open && (
        <div style={{ padding: "0 16px 15px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 11 }}>
            <span className="muted small" style={{ maxWidth: 620 }}>
              The rest of the return that arrives with the K-1 batch. Staff only — these carry every partner&rsquo;s
              allocation, so no investor link can reach them.
            </span>
            <YearSelect value={year} years={yearOptions} onChange={setYear} small aria-label="Tax year" />
          </div>

          {error && <div style={{ color: "#b91c1c", fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>{error}</div>}

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(268px, 1fr))" }}>
            {TAX_DOC_KINDS.map((k) => {
              const doc = docs?.find((d) => d.kind === k.id);
              const isBusy = busy === k.id;
              return (
                <div key={k.id} style={{
                  border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)",
                  padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{k.label}</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{k.note}</div>
                  </div>
                  {isBusy ? (
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: TEAL }}>Working…</span>
                  ) : doc ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <DocChip
                        href={`/api/property-tax-docs/file?id=${doc.id}`}
                        tone={TONE_GREEN}
                        label="VIEW"
                        icon={false}
                        minWidth={0}
                        title={doc.filename}
                        rows={[
                          { label: "Document", value: k.label },
                          { label: "Tax year", value: String(doc.taxYear) },
                          { label: "Size", value: kb(doc.size) },
                          { label: "Uploaded", value: `${shortDate(doc.uploadedAt)}${doc.uploadedBy ? ` · ${doc.uploadedBy}` : ""}` },
                        ]}
                        footer={{ label: "Visibility", value: "Staff only — never sent to investors" }}
                      />
                      <button onClick={() => remove(doc, k.label)} title={`Remove the ${k.label}`}
                        style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </span>
                  ) : (
                    <label
                      onDragOver={(e) => { e.preventDefault(); setDragKind(k.id); }}
                      onDragLeave={(e) => { e.preventDefault(); setDragKind(null); }}
                      onDrop={(e) => {
                        e.preventDefault(); setDragKind(null);
                        const f = e.dataTransfer.files?.[0];
                        if (f) void upload(k.id, f);
                      }}
                      title={`Drop the ${year} ${k.label} here`}
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", flexShrink: 0, minWidth: 78,
                        border: `1.5px dashed ${dragKind === k.id ? TEAL : "var(--border)"}`, borderRadius: 999,
                        padding: "2px 10px", fontSize: 11, fontWeight: 700,
                        background: dragKind === k.id ? "rgba(15,118,110,0.09)" : "transparent",
                        color: dragKind === k.id ? TEAL : "var(--muted)",
                        transition: "border-color .15s, background .15s, color .15s",
                      }}>
                      {dragKind === k.id ? "DROP IT" : "DROP PDF"}
                      <input type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(k.id, f); }} />
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            Re-uploading a document replaces the one on file — a revised return supersedes the old one.
          </div>
        </div>
      )}
    </div>
  );
}

/** True when this property's partnership is one we hold documents for. */
export function TaxDocsBadge({ count }: { count: number }) {
  return <Pill tone={count ? TONE_GREEN : TONE_NEUTRAL}>{count ? `${count} ON FILE` : "NONE"}</Pill>;
}
