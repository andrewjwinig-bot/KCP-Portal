"use client";

// Tenant Emails to Add — every current tenant with no email on file (owner,
// 11/2026: "we have no email on file for a lot of tenants … a doc for them to
// populate"). Harry's shopping centres and residential, Nancy's office. Type an
// address on a row, or download the sheet, fill the blue Email column and
// import it back. Addresses land on the unit page's Contacts — the one list
// every tenant email reads.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { StatusBanner } from "@/app/components/StatusBanner";
import { StatPill } from "@/app/components/Pill";
import { TabButton } from "@/app/components/TabButton";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import LoadingState from "@/app/components/LoadingState";
import { pickInto } from "@/app/components/pickFiles";
import { th, thL, tdL } from "@/app/components/tableStyles";

type Group = "sc" | "office";
type Row = {
  unitRef: string; propertyCode: string; propertyName: string; suite: string; tenantName: string;
  group: Group; sqft: number | null; skylineContact: string | null; skylinePhone: string | null;
};
type Data = { group: Group | null; fixed: boolean; rows: Row[] };
type ImportResult = { source?: "skyline"; asContacts?: number; unchanged?: number; tenants: number; added: number; problems: { row: number; unitRef: string; problem: string }[] };

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true, style: { verticalAlign: "-3px", flexShrink: 0 } } as const;
const LABEL: Record<Group, string> = { sc: "Shopping Centers & Residential", office: "Office" };

export default function MissingEmailsPage() {
  const [group, setGroup] = useState<Group>("sc");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (g: Group) => {
    const r = await fetch(`/api/suites/missing-emails?group=${g}`, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!j?.ok) { setError(j?.error ?? "Could not load the tenants."); return; }
    setData(j); setError(null);
    if (j.fixed && j.group && j.group !== g) setGroup(j.group);
  }, []);
  useEffect(() => { load(group); }, [group, load]);

  const shownGroup: Group = data?.fixed && data.group ? data.group : group;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const byProperty = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) (m.get(r.propertyCode) ?? m.set(r.propertyCode, []).get(r.propertyCode)!).push(r);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  const left = rows.filter((r) => !done[r.unitRef]).length;

  const importFile = async (f: File) => {
    setImporting(true); setResult(null); setError(null);
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/suites/missing-emails", { method: "POST", body: fd }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setImporting(false);
    if (!r?.ok || !j?.ok) { setError(j?.error ?? "The import did not work."); return; }
    setResult(j); setDone({}); load(shownGroup);
  };

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <PageHeader title="Tenant Emails to Add"
        info={<>Every current tenant with no email on file, so notices, statements and receipts have nowhere to go. Type the billing email on a tenant&apos;s row, or Download the sheet, fill the blue Email column (several addresses? separate them with ;), save it and Import it here — or import Skyline's occupant Email List (.xls) as it comes out of Skyline. Addresses are added to the unit page&apos;s Contacts as statement recipients; nothing already on file is changed.</>}
        actions={<>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importFile(f); }} />
          <button className="btn import" disabled={importing} onClick={() => pickInto(fileRef.current, "tenant-emails")}><Upload {...ICON} /> {importing ? "Importing…" : "Import Filled Sheet"}</button>
          <DownloadMenu label="Export" items={[{ label: "Fill-in sheet (Excel)", description: `${LABEL[shownGroup]} · tenants with no email`, href: `/api/suites/missing-emails?group=${shownGroup}&format=xlsx` }]} />
        </>} />

      {!data?.fixed && (
        <div style={{ display: "flex", gap: 8 }}>
          {(["sc", "office"] as Group[]).map((g) => <TabButton key={g} active={group === g} onClick={() => { setData(null); setDone({}); setGroup(g); }}>{LABEL[g]}</TabButton>)}
        </div>
      )}

      {error && <StatusBanner tone="danger" title="Something went wrong">{error}</StatusBanner>}
      {result && (
        <StatusBanner tone={result.problems.length ? "warning" : "success"} title={`Added emails for ${result.tenants} tenant${result.tenants === 1 ? "" : "s"}`}>
          {result.added} new address{result.added === 1 ? "" : "es"}
          {result.source === "skyline" && !!result.asContacts && <> · {result.asContacts} tenant{result.asContacts === 1 ? "" : "s"} already had a recipient, so the new addresses were added as contacts only (tick them on the unit page to send to them)</>}
          {result.problems.length > 0 && <> · {result.problems.length} {result.source === "skyline" ? "suite" : "row"}{result.problems.length === 1 ? "" : "s"} not used: {result.problems.slice(0, 5).map((p) => `${p.row ? `row ${p.row} ` : ""}(${p.unitRef}) ${p.problem.toLowerCase()}`).join("; ")}{result.problems.length > 5 ? "…" : ""}</>}
        </StatusBanner>
      )}

      {!data && !error && <LoadingState status="Finding tenants with no email" />}

      {data && (
        <>
          <div className="pills">
            <StatPill label="No email on file" value={left} sub={LABEL[shownGroup]} accent={left ? "var(--c-b45309)" : "var(--c-15803d)"} />
            <StatPill label="Properties" value={byProperty.length} />
            {Object.keys(done).length > 0 && <StatPill label="Added just now" value={Object.keys(done).length} accent="var(--c-15803d)" />}
          </div>
          {rows.length === 0 ? (
            <StatusBanner tone="success" title="Every tenant has an email on file">{LABEL[shownGroup]}</StatusBanner>
          ) : (
            <section className="card" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead><tr><th style={thL}>Tenant</th><th style={thL}>Skyline contact</th><th style={thL}>Email</th><th style={th} /></tr></thead>
                <tbody>
                  {byProperty.map(([code, ts]) => (
                    <Fragment key={code}>
                      <tr style={{ background: "var(--tint-brand-bg)", borderTop: "2px solid var(--border)" }}>
                        <td colSpan={4} style={{ ...tdL, fontWeight: 800 }}><code>{code}</code> {ts[0].propertyName} <span className="muted" style={{ fontWeight: 400 }}>· {ts.filter((t) => !done[t.unitRef]).length} to add</span></td>
                      </tr>
                      {ts.map((t) => <EmailRow key={t.unitRef} t={t} added={done[t.unitRef]} onAdded={(e) => setDone((d) => ({ ...d, [t.unitRef]: e }))} />)}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function EmailRow({ t, added, onAdded }: { t: Row; added?: string; onAdded: (emails: string) => void }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!email.trim()) return;
    setSaving(true); setErr(null);
    const r = await fetch("/api/suites/missing-emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitRef: t.unitRef, emails: email }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setSaving(false);
    if (!r?.ok || !j?.ok) { setErr(j?.error ?? "Not saved."); return; }
    onAdded(email.trim());
  };
  return (
    <tr className="task-row" style={{ borderBottom: "1px solid var(--hairline)" }}>
      <td style={{ ...tdL, whiteSpace: "normal", maxWidth: 300 }}>
        <span style={{ display: "grid", lineHeight: 1.3 }}>
          <a className="text-link" style={{ fontWeight: 600 }} href={`/units/${encodeURIComponent(t.unitRef)}`}>{t.tenantName}</a>
          <code style={{ fontSize: "var(--fs-12)", justifySelf: "start" }}>{t.unitRef}</code>
        </span>
      </td>
      <td style={{ ...tdL, whiteSpace: "normal", fontSize: "var(--fs-13)" }}>
        {t.skylineContact || t.skylinePhone ? <>{t.skylineContact ?? ""}{t.skylineContact && t.skylinePhone ? " · " : ""}{t.skylinePhone ?? ""}</> : <span className="muted">—</span>}
      </td>
      <td style={{ ...tdL, minWidth: 260 }}>
        {added ? <span style={{ color: "var(--c-15803d)", fontWeight: 600 }}>Added · {added}</span> : (
          <>
            <input type="email" value={email} placeholder="billing@tenant.com" style={{ width: "100%" }}
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
            {err && <div className="small" style={{ color: "var(--c-b91c1c)", marginTop: 4 }}>{err}</div>}
          </>
        )}
      </td>
      <td style={{ ...tdL, whiteSpace: "nowrap" }}>
        {!added && <button className="btn sm" disabled={saving || !email.trim()} onClick={save}>{saving ? "Saving…" : "Save"}</button>}
      </td>
    </tr>
  );
}
