"use client";

// The property page's INTERNAL site plan — the designed centre's drawing,
// large, coloured by what we act on (lease expiry, rent $/SF, open A/R) rather
// than by what the public is sold. Hover a suite for its tenant, lease and
// money; click it for the unit page. Data: /api/properties/[id]/siteplan
// (staffPlan.ts), which decides on the server what this viewer may see.

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatPill } from "../../components/Pill";
import { DownloadMenu } from "../../components/DownloadMenu";
import { downloadPlanPng, downloadRollXlsx, type RollRow } from "./sitePlanExport";
import { TabButton } from "../../components/TabButton";
import { th, thL, td, tdL } from "../../components/tableStyles";
import CampusPlanCard from "./CampusPlanCard";
import PlanTip, { type PlanTipRow } from "./PlanTip";
import type { CampusView } from "../../../lib/buildings/campusMath";
import {
  AR_COLOR, AR_LABEL, arBucket, EXPIRY_COLOR, EXPIRY_LABEL, EXPIRY_ORDER, expiryBucket,
  labelSize, monthsLeft, rentBandOf, rentBands, type ArBucket, type ExpiryBucket, type StaffPlan, type StaffSuite,
} from "../../../lib/centers/designed/staffPlanMath";

type Mode = "plain" | "expiry" | "rent" | "ar";
type SortKey = "order" | "tenant" | "suite" | "sf" | "from" | "to" | "rent" | "psf" | "gross" | "ar" | "past";

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
};
/** Area of a suite's polygons (shoelace), in plan pixels². */
const areaOf = (polys: string[]) => polys.reduce((t, poly) => {
  const p = poly.trim().split(/\s+/).map((q) => q.split(",").map(Number));
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return t + Math.abs(a) / 2;
}, 0);
/** A leased suite paying no base rent — below the lowest step, so a deeper red (owner: not grey). */
const NO_RENT = "#7f1d1d";
/** The plain view's leased fill — quiet, so the vacancies are what reads. */
const LEASED = "#cbd5e1";
const termLeft = (m: number | null) =>
  m == null ? "" : m < 0 ? `ended ${-m} mo ago` : m < 12 ? `${m} mo left` : `${Math.floor(m / 12)} yr ${m % 12} mo left`;

export default function SitePlanCard({ code, style, extraTiles, onLoaded }: {
  code: string; style?: React.CSSProperties;
  /** Tiles from the page laid into the card's ONE KPI row (Year Built). */
  extraTiles?: { label: string; value: string; sub?: string }[];
  /** Tells the page whether a plan (or campus) is drawn, so it can drop its own tiles and rent roll. */
  onLoaded?: (drawn: boolean) => void;
}) {
  const router = useRouter();
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  /** A rent-roll row under the mouse — its suite is outlined on the plan. */
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [plan, setPlan] = useState<StaffPlan | null>(null);
  /** A holding entity's page (JV III Condo, NI LLC) draws the Interplex campus instead. */
  const [campus, setCampus] = useState<CampusView | null>(null);
  const [mode, setMode] = useState<Mode>("plain");
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
      .then((j) => { if (alive) { setPlan(j?.plan ?? null); setCampus(j?.campus ?? null); onLoaded?.(!!(j?.plan || j?.campus)); } })
      .catch(() => { if (alive) { setPlan(null); onLoaded?.(false); } });
    return () => { alive = false; };
  }, [code]);

  const ours = useMemo(() => (plan?.suites ?? []).filter((s) => !s.shadow), [plan]);
  // EVERY suite the roll carries — the drawn ones plus any not mapped onto the
  // drawing — so the tiles, legend and rent roll below are the whole property's.
  const all = useMemo<StaffSuite[]>(() => [
    ...ours.filter((s) => !s.amenity),
    ...(plan?.unmapped ?? []).map((u) => ({
      id: u.unitRef, label: u.unitRef.split("-").slice(1).join("-"), cx: 0, cy: 0, rot: 0, w: 0, h: 0,
      tenant: u.tenant, occupant: u.vacant ? null : u.tenant, unitRefs: [u.unitRef], sf: u.sf,
      status: (u.vacant ? "available" : "leased") as StaffSuite["status"],
      leaseFrom: u.leaseFrom ?? null, leaseTo: u.leaseTo ?? null, money: u.money, notDrawn: true,
    })),
  ], [ours, plan]);
  const rents = useMemo(() => ours.map((s) => s.money?.rentPsf ?? 0), [ours]);
  const bands = useMemo(() => rentBands(rents), [rents]);

  if (!plan) return campus ? <CampusPlanCard campus={campus} style={style} /> : null;

  // An office building draws one floor at a time; the tiles, legend and
  // expirations stay building-wide.
  const cur = plan.floors?.find((f) => f.floor === floor) ?? plan.floors?.[0] ?? null;
  const meta = cur ? cur.plan : plan.plan;
  const drawn = cur ? plan.suites.filter((s) => s.floor === cur.floor) : plan.suites;

  // What each suite reads as in the current mode: its bucket key (for the
  // legend and the focus filter) and its fill.
  const paint = (s: StaffSuite): { key: string; fill: string } | null => {
    if (s.shadow) return null;
    // PLAIN (the default): leased vs vacant only.
    if (mode === "plain") return s.status === "available" ? { key: "vacant", fill: EXPIRY_COLOR.vacant } : { key: "leased", fill: LEASED };
    if (mode === "expiry") { const b = expiryBucket(s, today); return { key: b, fill: EXPIRY_COLOR[b] }; }
    if (mode === "ar") {
      if (s.status === "available") return { key: "vacant", fill: EXPIRY_COLOR.vacant };
      const b = arBucket(s.ar); return { key: b, fill: AR_COLOR[b] };
    }
    if (s.status === "available") return { key: "vacant", fill: EXPIRY_COLOR.vacant };
    const psf = s.money?.rentPsf ?? 0;
    if (psf > 0) { const b = rentBandOf(psf, bands); return { key: b.key, fill: b.color }; }
    return { key: "norent", fill: NO_RENT };
  };

  // KPI tiles — the property at a glance, over every suite the roll carries.
  const totalSf = all.reduce((t, s) => t + s.sf, 0);
  const vacantSf = all.filter((s) => s.status === "available").reduce((t, s) => t + s.sf, 0);
  const vacantCount = all.filter((s) => s.status === "available").length;
  const expiring = all.filter((s) => { const b = expiryBucket(s, today); return b === "expired" || b === "lt12"; });
  const expiringSf = expiring.reduce((t, s) => t + s.sf, 0);
  const pastDue = all.reduce((t, s) => t + (s.ar?.pastDue ?? 0), 0);
  const pastDueCount = all.filter((s) => arBucket(s.ar) === "pastDue").length;

  // Legend: every bucket present in this mode, with its count and SF.
  const legend: { key: string; label: string; color: string; count: number; sf: number }[] = (() => {
    const tally = new Map<string, { count: number; sf: number }>();
    for (const s of all) {
      const p = paint(s); if (!p) continue;
      const t = tally.get(p.key) ?? { count: 0, sf: 0 };
      tally.set(p.key, { count: t.count + 1, sf: t.sf + s.sf });
    }
    const keys: { key: string; label: string; color: string }[] =
      mode === "plain" ? [{ key: "leased", label: "Leased", color: LEASED }, { key: "vacant", label: "Vacant", color: EXPIRY_COLOR.vacant }]
      : mode === "expiry" ? EXPIRY_ORDER.map((b) => ({ key: b, label: EXPIRY_LABEL[b], color: EXPIRY_COLOR[b] }))
      : mode === "ar" ? [
          ...(["pastDue", "current", "none", "unknown"] as ArBucket[]).map((b) => ({ key: b, label: AR_LABEL[b], color: AR_COLOR[b] })),
          { key: "vacant", label: "Vacant", color: EXPIRY_COLOR.vacant },
        ]
      : [
          ...bands.map((b) => ({ key: b.key, label: b.lo === b.hi ? `${money2(b.lo)}/SF` : `${money2(b.lo)} – ${money2(b.hi)}/SF`, color: b.color })),
          { key: "norent", label: "No base rent", color: NO_RENT },
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

  // THE RENT ROLL — every suite, narrowed by the legend filter, sorted by the
  // view (soonest expiry / highest rent / most past due) unless a column is clicked.
  const rows: RollRow[] = all
    .filter((s) => !focus || paint(s)?.key === focus)
    .map((s) => ({ s, color: paint(s)?.fill ?? "transparent", bucket: expiryBucket(s, today) }));
  const val = (r: RollRow, k: SortKey): number | string => {
    const s = r.s;
    switch (k) {
      case "order": return s.order ?? 1e6;
      case "tenant": return s.status === "available" ? "\uffff" : s.tenant.toLowerCase();
      case "suite": return s.unitRefs[0] ?? s.id;
      case "sf": return s.sf;
      case "from": return s.leaseFrom ?? "";
      case "to": return s.status === "available" ? "9999" : s.leaseTo ?? "9998";
      case "rent": return s.money?.baseRent ?? -1;
      case "psf": return s.money?.rentPsf ?? -1;
      case "gross": return s.money?.gross ?? -1;
      case "ar": return s.ar?.totalDue ?? -1;
      case "past": return s.ar?.pastDue ?? -1;
    }
  };
  const eff = sort ?? (mode === "rent" ? { key: "psf" as SortKey, dir: -1 as const } : mode === "ar" ? { key: "past" as SortKey, dir: -1 as const } : mode === "expiry" ? { key: "to" as SortKey, dir: 1 as const } : { key: "order" as SortKey, dir: 1 as const });
  rows.sort((a, b) => {
    const x = val(a, eff.key), y = val(b, eff.key);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
    return c * eff.dir || String(a.s.unitRefs[0] ?? a.s.id).localeCompare(String(b.s.unitRefs[0] ?? b.s.id), undefined, { numeric: true });
  });
  const clickSort = (k: SortKey) => setSort((cur) => (cur?.key === k ? (cur.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: k === "tenant" || k === "suite" || k === "to" || k === "from" ? 1 : -1 }));
  const modeLabel = mode === "plain" ? "leased / vacant" : mode === "expiry" ? "lease expiry" : mode === "rent" ? "base rent $/SF" : "open A/R";
  const focusLabel = focus ? legend.find((l) => l.key === focus)?.label ?? null : null;
  const viewTitle = `${plan.name}${cur && plan.floors && plan.floors.length > 1 ? ` · ${cur.label}` : ""}`;
  const downloads = [
    { label: "Site plan — plain", description: "The drawing alone, no colours", onClick: () => downloadPlanPng({ src: meta.src, width: meta.width, height: meta.height, svg: null, title: viewTitle, file: `${plan.code} site plan` }) },
    { label: "Site plan — as shown", description: `Coloured by ${modeLabel}${focusLabel ? `, ${focusLabel} only` : ""}, with the legend`, onClick: () => downloadPlanPng({
      src: meta.src, width: meta.width, height: meta.height, svg: svgRef.current, title: viewTitle,
      subtitle: `Colored by ${modeLabel}${focusLabel ? ` · ${focusLabel}` : ""} · rent roll ${plan.rollImportedAt ? new Date(plan.rollImportedAt).toLocaleDateString("en-US") : ""}`,
      legend: legend.filter((l) => !focus || l.key === focus).map((l) => ({ color: l.color, label: `${l.label} · ${l.count} · ${l.sf.toLocaleString()} SF` })),
      file: `${plan.code} site plan - ${modeLabel}${focusLabel ? ` - ${focusLabel}` : ""}`,
    }) },
    { label: "Rent roll — as shown (Excel)", description: `${rows.length} suite${rows.length === 1 ? "" : "s"}${focusLabel ? ` · ${focusLabel}` : ""}, in this order`, onClick: () => { void downloadRollXlsx({ name: plan.name, code: plan.code, rows, money: plan.canSeeMoney, ar: plan.canSeeAr, floors: !!plan.floors, filter: focusLabel, today }); } },
  ];

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", ...style }}>
      <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>{plan.floors ? "Floor Plans" : "Site Plan"}</div>
          <div style={{ fontSize: "var(--fs-13)", color: "var(--muted)", marginTop: 4 }}>
            Live from the rent roll{plan.rollImportedAt ? ` imported ${new Date(plan.rollImportedAt).toLocaleDateString("en-US")}` : ""} · hover a suite for its lease, click for the unit
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
        <DownloadMenu items={downloads} variant="default" />
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
          <TabButton active={mode === "plain"} onClick={() => { setMode("plain"); setFocus(null); setSort(null); }}>Plain</TabButton>
          <TabButton active={mode === "expiry"} onClick={() => { setMode("expiry"); setFocus(null); setSort(null); }}>Lease Expiry</TabButton>
          {plan.canSeeMoney && <TabButton active={mode === "rent"} onClick={() => { setMode("rent"); setFocus(null); setSort(null); }}>Rent $/SF</TabButton>}
          {plan.canSeeAr && <TabButton active={mode === "ar"} onClick={() => { setMode("ar"); setFocus(null); setSort(null); }}>Open A/R</TabButton>}
        </div>
        </div>
      </div>

      <div className="pills" style={{ padding: "14px 20px 0", marginTop: 0 }}>
        <StatPill label="Occupied" value={totalSf ? `${(((totalSf - vacantSf) / totalSf) * 100).toFixed(1)}%` : "—"} sub={`${totalSf.toLocaleString()} SF · ${all.length} suites`} />
        <StatPill label="Vacant SF" value={vacantSf.toLocaleString()} accent={vacantSf ? EXPIRY_COLOR.vacant : undefined}
          sub={`${vacantCount} suites`} />
        <StatPill label="Expiring ≤ 12 mo" value={String(expiring.length)} accent={expiring.length ? "#b45309" : undefined}
          sub={`${expiringSf.toLocaleString()} SF incl. past term`} />
        {plan.canSeeAr && (
          <StatPill label="Past Due" value={money0(pastDue)} accent={pastDue >= 1 ? "#b91c1c" : undefined}
            sub={`${pastDueCount} ${pastDueCount === 1 ? "tenant" : "tenants"}`} />
        )}
        {(extraTiles ?? []).map((t) => <StatPill key={t.label} label={t.label} value={t.value} sub={t.sub} />)}
      </div>

      {plan.floors && plan.floors.length > 1 && (
        <div style={{ display: "flex", gap: 6, padding: "14px 20px 0", flexWrap: "wrap" }}>
          {plan.floors.map((f) => {
            const n = plan.suites.filter((s) => s.floor === f.floor && !s.shadow).length;
            const on = f.floor === cur?.floor;
            return (
              <button key={f.floor} type="button" onClick={() => { setFloor(f.floor); setHover(null); }}
                className={on ? "btn primary" : "btn"} style={{ fontSize: "var(--fs-12)", padding: "5px 12px" }}>
                {f.label}<span style={{ opacity: 0.7, fontWeight: 500, marginLeft: 6 }}>{n ? `${n} suite${n === 1 ? "" : "s"}` : "not mapped"}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ position: "relative", margin: "14px 20px 0" }} onMouseLeave={() => setHover(null)}>
        <img src={meta.src} alt={`${cur ? `${cur.label} plan` : "Site plan"} of ${plan.name}`} width={meta.width} height={meta.height}
          style={{ display: "block", width: "100%", height: "auto", borderRadius: 8, border: "1px solid var(--border)", background: "#fff" }} />
        <svg ref={svgRef} viewBox={meta.viewBox} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} role="group" aria-label="Suites">
          {/* An office floor's interiors show only inside the suite under the mouse,
              so the plan reads as clean suite blocks until you look at one. */}
          {meta.detailSrc && hover && hover.s.floor === cur?.floor && hover.s.pts && (
            <>
              <defs>
                <clipPath id={`detail-${plan.code}`}>
                  {hover.s.pts.map((pts, i) => <polygon key={i} points={pts} />)}
                </clipPath>
              </defs>
              <rect x={0} y={0} width={vbW} height={Number(meta.viewBox.split(/\s+/)[3]) || meta.height} fill="#fff"
                clipPath={`url(#detail-${plan.code})`} />
              <image href={meta.detailSrc} x={0} y={0} width={vbW} height={Number(meta.viewBox.split(/\s+/)[3]) || meta.height}
                preserveAspectRatio="none" clipPath={`url(#detail-${plan.code})`} style={{ pointerEvents: "none" }} />
            </>
          )}
          {drawn.map((s) => {
            const p = paint(s);
            const dim = focus && p?.key !== focus;
            const hot = hover?.s.id === s.id || hoverId === s.id;
            const shapeProps = s.amenity ? {
              fill: "#e2e8f0", fillOpacity: 0.85, stroke: "rgba(15,23,42,0.35)", strokeWidth: 3 * (cur ? 0.6 : 1),
            } : {
              fill: p ? p.fill : "transparent",
              // Lighter while hovered on a floor with interiors, so the offices read through.
              // Rent's steps are drawn near full strength: washed over the white plan
              // at 62% the colours read grey (owner: "dont have it be grey").
              fillOpacity: p ? (dim ? 0.12 : hot ? (meta.detailSrc ? 0.3 : 0.9) : mode === "rent" ? 0.85 : 0.62) : 0,
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
                {s.amenity && (
                  <text x={s.cx} y={s.cy} textAnchor="middle" fontSize={fontFor({ ...s, label: s.amenity }) * 0.8} fontWeight={700}
                    fill="#64748b" style={{ pointerEvents: "none" }}>{s.amenity}</text>
                )}
                {!s.shadow && (() => {
                  const fs = fontFor(s);
                  const textProps = {
                    textAnchor: "middle" as const, fill: dim ? "rgba(15,23,42,0.35)" : "#0f172a", stroke: "#fff",
                    paintOrder: "stroke" as const, style: { pointerEvents: "none" as const },
                    transform: s.rot ? `rotate(${s.rot} ${s.cx} ${s.cy})` : undefined,
                  };
                  // An office floor names who is in the suite (or VACANT) over its number,
                  // when the suite is big enough for the name to read; otherwise the number alone.
                  if (cur) {
                    const name = s.status === "available" ? "VACANT" : s.tenant;
                    // Fit the name to the suite's real width, not its bounding box —
                    // on the angled floors (Buildings 6, 7, 8) a box is far wider than the suite.
                    const span = Math.min(s.w, 1.15 * Math.sqrt(areaOf(s.pts ?? [])) || s.w);
                    const nameFs = labelSize({ ...s, w: span, label: name }, vbW / 70);
                    if (nameFs >= vbW / 150 && s.h > nameFs * 3) {
                      const numFs = Math.min(fs, nameFs * 0.85);
                      return (
                        <>
                          <text x={s.cx} y={s.cy - nameFs * 0.15} fontSize={nameFs} fontWeight={800} strokeWidth={nameFs / 5} {...textProps}>{name}</text>
                          <text x={s.cx} y={s.cy + numFs * 1.05} fontSize={numFs} fontWeight={600} strokeWidth={numFs / 5} {...textProps}>{s.label}</text>
                        </>
                      );
                    }
                  }
                  return <text x={s.cx} y={s.cy + fs / 3} fontSize={fs} fontWeight={800} strokeWidth={fs / 5} {...textProps}>{s.label}</text>;
                })()}
              </g>
            );
          })}
        </svg>
        {hover && <SuiteTip s={hover.s} x={hover.x} y={hover.y} plan={plan} today={today} accent={paint(hover.s)?.fill} />}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 20px 16px", alignItems: "center" }}>
        {/* Say what the colours MEAN — the view switch sits far off at the top right,
            and a yellow suite read as a rent when it was a lease date. */}
        <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginRight: 2 }}>
          {mode === "plain" ? "Leased / vacant" : mode === "expiry" ? "Colored by lease expiry" : mode === "rent" ? "Colored by base rent $/SF · red lowest → green highest" : "Colored by open A/R"}
        </span>
        {legend.map((l) => (
          <button key={l.key} type="button" onClick={() => setFocus(focus === l.key ? null : l.key)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${focus === l.key ? "var(--text)" : "var(--border)"}`, background: "var(--card)",
              fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--text)", opacity: focus && focus !== l.key ? 0.5 : 1,
            }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
            {l.label}
            <span className="muted" style={{ fontWeight: 500 }}>{l.count} · {l.sf.toLocaleString()} SF</span>
          </button>
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: "12px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>Rent Roll</div>
          <span className="muted" style={{ fontSize: "var(--fs-12)" }}>
            {focusLabel ? <>{rows.length} of {all.length} suites · {focusLabel} · <button type="button" className="linkish" onClick={() => setFocus(null)}
              style={{ background: "none", border: 0, padding: 0, color: "var(--brand)", cursor: "pointer", fontSize: "var(--fs-12)", fontWeight: 600 }}>show all</button></>
              : <>{all.length} suites · {eff.key === "order" ? "rent roll order" : "sorted"} · click a legend entry to narrow, a column to sort</>}
          </span>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                {([
                  ["tenant", "Tenant", true], ["suite", "Suite", true], ["sf", "SF", false], ["from", "Lease From", false], ["to", "Lease To", false],
                ] as [SortKey, string, boolean][]).map(([k, l, left]) => (
                  <th key={k} style={{ ...(left ? thL : th), cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => clickSort(k)}>{l}{eff.key === k ? (eff.dir === 1 ? " ▲" : " ▼") : ""}</th>
                ))}
                <th style={thL}>Term</th>
                {plan.canSeeMoney && ([["rent", "Rent / mo"], ["psf", "$/SF"], ["gross", "Gross / mo"]] as [SortKey, string][]).map(([k, l]) => (
                  <th key={k} style={{ ...th, cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => clickSort(k)}>{l}{eff.key === k ? (eff.dir === 1 ? " ▲" : " ▼") : ""}</th>
                ))}
                {plan.canSeeAr && ([["ar", "Open A/R"], ["past", "Past Due"]] as [SortKey, string][]).map(([k, l]) => (
                  <th key={k} style={{ ...th, cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => clickSort(k)}>{l}{eff.key === k ? (eff.dir === 1 ? " ▲" : " ▼") : ""}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, color, bucket: b }) => {
                const vacant = s.status === "available";
                return (
                  <tr key={s.id} style={{ cursor: s.unitRefs.length ? "pointer" : "default", background: vacant ? "rgba(15,23,42,0.025)" : undefined }}
                    onClick={() => open(s)}
                    onMouseEnter={() => setHoverId(s.id)} onMouseLeave={() => setHoverId(null)}>
                    <td style={{ ...tdL, fontWeight: vacant ? 400 : 600, fontStyle: vacant ? "italic" : "normal", color: vacant ? "var(--muted)" : "var(--text)" }}>
                      <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: color, marginRight: 8 }} />
                      {vacant ? "Vacant" : s.tenant}
                      {(s as StaffSuite & { notDrawn?: boolean }).notDrawn && <span className="muted" style={{ fontSize: "var(--fs-11)", fontWeight: 500, fontStyle: "normal", marginLeft: 6 }}>not on the plan</span>}
                    </td>
                    <td style={tdL}><code style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--brand)", whiteSpace: "nowrap" }}>{s.unitRefs.join(" + ") || s.id}</code></td>
                    <td style={td}>{s.sf ? s.sf.toLocaleString() : "—"}</td>
                    <td style={{ ...td, color: "var(--muted)" }}>{vacant ? "" : dateLabel(s.leaseFrom)}</td>
                    <td style={td}>{vacant ? "" : dateLabel(s.leaseTo)}</td>
                    <td style={{ ...tdL, color: b === "expired" ? "#b91c1c" : b === "lt12" ? "#b45309" : "var(--muted)", whiteSpace: "nowrap" }}>
                      {vacant ? "" : b === "expired" ? "Past term" : termLeft(monthsLeft(s.leaseTo, today))}
                    </td>
                    {plan.canSeeMoney && <td style={td}>{s.money ? money0(s.money.baseRent) : vacant ? "" : "—"}</td>}
                    {plan.canSeeMoney && <td style={td}>{s.money?.rentPsf ? money2(s.money.rentPsf) : vacant ? "" : "—"}</td>}
                    {plan.canSeeMoney && <td style={td}>{s.money?.gross ? money0(s.money.gross) : vacant ? "" : "—"}</td>}
                    {plan.canSeeAr && <td style={td}>{s.ar ? money0(s.ar.totalDue) : ""}</td>}
                    {plan.canSeeAr && <td style={{ ...td, color: (s.ar?.pastDue ?? 0) >= 1 ? "#b91c1c" : undefined, fontWeight: (s.ar?.pastDue ?? 0) >= 1 ? 700 : undefined }}>{s.ar && s.ar.pastDue >= 1 ? money0(s.ar.pastDue) : ""}</td>}
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 1 && (() => {
              const t = (f: (s: StaffSuite) => number) => rows.reduce((a, r) => a + (f(r.s) || 0), 0);
              const sf = t((s) => s.sf), rent = t((s) => s.money?.baseRent ?? 0), occSf = t((s) => (s.money ? s.sf : 0));
              return (
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                    <td style={{ ...tdL, fontWeight: 700 }}>Total · {rows.length} suites</td><td style={tdL} />
                    <td style={{ ...td, fontWeight: 700 }}>{sf.toLocaleString()}</td><td style={td} /><td style={td} /><td style={tdL} />
                    {plan.canSeeMoney && <td style={{ ...td, fontWeight: 700 }}>{money0(rent)}</td>}
                    {plan.canSeeMoney && <td style={{ ...td, fontWeight: 700 }}>{occSf ? money2((rent * 12) / occSf) : "—"}</td>}
                    {plan.canSeeMoney && <td style={{ ...td, fontWeight: 700 }}>{money0(t((s) => s.money?.gross ?? 0))}</td>}
                    {plan.canSeeAr && <td style={{ ...td, fontWeight: 700 }}>{money0(t((s) => s.ar?.totalDue ?? 0))}</td>}
                    {plan.canSeeAr && <td style={{ ...td, fontWeight: 700, color: t((s) => s.ar?.pastDue ?? 0) >= 1 ? "#b91c1c" : undefined }}>{money0(t((s) => s.ar?.pastDue ?? 0))}</td>}
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
    </div>
  );
}


/** The suite hover: the tenant big and bold, then a few clear figures — the
 *  Management Fees chart's tooltip look (owner: "bold and big and clear"),
 *  with a colour rail in the suite's current colour instead of a dot. */
function SuiteTip({ s, x, y, plan, today, accent }: { s: StaffSuite; x: number; y: number; plan: StaffPlan; today: Date; accent?: string }) {
  const width = 360;
  const rows: PlanTipRow[] = [];
  const vacant = s.status === "available";
  if (!vacant) {
    if (s.occupant && s.occupant !== s.tenant) rows.push({ label: "On the rent roll", value: s.occupant, wide: true });
    const b = expiryBucket(s, today);
    rows.push({
      label: "Expires",
      value: b === "expired" ? `${dateLabel(s.leaseTo)} · past term` : dateLabel(s.leaseTo),
      color: b === "expired" ? "#b91c1c" : b === "lt12" ? "#b45309" : undefined,
      strong: true,
    });
    if (s.money) {
      rows.push({ label: "Base rent / mo", value: money0(s.money.baseRent), strong: true });
      rows.push({ label: "Rent $/SF", value: `${money2(s.money.rentPsf)}/SF` });
      if (s.money.gross > 0) rows.push({ label: "Gross / mo", value: money0(s.money.gross) });
      const rec = s.money.cam + s.money.ret + s.money.other;
      if (rec > 0) rows.push({ label: "CAM · RET · Other / mo", value: `${money0(s.money.cam)} · ${money0(s.money.ret)} · ${money0(s.money.other)}`, wide: true });
    }
  }
  const footer =
    vacant ? null
    : plan.canSeeAr
      ? s.ar
        ? { label: `Open A/R · ${s.ar.period}`, value: s.ar.pastDue >= 1 ? `${money2(s.ar.totalDue)} · ${money2(s.ar.pastDue)} past due` : money2(s.ar.totalDue),
            color: s.ar.pastDue >= 1 ? "#b91c1c" : s.ar.totalDue >= 1 ? "#b45309" : "#15803d" }
        : { label: "Open A/R", value: "No statement on file", color: "var(--muted)" }
      : null;
  return (
    <PlanTip title={vacant ? "Vacant" : s.tenant} accent={accent} x={x} y={y} rows={rows} footer={footer}
      subtitle={`Suite ${s.unitRefs.join(" + ") || s.id} · ${s.sf.toLocaleString()} SF${s.addr ? ` · ${s.addr.split("·").pop()!.trim()}` : ""}`} />
  );
}
