"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { RentRollData } from "../../../../lib/rentroll/parseRentRollExcel";
import { amenityFor } from "../../../../lib/rentroll/amenities";
import { PROPERTY_DEFS } from "../../../../lib/properties/data";
import {
  SectionLabel,
  CollapsibleSection,
  InfoField,
  formatModalDate,
} from "../../../properties/PropertyDetail";
import { StatPill } from "../../../components/Pill";
import SuiteInformationCard from "./SuiteInformationCard";
import ContactsCard from "./ContactsCard";
import DepositCard from "./DepositCard";
import CamConfigCard from "./CamConfigCard";
import OfficeCamConfigCard from "./OfficeCamConfigCard";
import FloorplanCard from "./FloorplanCard";
import ShareFolderCard from "../../../components/ShareFolderCard";
import { useUser } from "../../../components/UserProvider";

// ─── Helpers ────────────────────────────────────────────────────────────────

const JV_III_CODES = new Set(["3610", "3620", "3640"]);
const NI_LLC_CODES = new Set(["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);

function showsBaseYear(propertyCode: string): boolean {
  const c = propertyCode.toUpperCase();
  return JV_III_CODES.has(c) || NI_LLC_CODES.has(c);
}

// A retail unit lives in a Shopping Center property (any non-entity
// PropertyDef whose type is "Retail"). CAM / INS / RET reconciliation
// is only meaningful for these.
function isRetailUnit(propertyCode: string): boolean {
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === propertyCode.toUpperCase());
  return !!def && def.type === "Retail" && !def.entityKind;
}

// An office unit is one whose building runs base-year expense recovery — the
// NI LLC and JV III office buildings. These show the office CAM config card
// (pro-rata share + gross-up) so CAMPRep lease terms are stored per tenant.
function isOfficeUnit(propertyCode: string): boolean {
  const c = propertyCode.toUpperCase();
  return JV_III_CODES.has(c) || NI_LLC_CODES.has(c);
}

// Friendly back-link label for a known internal path (used with ?from=).
function labelForPath(p: string): string {
  if (p.startsWith("/cam-recon")) return "← CAM / RET Reconciliation";
  if (p.startsWith("/rentroll/units")) return "← All Units";
  if (p.startsWith("/rentroll")) return "← Rent roll";
  if (p.startsWith("/properties")) return "← Property";
  if (p.startsWith("/maintenance")) return "← Maintenance";
  if (p.startsWith("/reservations")) return "← Reservations";
  return "← Back";
}

function parseRentDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

function daysUntil(d: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtResetDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function propName(code: string): string {
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
  return def?.name ?? code;
}

type BaseYearReset = {
  resetDate: string;
  originalBaseYear: number | null;
  newBaseYear: number;
  notes?: string;
};

type MaintRequest = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  submittedDate: string;
  tenantCompany: string;
  tenantSuite: string;
  propertyCode: string | null;
  propertyName: string;
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function UnitDetailPage() {
  const params = useParams<{ unitRef: string }>();
  const router = useRouter();
  const rawRef = params?.unitRef ?? "";
  const decodedUnitRef = decodeURIComponent(Array.isArray(rawRef) ? rawRef[0] : rawRef);
  const { user } = useUser();
  // The maint persona is maintenance staff — no business need to see rent,
  // deposits, or CAM reconciliation details.
  const isMaint = user.id === "maint";

  const [rentroll, setRentroll] = useState<RentRollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantMeta, setTenantMeta] = useState<Record<string, { baseYear?: number | string | null }>>({});
  const [resets, setResets] = useState<Record<string, BaseYearReset>>({});
  const [allRequests, setAllRequests] = useState<MaintRequest[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch("/api/rentroll").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/tenant-meta").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/base-year-resets").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/maintenance/requests").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([rrJ, tmJ, byrJ, mrJ]) => {
      if (!alive) return;
      setRentroll(rrJ?.rentroll ?? null);
      setTenantMeta(tmJ?.tenantMeta ?? {});
      setResets(byrJ?.resets ?? {});
      setAllRequests((mrJ?.requests ?? []) as MaintRequest[]);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const found = useMemo(() => {
    if (!rentroll) return null;
    for (const p of rentroll.properties) {
      const u = p.units.find((unit) => unit.unitRef === decodedUnitRef);
      if (u) return { unit: u, propertyCode: p.propertyCode };
    }
    return null;
  }, [rentroll, decodedUnitRef]);

  // Maintenance match: by tenantSuite OR (propertyCode + occupantName).
  // Computed up here so all hooks run before any early return.
  const unitRequests = useMemo(() => {
    if (!found) return [];
    const u = found.unit;
    const occupantLower = (u.occupantName || "").toLowerCase().trim();
    const matched = allRequests.filter((r) => {
      if (r.tenantSuite && r.tenantSuite === u.unitRef) return true;
      if (
        r.propertyCode &&
        r.propertyCode === found.propertyCode &&
        occupantLower &&
        (r.tenantCompany ?? "").toLowerCase().trim() === occupantLower
      ) return true;
      return false;
    });
    return matched.sort((a, b) => {
      const ac = a.status === "Complete" ? 1 : 0;
      const bc = b.status === "Complete" ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return (Date.parse(b.submittedDate) || 0) - (Date.parse(a.submittedDate) || 0);
    });
  }, [allRequests, found]);

  if (loading) {
    return (
      <main style={{ display: "grid", gap: 14 }}>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
      </main>
    );
  }

  if (!rentroll || !found) {
    return (
      <main style={{ display: "grid", gap: 14 }}>
        <div style={{
          padding: "20px 24px",
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--card)",
          display: "flex", flexDirection: "column", gap: 8,
          maxWidth: 480,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Unit not found</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            No unit matches <code>{decodedUnitRef}</code>.
          </div>
          <Link
            href="/rentroll"
            style={{ fontSize: 13, fontWeight: 600, color: "var(--brand)", textDecoration: "none", marginTop: 4 }}
          >
            ← Rent roll
          </Link>
        </div>
      </main>
    );
  }

  const unit = found.unit;
  const propertyCode = found.propertyCode;
  const amenity = unit.amenity ?? amenityFor(unit.unitRef);
  const isAmenity = !!amenity;
  const headerTitle = isAmenity
    ? amenity!.label
    : unit.isVacant
      ? "Vacant"
      : (unit.occupantName || "Vacant");

  const propertyName = propName(propertyCode);

  const leaseToDate = parseRentDate(unit.leaseTo);
  const daysToExpiry = leaseToDate ? daysUntil(leaseToDate) : null;

  const baseYearShown = showsBaseYear(propertyCode);
  const baseYearVal = tenantMeta[unit.unitRef]?.baseYear ?? null;
  const reset = resets[unit.unitRef];

  // True PRS = unit sqft ÷ building sqft × 100. Used to pre-fill the
  // Stipulated PRS column in the CAM card so it starts on the lease-
  // neutral value. Some properties carve out tenants from specific
  // categories (e.g. Wawa outparcel from CAM at Brookwood) — see
  // lib/cam/propertyRules.ts for per-property overrides.
  const propertyDef = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === propertyCode.toUpperCase());
  const buildingSqft = propertyDef?.sqft ?? 0;

  // Annual values
  const annualRent = unit.baseRent * 12;
  const annualPerSf = unit.sqft > 0 ? annualRent / unit.sqft : 0;
  const hasNNN = unit.opexMonth > 0 || unit.reTaxMonth > 0 || unit.otherMonth > 0;

  const futureEsc = unit.futureEscalations ?? [];

  // Hero KPI accent for "Days to expiry" tile.
  const daysToExpiryAccent =
    daysToExpiry == null
      ? undefined
      : daysToExpiry < 0
        ? "#b91c1c"
        : daysToExpiry <= 30
          ? "#b91c1c"
          : daysToExpiry <= 90
            ? "#b45309"
            : undefined;

  const daysToExpiryValue =
    isAmenity
      ? "—"
      : unit.isVacant
        ? "Vacant"
        : daysToExpiry == null
          ? "—"
          : daysToExpiry < 0
            ? "Expired"
            : `${daysToExpiry}d`;

  const heroAnnualPerSf =
    unit.annualRentPerSqft || annualPerSf
      ? `$${(unit.annualRentPerSqft || annualPerSf).toFixed(2)}`
      : "—";

  // Prev/next within the same property (rent-roll order) so you can step
  // through a building's tenants without going back to the rent roll.
  const propUnits = rentroll.properties.find((p) => p.propertyCode === propertyCode)?.units ?? [];
  const navIdx = propUnits.findIndex((u) => u.unitRef === decodedUnitRef);
  const prevUnit = navIdx > 0 ? propUnits[navIdx - 1] : null;
  const nextUnit = navIdx >= 0 && navIdx < propUnits.length - 1 ? propUnits[navIdx + 1] : null;
  const navName = (u: typeof unit) => (u.amenity ?? amenityFor(u.unitRef))?.label || u.occupantName || "Vacant";
  const navBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600,
    padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border)",
    background: "var(--card)", color: "var(--text)", textDecoration: "none", whiteSpace: "nowrap",
  };
  const navDisabled: React.CSSProperties = { ...navBtn, opacity: 0.4, cursor: "default" };

  // Universal back: return to wherever the user came from. An explicit
  // ?from=<internal path> (passed by pages that want a labeled, state-
  // preserving return — e.g. the CAM recon page restoring its building) is
  // used as a real link; otherwise just go back in history. Falls back to the
  // rent roll only on a direct load with no history. Prev/next preserve the
  // param so the back target stays correct as you step through tenants.
  const fromParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("from") : null;
  const hasFrom = !!fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//");
  const backLabel = hasFrom ? labelForPath(fromParam!) : "← Back";
  const fromSuffix = fromParam ? `?from=${encodeURIComponent(fromParam)}` : "";
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/rentroll");
  };
  const backStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "var(--muted)", textDecoration: "none",
    width: "fit-content", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit",
  };

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          {hasFrom
            ? <Link href={fromParam!} style={backStyle}>{backLabel}</Link>
            : <button type="button" onClick={goBack} style={backStyle}>← Back</button>}
          {propUnits.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {prevUnit
                ? <Link href={`/rentroll/units/${encodeURIComponent(prevUnit.unitRef)}${fromSuffix}`} title={`${prevUnit.unitRef} · ${navName(prevUnit)}`} style={navBtn}>‹ Prev</Link>
                : <span style={navDisabled}>‹ Prev</span>}
              <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                {navIdx + 1} / {propUnits.length} · {propertyCode}
              </span>
              {nextUnit
                ? <Link href={`/rentroll/units/${encodeURIComponent(nextUnit.unitRef)}${fromSuffix}`} title={`${nextUnit.unitRef} · ${navName(nextUnit)}`} style={navBtn}>Next ›</Link>
                : <span style={navDisabled}>Next ›</span>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <h1 style={{ margin: 0, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{headerTitle}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
            <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
            <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <code style={{
            background: "#0b1220", color: "#e0f0ff",
            padding: "2px 8px", borderRadius: 5,
            fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
          }}>{unit.unitRef}</code>
          <Link
            href={`/properties/${encodeURIComponent(propertyCode)}`}
            style={{ fontSize: 13, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            {propertyName} <span style={{ color: "var(--muted)", fontWeight: 500 }}>({propertyCode})</span>
          </Link>
        </div>
      </header>

      {/* ── Hero KPI strip ── */}
      <div className="pills" style={{ marginTop: 0 }}>
        <StatPill
          label="Sq Ft"
          value={unit.sqft ? unit.sqft.toLocaleString() : "—"}
        />
        {isAmenity || unit.isVacant ? (
          <StatPill
            label="Status"
            value={isAmenity ? "In-House" : "Vacant"}
            accent={isAmenity ? "#0d9488" : "var(--muted)"}
          />
        ) : isMaint ? null : (
          <>
            <StatPill label="Annual $/sf" value={heroAnnualPerSf} />
            <StatPill
              label="Base Rent / mo"
              value={unit.baseRent ? `$${unit.baseRent.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
            />
            <StatPill
              label="Gross Rent / mo"
              value={unit.grossRentTotal ? `$${unit.grossRentTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
            />
            <StatPill
              label="Annual Rent"
              value={annualRent ? `$${Math.round(annualRent).toLocaleString()}` : "—"}
            />
          </>
        )}
        <StatPill
          label="Days to Expiry"
          value={daysToExpiryValue}
          accent={daysToExpiryAccent}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Top row: Lease Term + Shared Drive (stacked) · Floorplan ·
            Other Charges. The monthly CAM / RET / INS estimates that used
            to sit at the bottom of the CAM card now stack in the third
            slot — they read as a proper card instead of a stray chip
            row. Base Rent / Annual $/sf / Annual Rent stay on the hero
            pills, so the Rent card only appears when there's something
            else to show. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(240px, 0.7fr) minmax(0, 1fr) minmax(220px, 0.6fr)",
          gap: 14, alignItems: "stretch",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px" }}>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                color: "var(--muted)", textTransform: "uppercase",
              }}>Lease Term</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                {formatModalDate(unit.leaseFrom)}
                <span style={{ color: "var(--muted)", fontWeight: 500, margin: "0 8px" }}>→</span>
                {formatModalDate(unit.leaseTo)}
              </span>
            </div>
            <ShareFolderCard kind="unit" entityKey={unit.unitRef} />
          </div>
          <FloorplanCard unitRef={unit.unitRef} />
          <OtherChargesCard
            opexMonth={unit.opexMonth}
            reTaxMonth={unit.reTaxMonth}
            otherMonth={unit.otherMonth}
          />
        </div>

        {/* Rent card — only renders when there's content beyond the
            hero-pill repeats. Non-retail tenants still see NNN breakouts
            and Gross Rent here; everyone sees Last Increase when it
            exists. Hidden entirely for the maint persona. */}
        {!isMaint && !isAmenity && (
          (!isRetailUnit(propertyCode) && (hasNNN || unit.grossRentTotal > 0))
          || Boolean(unit.lastIncreaseDate || unit.lastIncreaseAmount)
        ) && (
          <div className="card">
            <SectionLabel>Rent</SectionLabel>
            {!isRetailUnit(propertyCode) && (hasNNN || unit.grossRentTotal > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 32px" }}>
                {hasNNN && unit.opexMonth > 0  && <InfoField label="CAM / mo"    value={money(unit.opexMonth)} />}
                {hasNNN && unit.otherMonth > 0 && <InfoField label="INS / mo"    value={money(unit.otherMonth)} />}
                {hasNNN && unit.reTaxMonth > 0 && <InfoField label="RE Tax / mo" value={money(unit.reTaxMonth)} />}
                {unit.grossRentTotal > 0 && (
                  <InfoField label="Gross Rent / mo" value={money(unit.grossRentTotal)} />
                )}
              </div>
            )}
            {Boolean(unit.lastIncreaseDate || unit.lastIncreaseAmount) && (() => {
              const hasNonRetailNNN = !isRetailUnit(propertyCode) && (hasNNN || unit.grossRentTotal > 0);
              return (
                <div style={{
                  marginTop: hasNonRetailNNN ? 14 : 0,
                  paddingTop: hasNonRetailNNN ? 14 : 0,
                  borderTop: hasNonRetailNNN ? "1px solid var(--border)" : undefined,
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 32px",
                }}>
                  <div style={{ gridColumn: "1 / -1", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>
                    Last Increase
                  </div>
                  <InfoField label="Date" value={formatModalDate(unit.lastIncreaseDate)} />
                  <InfoField label="Amount" value={unit.lastIncreaseAmount ? money(unit.lastIncreaseAmount) : "—"} />
                </div>
              );
            })()}
          </div>
        )}

        {/* ── CAM / INS / RET (retail only, occupied suites, hidden from maint) ── */}
        {!isMaint && isRetailUnit(propertyCode) && !isAmenity && !unit.isVacant && (
          <CamConfigCard
            unitRef={unit.unitRef}
            propertyCode={propertyCode}
            occupantName={unit.occupantName || ""}
            unitSqft={unit.sqft}
            buildingSqft={buildingSqft}
          />
        )}

        {/* ── Base Year (office only) ── */}
        {baseYearShown && (
          <div className="card">
            <SectionLabel>Base Year</SectionLabel>
            {reset ? (
              <div>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 6,
                  border: "1.5px solid rgba(220,38,38,0.55)",
                  background: "rgba(220,38,38,0.08)",
                  color: "#b91c1c", fontWeight: 700, fontSize: 14,
                }}>
                  {baseYearVal != null ? baseYearVal : "—"}
                  <sup style={{ fontSize: 10, fontWeight: 800, color: "#b91c1c", lineHeight: 1 }}>※</sup>
                </span>
                <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6, fontWeight: 500 }}>
                  Reset on {fmtResetDate(reset.resetDate)}
                  {reset.originalBaseYear != null ? ` (was ${reset.originalBaseYear})` : ""}
                  {reset.notes ? ` — ${reset.notes}` : ""}
                </div>
              </div>
            ) : (
              <InfoField label="Current Base Year" value={baseYearVal != null ? String(baseYearVal) : "—"} />
            )}
          </div>
        )}

        {/* ── CAM / RET config (office only, occupied suites, hidden from maint) ── */}
        {!isMaint && isOfficeUnit(propertyCode) && !isAmenity && !unit.isVacant && (
          <OfficeCamConfigCard
            unitRef={unit.unitRef}
            unitSqft={unit.sqft}
            buildingSqft={buildingSqft}
            baseYear={baseYearVal}
          />
        )}

        {/* ── Contacts (occupied suites only) ── */}
        {!isAmenity && !unit.isVacant && (
          <ContactsCard
            unitRef={unit.unitRef}
            propertyCode={propertyCode}
            occupantName={unit.occupantName || ""}
          />
        )}

        {/* ── Security Deposit (occupied suites only, hidden from maint) ── */}
        {!isMaint && !isAmenity && !unit.isVacant && (
          <DepositCard
            unitRef={unit.unitRef}
            propertyCode={propertyCode}
            tenantCompany={unit.occupantName || ""}
          />
        )}

        {/* ── Suite Information (Floorplan lives in the top row) ── */}
        <SuiteInformationCard unitRef={unit.unitRef} />

        {/* ── Future Escalations ── */}
        {futureEsc.length > 0 && (
          <div className="card">
            <CollapsibleSection title="Future Escalations" count={futureEsc.length}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {futureEsc.map((esc, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 12px",
                    border: "1px solid var(--border)", borderRadius: 8,
                    background: "#fafafa",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{formatModalDate(esc.date)}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>→</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{money(esc.amount)}/mo</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        )}

        {/* ── Maintenance Requests ── */}
        <div className="card">
        <CollapsibleSection
          title="Maintenance Requests for this Unit"
          count={unitRequests.length}
          link={
            <Link href="/maintenance" style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", marginLeft: 8, textDecoration: "none" }}>
              Open Maintenance →
            </Link>
          }
        >
          {unitRequests.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>No maintenance requests for this unit.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {unitRequests.map((r) => {
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
          )}
        </CollapsibleSection>
        </div>

        {/* ── Last Increase — for amenity units only (rent card not shown) ── */}
        {isAmenity && Boolean(unit.lastIncreaseDate || unit.lastIncreaseAmount) && (
          <div className="card">
            <SectionLabel>Last Increase</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 32px" }}>
              <InfoField label="Date" value={formatModalDate(unit.lastIncreaseDate)} />
              <InfoField label="Amount" value={unit.lastIncreaseAmount ? money(unit.lastIncreaseAmount) : "—"} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// Compact "Other Charges" card — stacks the 2026-budget monthly NNN
// estimates (CAM / RET / INS) in the top row beside Lease Term and
// Floorplan. Renders nothing when every figure is zero (e.g. office
// gross-lease tenants).
function OtherChargesCard({
  opexMonth,
  reTaxMonth,
  otherMonth,
}: {
  opexMonth: number;
  reTaxMonth: number;
  otherMonth: number;
}) {
  if (opexMonth <= 0 && reTaxMonth <= 0 && otherMonth <= 0) return null;
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const Row = ({ label, value }: { label: string; value: number }) => (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
    }}>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{fmt(value)}</span>
    </div>
  );
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
        color: "var(--muted)", textTransform: "uppercase",
        marginBottom: 2,
      }}>Other Charges</span>
      {opexMonth > 0 && <Row label="Est. CAM / mo" value={opexMonth} />}
      {reTaxMonth > 0 && <Row label="Est. RET / mo" value={reTaxMonth} />}
      {otherMonth > 0 && <Row label="Est. INS / mo" value={otherMonth} />}
      <span style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>
        2026 budget
      </span>
    </div>
  );
}
