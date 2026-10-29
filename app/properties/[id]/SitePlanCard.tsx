"use client";

// The property page's INTERNAL site plan — the designed centre's drawing,
// large, coloured by what we act on (lease expiry, rent $/SF, open A/R) rather
// than by what the public is sold. Hover a suite for its tenant, lease and
// money; click it for the unit page. Data: /api/properties/[id]/siteplan
// (staffPlan.ts), which decides on the server what this viewer may see.

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatPill } from "../../components/Pill";
import { TabButton } from "../../components/TabButton";
import { TipCard, type TipRow } from "../../components/HoverCard";
import { th, thL, td, tdL } from "../../components/tableStyles";
import {
  AR_COLOR, AR_LABEL, arBucket, brandRamp, EXPIRY_COLOR, EXPIRY_LABEL, EXPIRY_ORDER, expiryBucket,
  labelSize, monthsLeft, scaleOf, type ArBucket, type ExpiryBucket, type StaffPlan, type StaffSuite,
} from "../../../lib/centers/designed/staffPlanMath";

type Mode = "expiry" | "rent" | "ar";

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
};
const termLeft = (m: number | null) =>
  m == null ? "" : m < 0 ? `ended ${-m} mo ago` : m < 12 ? `${m} mo left` : `${Math.floor(m / 12)} yr ${m % 12} mo left`;

export default function SitePlanCard({ code, style }: { code: string; style?: React.CSSProperties }) {
  const router = useRouter();
  const [plan, setPlan] = useState<StaffPlan | null>(null);
  const [mode, setMode] = useState<Mode>("expiry");
  const [hover, setHover] = useState<{ s: StaffSuite; x: number; y: number } | null>(null);
  /** A legend entry the plan is narrowed to (others dimmed). */
  const [focus, setFocus] = useState<string | null>(null);
  /** An office building's floor on show. */
  const [floor, setFloor] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/properties/${encodeURIComponent(code)}/siteplan`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setPlan(j?.plan ?? null); })
      .catch(() => { if (alive) setPlan(null); });
    return () => { alive = false; };
  }, [code]);

  const ours = useMemo(() => (plan?.suites ?? []).filter((s) => !s.shadow), [plan]);
  const rents = useMemo(() => ours.map((s) => s.money?.rentPsf ?? 0), [ours]);

  if (!plan) return null;

  // An office building draws one floor at a time; the tiles, legend and
  // expirations stay building-wide.
  const cur = plan.floors?.find((f) => f.floor === floor) ?? plan.floors?.[0] ?? null;
  const meta = cur ? cur.plan : plan.plan;
  const drawn = cur ? plan.suites.filter((s) => s.floor === cur.floor) : plan.suites;

  // What each suite reads as in the current mode: its bucket key (for the
  // legend and the focus filter) and its fill.
  const paint = (s: StaffSuite): { key: string; fill: string } | null => {
    if (s.shadow) return null;
    if (mode === "expiry") { const b = expiryBucket(s, today); return { key: b, fill: EXPIRY_COLOR[b] }; }
    if (mode === "ar") {
      if (s.status === "available") return { key: "vacant", fill: EXPIRY_COLOR.vacant };
      const b = arBucket(s.ar); return { key: b, fill: AR_COLOR[b] };
    }
    if (s.status === "available") return { key: "vacant", fill: EXPIRY_COLOR.vacant };
    const psf = s.money?.rentPsf ?? 0;
    return psf > 0 ? { key: "rent", fill: brandRamp(0.15 + 0.85 * scaleOf(psf, rents)) } : { key: "norent", fill: "#94a3b8" };
  };

  // KPI tiles — the centre at a glance.
  // A building's suites not mapped yet still count — the tiles are the building's.
  const unmapped = plan.unmapped ?? [];
  const totalSf = ours.reduce((t, s) => t + s.sf, 0) + unmapped.reduce((t, u) => t + u.sf, 0);
  const vacantSf = ours.filter((s) => s.status === "available").reduce((t, s) => t + s.sf, 0)
    + unmapped.filter((u) => u.vacant).reduce((t, u) => t + u.sf, 0);
  const vacantCount = ours.filter((s) => s.status === "available").length + unmapped.filter((u) => u.vacant).length;
  const expiring = ours.filter((s) => { const b = expiryBucket(s, today); return b === "expired" || b === "lt12"; });
  const expiringSf = expiring.reduce((t, s) => t + s.sf, 0);
  const pastDue = ours.reduce((t, s) => t + (s.ar?.pastDue ?? 0), 0);
  const pastDueCount = ours.filter((s) => arBucket(s.ar) === "pastDue").length;

  // Legend: every bucket present in this mode, with its count and SF.
  const legend: { key: string; label: string; color: string; count: number; sf: number }[] = (() => {
    const tally = new Map<string, { count: number; sf: number }>();
    for (const s of ours) {
      const p = paint(s); if (!p) continue;
      const t = tally.get(p.key) ?? { count: 0, sf: 0 };
      tally.set(p.key, { count: t.count + 1, sf: t.sf + s.sf });
    }
    const keys: { key: string; label: string; color: string }[] =
      mode === "expiry" ? EXPIRY_ORDER.map((b) => ({ key: b, label: EXPIRY_LABEL[b], color: EXPIRY_COLOR[b] }))
      : mode === "ar" ? [
          ...(["pastDue", "current", "none", "unknown"] as ArBucket[]).map((b) => ({ key: b, label: AR_LABEL[b], color: AR_COLOR[b] })),
          { key: "vacant", label: "Vacant", color: EXPIRY_COLOR.vacant },
        ]
      : [
          { key: "rent", label: rentRangeLabel(rents), color: brandRamp(0.7) },
          { key: "norent", label: "No base rent", color: "#94a3b8" },
          { key: "vacant", label: "Vacant", color: EXPIRY_COLOR.vacant },
        ];
    return keys.filter((k) => tally.has(k.key)).map((k) => ({ ...k, ...tally.get(k.key)! }));
  })();

  const vbW = Number(meta.viewBox.split(/\s+/)[2]) || 3300;
  // A floor plan is drawn smaller per foot than a site plan, so its labels run larger.
  const fontFor = (s: StaffSuite) => labelSize(s, cur ? vbW / 55 : Math.max(22, Math.min(34, vbW / 110)));

  const open = (s: StaffSuite) => {
    const ref = s.unitRefs[0];
    if (ref) router.push(`/units/${encodeURIComponent(ref)}`);
  };

  // Lease expirations over the next 24 months (and anything past term), soonest first.
  const upcoming = ours
    .filter((s) => { const b = expiryBucket(s, today); return b === "expired" || b === "lt12" || b === "lt24"; })
    .sort((a, b) => (a.leaseTo ?? "").localeCompare(b.leaseTo ?? ""));

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", ...style }}>
      <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>{plan.floors ? "Floor Plans" : "Site Plan"}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            Live from the rent roll{plan.rollImportedAt ? ` imported ${new Date(plan.rollImportedAt).toLocaleDateString("en-US")}` : ""} · hover a suite for its lease, click for the unit
          </div>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
          <TabButton active={mode === "expiry"} onClick={() => { setMode("expiry"); setFocus(null); }}>Lease Expiry</TabButton>
          {plan.canSeeMoney && <TabButton active={mode === "rent"} onClick={() => { setMode("rent"); setFocus(null); }}>Rent $/SF</TabButton>}
          {plan.canSeeAr && <TabButton active={mode === "ar"} onClick={() => { setMode("ar"); setFocus(null); }}>Open A/R</TabButton>}
        </div>
      </div>

      <div className="pills" style={{ padding: "14px 20px 0", marginTop: 0 }}>
        <StatPill label="Occupied" value={totalSf ? `${(((totalSf - vacantSf) / totalSf) * 100).toFixed(1)}%` : "—"} sub={`${totalSf.toLocaleString()} SF`} />
        <StatPill label="Vacant SF" value={vacantSf.toLocaleString()} accent={vacantSf ? EXPIRY_COLOR.vacant : undefined}
          sub={`${vacantCount} suites`} />
        <StatPill label="Expiring ≤ 12 mo" value={String(expiring.length)} accent={expiring.length ? "#b45309" : undefined}
          sub={`${expiringSf.toLocaleString()} SF incl. past term`} />
        {plan.canSeeAr && (
          <StatPill label="Past Due" value={money0(pastDue)} accent={pastDue >= 1 ? "#b91c1c" : undefined}
            sub={`${pastDueCount} ${pastDueCount === 1 ? "tenant" : "tenants"}`} />
        )}
      </div>

      {plan.floors && plan.floors.length > 1 && (
        <div style={{ display: "flex", gap: 6, padding: "14px 20px 0", flexWrap: "wrap" }}>
          {plan.floors.map((f) => {
            const n = plan.suites.filter((s) => s.floor === f.floor && !s.shadow).length;
            const on = f.floor === cur?.floor;
            return (
              <button key={f.floor} type="button" onClick={() => { setFloor(f.floor); setHover(null); }}
                className={on ? "btn primary" : "btn"} style={{ fontSize: 12, padding: "5px 12px" }}>
                {f.label}<span style={{ opacity: 0.7, fontWeight: 500, marginLeft: 6 }}>{n ? `${n} suite${n === 1 ? "" : "s"}` : "not mapped"}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ position: "relative", margin: "14px 20px 0" }} onMouseLeave={() => setHover(null)}>
        <img src={meta.src} alt={`${cur ? `${cur.label} plan` : "Site plan"} of ${plan.name}`} width={meta.width} height={meta.height}
          style={{ display: "block", width: "100%", height: "auto", borderRadius: 8, border: "1px solid var(--border)", background: "#fff" }} />
        <svg viewBox={meta.viewBox} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} role="group" aria-label="Suites">
          {drawn.map((s) => {
            const p = paint(s);
            const dim = focus && p?.key !== focus;
            const hot = hover?.s.id === s.id;
            const shapeProps = {
              fill: p ? p.fill : "transparent",
              fillOpacity: p ? (dim ? 0.12 : hot ? 0.85 : 0.62) : 0,
              stroke: p ? (hot ? "#0f172a" : "rgba(15,23,42,0.55)") : "transparent",
              strokeWidth: (hot ? 8 : 3) * (cur ? 0.6 : 1),
            };
            return (
              <g key={s.id} style={{ cursor: s.unitRefs.length && !s.shadow ? "pointer" : "default" }}
                onMouseMove={(e) => !s.shadow && setHover({ s, x: e.clientX, y: e.clientY })}
                onClick={() => !s.shadow && open(s)}
                tabIndex={s.shadow ? -1 : 0}
                onKeyDown={(e) => { if (e.key === "Enter") open(s); }}
                aria-label={`${s.tenant}, suite ${s.id}`}>
                {s.pts
                  ? s.pts.map((pts, i) => <polygon key={i} points={pts} {...shapeProps} />)
                  : (s.rects ?? []).map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} {...shapeProps} />)}
                {!s.shadow && (
                  <text x={s.cx} y={s.cy + fontFor(s) / 3} textAnchor="middle" fontSize={fontFor(s)} fontWeight={800}
                    fill={dim ? "rgba(15,23,42,0.35)" : "#0f172a"} stroke="#fff" strokeWidth={fontFor(s) / 5} paintOrder="stroke"
                    transform={s.rot ? `rotate(${s.rot} ${s.cx} ${s.cy})` : undefined} style={{ pointerEvents: "none" }}>
                    {s.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover && <SuiteTip s={hover.s} x={hover.x} y={hover.y} plan={plan} today={today} />}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 20px 16px" }}>
        {legend.map((l) => (
          <button key={l.key} type="button" onClick={() => setFocus(focus === l.key ? null : l.key)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${focus === l.key ? "var(--text)" : "var(--border)"}`, background: "var(--card)",
              fontSize: 12, fontWeight: 600, color: "var(--text)", opacity: focus && focus !== l.key ? 0.5 : 1,
            }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
            {l.label}
            <span className="muted" style={{ fontWeight: 500 }}>{l.count} · {l.sf.toLocaleString()} SF</span>
          </button>
        ))}
      </div>

      {plan.unmapped && plan.unmapped.length > 0 && (
        <details style={{ borderTop: "1px solid var(--border)", padding: "10px 20px" }}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
            {plan.unmapped.length} {plan.unmapped.length === 1 ? "suite" : "suites"} on the rent roll not mapped yet
            {" · "}{plan.unmapped.reduce((t, u) => t + u.sf, 0).toLocaleString()} SF
          </summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {plan.unmapped.map((u) => (
              <a key={u.unitRef} href={`/units/${encodeURIComponent(u.unitRef)}`}
                style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, border: "1px solid var(--border)", textDecoration: "none", color: "var(--text)" }}>
                <code style={{ fontSize: 11 }}>{u.unitRef}</code> {u.vacant ? <span className="muted">Vacant</span> : u.tenant}
              </a>
            ))}
          </div>
        </details>
      )}

      {upcoming.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 20px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>
            Lease Expirations · Next 24 Months
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th style={thL}>Tenant</th><th style={thL}>Suite</th><th style={th}>SF</th><th style={th}>Lease To</th><th style={thL}>Term</th>
                  {plan.canSeeMoney && <th style={th}>Rent / mo</th>}
                  {plan.canSeeMoney && <th style={th}>$/SF</th>}
                </tr>
              </thead>
              <tbody>
                {upcoming.map((s) => {
                  const b = expiryBucket(s, today) as ExpiryBucket;
                  return (
                    <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => open(s)}>
                      <td style={{ ...tdL, fontWeight: 600 }}>
                        <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: EXPIRY_COLOR[b], marginRight: 8 }} />
                        {s.tenant}
                      </td>
                      <td style={tdL}><code>{s.unitRefs[0] ?? s.id}</code></td>
                      <td style={td}>{s.sf.toLocaleString()}</td>
                      <td style={td}>{dateLabel(s.leaseTo)}</td>
                      <td style={{ ...tdL, color: b === "expired" ? "#b91c1c" : "var(--muted)" }}>
                        {b === "expired" ? "Past term" : termLeft(monthsLeft(s.leaseTo, today))}
                      </td>
                      {plan.canSeeMoney && <td style={td}>{s.money ? money0(s.money.baseRent) : "—"}</td>}
                      {plan.canSeeMoney && <td style={td}>{s.money?.rentPsf ? money2(s.money.rentPsf) : "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function rentRangeLabel(rents: number[]): string {
  const xs = rents.filter((r) => r > 0);
  if (!xs.length) return "Base rent $/SF";
  return `Base rent ${money2(Math.min(...xs))} → ${money2(Math.max(...xs))} /SF`;
}

function SuiteTip({ s, x, y, plan, today }: { s: StaffSuite; x: number; y: number; plan: StaffPlan; today: Date }) {
  const width = 280;
  const rows: TipRow[] = [];
  rows.push({ label: "Suite", value: `${s.unitRefs.join(" + ") || s.id}${s.addr ? ` · ${s.addr.split("·").pop()!.trim()}` : ""}` });
  rows.push({ label: "Size", value: `${s.sf.toLocaleString()} SF` });
  if (s.status === "leased") {
    if (s.occupant && s.occupant !== s.tenant) rows.push({ label: "On the rent roll", value: s.occupant });
    const b = expiryBucket(s, today);
    rows.push({ label: "Lease", value: `${dateLabel(s.leaseFrom)} – ${dateLabel(s.leaseTo)}`, color: EXPIRY_COLOR[b] });
    const left = monthsLeft(s.leaseTo, today);
    if (left != null) rows.push({ label: "Term", value: b === "expired" ? "Past term / holdover" : termLeft(left) });
    if (s.money) {
      rows.push({ label: "Base rent", value: `${money0(s.money.baseRent)}/mo · ${money2(s.money.rentPsf)}/SF` });
      const rec = s.money.cam + s.money.ret + s.money.other;
      if (rec > 0) rows.push({ label: "CAM · RET · Other", value: `${money0(s.money.cam)} · ${money0(s.money.ret)} · ${money0(s.money.other)}` });
    }
  }
  const footer: TipRow | undefined =
    s.status === "available" ? { label: "Status", value: "Vacant", color: EXPIRY_COLOR.vacant }
    : plan.canSeeAr
      ? s.ar
        ? { label: `Open A/R · ${s.ar.period}`, value: s.ar.pastDue >= 1 ? `${money2(s.ar.totalDue)} (${money2(s.ar.pastDue)} past due)` : money2(s.ar.totalDue),
            color: s.ar.pastDue >= 1 ? "#b91c1c" : s.ar.totalDue >= 1 ? "#b45309" : "#15803d" }
        : { label: "Open A/R", value: "No statement on file" }
    : s.money ? { label: "Gross / mo", value: money0(s.money.gross) } : undefined;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = x + 16 + width > vw - 8 ? x - 16 - width : x + 16;
  const top = Math.min(y + 16, vh - 260);
  return (
    <TipCard title={s.tenant} rows={rows} footer={footer} width={width}
      style={{ position: "fixed", zIndex: 3000, left, top }} />
  );
}
