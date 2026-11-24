"use client";

// THE ONE DROPDOWN FOR PICKING A SUITE (owner, 11/2026: "do we have a standard
// dropdown for units … suite should go first before tenant name and then the
// data $XXX should go at the end … just show the last part of the unit").
//
// Grouped under a building header ("3610 · Building 1, Neshaminy Interplex"),
// each option reads  104 · All American Hospice, LLC · ($1,929.42)  — the
// suite without its property code (the header already names the building),
// the tenant, then whatever figure the page wants at the end. Suites sort in
// suite order within a building. Use it anywhere a page picks a tenant / unit.

import { useMemo } from "react";

export type UnitChoice = {
  unitRef: string;
  tenant: string;
  /** Group header — "3610 · Building 1, Neshaminy Interplex". */
  group: string;
  /** The figure at the end of the line, already formatted ("$3,952.45"). */
  meta?: string;
};

/** "3610-104" becomes "104": everything after the property code. */
export function suiteOf(unitRef: string): string {
  const i = unitRef.indexOf("-");
  return i > 0 ? unitRef.slice(i + 1) : unitRef;
}

const bySuite = (a: UnitChoice, b: UnitChoice) =>
  suiteOf(a.unitRef).localeCompare(suiteOf(b.unitRef), undefined, { numeric: true }) || a.tenant.localeCompare(b.tenant);

export function unitLabel(u: UnitChoice): string {
  return [suiteOf(u.unitRef), u.tenant, u.meta].filter(Boolean).join("  ·  ");
}

export function UnitSelect({
  units, value, onChange, placeholder = "Select a tenant…", brand, style, ariaLabel = "Tenant", disabled,
}: {
  units: UnitChoice[];
  value: string;
  onChange: (unitRef: string) => void;
  placeholder?: string;
  /** The page's driving control — the brand-outlined select. */
  brand?: boolean;
  style?: React.CSSProperties;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, UnitChoice[]>();
    for (const u of units) m.set(u.group, [...(m.get(u.group) ?? []), u]);
    return [...m.entries()].map(([g, rows]) => [g, [...rows].sort(bySuite)] as const);
  }, [units]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} disabled={disabled}
      className={brand ? "select-brand select-lg" : undefined} style={{ width: "100%", ...style }}>
      <option value="">{placeholder}</option>
      {groups.map(([g, rows]) => (
        <optgroup key={g} label={g}>
          {rows.map((u) => <option key={`${u.unitRef}|${u.tenant}`} value={u.unitRef}>{unitLabel(u)}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
