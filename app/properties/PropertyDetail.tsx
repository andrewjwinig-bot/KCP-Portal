"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ALLOC_PCT, TYPE_STYLE, BANK_ACCOUNTS, FLOORPLAN_IDS,
  type PropertyDef, type PropType, type BankAccount,
} from "../../lib/properties/data";
import { PROPERTY_OWNERSHIP, type PropertyOwner } from "../../lib/properties/ownership";
import type { RentRollData, RentRollProperty } from "../../lib/rentroll/parseRentRollExcel";
import { amenityFor } from "../../lib/rentroll/amenities";
import { useUser } from "../components/UserProvider";
import {
  TAX_TASKS, PARCEL_INFO,
  baseEntityName, filingLabel, isTaskEffectivelyDone,
  type TaxTask, type TaxParcel, TAX_CATEGORIES, type K1Investor,
} from "../tracker/tax-data";
import { StatPill } from "../components/Pill";
import ShareFolderCard from "../components/ShareFolderCard";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function pct(n: number) {
  return n === 0 ? "—" : `${(n * 100).toFixed(2)}%`;
}

export function formatModalDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return d;
  return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3].slice(2)}`;
}

export function TypePill({ type, large }: { type: PropType; large?: boolean }) {
  const s = TYPE_STYLE[type];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: large ? "5px 14px" : "2px 9px",
      borderRadius: 999,
      fontSize: large ? 13 : 11,
      fontWeight: 500,
      background: s.bg,
      color: s.text,
      border: `1px solid ${s.border}`,
      letterSpacing: "0.02em",
    }}>
      {type}
    </span>
  );
}

// Match TAX_TASKS to a property by ID prefix
export function tasksForProp(id: string): TaxTask[] {
  // Normalize 40a0 → 40A0 for matching
  const uid = id.toUpperCase();
  return TAX_TASKS.filter(t => {
    const base = baseEntityName(t.entity);
    return base.toUpperCase().startsWith(uid + " ");
  });
}

// Lookup parcels for a property
export function parcelsForProp(id: string): TaxParcel[] {
  const uid = id.toUpperCase();
  const entry = Object.entries(PARCEL_INFO).find(([key]) =>
    key.toUpperCase().startsWith(uid + " ") || key.toUpperCase().startsWith(uid)
  );
  return entry ? entry[1] : [];
}

// Bank accounts for a property
export function bankAccountsForProp(id: string): BankAccount[] {
  return BANK_ACCOUNTS[id.toUpperCase()] ?? [];
}

// ─── FLOORPLAN VIEWER ────────────────────────────────────────────────────────

const FLOORPLAN_ROTATE_CW = new Set(["3610", "3620", "4050"]);

export function FloorplanImage({ src, alt, rotate90 }: { src: string; alt: string; rotate90: boolean }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!rotate90) return;
    const img = new window.Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src, rotate90]);
  if (!rotate90) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={src} alt={alt} style={{ width: "100%", height: "auto", display: "block" }} />;
  }
  if (!dims) return <div style={{ height: 200 }} />;
  return (
    <div style={{ width: "100%", aspectRatio: `${dims.h} / ${dims.w}`, position: "relative", overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: `${(dims.w / dims.h) * 100}%`,
          height: "auto",
          transform: "translate(-50%, -50%) rotate(90deg)",
          transformOrigin: "center",
        }}
      />
    </div>
  );
}

export function FloorplanViewer({ propId, propName }: { propId: string; propName: string }) {
  const [open, setOpen] = useState(false);
  const src = `/floorplans/${propId}.jpg`;
  const rotate90 = FLOORPLAN_ROTATE_CW.has(propId.toUpperCase());

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: 8,
          border: "1.5px solid rgba(11,74,125,0.3)",
          background: "rgba(11,74,125,0.06)",
          color: "#0b4a7d", fontSize: 13, fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 15 }}>⬜</span> View Floorplan
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(15,23,42,0.75)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--card)", borderRadius: 12,
              border: "1px solid var(--border)",
              overflow: "hidden",
              maxWidth: "min(90vw, 960px)",
              maxHeight: "90vh",
              display: "flex", flexDirection: "column",
              boxShadow: "0 16px 48px rgba(15,23,42,0.3)",
            }}
          >
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0,
            }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{propName} — Floorplan</span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)", padding: "0 4px" }}
              >✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: 16 }}>
              <FloorplanImage src={src} alt={`${propName} floorplan`} rotate90={rotate90} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── OWNER ROW ────────────────────────────────────────────────────────────────

/** Single ownership % for display — profit/loss/capital match in source data,
 *  so we use profit % first then fall back to overall owner %. */
export function ownerPctFor(inv: PropertyOwner | K1Investor): number | undefined {
  const o = inv as PropertyOwner;
  return o.profitPct ?? o.ownerPct ?? o.capitalPct ?? o.lossPct;
}

export function K1InvestorRow({
  inv, done, hasDetail, showK1Check,
}: {
  inv: PropertyOwner;
  done: boolean;
  hasDetail: boolean;
  /** Show the K-1 filing-done checkmark column (only on K-1 properties). */
  showK1Check: boolean;
}) {
  const [popupOpen, setPopupOpen] = useState(false);
  const pctFmt = (n: number) => `${(n * 100).toFixed(6).replace(/\.?0+$/, "")}%`;
  const ownership = ownerPctFor(inv);

  return (
    <>
      <div
        onClick={hasDetail ? () => setPopupOpen(true) : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 4,
          background: done ? "rgba(22,163,74,0.04)" : "#fafafa",
          cursor: hasDetail ? "pointer" : "default",
        }}
      >
        {showK1Check && (
          <span style={{
            width: 16, height: 16, borderRadius: 4,
            background: done ? "rgba(22,163,74,0.15)" : "var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: done ? "#16a34a" : "transparent",
            flexShrink: 0,
          }}>✓</span>
        )}
        {inv.vendorCode && (
          <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
            padding: "2px 7px", borderRadius: 999,
            background: "rgba(15,23,42,0.05)", color: "var(--text)",
            border: "1px solid var(--border)",
            flexShrink: 0,
          }}>{inv.vendorCode}</span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: done ? 700 : 500, color: done ? "#16a34a" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {inv.name}
          </span>
          {hasDetail && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>ⓘ</span>
          )}
        </span>
        {ownership != null && (
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, flexShrink: 0 }}>
            {pctFmt(ownership)}
          </span>
        )}
      </div>

      {popupOpen && (
        <div
          onClick={() => setPopupOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--card)", borderRadius: 12,
              border: "1px solid var(--border)",
              padding: "24px 28px",
              width: 420, maxWidth: "calc(100vw - 40px)",
              boxShadow: "0 8px 32px rgba(15,23,42,0.18)",
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{inv.name}</div>
                {inv.detailedName && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{inv.detailedName}</div>
                )}
              </div>
              <button
                onClick={() => setPopupOpen(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)", lineHeight: 1, padding: 2 }}
              >✕</button>
            </div>

            {inv.address && (
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 3 }}>Address</div>
                <div>{inv.address}</div>
                <div>{inv.city}, {inv.state} {inv.zip}</div>
                {inv.stateIfDifferent && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>Also files in: {inv.stateIfDifferent}</div>
                )}
              </div>
            )}

            {inv.phone && (
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 3 }}>Phone</div>
                <div>{inv.phone}</div>
              </div>
            )}

            {inv.vendorCode && (
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 3 }}>Vendor Code</div>
                <div style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{inv.vendorCode}</div>
              </div>
            )}

            {ownership != null && (
              <div>
                <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 6 }}>Ownership %</div>
                <div style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "#fafafa", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{pctFmt(ownership)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── OWNER SUB-ROW ────────────────────────────────────────────────────────────
// Compact sub-row used under a "parent" owner row when one person holds
// multiple legal-payee stakes in the same property. Shows the vendor code
// chip, trust/detail label (if any), and the individual stake %.

export function OwnerSubRow({
  inv, done, hasDetail, showK1Check, ownership, pctFmt,
}: {
  inv: PropertyOwner;
  done: boolean;
  hasDetail: boolean;
  showK1Check: boolean;
  ownership: number | undefined;
  pctFmt: (n: number) => string;
}) {
  const [popupOpen, setPopupOpen] = useState(false);
  const detail = inv.detailedName ?? "";
  return (
    <>
      <div
        onClick={hasDetail ? () => setPopupOpen(true) : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 10px",
          borderLeft: "2px solid var(--border)",
          marginBottom: 2,
          cursor: hasDetail ? "pointer" : "default",
          fontSize: 12,
        }}
      >
        {showK1Check && (
          <span style={{
            width: 13, height: 13, borderRadius: 3,
            background: done ? "rgba(22,163,74,0.18)" : "var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, color: done ? "#16a34a" : "transparent",
            flexShrink: 0,
          }}>✓</span>
        )}
        {inv.vendorCode && (
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
            padding: "1px 6px", borderRadius: 999,
            background: "rgba(15,23,42,0.05)", color: "var(--text)",
            border: "1px solid var(--border)",
            flexShrink: 0,
          }}>{inv.vendorCode}</span>
        )}
        <span style={{
          flex: 1, minWidth: 0,
          color: "var(--muted)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {detail || "—"}
          {hasDetail && <span style={{ marginLeft: 4, fontSize: 10 }}>ⓘ</span>}
        </span>
        {ownership != null && (
          <span style={{ fontWeight: 600, flexShrink: 0 }}>{pctFmt(ownership)}</span>
        )}
      </div>

      {popupOpen && (
        <div
          onClick={() => setPopupOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card)", borderRadius: 12,
              border: "1px solid var(--border)",
              padding: "24px 28px",
              width: 420, maxWidth: "calc(100vw - 40px)",
              boxShadow: "0 8px 32px rgba(15,23,42,0.18)",
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{inv.name}</div>
                {inv.detailedName && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{inv.detailedName}</div>
                )}
              </div>
              <button
                onClick={() => setPopupOpen(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)", lineHeight: 1, padding: 2 }}
              >✕</button>
            </div>

            {inv.address && (
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 3 }}>Address</div>
                <div>{inv.address}</div>
                <div>{inv.city}, {inv.state} {inv.zip}</div>
                {inv.stateIfDifferent && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>Also files in: {inv.stateIfDifferent}</div>
                )}
              </div>
            )}

            {inv.phone && (
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 3 }}>Phone</div>
                <div>{inv.phone}</div>
              </div>
            )}

            {inv.vendorCode && (
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 3 }}>Vendor Code</div>
                <div style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{inv.vendorCode}</div>
              </div>
            )}

            {ownership != null && (
              <div>
                <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 6 }}>Ownership %</div>
                <div style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "#fafafa", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{pctFmt(ownership)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── SMALL HELPER COMPONENTS ──────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
      color: "var(--muted)", textTransform: "uppercase",
      marginBottom: 10, display: "flex", alignItems: "center", gap: 6,
    }}>
      {children}
    </div>
  );
}

export function CollapsibleSection({ title, link, count, children }: {
  title: string;
  link?: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        marginBottom: open ? 12 : 0,
      }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "transparent", border: "none", padding: 0,
            fontSize: 11, fontWeight: 900, letterSpacing: "0.08em",
            color: "var(--muted)", textTransform: "uppercase",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>{title}</span>
          {typeof count === "number" && (
            <span style={{
              fontSize: 10, fontWeight: 800,
              padding: "1px 7px", borderRadius: 999,
              background: "rgba(15,23,42,0.06)", color: "var(--muted)",
              letterSpacing: 0,
            }}>{count}</span>
          )}
        </button>
        {link && <span onClick={(e) => e.stopPropagation()}>{link}</span>}
      </div>
      {open && children}
    </section>
  );
}

export function InfoField({ label, value }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.4, wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

/** Larger variant of InfoField for hero/Overview-style key reference numbers
 * (Year Built, Sq Footage, Acres). 16/700 instead of 14/600 to give
 * Overview values more weight than dense detail-list fields. */
export function BigInfoField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", lineHeight: 1.4, wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

// ─── PROPERTY DETAIL BODY ─────────────────────────────────────────────────────

export function PropertyDetailBody({
  prop,
  checked,
}: {
  prop: PropertyDef;
  checked: Record<string, boolean>;
}) {
  const router = useRouter();
  const { user } = useUser();
  const isMaint = user.id === "maint";
  const canEditFacts = isMaint || user.navKeys.has("all");
  const tasks        = useMemo(() => tasksForProp(prop.id), [prop.id]);
  const parcels      = useMemo(() => parcelsForProp(prop.id), [prop.id]);
  const bankAccounts = useMemo(() => bankAccountsForProp(prop.id), [prop.id]);
  const alloc       = ALLOC_PCT[prop.id];
  const k1Tasks     = tasks.filter(t => t.category === "k1");
  const filingTasks = tasks.filter(t => t.category !== "k1");

  // Maintenance-team-edited property facts (year built, construction,
  // roof, electrical, HVAC, etc.). Stored server-side via
  // /api/properties/[id]/facts. yearBuilt here is an override — if unset,
  // we fall back to the static value on PropertyDef.
  const [facts, setFacts] = useState<PropertyFactsState | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/properties/${encodeURIComponent(prop.id)}/facts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setFacts(j?.facts ?? {}))
      .catch(() => alive && setFacts({}));
    return () => { alive = false; };
  }, [prop.id]);

  // Maintenance requests for this property — fetched on mount.
  type PropRequest = {
    id: string; subject: string; status: string; priority: string;
    assignedTo: string | null; submittedDate: string; tenantCompany: string;
    propertyCode: string | null; propertyName: string;
  };
  const [propRequests, setPropRequests] = useState<PropRequest[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/maintenance/requests")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!alive) return;
        const all = (j?.requests ?? []) as PropRequest[];
        setPropRequests(all.filter((r) => r.propertyCode === prop.id));
      })
      .catch(() => alive && setPropRequests([]));
    return () => { alive = false; };
  }, [prop.id]);

  // Canonical ownership entry (source of truth for owners + vendor codes).
  const ownershipEntry = useMemo(
    () => PROPERTY_OWNERSHIP.find((p) => p.propertyCode.toUpperCase() === prop.id.toUpperCase()),
    [prop.id],
  );
  // Group + sort owners by total ownership desc (matches Investor Info page).
  const ownerGroups = useMemo(() => {
    const owners = ownershipEntry?.owners ?? [];
    const byKey = new Map<string, PropertyOwner[]>();
    for (const o of owners) {
      const key = o.name.toLowerCase().replace(/\s+/g, " ").trim();
      let arr = byKey.get(key);
      if (!arr) { arr = []; byKey.set(key, arr); }
      arr.push(o);
    }
    for (const arr of byKey.values()) {
      arr.sort((a, b) => (ownerPctFor(b) ?? 0) - (ownerPctFor(a) ?? 0));
    }
    const totals = new Map<string, number>();
    for (const [k, arr] of byKey.entries()) {
      totals.set(k, arr.reduce((s, o) => s + (ownerPctFor(o) ?? 0), 0));
    }
    return [...byKey.entries()]
      .map(([k, arr]) => ({ key: k, total: totals.get(k) ?? 0, owners: arr }))
      .sort((a, b) => b.total - a.total);
  }, [ownershipEntry]);

  const ownershipTotal = useMemo(
    () => (ownershipEntry?.owners ?? []).reduce((s, o) => s + (ownerPctFor(o) ?? 0), 0),
    [ownershipEntry],
  );

  const [rrProp, setRrProp] = useState<RentRollProperty | null>(null);
  useEffect(() => {
    fetch("/api/rentroll")
      .then(r => r.ok ? r.json() : null)
      .then((res: { rentroll: RentRollData } | null) => {
        const data = res?.rentroll;
        if (!data) return;
        const match = data.properties.find(
          p => p.propertyCode.toUpperCase() === prop.id.toUpperCase()
        );
        setRrProp(match ?? null);
      })
      .catch(() => {});
  }, [prop.id]);

  const [instructionsTask, setInstructionsTask] = useState<TaxTask | null>(null);

  const today = new Date();

  function filingStatus(t: TaxTask) {
    const done = isTaskEffectivelyDone(t, checked);
    if (done) return { label: "Filed", color: "#16a34a", bg: "rgba(22,163,74,0.08)", border: "rgba(22,163,74,0.2)" };
    const due = new Date(today.getFullYear(), t.dueMonth - 1, t.dueDay);
    due.setHours(23, 59, 59);
    if (due < today) return { label: "Overdue", color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.2)" };
    return { label: "Pending", color: "var(--muted)", bg: "rgba(0,0,0,0.04)", border: "var(--border)" };
  }

  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Hero KPI strip values — gather first so we can skip rendering when nothing's set.
  const heroSqft = (rrProp?.totalSqft && rrProp.totalSqft > 0)
    ? rrProp.totalSqft
    : (prop.sqft ?? 0);
  const heroOccPct = rrProp && rrProp.totalSqft > 0
    ? (rrProp.occupiedSqft / rrProp.totalSqft) * 100
    : null;
  const heroUnits = rrProp?.units?.length ?? 0;
  const heroYearBuilt = facts?.yearBuilt ?? prop.yearBuilt ?? null;

  const heroTiles: { label: string; value: string; accent?: string }[] = [];
  if (heroSqft > 0) heroTiles.push({ label: "Total Sq Ft", value: heroSqft.toLocaleString() });
  if (heroOccPct != null) {
    heroTiles.push({
      label: "Occupied",
      value: `${heroOccPct.toFixed(1)}%`,
      accent: heroOccPct >= 90 ? "#16a34a" : heroOccPct >= 70 ? "#0b4a7d" : "#d97706",
    });
  }
  if (heroUnits > 0) heroTiles.push({ label: "Units", value: String(heroUnits) });
  if (heroYearBuilt) heroTiles.push({ label: "Year Built", value: String(heroYearBuilt) });

  return (
    <>
      {/* ── Hero KPI strip ── */}
      {heroTiles.length > 0 && (
        <div className="pills" style={{ marginTop: 0, marginBottom: 14 }}>
          {heroTiles.map((t) => (
            <StatPill key={t.label} label={t.label} value={t.value} accent={t.accent} />
          ))}
        </div>
      )}

      {/* Body — sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Notes ── */}
        {prop.notes && (
          <div className="card">
            <SectionLabel>Notes</SectionLabel>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>{prop.notes}</p>
          </div>
        )}

        {/* ── Shared Drive Folder ── */}
        <ShareFolderCard kind="property" entityKey={prop.id} />

        {/* ── Overview ── */}
        <div className="card">
          <SectionLabel>Overview</SectionLabel>

          {/* Identifiers & accounts · Parcel Numbers · Floorplan — one row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px 32px",
            alignItems: "start",
          }}>
            {(prop.acres != null || prop.ein || prop.ein2 || (!isMaint && bankAccounts.length > 0)) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                {prop.acres != null && (
                  <BigInfoField label="Acres" value={`${prop.acres} ac`} />
                )}
                {prop.ein && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>{prop.einLabel ?? "EIN"}</div>
                    <div style={{
                      padding: "8px 12px",
                      background: "rgba(11,74,125,0.04)",
                      border: "1px solid rgba(11,74,125,0.12)",
                      borderRadius: 8,
                      fontSize: 14, fontWeight: 700, color: "var(--text)",
                    }}>{prop.ein}</div>
                  </div>
                )}
                {prop.ein2 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>{prop.ein2Label ?? "EIN (2)"}</div>
                    <div style={{
                      padding: "8px 12px",
                      background: "rgba(11,74,125,0.04)",
                      border: "1px solid rgba(11,74,125,0.12)",
                      borderRadius: 8,
                      fontSize: 14, fontWeight: 700, color: "var(--text)",
                    }}>{prop.ein2}</div>
                  </div>
                )}
                {!isMaint && bankAccounts.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Bank Accounts</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {bankAccounts.map((acct, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px",
                          background: "rgba(11,74,125,0.04)",
                          border: "1px solid rgba(11,74,125,0.12)",
                          borderRadius: 8,
                          gap: 10,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <a href={acct.link} target="_blank" rel="noreferrer"
                              style={{ fontSize: 14, fontWeight: 700, color: "#0b4a7d", textDecoration: "none" }}
                              onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                            >{acct.bank} {acct.last4}</a>
                            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>{acct.label}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {parcels.length > 0 && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Parcel Numbers</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {parcels.map((p, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "rgba(11,74,125,0.04)",
                      border: "1px solid rgba(11,74,125,0.12)",
                      borderRadius: 8,
                      gap: 10,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {p.link
                          ? <a href={p.link} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 700, color: "#0b4a7d", textDecoration: "none" }}
                              onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                            >{p.number}</a>
                          : <code style={{ fontSize: 14, fontWeight: 700, color: "#0b4a7d" }}>{p.number}</code>
                        }
                        {p.label && <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>{p.label}</span>}
                      </div>
                      {p.method && (
                        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{p.method}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {FLOORPLAN_IDS.has(prop.id) && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Floorplan</div>
                <FloorplanViewer propId={prop.id} propName={prop.name} />
              </div>
            )}
          </div>

          {/* Portfolio PRS % — full-width strip at the foot of Overview */}
          {!isMaint && alloc && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>Portfolio PRS %</span>
                <Link href="/allocated-invoicer" style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", textDecoration: "none" }}>
                  Open Allocated Invoicer →
                </Link>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {([
                  ["9301", "Business Parks"],
                  ["9302", "Shopping Centers"],
                  ["9303", "All Properties"],
                ] as const).map(([acct, name]) => (
                  <div key={acct} style={{
                    flex: 1, textAlign: "center",
                    padding: "8px 8px 7px",
                    border: `1.5px solid ${alloc[acct] > 0 ? "rgba(11,74,125,0.28)" : "var(--border)"}`,
                    borderRadius: 8,
                    background: alloc[acct] > 0 ? "rgba(11,74,125,0.05)" : "#fafafa",
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1, color: alloc[acct] > 0 ? "#0b4a7d" : "var(--muted)" }}>
                      {pct(alloc[acct])}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", marginTop: 4 }}>
                      {name} ({acct})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Building Facts (maint-team editable) ── */}
        <div className="card">
          <BuildingFacts
            propId={prop.id}
            facts={facts}
            onSaved={(next) => setFacts(next)}
            canEdit={canEditFacts}
          />
        </div>

        {/* ── Ownership ── */}
        {!isMaint && ownershipEntry && ownershipEntry.owners.length > 0 && (
          <div className="card">
          <CollapsibleSection
            title="Ownership"
            count={ownershipEntry.owners.length}
            link={
              <Link href="/investors" style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", marginLeft: 8, textDecoration: "none" }}>
                Open Investor Info →
              </Link>
            }
          >
            {k1Tasks.map((t) => {
              const allDone = t.investors?.every((inv) => checked[inv.id]) ?? false;
              return (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    K-1 Distribution · Due {MONTHS_SHORT[t.dueMonth - 1]} {t.dueDay}
                  </span>
                  {allDone
                    ? <span style={{ fontSize: 10, fontWeight: 800, color: "#16a34a", background: "rgba(22,163,74,0.08)", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(22,163,74,0.2)" }}>All Distributed</span>
                    : <span style={{ fontSize: 10, fontWeight: 800, color: "#b45309", background: "rgba(180,83,9,0.08)", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(180,83,9,0.25)" }}>Pending</span>
                  }
                </div>
              );
            })}
            {ownerGroups.map((g) => {
              const grouped = g.owners.length > 1;
              if (!grouped) {
                const inv = g.owners[0];
                const done = !!checked[inv.id];
                const hasDetail = !!(inv.detailedName || inv.address || inv.phone || inv.vendorCode || ownerPctFor(inv) != null);
                return (
                  <K1InvestorRow key={inv.id} inv={inv} done={done} hasDetail={hasDetail} showK1Check={!!ownershipEntry.hasK1Distribution} />
                );
              }
              // Multi-stake: primary row with person + combined %, then
              // smaller indented sub-rows for each vendor / legal payee.
              return (
                <div key={g.key} style={{ marginBottom: 6 }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: "#fafafa",
                    marginBottom: 4,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{g.owners[0].name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {(g.total * 100).toFixed(4)}%
                    </span>
                  </div>
                  <div style={{ paddingLeft: 18 }}>
                    {g.owners.map((inv) => {
                      const done = !!checked[inv.id];
                      const hasDetail = !!(inv.detailedName || inv.address || inv.phone || inv.vendorCode || ownerPctFor(inv) != null);
                      const pctFmt = (n: number) => `${(n * 100).toFixed(6).replace(/\.?0+$/, "")}%`;
                      const ownership = ownerPctFor(inv);
                      return (
                        <OwnerSubRow
                          key={inv.id}
                          inv={inv}
                          done={done}
                          hasDetail={hasDetail}
                          showK1Check={!!ownershipEntry.hasK1Distribution}
                          ownership={ownership}
                          pctFmt={pctFmt}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {ownershipTotal > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderRadius: 8, background: "rgba(15,23,42,0.04)", border: "1px solid var(--border)", marginTop: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Total</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{`${(ownershipTotal * 100).toFixed(4)}%`}</span>
              </div>
            )}
          </CollapsibleSection>
          </div>
        )}

        {/* ── Tax Filings ── */}
        {!isMaint && filingTasks.length > 0 && (
          <div className="card">
          <CollapsibleSection
            title="Tax Filings"
            count={filingTasks.length}
            link={
              <Link href="/tracker/taxes" style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", marginLeft: 8, textDecoration: "none" }}>
                Open Filing Tracker →
              </Link>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filingTasks.map(t => {
                const status = filingStatus(t);
                const cat = TAX_CATEGORIES[t.category];
                return (
                  <div
                    key={t.id}
                    onClick={t.instructionSteps ? () => setInstructionsTask(t) : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "9px 12px",
                      border: `1px solid ${t.instructionSteps ? "rgba(220,38,38,0.35)" : "var(--border)"}`,
                      borderRadius: 8,
                      background: t.instructionSteps ? "rgba(220,38,38,0.03)" : "#fafafa",
                      cursor: t.instructionSteps ? "pointer" : "default",
                    }}
                  >
                    <span style={{
                      flexShrink: 0,
                      width: 28, height: 28,
                      borderRadius: 6,
                      background: cat.bg,
                      border: `1px solid ${cat.border}`,
                      color: cat.text,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 900,
                    }}>{cat.pill}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
                        {filingLabel(t)}
                        {t.instructionSteps && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Due {MONTHS_SHORT[t.dueMonth - 1]} {t.dueDay}
                        {t.notes && ` · ${t.notes}`}
                      </div>
                    </div>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 10, fontWeight: 800,
                      padding: "2px 8px", borderRadius: 999,
                      background: status.bg,
                      color: status.color,
                      border: `1px solid ${status.border}`,
                    }}>{status.label}</span>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
          </div>
        )}

        {/* ── Rent Roll table (collapsible inside the open card) ── */}
        {rrProp && rrProp.units.length > 0 && (
          <div className="card">
          <CollapsibleSection title="Rent Roll" count={rrProp.units.length}>
            <div className="tableWrap" style={{ marginTop: 4 }}>
              <table>
                <colgroup>
                  <col />                          {/* Tenant — flex (gets the slack) */}
                  <col style={{ width: 90 }} />    {/* Unit */}
                  <col style={{ width: 80 }} />    {/* Sq Ft */}
                  <col style={{ width: 95 }} />    {/* Lease From */}
                  <col style={{ width: 95 }} />    {/* Lease To */}
                  <col style={{ width: 90 }} />    {/* Base Rent /mo */}
                  <col style={{ width: 70 }} />    {/* Annual $/sf */}
                </colgroup>
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Unit</th>
                    <th style={{ textAlign: "right" }}>Sq Ft</th>
                    <th>Lease From</th>
                    <th>Lease To</th>
                    <th style={{ textAlign: "right" }}>Base Rent<br />/mo</th>
                    <th style={{ textAlign: "right" }}>Annual<br />$/sf</th>
                  </tr>
                </thead>
                <tbody>
                  {rrProp.units.map((u, i) => {
                    const amenity = u.amenity ?? amenityFor(u.unitRef);
                    const isAmenity = !!amenity;
                    const effectiveVacant = isAmenity ? false : u.isVacant;
                    const occupantLabel = isAmenity ? amenity!.label : u.occupantName;
                    return (
                    <tr
                      key={i}
                      onClick={() => router.push(`/rentroll/units/${encodeURIComponent(u.unitRef)}`)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
                      style={{
                        cursor: "pointer",
                        background: isAmenity
                          ? "rgba(13,148,136,0.06)"
                          : effectiveVacant
                            ? "rgba(15,23,42,0.025)"
                            : undefined,
                      }}
                    >
                      <td style={{
                        fontWeight: effectiveVacant ? 400 : 600,
                        color: effectiveVacant
                          ? "var(--muted)"
                          : isAmenity
                            ? "#0d9488"
                            : "var(--text)",
                        fontStyle: effectiveVacant ? "italic" : "normal",
                      }}>
                        {effectiveVacant ? "Vacant" : occupantLabel}
                        {isAmenity && (
                          <span style={{
                            marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
                            padding: "2px 7px", borderRadius: 999,
                            background: "rgba(13,148,136,0.10)", color: "#0d9488",
                            border: "1px solid rgba(13,148,136,0.35)", textTransform: "uppercase",
                          }}>
                            In-House
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <code style={{ fontSize: 12, fontWeight: 700, color: "#0b4a7d", whiteSpace: "nowrap", textDecoration: "underline", textUnderlineOffset: 2 }}>{u.unitRef}</code>
                      </td>
                      <td style={{ textAlign: "right", fontSize: 13 }}>{u.sqft ? u.sqft.toLocaleString() : "—"}</td>
                      <td style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatModalDate(u.leaseFrom)}</td>
                      <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{formatModalDate(u.leaseTo)}</td>
                      <td style={{ textAlign: "right", fontSize: 13 }}>{u.baseRent ? `$${u.baseRent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                      <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{u.annualRentPerSqft ? `$${u.annualRentPerSqft.toFixed(2)}` : "—"}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
          </div>
        )}

        {/* ── Maintenance Requests for this property ── */}
        {propRequests && propRequests.length > 0 && (
          <div className="card">
          <CollapsibleSection
            title="Maintenance Requests"
            count={propRequests.length}
            link={
              <Link href={`/maintenance?property=${encodeURIComponent(prop.name)}`} style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", marginLeft: 8, textDecoration: "none" }}>
                Open Maintenance →
              </Link>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...propRequests]
                .sort((a, b) => {
                  // Active (not Complete) first; within each, newest first.
                  const ac = a.status === "Complete" ? 1 : 0;
                  const bc = b.status === "Complete" ? 1 : 0;
                  if (ac !== bc) return ac - bc;
                  return (Date.parse(b.submittedDate) || 0) - (Date.parse(a.submittedDate) || 0);
                })
                .map((r) => {
                  const statusColor =
                    r.status === "Complete" ? { bg: "rgba(22,163,74,0.10)", fg: "#15803d", border: "rgba(22,163,74,0.30)" }
                      : r.status === "In Progress" ? { bg: "rgba(217,119,6,0.10)", fg: "#b45309", border: "rgba(217,119,6,0.30)" }
                        : { bg: "rgba(11,74,125,0.10)", fg: "#0b4a7d", border: "rgba(11,74,125,0.30)" };
                  const prioColor =
                    r.priority === "High" ? { bg: "rgba(220,38,38,0.10)", fg: "#b91c1c", border: "rgba(220,38,38,0.30)" }
                      : r.priority === "Medium" ? { bg: "rgba(217,119,6,0.10)", fg: "#b45309", border: "rgba(217,119,6,0.30)" }
                        : null;
                  return (
                    <Link
                      key={r.id}
                      href={`/maintenance?openId=${encodeURIComponent(r.id)}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 12px",
                        border: "1px solid var(--border)", borderRadius: 8,
                        background: "#fafafa",
                        textDecoration: "none", color: "inherit",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.subject || "(no subject)"}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {[r.tenantCompany, r.assignedTo ?? "Unassigned", formatModalDate(r.submittedDate)].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {prioColor && (
                        <span style={{
                          flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                          padding: "2px 8px", borderRadius: 999,
                          background: prioColor.bg, color: prioColor.fg, border: `1px solid ${prioColor.border}`,
                        }}>{r.priority}</span>
                      )}
                      <span style={{
                        flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                        padding: "2px 8px", borderRadius: 999,
                        background: statusColor.bg, color: statusColor.fg, border: `1px solid ${statusColor.border}`,
                      }}>{r.status}</span>
                    </Link>
                  );
                })}
            </div>
          </CollapsibleSection>
          </div>
        )}

      </div>

      {/* ── Instructions popup ── */}
      {instructionsTask && (
        <div
          onClick={() => setInstructionsTask(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1100,
            background: "rgba(15,23,42,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--card)", borderRadius: 14,
              border: "1.5px solid rgba(220,38,38,0.3)",
              padding: "24px 28px",
              width: 500, maxWidth: "calc(100vw - 40px)",
              maxHeight: "80vh", overflowY: "auto",
              boxShadow: "0 8px 32px rgba(15,23,42,0.2)",
              display: "flex", flexDirection: "column", gap: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{filingLabel(instructionsTask)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Due {MONTHS_SHORT[instructionsTask.dueMonth - 1]} {instructionsTask.dueDay}
                  {instructionsTask.notes && ` · ${instructionsTask.notes}`}
                </div>
              </div>
              <button
                onClick={() => setInstructionsTask(null)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)", lineHeight: 1, padding: 2, flexShrink: 0 }}
              >✕</button>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
                Instructions
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                {instructionsTask.instructionSteps!.map((step, i) => (
                  <li key={i} style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}>
                    {step.startsWith("Email ") ? (
                      <>
                        Email{" "}
                        <a
                          href={`mailto:${step.slice(6).trim()}`}
                          style={{ color: "#0b4a7d", fontWeight: 600, textDecoration: "underline" }}
                        >
                          {step.slice(6).trim()}
                        </a>
                      </>
                    ) : step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── BUILDING FACTS (maint-team editable) ───────────────────────────────

export type PropertyFactsState = {
  yearBuilt?: number | null;
  constructionType?: string;
  roofAge?: string;
  roofType?: string;
  electricalService?: string;
  ceilingHeight?: string;
  waterService?: string;
  hvac?: string;
  restrooms?: string;
  updatedAt?: string;
};

const FACT_FIELDS: { key: keyof PropertyFactsState; label: string; placeholder: string; type?: "number" }[] = [
  { key: "constructionType",  label: "Construction Type",  placeholder: "e.g. Steel frame, masonry exterior" },
  { key: "roofAge",           label: "Roof Age",           placeholder: "e.g. 12 yrs (replaced 2014)" },
  { key: "roofType",          label: "Roof Type",          placeholder: "e.g. TPO membrane" },
  { key: "electricalService", label: "Electrical Service", placeholder: "e.g. 800A 277/480V 3-phase" },
  { key: "ceilingHeight",     label: "Ceiling Height",     placeholder: `e.g. 12'–14' clear` },
  { key: "waterService",      label: "Water Service",      placeholder: "e.g. 2-inch domestic, 6-inch fire" },
  { key: "hvac",              label: "HVAC",               placeholder: "e.g. Rooftop Carrier units, 5 zones" },
  { key: "restrooms",         label: "Restrooms",          placeholder: "e.g. 4 ADA-compliant, 2 per floor" },
];

function BuildingFacts({
  propId, facts, onSaved, canEdit,
}: {
  propId: string;
  facts: PropertyFactsState | null;
  onSaved: (f: PropertyFactsState) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PropertyFactsState>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(facts ?? {});
    setError(null);
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/properties/${encodeURIComponent(propId)}/facts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      onSaved(j.facts ?? {});
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const filledCount = facts
    ? FACT_FIELDS.reduce((n, f) => {
        const v = facts[f.key];
        return n + (typeof v === "string" && v.trim() ? 1 : 0);
      }, 0)
    : 0;

  function displayValue(key: keyof PropertyFactsState): string {
    const v = facts?.[key];
    return (typeof v === "string" && v.trim()) ? v : "—";
  }

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <span style={{
          fontSize: 11, fontWeight: 900, letterSpacing: "0.08em",
          color: "var(--muted)", textTransform: "uppercase",
        }}>Building Facts</span>
        <span style={{
          fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 999,
          background: "rgba(15,23,42,0.06)", color: "var(--muted)",
        }}>{filledCount}</span>
        {canEdit && !editing && (
          <button
            onClick={startEdit}
            style={{
              fontSize: 11, fontWeight: 600, color: "var(--brand)",
              marginLeft: 2, background: "transparent", border: "none",
              cursor: "pointer", padding: 0, fontFamily: "inherit",
            }}
          >Edit ✎</button>
        )}
      </div>
      {facts === null ? (
        <div className="muted small">Loading…</div>
      ) : editing ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {FACT_FIELDS.map((f) => {
            const raw = draft[f.key];
            const value = raw == null ? "" : String(raw);
            return (
              <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
                  {f.label}
                </span>
                <input
                  type={f.type === "number" ? "number" : "text"}
                  inputMode={f.type === "number" ? "numeric" : undefined}
                  value={value}
                  placeholder={f.placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  style={{
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    background: "var(--card)",
                    color: "var(--text)",
                    fontFamily: "inherit", fontSize: 13, outline: "none",
                  }}
                />
              </label>
            );
          })}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <button
              onClick={save}
              disabled={busy}
              className="btn primary"
              style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}
            >{busy ? "Saving…" : "Save"}</button>
            <button
              onClick={cancelEdit}
              disabled={busy}
              className="btn"
              style={{ fontSize: 13, padding: "8px 14px" }}
            >Cancel</button>
            {error && <span style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>{error}</span>}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px 24px" }}>
          {FACT_FIELDS.map((f) => (
            <InfoField key={f.key} label={f.label} value={displayValue(f.key)} />
          ))}
        </div>
      )}
    </section>
  );
}
