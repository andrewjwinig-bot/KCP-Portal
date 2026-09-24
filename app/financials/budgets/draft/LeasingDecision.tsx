"use client";

// A leasing decision, made from the Revenue by tenant table. Every suite that
// needs a call — a lease expiring or held over, a vacancy — carries a pill on
// its row: amber DECIDE until someone decides, then the decision itself
// ("RENEW $24.00/SF", "HOLD", "LEASE-UP JUN") in the owner's colour. The pill
// opens a small window with the inputs; figures save LIVE (~0.7s after typing
// stops) and the row's months re-project behind the window.
//
// The rules are the projection's (leaseRevenue.ts): a renewal's rent starts the
// day after the term, a vacate is paid through it, a hold keeps today's rent,
// a lease-up starts in its month. A HOLD is still a deal for a new term, so it
// takes a term, TI and a commission; only its rent is fixed at today's.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pill, TONE_AMBER, contributorTone } from "@/app/components/Pill";
import type { LeaseAssumption } from "@/lib/financials/budgets/leasingAssumptions";
import { internalCommission } from "@/lib/commissions";

export type SavePayload = { unitRef: string; kind: string | null; monthlyRent?: number; rentPsf?: number; tiPsf?: number; lcPct?: number; startMonth?: number; termYears?: number };

/** One suite needing a call. */
export type LeasingCall = {
  unitRef: string;
  /** "contracted" — a lease in place all year: no call is owed, but its rent
   *  can be BACKED OUT (a tenant who will not pay). */
  mode: "inplace" | "vacant" | "contracted";
  title: string;
  sqft: number;
  currentRent: number;
  leaseTo: string | null;
  assumption?: LeaseAssumption;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const round2 = (n: number) => Math.round(n * 100) / 100;
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

const INPLACE_CHOICES = [
  { value: "hold", label: "Hold — stays at today's rent" },
  { value: "renew", label: "Renew — at a new rent" },
  { value: "vacate", label: "Vacate — leaves at term end" },
  { value: "stop", label: "Stops paying — back out the rent" },
];
const CONTRACTED_CHOICES = [
  { value: "keep", label: "Keeps paying — lease in place" },
  { value: "stop", label: "Stops paying — back out the rent" },
];
const VACANT_CHOICES = [
  { value: "none", label: "Leave vacant" },
  { value: "leaseup", label: "Lease up" },
];

export function parseMDY(s: string | null): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s ?? "");
  if (!m) return null;
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(y, Number(m[1]) - 1, Number(m[2]));
}
const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
const mmyy = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getFullYear()).slice(-2)}`;

/** What the decision does to the budget year, in words. */
function effectText(kind: string, end: Date | null, year: number, month: number): string {
  switch (kind) {
    case "": return "Today's rent until decided";
    case "hold": return "Today's rent";
    case "none": return "Vacant all year";
    case "keep": return "Rent as the lease schedules it";
    case "stop": return `No rent — or recoveries — from ${MONTHS[month - 1]} ${year}`;
    case "leaseup": return `Rent from ${MONTHS[month - 1]} ${year}`;
    case "renew": {
      if (!end) return "New rent all year";
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
      return start.getFullYear() < year ? "New rent all year" : start.getFullYear() > year ? `No change in ${year}` : `New rent from ${fmtDate(start)}`;
    }
    case "vacate": {
      if (!end || end.getFullYear() < year) return `No rent in ${year}`;
      if (end.getFullYear() > year) return "Paid all year";
      return `Paid through ${fmtDate(end)}`;
    }
    default: return "";
  }
}

/** The pill's words for a decision. */
function decisionLabel(call: LeasingCall): string | null {
  const a = call.assumption;
  if (!a) return null;
  if (call.mode === "vacant" && a.kind === "hold") return "LEAVE VACANT";
  if (a.kind === "stop") return `BACKED OUT FROM ${MONTHS[(a.startMonth ?? 1) - 1].toUpperCase()}`;
  const psf = a.rentPsf ?? (a.monthlyRent != null && call.sqft > 0 ? round2((a.monthlyRent * 12) / call.sqft) : null);
  switch (a.kind) {
    case "hold": return "HOLD";
    case "vacate": return "VACATE";
    case "renew": return psf != null ? `RENEW $${psf.toFixed(2)}/SF` : "RENEW";
    case "leaseup": return `LEASE-UP ${MONTHS[(a.startMonth ?? 1) - 1].toUpperCase()}${psf != null ? ` · $${psf.toFixed(2)}/SF` : ""}`;
    default: return null;
  }
}

/** The row's pill — DECIDE, or the decision. The window it opens is owned by
 *  the table (so a save that re-projects, or filters the row away, never
 *  closes it mid-edit). */
export function DecisionPill({ call, owner, onOpen }: {
  call: LeasingCall;
  owner: { id: string; label: string };
  onOpen: () => void;
}) {
  const label = decisionLabel(call);
  // A lease in place owes no call — so no amber DECIDE on every row, only a
  // quiet action that shows when the row is hovered.
  if (call.mode === "contracted" && !label) {
    return (
      <button type="button" className="row-quiet-action" onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label={`Back out ${call.unitRef}'s rent`}>
        Back out
      </button>
    );
  }
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }}
      style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
      aria-label={label ? `Change decision: ${label}` : `Decide ${call.unitRef}`}>
      <Pill tone={label ? contributorTone(owner.id) : TONE_AMBER}>{label ?? "DECIDE"}</Pill>
    </button>
  );
}

export function DecisionModal({ call, owner, budgetYear, fromSchedule, onSave, onClose }: {
  call: LeasingCall;
  owner: { id: string; label: string };
  budgetYear: number;
  fromSchedule: boolean;
  onSave: (p: SavePayload) => unknown;
  onClose: () => void;
}) {
  const { mode, sqft, currentRent, assumption, unitRef } = call;
  const saved = assumption?.kind === "hold" && mode === "vacant" ? "none" : mode === "contracted" && !assumption ? "keep" : assumption?.kind;
  // Rent is keyed as ANNUAL $/SF — how a deal is quoted. An existing tenant's
  // box starts at what they pay today, so a flat renewal is no typing at all.
  const curPsf = sqft > 0 && currentRent ? round2((currentRent * 12) / sqft) : null;
  const savedPsf = assumption?.rentPsf ?? (assumption?.monthlyRent != null && sqft > 0 ? round2((assumption.monthlyRent * 12) / sqft) : null);
  const f2 = (n: number | null | undefined) => (n != null ? n.toFixed(2) : "");
  const [kind, setKind] = useState<string>(saved ?? "");
  const [rent, setRent] = useState<string>(f2(savedPsf ?? curPsf));
  const [ti, setTi] = useState<string>(f2(assumption?.tiPsf));
  const [lc, setLc] = useState<string>(assumption?.lcPct != null ? String(assumption.lcPct) : "");
  const [month, setMonth] = useState<number>(assumption?.startMonth ?? 1);
  const [term, setTerm] = useState<string>(assumption?.termYears != null ? String(assumption.termYears) : "");
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function push(over: Partial<{ k: string; r: string; ti: string; lc: string; mo: number; t: string }> = {}) {
    const k = over.k ?? kind, r = over.r ?? rent, mo = over.mo ?? month, t = over.t ?? term;
    const tiV = over.ti ?? ti, lcV = over.lc ?? lc;
    if (k === "") return;
    const apiKind = k === "none" ? "hold" : k === "keep" ? null : k;
    const psf = r !== "" ? Number(r) : null;
    // A renewal left at today's $/SF holds today's rent exactly, rather than a
    // figure rounded back through $/SF.
    const same = psf != null && curPsf != null && Math.abs(psf - curPsf) < 0.005;
    const monthlyRent = psf == null || same || !(sqft > 0) ? undefined : Math.round((psf * sqft) / 12);
    onSave({
      unitRef, kind: apiKind, monthlyRent,
      rentPsf: k === "renew" || k === "leaseup" ? psf ?? undefined : undefined,
      tiPsf: tiV !== "" ? Number(tiV) : undefined,
      lcPct: lcV !== "" ? Number(lcV) : undefined,
      startMonth: mo, termYears: t !== "" ? Number(t) : undefined,
    });
  }

  const end = parseMDY(call.leaseTo);
  const holdover = !!end && end.getTime() < Date.now();
  const deal = kind === "renew" || kind === "leaseup";
  const costs = deal || (kind === "hold" && mode === "inplace");
  const newMonthly = deal && rent !== "" && sqft > 0 ? (Number(rent) * sqft) / 12 : currentRent;
  const commission = lc !== "" && term !== "" ? (Number(lc) / 100) * newMonthly * 12 * Number(term) : 0;
  const tiTotal = ti !== "" && sqft > 0 ? Number(ti) * sqft : 0;
  const effect = kind === "" && mode === "vacant" ? "Vacant until decided"
    : kind === "" && fromSchedule ? "No rent after the term until decided"
    : effectText(kind, end, budgetYear, month);

  const num = (v: string, set: (x: string) => void, field: "r" | "ti" | "lc", aria: string, pct = false) => (
    <input value={v} inputMode="decimal" placeholder={pct ? "0" : "0.00"} aria-label={aria}
      onChange={(e) => {
        const next = e.target.value.replace(/[^0-9.]/g, "");
        set(next);
        if (liveTimer.current) clearTimeout(liveTimer.current);
        if (next === "" || Number.isFinite(Number(next))) {
          liveTimer.current = setTimeout(() => push({ [field]: next } as Partial<{ r: string; ti: string; lc: string }>), 700);
        }
      }}
      onBlur={() => {
        if (liveTimer.current) { clearTimeout(liveTimer.current); liveTimer.current = null; }
        const f = v === "" || !Number.isFinite(Number(v)) ? "" : pct ? String(Number(v)) : Number(v).toFixed(2);
        set(f);
        push({ [field]: f } as Partial<{ r: string; ti: string; lc: string }>);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ width: 110, textAlign: "right" }} />
  );
  const field = (label: string, control: React.ReactNode, note?: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span style={secLabel}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{control}{note && <span className="muted" style={{ fontSize: 12 }}>{note}</span>}</div>
    </div>
  );
  const fact = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={secLabel}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
  const tone = contributorTone(owner.id);

  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Leasing decision for ${unitRef}`}
        style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: `3px solid ${tone.border}` }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ ...secLabel, color: tone.fg }}>{owner.label}&rsquo;s call · {mode === "vacant" ? "vacant space" : mode === "contracted" ? "lease in place" : holdover ? "holdover" : "expiring lease"}</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>
              <code style={{ fontSize: 13, marginRight: 8 }}>{unitRef}</code>{call.title}
            </div>
          </div>
          <button type="button" className="btn sm" onClick={onClose}>Done</button>
        </div>
        <div style={{ padding: "12px 18px", display: "flex", gap: 22, flexWrap: "wrap", borderBottom: "1px solid var(--border)", background: "rgba(15,23,42,0.025)" }}>
          {fact("SF", sqft > 0 ? sqft.toLocaleString() : "—")}
          {mode === "contracted" && fact("Rent", currentRent > 0 ? <>{money0(currentRent)}/mo{curPsf != null && <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}> · ${curPsf.toFixed(2)}/SF/yr</span>}</> : "—")}
          {mode === "inplace" && fact("Expiring rent", currentRent > 0 ? <>{money0(currentRent)}/mo{curPsf != null && <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}> · ${curPsf.toFixed(2)}/SF/yr</span>}</> : "—")}
          {mode === "inplace" && fact("Expires", end ? <span style={{ color: holdover ? "#b45309" : undefined }}>{mmyy(end)}{holdover ? " (holdover)" : ""}</span> : "—")}
        </div>
        <div style={{ padding: "10px 18px 14px" }}>
          {field("Decision", (
            <select value={kind} className="select-brand" aria-label="Decision"
              onChange={(e) => { if (e.target.value) { setKind(e.target.value); push({ k: e.target.value }); } }}>
              {kind === "" && <option value="">Choose…</option>}
              {(mode === "inplace" ? INPLACE_CHOICES : mode === "contracted" ? CONTRACTED_CHOICES : VACANT_CHOICES).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          {kind === "stop" && field("Rent stops from", (
            <select value={month} className="select-sm" aria-label="Rent stops from"
              onChange={(e) => { setMonth(Number(e.target.value)); push({ mo: Number(e.target.value) }); }}>
              {MONTHS.map((mo, i) => <option key={mo} value={i + 1}>{mo} {budgetYear}</option>)}
            </select>
          ), "no rent or recoveries from this month")}
          {kind === "leaseup" && field("Starts paying", (
            <select value={month} className="select-sm" aria-label="Starts paying"
              onChange={(e) => { setMonth(Number(e.target.value)); push({ mo: Number(e.target.value) }); }}>
              {MONTHS.map((mo, i) => <option key={mo} value={i + 1}>{mo} {budgetYear}</option>)}
            </select>
          ))}
          {deal && field("Rent $/SF/yr", num(rent, setRent, "r", "Rent, annual $ per SF"),
            rent !== "" && sqft > 0 ? `= ${money0((Number(rent) * sqft) / 12)}/mo` : undefined)}
          {costs && !deal && curPsf != null && field("Rent $/SF/yr", <span style={{ fontWeight: 700 }}>${curPsf.toFixed(2)}</span>, "today's rent")}
          {costs && field("Term", (
            <select value={term} className="select-sm" aria-label="Lease term"
              onChange={(e) => { setTerm(e.target.value); push({ t: e.target.value }); }}>
              <option value="">Choose…</option>
              {[1, 2, 3, 5, 7, 10, 15].map((y) => <option key={y} value={y}>{y} yr{y === 1 ? "" : "s"}</option>)}
            </select>
          ))}
          {costs && field("TI $/SF", num(ti, setTi, "ti", "Tenant improvements, $ per SF"), tiTotal > 0 ? `= ${money0(tiTotal)}` : undefined)}
          {costs && field("Outside LC %", num(lc, setLc, "lc", "Leasing commission, percent of the rent over the term", true),
            lc !== "" && Number(lc) > 0 ? (term === "" ? "set a term" : commission > 0 ? `= ${money0(commission)}` : "set a rent") : undefined)}
          {costs && (() => {
            // The internal broker's own commission on the deal — Harry $1/SF at
            // the centres, Nancy's term-based $/SF at the parks — budgeted on
            // Commissions-Internal Broker (6620-8501).
            const group = owner.id === "harry" ? "SC" : "BP";
            const internal = internalCommission(group, sqft, term !== "" ? Number(term) : undefined);
            return field("Internal comm.", <span style={{ fontWeight: 700 }}>{internal > 0 ? money0(internal) : "—"}</span>,
              group === "SC" ? "$1.00/SF · to 6620-8501" : internal > 0 ? "by term · to 6620-8501" : "set a term");
          })()}
          <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, background: tone.bg, border: `1px solid ${tone.border}`, fontSize: 13 }}>
            <b>In {budgetYear}:</b> {effect}
            {assumption?.updatedAt && (
              <span className="muted"> · ✓ {assumption.updatedBy ? `${assumption.updatedBy.charAt(0)}${assumption.updatedBy.slice(1).toLowerCase()}` : "Saved"} {new Date(assumption.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}
