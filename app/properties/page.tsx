"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  PROPERTY_DEFS, ALLOC_PCT, TYPE_STYLE, BANK_ACCOUNTS, FLOORPLAN_IDS,
  FUND_LABEL,
  type PropertyDef, type PropType, type BankAccount, type FundGroup,
} from "../../lib/properties/data";
import { PROPERTY_OWNERSHIP, type PropertyOwner } from "../../lib/properties/ownership";
import type { RentRollData, RentRollProperty } from "../../lib/rentroll/parseRentRollExcel";
import { useUser } from "../components/UserProvider";
import {
  TAX_TASKS, PARCEL_INFO,
  baseEntityName, filingLabel, isTaskEffectivelyDone,
  loadTaxChecked, type TaxTask, type TaxParcel, TAX_CATEGORIES, type K1Investor,
} from "../tracker/tax-data";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function pct(n: number) {
  return n === 0 ? "—" : `${(n * 100).toFixed(2)}%`;
}

function formatModalDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return d;
  return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3].slice(2)}`;
}

function TypePill({ type, large }: { type: PropType; large?: boolean }) {
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
function tasksForProp(id: string): TaxTask[] {
  // Normalize 40a0 → 40A0 for matching
  const uid = id.toUpperCase();
  return TAX_TASKS.filter(t => {
    const base = baseEntityName(t.entity);
    return base.toUpperCase().startsWith(uid + " ");
  });
}

// Lookup parcels for a property
function parcelsForProp(id: string): TaxParcel[] {
  const uid = id.toUpperCase();
  const entry = Object.entries(PARCEL_INFO).find(([key]) =>
    key.toUpperCase().startsWith(uid + " ") || key.toUpperCase().startsWith(uid)
  );
  return entry ? entry[1] : [];
}

// Bank accounts for a property
function bankAccountsForProp(id: string): BankAccount[] {
  return BANK_ACCOUNTS[id.toUpperCase()] ?? [];
}

// ─── FLOORPLAN VIEWER ────────────────────────────────────────────────────────

const FLOORPLAN_ROTATE_CW = new Set(["3610", "3620", "4050"]);

function FloorplanImage({ src, alt, rotate90 }: { src: string; alt: string; rotate90: boolean }) {
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

function FloorplanViewer({ propId, propName }: { propId: string; propName: string }) {
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
function ownerPctFor(inv: PropertyOwner | K1Investor): number | undefined {
  const o = inv as PropertyOwner;
  return o.profitPct ?? o.ownerPct ?? o.capitalPct ?? o.lossPct;
}

function K1InvestorRow({
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

function OwnerSubRow({
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

// ─── DETAIL MODAL ────────────────────────────────────────────────────────────

function DetailModal({
  prop,
  onClose,
  checked,
}: {
  prop: PropertyDef;
  onClose: () => void;
  checked: Record<string, boolean>;
}) {
  const tasks        = useMemo(() => tasksForProp(prop.id), [prop.id]);
  const parcels      = useMemo(() => parcelsForProp(prop.id), [prop.id]);
  const bankAccounts = useMemo(() => bankAccountsForProp(prop.id), [prop.id]);
  const alloc       = ALLOC_PCT[prop.id];
  const k1Tasks     = tasks.filter(t => t.category === "k1");
  const filingTasks = tasks.filter(t => t.category !== "k1");

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

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()} style={{ maxHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column" }}>

        {/* Modal header */}
        <div style={{ borderBottom: "1px solid var(--border)", flexShrink: 0, padding: "16px 20px 14px" }}>
          {/* Single row: title on left, Office pill + close on right */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div className="modalTitle" style={{ fontWeight: 500, margin: 0 }}>{prop.name} – {prop.id}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <TypePill type={prop.type} />
              <button
                onClick={onClose}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 20, color: "var(--muted)", padding: "0 4px",
                  flexShrink: 0, lineHeight: 1,
                }}
              >✕</button>
            </div>
          </div>
          {/* Subheader: address */}
          {(prop.address || prop.city) && (
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              {[prop.address, prop.city, [prop.state, prop.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
            </div>
          )}
          {FLOORPLAN_IDS.has(prop.id) && (
            <div style={{ marginTop: 10 }}>
              <FloorplanViewer propId={prop.id} propName={prop.name} />
            </div>
          )}
          {prop.notes && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{prop.notes}</p>
          )}
        </div>

        {/* Modal body — scrollable */}
        <div style={{ overflowY: "auto", padding: "20px 4px 4px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ── Overview ── */}
          <section>
            <SectionLabel>Overview</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 32px", marginBottom: (parcels.length > 0 || bankAccounts.length > 0) ? 16 : 0 }}>
              {prop.type !== "Land" && prop.type !== "Misc" && (
                <InfoField label="Sq Footage" value={prop.sqft ? `${prop.sqft.toLocaleString()} sq ft` : "—"} />
              )}
              {prop.acres != null && (
                <InfoField label="Acres" value={`${prop.acres} ac`} />
              )}
              {prop.type !== "Land" && prop.type !== "Misc" && (
                <InfoField label="Year Built" value={prop.yearBuilt ? String(prop.yearBuilt) : "—"} />
              )}
              {prop.ein && (
                <InfoField label={prop.einLabel ?? "EIN"} value={prop.ein} />
              )}
              {prop.ein2 && (
                <InfoField label={prop.ein2Label ?? "EIN (2)"} value={prop.ein2} />
              )}
            </div>

            {/* Parcel Numbers */}
            {parcels.length > 0 && (
              <div style={{ marginBottom: bankAccounts.length > 0 ? 12 : 0 }}>
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

            {/* Bank Accounts */}
            {bankAccounts.length > 0 && (
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
          </section>

          {/* ── Occupancy & Suites (from rent roll) ── */}
          {rrProp && (
            <section>
              <SectionLabel>Occupancy</SectionLabel>
              {rrProp.totalSqft > 0 && (() => {
                const pctOcc = (rrProp.occupiedSqft / rrProp.totalSqft) * 100;
                return (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 22, fontWeight: 900, lineHeight: 1,
                        color: pctOcc >= 90 ? "#16a34a" : pctOcc >= 70 ? "#0b4a7d" : "#d97706",
                      }}>{pctOcc.toFixed(1)}%</span>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>
                        {rrProp.occupiedSqft.toLocaleString()} / {rrProp.totalSqft.toLocaleString()} sq ft occupied
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 999,
                        width: `${pctOcc}%`,
                        background: pctOcc >= 90 ? "#16a34a" : pctOcc >= 70 ? "#0b4a7d" : "#d97706",
                      }} />
                    </div>
                  </div>
                );
              })()}
            </section>
          )}

          {/* ── Rent Roll table (collapsible inside the open card) ── */}
          {rrProp && rrProp.units.length > 0 && (
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
                    {rrProp.units.map((u, i) => (
                      <tr key={i} style={{ background: u.isVacant ? "rgba(15,23,42,0.025)" : undefined }}>
                        <td style={{ fontWeight: u.isVacant ? 400 : 600, color: u.isVacant ? "var(--muted)" : "var(--text)", fontStyle: u.isVacant ? "italic" : "normal" }}>
                          {u.isVacant ? "Vacant" : u.occupantName}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <code style={{ fontSize: 12, fontWeight: 700, color: "#0b4a7d", whiteSpace: "nowrap" }}>{u.unitRef}</code>
                        </td>
                        <td style={{ textAlign: "right", fontSize: 13 }}>{u.sqft ? u.sqft.toLocaleString() : "—"}</td>
                        <td style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatModalDate(u.leaseFrom)}</td>
                        <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{formatModalDate(u.leaseTo)}</td>
                        <td style={{ textAlign: "right", fontSize: 13 }}>{u.baseRent ? `$${u.baseRent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                        <td style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{u.annualRentPerSqft ? `$${u.annualRentPerSqft.toFixed(2)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}

          {/* ── Tax Filings ── */}
          {filingTasks.length > 0 && (
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
          )}

          {/* ── Ownership ── */}
          {ownershipEntry && ownershipEntry.owners.length > 0 && (
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
          )}

          {/* ── GL Allocations ── */}
          {alloc && (
            <section>
              <SectionLabel>
                Allocated Invoicer %
                <Link href="/allocated-invoicer" style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", marginLeft: 8, textDecoration: "none" }}>
                  Open Allocated Invoicer →
                </Link>
              </SectionLabel>
              <div style={{ display: "flex", gap: 8 }}>
                {(["9301","9302","9303"] as const).map(acct => (
                  <div key={acct} style={{
                    flex: 1, textAlign: "center",
                    padding: "12px 8px 10px",
                    border: `1.5px solid ${alloc[acct] > 0 ? "rgba(11,74,125,0.28)" : "var(--border)"}`,
                    borderRadius: 10,
                    background: alloc[acct] > 0 ? "rgba(11,74,125,0.05)" : "#fafafa",
                  }}>
                    <div style={{
                      fontSize: 22, fontWeight: 900, lineHeight: 1,
                      color: alloc[acct] > 0 ? "#0b4a7d" : "var(--muted)",
                    }}>
                      {pct(alloc[acct])}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 5 }}>
                      Acct {acct}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}


        </div>
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
    </div>
  );
}

// ─── SMALL HELPER COMPONENTS ──────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 900, letterSpacing: "0.08em",
      color: "var(--muted)", textTransform: "uppercase",
      marginBottom: 12, display: "flex", alignItems: "center", gap: 6,
    }}>
      {children}
    </div>
  );
}

function CollapsibleSection({ title, link, count, children }: {
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

function InfoField({ label, value }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 500, color: "var(--text)" }}>{value}</span>
    </div>
  );
}

// ─── PROPERTY CARD ────────────────────────────────────────────────────────────

function PropertyCard({ prop, onClick }: { prop: PropertyDef; onClick: () => void; checked: Record<string, boolean> }) {
  const ts = TYPE_STYLE[prop.type];
  const isEntity = !!prop.entityKind;
  const typeAccent = isEntity ? "" : `, inset 0 5px 0 ${ts.text}`;
  // Ownership + Tax Filings used to render as collapsible footers on the
  // preview card. They live inside the detail modal (also collapsible) now,
  // so the preview stays clean and fast to scan.

  return (
    <div
      style={{
        display: "flex", flexDirection: "column",
        minHeight: 110,
        border: isEntity ? "1.5px dashed #6d28d9" : "1px solid var(--border)",
        borderRadius: 14,
        background: isEntity ? "rgba(109,40,217,0.04)" : "var(--card)",
        boxShadow: `0 2px 8px rgba(2,6,23,0.05)${typeAccent}`,
        fontFamily: "inherit",
        transition: "box-shadow 0.15s, border-color 0.15s, transform 0.1s",
        width: "100%",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = `0 6px 22px rgba(2,6,23,0.10)${typeAccent}`;
        if (!isEntity) el.style.borderColor = ts.border;
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = `0 2px 8px rgba(2,6,23,0.05)${typeAccent}`;
        if (!isEntity) el.style.borderColor = "var(--border)";
        el.style.transform = "";
      }}
    >
      {/* Main clickable area opens the detail modal */}
      <button
        onClick={onClick}
        style={{
          display: "flex", flexDirection: "column", flex: 1,
          padding: "19px 16px 14px",
          background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left", fontFamily: "inherit", width: "100%",
        }}
      >
        {/* Header row: id badge (left), type pill or entity pill (right) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <code style={{
            background: "#0b1220", color: "#e0f0ff",
            padding: "2px 8px", borderRadius: 5,
            fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
          }}>{prop.id}</code>
          {isEntity ? (
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
              color: "#6d28d9", background: "rgba(109,40,217,0.08)",
              border: "1px solid rgba(109,40,217,0.25)",
              padding: "2px 8px", borderRadius: 999, textTransform: "uppercase",
            }}>{prop.entityKind}</span>
          ) : (
            <TypePill type={prop.type} />
          )}
        </div>

        {/* Name */}
        <div style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.3, color: "var(--text)", marginBottom: 4 }}>
          {prop.name}
        </div>

        {/* Address / city */}
        {(prop.address || prop.city) && (
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4, marginTop: "auto", paddingTop: 8 }}>
            {prop.address
              ? `${prop.address}, ${prop.city ?? ""}`
              : prop.city}
          </div>
        )}
        {prop.notes && !prop.address && !prop.city && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: "auto", paddingTop: 8 }}>{prop.notes}</div>
        )}
      </button>

    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

const TYPES: PropType[] = ["Office", "Retail", "Residential", "Land", "Misc"];

export default function PropertiesPage() {
  const { user } = useUser();
  const [typeFilter, setTypeFilter] = useState<PropType | "all">(user.defaultPropertyType as PropType | "all");
  useEffect(() => { setTypeFilter(user.defaultPropertyType as PropType | "all"); }, [user.id, user.defaultPropertyType]);
  const [selected, setSelected] = useState<PropertyDef | null>(null);
  const [checked,  setChecked]  = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecked(loadTaxChecked(new Date().getFullYear()));
  }, []);

  const typeCounts = useMemo(() => {
    const counts: Record<PropType, number> = { Office: 0, Retail: 0, Residential: 0, Land: 0, Misc: 0 };
    PROPERTY_DEFS.forEach(p => counts[p.type]++);
    return counts;
  }, []);

  const filtered = useMemo(() =>
    typeFilter === "all" ? PROPERTY_DEFS : PROPERTY_DEFS.filter(p => p.type === typeFilter),
  [typeFilter]);

  return (
    <main>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1>Property Info</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </div>

      {/* ── Summary tiles ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 18 }}>
        {([
          { key: "all",         label: "Total",       value: PROPERTY_DEFS.length, color: "var(--brand)",  activeBg: "rgba(11,74,125,0.07)",  activeBorder: "rgba(11,74,125,0.3)"  },
          { key: "Office",      label: "Office",       value: typeCounts.Office,      color: "#0b4a7d",      activeBg: "rgba(11,74,125,0.09)",  activeBorder: "rgba(11,74,125,0.35)" },
          { key: "Retail",      label: "Retail",       value: typeCounts.Retail,      color: "#0d9488",      activeBg: "rgba(13,148,136,0.09)", activeBorder: "rgba(13,148,136,0.35)"},
          { key: "Residential", label: "Residential",  value: typeCounts.Residential, color: "#6d28d9",      activeBg: "rgba(109,40,217,0.09)", activeBorder: "rgba(109,40,217,0.35)"},
          { key: "Land",        label: "Land",         value: typeCounts.Land,        color: "#b45309",      activeBg: "rgba(180,83,9,0.09)",   activeBorder: "rgba(180,83,9,0.35)"  },
        ] as const).map(tile => {
          const isActive = typeFilter === tile.key;
          return (
            <button
              key={tile.key}
              onClick={() => setTypeFilter(typeFilter === tile.key ? "all" : tile.key as PropType | "all")}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                padding: "13px 8px 11px",
                border: `1.5px solid ${isActive ? tile.activeBorder : "var(--border)"}`,
                borderRadius: 10,
                background: isActive ? tile.activeBg : "var(--card)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
                boxShadow: isActive ? `0 0 0 3px ${tile.activeBorder}22` : "none",
                gap: 3,
              }}
            >
              <span style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: isActive ? tile.color : "var(--text)" }}>
                {tile.value}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? tile.color : "var(--muted)", letterSpacing: "0.02em" }}>
                {tile.label}
              </span>
            </button>
          );
        })}
      </div>


      {/* ── Property grid ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🏢</div>
          <div style={{ fontWeight: 700 }}>No properties match your search.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {TYPES.map(type => {
            const group = filtered.filter(p => p.type === type);
            if (group.length === 0) return null;
            const ts = TYPE_STYLE[type];

            // Office category splits into Fund subsections (JV III, NI LLC) with
            // any unaffiliated office properties rendered flat below.
            let officeFundSubsections: { fund: FundGroup; props: PropertyDef[] }[] = [];
            let officeUnaffiliated: PropertyDef[] = [];
            if (type === "Office") {
              const fundOrder: FundGroup[] = ["JV III", "NI LLC"];
              for (const f of fundOrder) {
                const props = group.filter(p => p.fundGroup === f);
                if (props.length) officeFundSubsections.push({ fund: f, props });
              }
              officeUnaffiliated = group.filter(p => !p.fundGroup);
            }

            return (
              <div key={type}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                }}>
                  <span style={{
                    fontSize: 14, fontWeight: 800, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: ts.text,
                    background: ts.bg, border: `1px solid ${ts.border}`,
                    padding: "5px 14px", borderRadius: 999,
                  }}>{type}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{group.length}</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>

                {type === "Office" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                    {officeFundSubsections.map(({ fund, props }) => (
                      <div key={fund}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            Fund
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                            {FUND_LABEL[fund]}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                            · {fund} · {props.length}
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                          {props.map(prop => (
                            <PropertyCard key={prop.id} prop={prop} onClick={() => setSelected(prop)} checked={checked} />
                          ))}
                        </div>
                      </div>
                    ))}
                    {officeUnaffiliated.length > 0 && (
                      <div>
                        {officeFundSubsections.length > 0 && (
                          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                            Other
                          </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                          {officeUnaffiliated.map(prop => (
                            <PropertyCard key={prop.id} prop={prop} onClick={() => setSelected(prop)} checked={checked} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                    {group.map(prop => (
                      <PropertyCard key={prop.id} prop={prop} onClick={() => setSelected(prop)} checked={checked} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Detail modal ── */}
      {selected && (
        <DetailModal
          prop={selected}
          onClose={() => setSelected(null)}
          checked={checked}
        />
      )}

    </main>
  );
}
