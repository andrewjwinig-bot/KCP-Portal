"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  PROPERTY_DEFS, ALLOC_PCT, TYPE_STYLE,
  type PropertyDef, type PropType,
} from "../../lib/properties/data";
import {
  TAX_TASKS, PARCEL_INFO,
  baseEntityName, filingLabel, isTaskEffectivelyDone,
  loadTaxChecked, type TaxTask, TAX_CATEGORIES,
} from "../tracker/tax-data";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function pct(n: number) {
  return n === 0 ? "—" : `${(n * 100).toFixed(2)}%`;
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
      fontWeight: 800,
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
function parcelsForProp(id: string): Array<{ method?: string; number: string }> {
  const uid = id.toUpperCase();
  const entry = Object.entries(PARCEL_INFO).find(([key]) =>
    key.toUpperCase().startsWith(uid + " ") || key.toUpperCase().startsWith(uid)
  );
  return entry ? entry[1] : [];
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
  const tasks       = useMemo(() => tasksForProp(prop.id), [prop.id]);
  const parcels     = useMemo(() => parcelsForProp(prop.id), [prop.id]);
  const alloc       = ALLOC_PCT[prop.id];
  const k1Tasks     = tasks.filter(t => t.category === "k1");
  const filingTasks = tasks.filter(t => t.category !== "k1");

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
        <div className="modalHeader" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 14, marginBottom: 0, flexShrink: 0 }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <code style={{
                background: "#0b1220", color: "#e0f0ff",
                padding: "2px 8px", borderRadius: 6,
                fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
              }}>{prop.id}</code>
              <TypePill type={prop.type} />
              {prop.allocGroup && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px",
                  borderRadius: 999, background: "rgba(11,74,125,0.07)",
                  color: "#0b4a7d", border: "1px solid rgba(11,74,125,0.2)",
                }}>
                  {prop.allocGroup} Group
                </span>
              )}
            </div>
            <div className="modalTitle" style={{ fontWeight: 500 }}>{prop.name}</div>
            {prop.notes && (
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{prop.notes}</p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 20, color: "var(--muted)", padding: "0 4px",
              flexShrink: 0, lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* Modal body — scrollable */}
        <div style={{ overflowY: "auto", padding: "20px 4px 4px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ── Overview ── */}
          <section>
            <SectionLabel>Overview</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px" }}>
              <InfoField label="Property Code" value={prop.id} mono />
              <InfoField label="Address" value={prop.address || "—"} />
              <InfoField label="City / State" value={[prop.city, prop.state].filter(Boolean).join(", ") || "—"} />
              <InfoField label="Zip Code" value={prop.zip || "—"} />
              <InfoField label="Sq Footage" value={prop.sqft ? `${prop.sqft.toLocaleString()} sq ft` : "—"} />
              <InfoField label="Year Built" value={prop.yearBuilt ? String(prop.yearBuilt) : "—"} />
              {prop.allocGroup && (
                <InfoField label="Alloc. Group" value={prop.allocGroup === "BP" ? "Business Park (9301)" : "Shopping Centers (9302)"} />
              )}
            </div>
          </section>

          {/* ── Parcel Numbers ── */}
          {parcels.length > 0 && (
            <section>
              <SectionLabel>Parcel Numbers</SectionLabel>
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
                    <code style={{ fontSize: 14, fontWeight: 700, color: "#0b4a7d" }}>{p.number}</code>
                    {p.method && (
                      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{p.method}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Tax Filings ── */}
          {filingTasks.length > 0 && (
            <section>
              <SectionLabel>
                Tax Filings
                <Link href="/tracker/taxes" style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", marginLeft: 8, textDecoration: "none" }}>
                  Open Filing Tracker →
                </Link>
              </SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {filingTasks.map(t => {
                  const status = filingStatus(t);
                  const cat = TAX_CATEGORIES[t.category];
                  return (
                    <div key={t.id} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "9px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: "#fafafa",
                    }}>
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
                        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{filingLabel(t)}</div>
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
            </section>
          )}

          {/* ── K-1 Investors ── */}
          {k1Tasks.length > 0 && (
            <section>
              <SectionLabel>K-1 Investors</SectionLabel>
              {k1Tasks.map(t => {
                const allDone = t.investors?.every(inv => checked[inv.id]) ?? false;
                return (
                  <div key={t.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                        Due {MONTHS_SHORT[t.dueMonth - 1]} {t.dueDay}
                      </span>
                      {allDone
                        ? <span style={{ fontSize: 10, fontWeight: 800, color: "#16a34a", background: "rgba(22,163,74,0.08)", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(22,163,74,0.2)" }}>All Distributed</span>
                        : <span style={{ fontSize: 10, fontWeight: 800, color: "#b45309", background: "rgba(180,83,9,0.08)", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(180,83,9,0.25)" }}>Pending</span>
                      }
                    </div>
                    {t.investors?.map(inv => {
                      const done = !!checked[inv.id];
                      return (
                        <div key={inv.id} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 12px",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          marginBottom: 4,
                          background: done ? "rgba(22,163,74,0.04)" : "#fafafa",
                        }}>
                          <span style={{
                            width: 16, height: 16, borderRadius: 4,
                            background: done ? "rgba(22,163,74,0.15)" : "var(--border)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: done ? "#16a34a" : "transparent",
                            flexShrink: 0,
                          }}>✓</span>
                          <span style={{ fontSize: 14, fontWeight: done ? 700 : 500, color: done ? "#16a34a" : "var(--text)" }}>
                            {inv.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>
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

          {/* ── CC Expense Accounts ── */}
          {prop.ccAccounts && (
            <section>
              <SectionLabel>
                CC Expense Accounts
                <Link href="/expenses" style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", marginLeft: 8, textDecoration: "none" }}>
                  Open CC Expense Coder →
                </Link>
              </SectionLabel>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {prop.ccAccounts.map(acct => (
                  <div key={acct} style={{
                    padding: "10px 16px",
                    border: "1px solid rgba(11,74,125,0.2)",
                    borderRadius: 8,
                    background: "rgba(11,74,125,0.04)",
                    fontSize: 14, fontWeight: 800, color: "#0b4a7d",
                    fontFamily: "monospace",
                  }}>{acct}</div>
                ))}
              </div>
            </section>
          )}

          {/* ── Quick Links ── */}
          <section>
            <SectionLabel>Quick Links</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <QuickLink href="/tracker" label="Master Tracker" icon="📋" desc="Monthly to-do checklist" />
              <QuickLink href="/tracker/taxes" label="Filing Tracker" icon="📄" desc="RE taxes · entity filings · K-1s" />
              <QuickLink href="/" label="Payroll Invoicer" icon="$" desc="Upload and process payroll" />
              <QuickLink href="/expenses" label="CC Expense Coder" icon="💳" desc="Code credit card transactions" />
              <QuickLink href="/allocated-invoicer" label="Allocated Invoicer" icon="%" desc="GL allocation invoicing" />
            </div>
          </section>

        </div>
      </div>
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

function InfoField({ label, value }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 500, color: "var(--text)" }}>{value}</span>
    </div>
  );
}

function QuickLink({ href, label, icon, desc }: { href: string; label: string; icon: string; desc: string }) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 12px",
      border: "1px solid var(--border)",
      borderRadius: 8,
      textDecoration: "none",
      color: "var(--text)",
      transition: "background 0.12s, border-color 0.12s",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = "rgba(11,74,125,0.05)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(11,74,125,0.25)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = "";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      <span style={{ fontSize: 16, width: 24, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{desc}</div>
      </div>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>→</span>
    </Link>
  );
}

// ─── PROPERTY CARD ────────────────────────────────────────────────────────────

function PropertyCard({ prop, onClick }: { prop: PropertyDef; onClick: () => void }) {
  const ts = TYPE_STYLE[prop.type];

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column",
        padding: "20px 16px 14px",
        minHeight: 140,
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "#fff",
        boxShadow: "0 2px 8px rgba(2,6,23,0.05)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        transition: "box-shadow 0.15s, border-color 0.15s, transform 0.1s",
        width: "100%",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = "0 6px 22px rgba(2,6,23,0.10)";
        el.style.borderColor = ts.border;
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = "0 2px 8px rgba(2,6,23,0.05)";
        el.style.borderColor = "var(--border)";
        el.style.transform = "";
      }}
    >
      {/* Centered name + code + pill */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", paddingBottom: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2, color: "var(--text)", marginBottom: 8 }}>
          {prop.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <code style={{
            background: "#0b1220", color: "#e0f0ff",
            padding: "3px 10px", borderRadius: 6,
            fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
          }}>{prop.id}</code>
          <TypePill type={prop.type} large />
        </div>
      </div>

    </button>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

const TYPES: PropType[] = ["Office", "Retail", "Residential", "Land", "Misc"];

export default function PropertiesPage() {
  const [search,   setSearch]   = useState("");
  const [typeFilter, setTypeFilter] = useState<PropType | "all">("all");
  const [selected, setSelected] = useState<PropertyDef | null>(null);
  const [checked,  setChecked]  = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecked(loadTaxChecked(new Date().getFullYear()));
  }, []);

  const typeCounts = useMemo(() => {
    const counts: Record<PropType, number> = { Office: 0, Retail: 0, Residential: 0, Land: 0 };
    PROPERTY_DEFS.forEach(p => counts[p.type]++);
    return counts;
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return PROPERTY_DEFS.filter(p => {
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (!q) return true;
      return (
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.address?.toLowerCase().includes(q) ?? false) ||
        p.type.toLowerCase().includes(q)
      );
    });
  }, [search, typeFilter]);

  return (
    <main>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 4 }}>
            Property Info
          </h1>
          <p className="muted small">Property directory · allocations · filings &amp; K-1s</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </div>

      {/* ── Summary tiles ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 18 }}>
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
                background: isActive ? tile.activeBg : "#fff",
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

      {/* ── Filter / search bar ── */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.08em", marginRight: 4 }}>TYPE</div>
        {(["all", ...TYPES] as const).map(t => {
          const active = typeFilter === t;
          const ts = t !== "all" ? TYPE_STYLE[t] : null;
          return (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              padding: "4px 12px",
              border: `1px solid ${active && ts ? ts.border : active ? "var(--brand)" : "var(--border)"}`,
              borderRadius: 999, cursor: "pointer",
              background: active && ts ? ts.bg : active ? "rgba(11,74,125,0.08)" : "transparent",
              fontFamily: "inherit", fontSize: 12,
              fontWeight: active ? 800 : 500,
              color: active && ts ? ts.text : active ? "var(--brand)" : "var(--text)",
              transition: "all 0.12s",
            }}>
              {t === "all" ? "All" : t}
            </button>
          );
        })}
        <div style={{ flex: 1, minWidth: 160, maxWidth: 280, marginLeft: "auto" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, code, address…"
            style={{
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none",
              background: "#fff",
            }}
          />
        </div>
        {(typeFilter !== "all" || search) && (
          <button
            className="btn"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={() => { setTypeFilter("all"); setSearch(""); }}
          >✕ Clear</button>
        )}
      </div>

      {/* ── Results count ── */}
      {(typeFilter !== "all" || search) && (
        <div className="small muted" style={{ marginBottom: 12 }}>
          Showing {filtered.length} of {PROPERTY_DEFS.length} properties
        </div>
      )}

      {/* ── Property grid ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🏢</div>
          <div style={{ fontWeight: 700 }}>No properties match your search.</div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
        }}>
          {filtered.map(prop => (
            <PropertyCard key={prop.id} prop={prop} onClick={() => setSelected(prop)} />
          ))}
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
