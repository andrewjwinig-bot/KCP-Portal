"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROPERTY_DEFS, TYPE_STYLE,
  FUND_LABEL,
  type PropertyDef, type PropType, type FundGroup,
} from "../../lib/properties/data";
import { useUser } from "../components/UserProvider";
import { loadTaxChecked } from "../tracker/tax-data";
import { TypePill } from "./PropertyDetail";
import { MANAGED_LOANS, summarizeLoan, todayISO, type Loan } from "../../lib/debt/amortization";

// Some loans are booked on a partnership/entity GL code rather than the
// property card id — show those loans on the entity card.
const LOAN_PROPERTY_TO_CARD: Record<string, string> = {
  "3600": "3610A", // JV III loan → JV III Condo entity card
};

function compactMoney(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2) + "M";
  if (n >= 1_000) return "$" + Math.round(n / 1000) + "K";
  return "$" + Math.round(n);
}

// ─── PROPERTY CARD ────────────────────────────────────────────────────────────

function PropertyCard({ prop, onClick, loan }: { prop: PropertyDef; onClick: () => void; checked: Record<string, boolean>; loan?: Loan | null }) {
  const ts = TYPE_STYLE[prop.type];
  const isEntity = !!prop.entityKind;
  const typeAccent = isEntity ? "" : `, inset 0 5px 0 ${ts.text}`;
  // Ownership + Tax Filings used to render as collapsible footers on the
  // preview card. They live inside the detail page (also collapsible) now,
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
      {/* Main clickable area navigates to the detail page */}
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

        {/* Debt summary — present only on properties (or partnership cards) that secure a loan */}
        {loan && (() => {
          const s = summarizeLoan(loan, todayISO());
          return (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap",
              padding: "3px 9px", borderRadius: 999,
              background: "rgba(11,74,125,0.06)",
              border: "1px solid rgba(11,74,125,0.20)",
              color: "var(--muted)", fontSize: 11, fontWeight: 600,
              marginTop: 6, alignSelf: "flex-start", maxWidth: "100%",
            }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                textTransform: "uppercase", color: "#0b4a7d" }}>Debt</span>
              <span style={{ color: "#0b4a7d", fontWeight: 800 }}>{compactMoney(s.projectedBalance)}</span>
              <span>·</span>
              <span>{loan.annualRatePct.toFixed(2)}%</span>
              <span>·</span>
              <span>{compactMoney(s.monthlyDebtService)}/mo</span>
            </div>
          );
        })()}

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
  const router = useRouter();
  const { user } = useUser();
  const [typeFilter, setTypeFilter] = useState<PropType | "all">(user.defaultPropertyType as PropType | "all");
  useEffect(() => { setTypeFilter(user.defaultPropertyType as PropType | "all"); }, [user.id, user.defaultPropertyType]);
  const [checked,  setChecked]  = useState<Record<string, boolean>>({});

  // Loan per property card. Loans booked on a partnership GL code (e.g.
  // JV III "3600") fall through to the partnership's entity card.
  const loansByCard = useMemo(() => {
    const map = new Map<string, Loan>();
    for (const l of MANAGED_LOANS) {
      const cardId = LOAN_PROPERTY_TO_CARD[l.property] ?? l.property;
      map.set(cardId, l);
    }
    return map;
  }, []);

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

  const openProp = (prop: PropertyDef) => router.push(`/properties/${prop.id}`);

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
                            <PropertyCard key={prop.id} prop={prop} onClick={() => openProp(prop)} checked={checked} loan={loansByCard.get(prop.id) ?? null} />
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
                            <PropertyCard key={prop.id} prop={prop} onClick={() => openProp(prop)} checked={checked} loan={loansByCard.get(prop.id) ?? null} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                    {group.map(prop => (
                      <PropertyCard key={prop.id} prop={prop} onClick={() => openProp(prop)} checked={checked} loan={loansByCard.get(prop.id) ?? null} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </main>
  );
}
