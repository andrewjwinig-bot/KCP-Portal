"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import ShareFolderCard from "../../../components/ShareFolderCard";

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
  const rawRef = params?.unitRef ?? "";
  const decodedUnitRef = decodeURIComponent(Array.isArray(rawRef) ? rawRef[0] : rawRef);

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
  // neutral value.
  const propertyDef = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === propertyCode.toUpperCase());
  const buildingSqft = propertyDef?.sqft ?? 0;
  const actualPrs =
    unit.sqft > 0 && buildingSqft > 0
      ? Math.round((unit.sqft / buildingSqft) * 10000) / 100  // two decimals
      : null;

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

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link
          href={`/rentroll#unit-${unit.unitRef.replace(/[^a-zA-Z0-9]/g, "-")}`}
          style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textDecoration: "none", width: "fit-content" }}
        >
          ← Rent roll
        </Link>
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
        ) : (
          <>
            <StatPill
              label="Base Rent / mo"
              value={unit.baseRent ? `$${unit.baseRent.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
            />
            <StatPill
              label="Gross Rent / mo"
              value={unit.grossRentTotal ? `$${unit.grossRentTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
            />
            <StatPill label="Annual $/sf" value={heroAnnualPerSf} />
          </>
        )}
        <StatPill
          label="Days to Expiry"
          value={daysToExpiryValue}
          accent={daysToExpiryAccent}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Lease Term + Rent share a row — Lease Term is a one-liner and
            Rent's 3-column grid stays compact, so giving each ~half a
            row reads better than two stacked half-empty cards. Amenity
            units have no Rent card; Lease Term renders alone. */}
        {(() => {
          const leaseTermCard = (
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
          );
          const rentCard = (
            <div className="card">
              <SectionLabel>Rent</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 32px" }}>
                <InfoField label="Base Rent / mo" value={unit.baseRent ? money(unit.baseRent) : "—"} />
                <InfoField label="Annual $/sf" value={unit.annualRentPerSqft ? `$${unit.annualRentPerSqft.toFixed(2)}` : (annualPerSf ? `$${annualPerSf.toFixed(2)}` : "—")} />
                <InfoField label="Annual Rent" value={annualRent ? money(annualRent) : "—"} />
                {/* NNN breakouts (CAM / RE Tax / Other) and Gross Rent live on
                    the CAM card pills for retail units. Non-retail units still
                    surface them here so the data isn't lost. */}
                {!isRetailUnit(propertyCode) && hasNNN && (
                  <>
                    {unit.opexMonth > 0 && <InfoField label="CAM / mo" value={money(unit.opexMonth)} />}
                    {unit.reTaxMonth > 0 && <InfoField label="RE Tax / mo" value={money(unit.reTaxMonth)} />}
                    {unit.otherMonth > 0 && <InfoField label="Other / mo" value={money(unit.otherMonth)} />}
                  </>
                )}
                {!isRetailUnit(propertyCode) && (
                  <InfoField label="Gross Rent / mo" value={unit.grossRentTotal ? money(unit.grossRentTotal) : "—"} />
                )}
              </div>
              {Boolean(unit.lastIncreaseDate || unit.lastIncreaseAmount) && (
                <div style={{
                  marginTop: 14, paddingTop: 14,
                  borderTop: "1px solid var(--border)",
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 32px",
                }}>
                  <div style={{ gridColumn: "1 / -1", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>
                    Last Increase
                  </div>
                  <InfoField label="Date" value={formatModalDate(unit.lastIncreaseDate)} />
                  <InfoField label="Amount" value={unit.lastIncreaseAmount ? money(unit.lastIncreaseAmount) : "—"} />
                </div>
              )}
            </div>
          );
          if (isAmenity) return leaseTermCard;
          return (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.5fr) minmax(0, 1fr)", gap: 14, alignItems: "stretch" }}>
              {leaseTermCard}
              {rentCard}
            </div>
          );
        })()}

        {/* ── CAM / INS / RET (retail only, occupied suites) ── */}
        {isRetailUnit(propertyCode) && !isAmenity && !unit.isVacant && (
          <CamConfigCard
            unitRef={unit.unitRef}
            actualPrs={actualPrs}
            unitSqft={unit.sqft}
            opexMonth={unit.opexMonth}
            reTaxMonth={unit.reTaxMonth}
            otherMonth={unit.otherMonth}
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

        {/* ── Contacts (occupied suites only) ── */}
        {!isAmenity && !unit.isVacant && (
          <ContactsCard
            unitRef={unit.unitRef}
            propertyCode={propertyCode}
            occupantName={unit.occupantName || ""}
          />
        )}

        {/* ── Security Deposit (occupied suites only) ── */}
        {!isAmenity && !unit.isVacant && (
          <DepositCard
            unitRef={unit.unitRef}
            propertyCode={propertyCode}
            tenantCompany={unit.occupantName || ""}
          />
        )}

        {/* ── Shared Drive Folder ── */}
        <ShareFolderCard kind="unit" entityKey={unit.unitRef} />

        {/* ── Suite Information + Floorplan ── */}
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
