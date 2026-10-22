"use client";

// Pro-rata Share Audit — every office tenant whose STIPULATED pro-rata share
// (the CAMPrep lease share that drives the CAM / RET reconciliation) diverges
// from its TRUE square-foot share (unit SF ÷ building SF). Mirrors the "≠ true
// X%" flag on the office unit page, consolidated across every building so staff
// can confirm each divergence is an intentional lease carve-out and not a
// keying error. Retail is intentionally excluded: retail PRS is taken over
// per-category denominators (with carve-outs), so it legitimately differs from
// raw SF and would only add noise here.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LoadingState from "@/app/components/LoadingState";
import { StatPill, Pill, TONE_AMBER, TONE_NEUTRAL } from "@/app/components/Pill";

type Tenant = { unitRef: string; suite: string; name: string; proRataPct: number; sqft: number };
type Row = {
  propertyCode: string;
  propertyName: string;
  year: number;
  unitRef: string;
  suite: string;
  name: string;
  sqft: number;
  buildingSqft: number;
  stipulated: number; // %
  trueShare: number; // %
  delta: number; // stipulated − true (percentage points)
};

const TOLERANCE = 0.01; // percentage points — matches the unit page's mismatch flag

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};

function pct(n: number): string {
  return n.toFixed(2) + "%";
}

export default function ProRataAuditPage() {
  return (
    <Suspense fallback={null}>
      <ProRataAuditInner />
    </Suspense>
  );
}

function ProRataAuditInner() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyMismatches, setOnlyMismatches] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const avail = await fetch("/api/cam-recon/office").then((r) => r.json());
        const props: { propertyCode: string; name: string; years: number[] }[] = avail?.available ?? [];
        const results = await Promise.all(
          props.map(async (p) => {
            const year = p.years?.[0];
            if (!year) return [] as Row[];
            try {
              const j = await fetch(`/api/cam-recon/office?property=${encodeURIComponent(p.propertyCode)}&year=${year}`).then((r) => r.json());
              const res = j?.result;
              if (!res) return [] as Row[];
              const buildingSqft: number = res.rentableSqft ?? 0;
              return (res.tenants as Tenant[]).map((t) => {
                const trueShare = buildingSqft > 0 ? (t.sqft / buildingSqft) * 100 : 0;
                return {
                  propertyCode: p.propertyCode,
                  propertyName: p.name,
                  year,
                  unitRef: t.unitRef,
                  suite: t.suite,
                  name: t.name,
                  sqft: t.sqft,
                  buildingSqft,
                  stipulated: t.proRataPct,
                  trueShare,
                  delta: Math.round((t.proRataPct - trueShare) * 100) / 100,
                } as Row;
              });
            } catch {
              return [] as Row[];
            }
          }),
        );
        if (alive) setRows(results.flat());
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => { alive = false; };
  }, []);

  const mismatches = useMemo(
    () => (rows ?? []).filter((r) => Math.abs(r.delta) > TOLERANCE),
    [rows],
  );
  const shown = useMemo(() => {
    const list = onlyMismatches ? mismatches : (rows ?? []);
    return [...list].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [rows, mismatches, onlyMismatches]);

  const totalTenants = rows?.length ?? 0;

  function downloadCsv() {
    const esc = (s: unknown) => `"${String(s).replace(/"/g, '""')}"`;
    const header = ["Property", "Code", "Year", "Suite", "Tenant", "Unit SF", "Building SF", "Stipulated %", "True SF %", "Delta (pp)"];
    const lines = [header.map(esc).join(",")];
    for (const r of shown) {
      lines.push([
        esc(r.propertyName), esc(r.propertyCode), r.year, esc(r.suite), esc(r.name),
        r.sqft, r.buildingSqft, r.stipulated.toFixed(2), r.trueShare.toFixed(2), r.delta.toFixed(2),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "Office_ProRata_Share_Audit.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <main>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Pro-rata Share Audit</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
            Office tenants whose stipulated CAMPrep share differs from their true square-foot share.
          </p>
        </div>
        <Link href="/cam-recon" className="btn" style={{ flexShrink: 0, textDecoration: "none" }}>← CAM / RET Reconciliation</Link>
      </div>

      {error && (
        <div className="card" style={{ marginTop: 16, borderColor: "rgba(220,38,38,0.4)", color: "#b91c1c" }}>{error}</div>
      )}

      {rows === null ? (
        <div className="card" style={{ marginTop: 18 }}>
          <LoadingState card={false} status="Auditing every office building…" columns={5} rows={6} />
        </div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 18 }}>
            <div style={SECTION_LABEL}>Summary</div>
            <div className="pills">
              <StatPill label="Office tenants" value={totalTenants} />
              <StatPill label="Diverge from true SF" value={mismatches.length} accent={mismatches.length ? "#b45309" : undefined} />
              <StatPill label="In line" value={totalTenants - mismatches.length} />
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              A divergence isn&rsquo;t necessarily wrong — a lease can stipulate a share that differs from raw SF (amendments, excluded areas, expansions). This is a checklist to confirm each one is intentional. Threshold: &gt; {TOLERANCE.toFixed(2)} percentage points.
            </p>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <input type="checkbox" checked={onlyMismatches} onChange={(e) => setOnlyMismatches(e.target.checked)} style={{ width: 15, height: 15 }} />
                Show only divergences
              </label>
              <button className="btn" onClick={downloadCsv} disabled={!shown.length} style={{ fontWeight: 700 }}>⭳ Download CSV</button>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Building</th>
                    <th>Suite</th>
                    <th>Tenant</th>
                    <th style={{ textAlign: "right" }}>Unit SF</th>
                    <th style={{ textAlign: "right" }}>Stipulated</th>
                    <th style={{ textAlign: "right" }}>True SF</th>
                    <th style={{ textAlign: "right" }}>Δ (pp)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 ? (
                    <tr><td colSpan={8} className="muted" style={{ padding: 16 }}>
                      {onlyMismatches ? "No office tenants diverge beyond the threshold — every stipulated share ties to SF." : "No tenants."}
                    </td></tr>
                  ) : shown.map((r) => {
                    const off = Math.abs(r.delta) > TOLERANCE;
                    return (
                      <tr key={`${r.propertyCode}-${r.unitRef}`}>
                        <td className="small"><code style={{ fontSize: 11, fontWeight: 700, color: "#0b4a7d" }}>{r.propertyCode}</code> {r.propertyName}</td>
                        <td className="small">{r.suite}</td>
                        <td>{r.name}</td>
                        <td style={{ textAlign: "right" }}>{r.sqft.toLocaleString("en-US")}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(r.stipulated)}</td>
                        <td style={{ textAlign: "right" }}>{pct(r.trueShare)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: off ? "#b45309" : "var(--muted)" }}>
                          {r.delta > 0 ? "+" : ""}{r.delta.toFixed(2)}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                            {off
                              ? <Pill tone={TONE_AMBER}>Confirm</Pill>
                              : <Pill tone={TONE_NEUTRAL}>OK</Pill>}
                            <Link
                              href={`/units/${encodeURIComponent(r.unitRef)}?from=${encodeURIComponent("/cam-recon/pro-rata-audit")}`}
                              className="btn"
                              style={{ padding: "4px 10px", fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}
                            >
                              Open unit →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
