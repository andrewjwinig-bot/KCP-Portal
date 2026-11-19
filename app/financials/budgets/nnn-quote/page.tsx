"use client";

// NNN QUOTE — Harry quotes a prospective tenant the all-in rent for a vacant
// suite (owner, 11/2026: "select the suite, input the base rent that he is
// quoting and then it should populate est CAM, INS, RET … and find the 'all
// in' number"; "show NNNs over the past 3 years so he can talk to them about
// the trends"). Estimates are the budget year's recoverable pools times the
// suite's pro-rata share — the budget draft's own "NNN / SF" — with the CAM
// admin fee the centre's leases carry. Math: lib/leasing/nnnQuote.ts.

import { useEffect, useMemo, useState } from "react";
import { Copy, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { MetaLine } from "@/app/components/LastImported";
import { StatPill } from "@/app/components/Pill";
import { StatusBanner } from "@/app/components/StatusBanner";
import LoadingState from "@/app/components/LoadingState";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { quoteNnn, type NnnYear, type Pools } from "@/lib/leasing/nnnQuote";

type Suite = { unitRef: string; suite: string; sqft: number; vacant: boolean; tenant: string };
type Quote = { code: string; name: string; budgetYear: number; gross: boolean; gla: number; pools: Pools | null; adminPct: number; suites: Suite[]; trend: NnnYear[] };

const psf = (n: number) => `$${n.toFixed(2)}`;
const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cents = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FIELD: React.CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const LABEL: React.CSSProperties = { fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

export default function NnnQuotePage() {
  const [properties, setProperties] = useState<{ code: string; name: string }[]>([]);
  const [code, setCode] = useState("");
  const [q, setQ] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitRef, setUnitRef] = useState("");
  const [rent, setRent] = useState("");
  const [admin, setAdmin] = useState("");
  const [sfText, setSfText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/financials/budgets/nnn-quote", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      const ps = j?.properties ?? [];
      setProperties(ps);
      let saved = ""; try { saved = localStorage.getItem("kcp:nnn-quote:code") ?? ""; } catch { /* ignore */ }
      setCode(ps.some((p: { code: string }) => p.code === saved) ? saved : ps[0]?.code ?? "");
    }).catch(() => setError("Could not load the centres."));
  }, []);

  useEffect(() => {
    if (!code) return;
    try { localStorage.setItem("kcp:nnn-quote:code", code); } catch { /* ignore */ }
    setLoading(true); setError(null); setQ(null);
    fetch(`/api/financials/budgets/nnn-quote?code=${code}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!j?.quote) { setError(j?.error ?? "Could not load this centre."); return; }
      const d: Quote = j.quote;
      setQ(d);
      const first = d.suites.find((s) => s.vacant) ?? d.suites[0];
      setUnitRef(first?.unitRef ?? ""); setSfText(""); setAdmin(String(d.adminPct || 0));
    }).catch(() => setError("Could not load this centre.")).finally(() => setLoading(false));
  }, [code]);

  const suite = q?.suites.find((s) => s.unitRef === unitRef) ?? null;
  const sqft = Number(sfText.replace(/,/g, "")) || suite?.sqft || 0;
  const quote = useMemo(() => (q?.pools ? quoteNnn(q.pools, q.gla, sqft, Number(rent) || 0, Number(admin) || 0) : null), [q, sqft, rent, admin]);
  const vacant = (q?.suites ?? []).filter((s) => s.vacant);
  const leased = (q?.suites ?? []).filter((s) => !s.vacant);

  const copyQuote = async () => {
    if (!quote || !q || !suite) return;
    const lines = [
      `${q.name} — Suite ${suite.suite} (${sqft.toLocaleString("en-US")} SF)`,
      `Estimated ${q.budgetYear} charges`,
      ...quote.lines.map((l) => `${l.label}: ${psf(l.psf)}/SF/yr · ${cents(l.monthly)}/mo`),
      `NNN total: ${psf(quote.nnnPsf)}/SF/yr · ${cents(quote.nnnMonthly)}/mo`,
      `All-in: ${psf(quote.allInPsf)}/SF/yr · ${cents(quote.allInMonthly)}/mo`,
      `CAM, insurance and real estate taxes are estimates based on the ${q.budgetYear} operating budget and are reconciled to actual each year.`,
    ];
    try { await navigator.clipboard.writeText(lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <PageHeader title="NNN Quote"
        info={<>Pick a suite and type the base rent you are quoting. CAM, insurance and real estate taxes are the {q?.budgetYear ?? "budget year"} budget&apos;s recoverable expenses for the centre times the suite&apos;s share of its square footage (the budget&apos;s &ldquo;NNN / SF&rdquo;), plus the CAM admin fee most of the centre&apos;s leases carry. A new lease&apos;s own terms — a cap, an exclusion, a stipulated share — are not applied.</>}
        actions={quote && suite ? <button className="btn" onClick={copyQuote}><Copy size={16} strokeWidth={1.75} aria-hidden /> {copied ? "Copied" : "Copy Quote"}</button> : undefined}
        meta={q && !q.gross && q.pools ? <MetaLine><span>{q.budgetYear} budget · GLA {q.gla.toLocaleString("en-US")} SF · NNN {psf((q.pools.cam + q.pools.ins + q.pools.ret) / q.gla)} / SF before admin fee</span></MetaLine> : undefined} />

      {error && <StatusBanner tone="danger" title="Something went wrong">{error}</StatusBanner>}

      {/* ONE card: every input in one row (owner: "why is property name
          outside of the box altogether?"), each field its own column so a
          long suite option never runs into the next box. */}
      {properties.length > 0 && (
        <section className="card" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
            <label style={FIELD}>
              <span style={LABEL}>Centre</span>
              <select className="select-brand" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: "100%", minWidth: 0 }}>
                {properties.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
              </select>
            </label>
            <label style={FIELD}>
              <span style={LABEL}>Suite</span>
              <select value={unitRef} disabled={!q || q.gross || !q.pools} onChange={(e) => { setUnitRef(e.target.value); setSfText(""); }} style={{ width: "100%", minWidth: 0 }}>
                {vacant.length > 0 && <optgroup label="Vacant">{vacant.map((s) => <option key={s.unitRef} value={s.unitRef}>{s.suite} · {s.sqft.toLocaleString("en-US")} SF</option>)}</optgroup>}
                {leased.length > 0 && <optgroup label="Leased">{leased.map((s) => <option key={s.unitRef} value={s.unitRef}>{s.suite} · {s.tenant} · {s.sqft.toLocaleString("en-US")} SF</option>)}</optgroup>}
              </select>
            </label>
            <label style={FIELD}>
              <span style={LABEL}>Square feet</span>
              <input inputMode="numeric" value={sfText} placeholder={suite ? suite.sqft.toLocaleString("en-US") : ""} onChange={(e) => setSfText(e.target.value)} style={{ width: "100%", minWidth: 0 }} />
            </label>
            <label style={FIELD}>
              <span style={LABEL}>Base rent $ / SF / yr</span>
              <input inputMode="decimal" value={rent} placeholder="e.g. 24.00" onChange={(e) => setRent(e.target.value)} autoFocus style={{ width: "100%", minWidth: 0 }} />
            </label>
            <label style={FIELD}>
              <span style={LABEL}>CAM admin fee %</span>
              <input inputMode="decimal" value={admin} onChange={(e) => setAdmin(e.target.value)} style={{ width: "100%", minWidth: 0 }} />
            </label>
          </div>

          {loading && <LoadingState status="Reading the centre's budget" context="Recoverable expenses and the rent roll" />}
          {q && q.gross && <StatusBanner compact tone="info" title={`${q.name} is leased gross`}>Tenants pay their own utilities and no CAM, insurance or tax estimates — quote the base rent alone.</StatusBanner>}
          {q && !q.gross && !q.pools && <StatusBanner compact tone="warning" title="No budget to quote from">The {q.budgetYear} budget draft for {q.name} could not be built, so there are no pools to estimate from.</StatusBanner>}

          {quote && (
            <>
              <div className="pills">
                <StatPill label="Base rent / SF" value={psf(Number(rent) || 0)} />
                <StatPill label="NNN / SF" value={psf(quote.nnnPsf)} sub={`${cents(quote.nnnMonthly)} a month`} />
                <StatPill label="All-in / SF" value={psf(quote.allInPsf)} total sub={`${cents(quote.allInMonthly)} a month · ${dollars(quote.allInAnnual)} a year`} />
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead><tr><th style={thL}>Charge</th><th style={th}>$ / SF / yr</th><th style={th}>Monthly</th><th style={th}>Annual</th></tr></thead>
                  <tbody>
                    {quote.lines.map((l) => (
                      <tr key={l.key} style={{ borderBottom: "1px solid var(--hairline)" }}>
                        <td style={{ ...tdL, fontWeight: l.key === "base" ? 600 : 400 }}>{l.label}{l.key !== "base" ? <span className="muted"> · est.</span> : null}</td>
                        <td style={td}>{l.psf.toFixed(2)}</td><td style={td}>{cents(l.monthly)}</td><td style={td}>{dollars(l.annual)}</td>
                      </tr>
                    ))}
                    <tr><td style={{ ...tdL, fontWeight: 600 }}>NNN total</td><td style={td}>{quote.nnnPsf.toFixed(2)}</td><td style={td}>{cents(quote.nnnMonthly)}</td><td style={td}>{dollars(quote.nnnAnnual)}</td></tr>
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <td style={{ ...tdL, fontWeight: 700 }}>All-in</td>
                      <td style={{ ...td, fontWeight: 700 }}>{quote.allInPsf.toFixed(2)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{cents(quote.allInMonthly)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{dollars(quote.allInAnnual)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ fontSize: "var(--fs-13)" }}>
                {sqft.toLocaleString("en-US")} SF is {quote.sharePct.toFixed(2)}% of the centre&apos;s {q.gla.toLocaleString("en-US")} SF. CAM, insurance and taxes are estimates from the {q.budgetYear} budget, billed monthly and reconciled to actual each year.
              </div>
            </>
          )}
        </section>
      )}

      {q && !q.gross && q.trend.length > 0 && <TrendCard trend={q.trend} />}
    </main>
  );
}

/** NNN per SF over the years (owner: "so he can talk to them about the trends
 *  … some properties theyve come down"). All years on today's GLA, so the
 *  change is the cost, not the denominator. */
function TrendCard({ trend }: { trend: NnnYear[] }) {
  // The move up to THIS year (actuals and its reprojection), not the budget.
  const actual = trend.filter((t) => t.kind !== "budget" && !t.partial);
  const first = actual[0], last = actual[actual.length - 1];
  const move = first && last && first !== last ? last.total - first.total : null;
  return (
    <section className="card" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>NNN Over the Years</span>
        {move != null && Math.abs(move) >= 0.01 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: move < 0 ? "var(--c-067647)" : "var(--c-b54708)" }}>
            {move < 0 ? <TrendingDown size={20} strokeWidth={1.75} aria-hidden /> : <TrendingUp size={20} strokeWidth={1.75} aria-hidden />}
            {move < 0 ? "Down" : "Up"} {psf(Math.abs(move))} / SF since {first.year}
          </span>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead><tr><th style={thL}>Year</th><th style={th}>CAM</th><th style={th}>Insurance</th><th style={th}>RE Taxes</th><th style={th}>NNN / SF</th><th style={th}>Change</th></tr></thead>
          <tbody>
            {trend.map((t, i) => {
              const prev = trend[i - 1];
              const d = prev && !prev.partial && !t.partial ? t.total - prev.total : null;
              return (
                <tr key={`${t.year}-${t.kind}`} style={{ borderBottom: "1px solid var(--hairline)" }}>
                  <td style={{ ...tdL, fontWeight: 600 }}>{t.year} <span className="muted" style={{ fontWeight: 400 }}>{t.kind === "budget" ? "budget" : t.kind === "reprojection" ? "reprojection" : "actual"}{t.partial ? " · partial" : ""}</span></td>
                  <td style={td}>{t.cam.toFixed(2)}</td>
                  <td style={td}>{t.partial && !t.ins ? "—" : t.ins.toFixed(2)}</td>
                  <td style={td}>{t.partial && !t.ret ? "—" : t.ret.toFixed(2)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{t.partial ? "—" : t.total.toFixed(2)}</td>
                  <td style={{ ...td, color: d == null || Math.abs(d) < 0.01 ? "var(--muted)" : d < 0 ? "var(--c-067647)" : "var(--c-b54708)", fontWeight: 600 }}>
                    {d == null || Math.abs(d) < 0.01 ? "—" : `${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-13)" }}>Actual years are the reconciled CAM, insurance and tax pools; the current year is its reprojection (actual to date, budget for the months still to post); every year is per SF of today&apos;s GLA, so the change is the cost moving.</div>
    </section>
  );
}
