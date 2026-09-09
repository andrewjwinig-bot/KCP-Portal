"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { PROPERTY_OWNERSHIP, type PropertyOwner } from "../../lib/properties/ownership";
import { PROPERTY_DEFS, TYPE_STYLE, FUND_LABEL, type PropType, type FundGroup } from "../../lib/properties/data";
import { structureFor, type InvestorStructure } from "../../lib/investors/structures";
import { ENTITY_VALUES, entityValue, totalEquityValue, STATEMENT_AS_OF } from "../../lib/properties/entityValues";
import { beneficiaryNames, statementForBeneficiary } from "../../lib/properties/beneficiaries";
import type { OwnershipEstimates } from "../../lib/properties/estimateStore";
import type { EntityOverrides, EntityOverride } from "../../lib/properties/entityOverrideStore";
import { ownerContact, type OwnerContact } from "../../lib/properties/ownerContacts";
import { residencyOf } from "../../lib/properties/residency";
import { buildStatementOfValuesPdf, type StatementPdfRow } from "../../lib/properties/statementPdf";
import { mergeTrusteeRows, normInvestorKey, type TrusteeRowOverride } from "../../lib/investors/structures";
import { canEditOwnership, canManageK1 } from "../../lib/users";
import { K1Header, K1Cell, K1PortalCell, K1SelectCell, K1ShareResults, K1InvestorCells, K1EmailCell, K1InvestorShare } from "./K1Panel";
import { useK1Registry } from "./useK1";
import { PartnershipTaxDocs } from "@/app/components/PartnershipTaxDocs";
import { useUser } from "../components/UserProvider";
import { Pill, StatPill, TONE_GREEN, TONE_RED } from "../components/Pill";
import { DownloadMenu } from "../components/DownloadMenu";
import { th, td, thL, tdL } from "../components/tableStyles";
import { InvestorContactCard } from "./InvestorContactCard";
import { ownerSections, type OwnerSection } from "./ownerSections";
import { Select } from "../components/YearSelect";

type ContactOverrides = Record<string, Partial<OwnerContact>>;

type View = "property" | "investor" | "statement";

const money0 = (n: number | null | undefined): string =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** A date string (yyyy-mm-dd) rendered long-form (e.g. "December 31, 2025"). */
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
/** The frozen year-end statement date, long-form. */
function asOfLong(): string {
  return longDate(STATEMENT_AS_OF);
}
/** The entity row with any saved field overrides applied (seed ⊕ override). */
function resolveEntity(code: string, entOv: EntityOverrides): ReturnType<typeof entityValue> {
  const seed = entityValue(code);
  if (!seed) return seed;
  const ov = entOv[code];
  return ov ? { ...seed, ...ov } : seed;
}
/** The entity's effective (overridden) year-end equity value. */
function resolveEquity(code: string, entOv: EntityOverrides): number {
  return resolveEntity(code, entOv)?.equityValue ?? 0;
}
/** Effective "today" estimated equity for an entity: the saved estimate
 *  override, or the (possibly overridden) year-end equity when none entered. */
function estimateFor(code: string, est: OwnershipEstimates, entOv: EntityOverrides): number {
  const ov = est.values[code];
  if (ov != null && Number.isFinite(ov)) return ov;
  return resolveEquity(code, entOv);
}

type PropertyHolding = {
  propertyCode: string;       // "1100", "7200"…
  propertyName: string;       // PROPERTY_DEFS lookup (or override)
  type: PropType | "Misc";    // for category grouping
  fundGroup?: FundGroup;      // JV III / NI LLC subsection (Office only)
  hasK1Distribution: boolean;
  owners: PropertyOwner[];
};

const TYPES: PropType[] = ["Office", "Retail", "Residential", "Land", "Misc"];




/** A row of the By Property roster: a group band, or one property. */
type PropBlock =
  | { kind: "band"; key: string; type: PropType; label: string; count: number; ye: number; est: number; sub?: boolean }
  | { kind: "prop"; h: PropertyHolding };

type InvestorAggregate = {
  /** Display name (Title Case as recorded). */
  name: string;
  /** Lower-cased key used for grouping. */
  key: string;
  rows: Array<{
    holding: PropertyHolding;
    investor: PropertyOwner;
  }>;
};

function pct(n: number | undefined | null): string {
  if (n == null) return "—";
  return (n * 100).toFixed(4) + "%";
}

/** Single ownership % for display — profit/loss/capital are equal in the
 *  source data, so we use profit pct (or fall back to overall owner pct). */
function ownershipFor(inv: PropertyOwner): number | undefined {
  return inv.profitPct ?? inv.ownerPct ?? inv.capitalPct ?? inv.lossPct;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

type OwnerGroup = {
  key: string;
  name: string;       // display name of the person
  total: number;      // sum of ownership across all stakes
  owners: PropertyOwner[];
};

/** Group owners by normalized name; sort groups by total ownership desc;
 *  sort within each group by row ownership desc. */
/** Read-only email for the ownership table when the K-1 tooling isn't in play
 *  (no override lookup — that lives server-side with the K-1 payload). */
/** An investor's name in the ownership table. One constant because a
 *  single-interest owner and a multi-stake one were rendering at different
 *  weights and sizes, and the name is what you scan for against the trust
 *  names beneath it. */
const INVESTOR_NAME: React.CSSProperties = { fontWeight: 700, fontSize: 15 };

/** A person holding several stakes renders as ONE block: a tinted band for the
 *  person, a lighter tint on each interest, and a brand rail down the left so
 *  where the block starts and ends is obvious at a glance. Previously the only
 *  cue was a 2.5%-opacity header and a faint divider, which read as noise. */
const GROUP_ROW_BG = "rgba(11,74,125,0.07)";
const GROUP_SUB_BG = "rgba(11,74,125,0.028)";
const GROUP_RAIL: React.CSSProperties = { boxShadow: "inset 3px 0 0 rgba(11,74,125,0.5)" };

function buildOwnerGroups(owners: PropertyOwner[]): OwnerGroup[] {
  const byKey = new Map<string, PropertyOwner[]>();
  for (const o of owners) {
    const key = normName(o.name);
    let arr = byKey.get(key);
    if (!arr) { arr = []; byKey.set(key, arr); }
    arr.push(o);
  }
  for (const arr of byKey.values()) {
    arr.sort((a, b) => (ownershipFor(b) ?? 0) - (ownershipFor(a) ?? 0));
  }
  const out: OwnerGroup[] = [];
  for (const [k, arr] of byKey.entries()) {
    out.push({
      key: k,
      name: arr[0].name,
      total: arr.reduce((s, o) => s + (ownershipFor(o) ?? 0), 0),
      owners: arr,
    });
  }
  // Alphabetical by owner. Ownership % order reads like a ranking, which is not
  // what this table is for — you come here to find a named person's row.
  out.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return out;
}

export default function InvestorInfoPage() {
  const [view, setView] = useState<View>("property");
  const [query, setQuery] = useState("");
  /** Statement-of-Values owner filter. "" = portfolio (all entities). */
  const [beneficiary, setBeneficiary] = useState("");
  const [zipping, setZipping] = useState(false);
  const benNames = useMemo(() => beneficiaryNames(), []);
  // Cross-link into a specific owner's Statement of Values (only when the
  // investor maps to a statement beneficiary).
  const beneficiaryMatch = (name: string) => benNames.find((n) => n.toLowerCase() === name.toLowerCase());
  const goToOwnerStatement = (name: string) => {
    const match = beneficiaryMatch(name);
    if (!match) return;
    setBeneficiary(match);
    setView("statement");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const { loggedInUser } = useUser();
  const canEdit = canEditOwnership(loggedInUser);
  // NARROWER than canEdit on purpose: a family member can edit ownership and is
  // herself an owner, so the K-1 sections are gated separately. The API applies
  // the same rule server-side.
  const canK1 = canManageK1(loggedInUser);
  /** Editable owner-contact overrides (overlay the seed). */
  const [contactOverrides, setContactOverrides] = useState<ContactOverrides>({});
  useEffect(() => {
    fetch("/api/ownership/contacts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.overrides) setContactOverrides(d.overrides); })
      .catch(() => {});
  }, []);
  /**
   * Seed ⊕ override → the contact shown/exported for a beneficiary.
   *
   * The merge lives in `ownerContact` so this page and the K-1 send path read
   * the SAME record. Merging it here instead is what showed an investor's
   * email on their row while their share dialog offered "Add email": the send
   * path only ever saw the static seed.
   */
  const resolveContact = useMemo(() => {
    return (name: string): OwnerContact | undefined => ownerContact(name, contactOverrides);
  }, [contactOverrides]);
  async function saveContact(name: string, override: Partial<OwnerContact> | null): Promise<boolean> {
    try {
      const res = await fetch("/api/ownership/contacts", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: name, override }),
      });
      if (!res.ok) return false;
      const d = await res.json();
      setContactOverrides(d.overrides ?? {});
      return true;
    } catch { return false; }
  }

  /** Editable entity-financial overrides (overlay the seed row). */
  const [entityOverrides, setEntityOverrides] = useState<EntityOverrides>({});
  useEffect(() => {
    fetch("/api/ownership/entities")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.overrides) setEntityOverrides(d.overrides); })
      .catch(() => {});
  }, []);
  async function saveEntity(code: string, override: EntityOverride | null): Promise<boolean> {
    try {
      const res = await fetch("/api/ownership/entities", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, override }),
      });
      if (!res.ok) return false;
      const d = await res.json();
      setEntityOverrides(d.overrides ?? {});
      return true;
    } catch { return false; }
  }

  /** Current "today" estimated equity per entity + shared as-of date. */
  const [estimates, setEstimates] = useState<OwnershipEstimates>({ asOf: "", values: {} });

  // Property code → entity code, so a By-Property card can show the property's
  // value (year-end + estimate) and each owner's $ share inline.
  const entityByProperty = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of ENTITY_VALUES) {
      if (e.propertyCode) m.set(e.propertyCode.toUpperCase(), e.entity);
      m.set(e.entity.toUpperCase(), e.entity);
    }
    return m;
  }, []);
  const propValue = (propertyCode: string): { ye: number; est: number } | null => {
    const ent = entityByProperty.get(propertyCode.toUpperCase());
    if (!ent) return null;
    return { ye: resolveEntity(ent, entityOverrides)?.equityValue ?? 0, est: estimateFor(ent, estimates, entityOverrides) };
  };
  const estAsOfLabel = estimates.asOf ? `as of ${longDate(estimates.asOf)}` : "as of today (not yet finalized)";
  const asOfLines = () => [
    [`Year-end values as of ${asOfLong()}`],
    [`Estimated values ${estAsOfLabel}`],
  ];
  const pctNum = (frac: number | undefined) => Number(((frac ?? 0) * 100).toFixed(4));

  /** Excel: one property's value split across its owners (year-end + estimated). */
  function exportPropertySoV(h: PropertyHolding) {
    const pv = propValue(h.propertyCode);
    const aoa: (string | number)[][] = [
      [`${h.propertyName} — Statement of Values`],
      [`Property ${h.propertyCode}`],
      ...asOfLines(),
      [],
      ["Vendor Code", "Owner", "Ownership %", "Year-End $", "Estimated $"],
    ];
    for (const g of buildOwnerGroups(h.owners)) {
      for (const inv of g.owners) {
        const frac = ownershipFor(inv) ?? 0;
        aoa.push([inv.vendorCode ?? "", inv.name + (inv.detailedName ? ` (${inv.detailedName})` : ""), pctNum(frac), pv ? Math.round(frac * pv.ye) : "", pv ? Math.round(frac * pv.est) : ""]);
      }
    }
    aoa.push(["", "Property total", 100, pv ? Math.round(pv.ye) : "", pv ? Math.round(pv.est) : ""]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Statement of Values");
    const safe = `${h.propertyCode}_${h.propertyName}`.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    XLSX.writeFile(wb, `Statement_of_Values_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /** Excel: one investor's share of every property they hold (year-end + estimated). */
  function exportInvestorSoV(agg: { name: string; rows: { holding: PropertyHolding; investor: PropertyOwner }[] }) {
    const aoa: (string | number)[][] = [
      [`${agg.name} — Statement of Values`],
      ...asOfLines(),
      [],
      ["Prop", "Property", "Ownership %", "Year-End $", "Estimated $"],
    ];
    let totYE = 0, totEst = 0;
    for (const r of agg.rows) {
      const pv = propValue(r.holding.propertyCode);
      const frac = ownershipFor(r.investor) ?? 0;
      const ye = pv ? frac * pv.ye : 0, est = pv ? frac * pv.est : 0;
      totYE += ye; totEst += est;
      aoa.push([r.holding.propertyCode, r.holding.propertyName, pctNum(frac), pv ? Math.round(ye) : "", pv ? Math.round(est) : ""]);
    }
    aoa.push(["", "Total", "", Math.round(totYE), Math.round(totEst)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Statement of Values");
    const safe = agg.name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    XLSX.writeFile(wb, `Statement_of_Values_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  useEffect(() => {
    fetch("/api/ownership/estimates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d === "object") setEstimates({ asOf: d.asOf ?? "", values: d.values ?? {} }); })
      .catch(() => {});
  }, []);
  async function saveEstimates(next: OwnershipEstimates): Promise<boolean> {
    try {
      const res = await fetch("/api/ownership/estimates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) return false;
      const saved = await res.json();
      setEstimates({ asOf: saved.asOf ?? "", values: saved.values ?? {} });
      return true;
    } catch {
      return false;
    }
  }
  // Prefill the search box if the page was opened with ?q=… (used by the
  // global search to deep-link to an owner or vendor code).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setQuery(q);
    // Deep-link into the Statement of Values (?view=statement&owner=Name).
    const v = params.get("view");
    if (v === "statement" || v === "investor" || v === "property") setView(v);
    const owner = params.get("owner");
    if (owner) {
      setView("statement");
      // Match case-insensitively to the canonical beneficiary name.
      const match = beneficiaryNames().find((n) => n.toLowerCase() === owner.toLowerCase());
      if (match) setBeneficiary(match);
    }
  }, []);
  /** Open/closed state for each card. Default = closed everywhere so the page
   *  reads like the rent roll page (PropertyCard pattern). */
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  function toggleOpen(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  /**
   * Which multi-stake investors have their individual interests showing,
   * keyed `<property>::<person>`. COLLAPSED is the default: a property's
   * ownership table answers "who owns this and how much" first, and one
   * person holding it through three trusts turned that into three rows to
   * read past. The roll-up carries the person's total; the trusts are the
   * follow-up question, one click away.
   *
   * They are still RENDERED when collapsed, hidden by `.screen-collapsed`
   * (screen only), so a printed ownership schedule lists every interest —
   * a printout of roll-ups alone would not tie to the K-1 schedule.
   */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // ── Holdings list sourced from PROPERTY_OWNERSHIP ──────────────────────
  const holdings: PropertyHolding[] = useMemo(() => {
    return PROPERTY_OWNERSHIP
      .filter((p) => p.owners.length > 0)
      .map((p) => {
        const def = PROPERTY_DEFS.find((d) => d.id.toUpperCase() === p.propertyCode.toUpperCase());
        return {
          propertyCode: p.propertyCode,
          propertyName: p.propertyName ?? def?.name ?? p.propertyCode,
          type: (def?.type ?? "Misc") as PropType,
          fundGroup: def?.fundGroup,
          hasK1Distribution: !!p.hasK1Distribution,
          owners: p.owners,
        };
      })
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode));
  }, []);

  // K-1 state lives here, not in each card: the K-1 columns are part of the
  // ownership table (one table, not two that repeat owner / code / share), and
  // that table is built inside a .map — where a hook can't be called.
  const openK1Codes = useMemo(
    () => (canK1 ? holdings.filter((h) => h.hasK1Distribution && openIds[h.propertyCode]).map((h) => h.propertyCode) : []),
    [canK1, holdings, openIds],
  );
  const k1reg = useK1Registry(canK1, openK1Codes);

  // ── Investor view: group by normalized name across all properties ─────
  const investorIndex: InvestorAggregate[] = useMemo(() => {
    const map = new Map<string, InvestorAggregate>();
    for (const h of holdings) {
      for (const inv of h.owners) {
        const key = normName(inv.name);
        let agg = map.get(key);
        if (!agg) {
          agg = { name: inv.name, key, rows: [] };
          map.set(key, agg);
        }
        agg.rows.push({ holding: h, investor: inv });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [holdings]);

  /** Does a person's set of interests answer the current search? */
  const groupMatchesQuery = (owners: PropertyOwner[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    return owners.some((o) =>
      o.name.toLowerCase().includes(q)
      || (o.detailedName ?? "").toLowerCase().includes(q)
      || (o.vendorCode ?? "").toLowerCase().includes(q));
  };

  const filteredHoldings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return holdings;
    return holdings.filter((h) =>
      h.propertyName.toLowerCase().includes(q)
      || h.propertyCode.toLowerCase().includes(q)
      || h.owners.some((inv) =>
        inv.name.toLowerCase().includes(q)
        || (inv.detailedName ?? "").toLowerCase().includes(q)
        || (inv.vendorCode ?? "").toLowerCase().includes(q)),
    );
  }, [holdings, query]);

  // The roster in render order: a band per property type (Office banding again
  // by fund, as it always has), then that group's properties. Bands carry the
  // group's totals the way the Monthly Statements property bands do — the
  // count and value were previously only readable by adding up the cards.
  const groupTotals = (items: PropertyHolding[]) =>
    items.reduce((a, h) => {
      const pv = propValue(h.propertyCode);
      return { ye: a.ye + (pv?.ye ?? 0), est: a.est + (pv?.est ?? 0) };
    }, { ye: 0, est: 0 });
  const portfolioValue = groupTotals(filteredHoldings);

  const propertyBlocks: PropBlock[] = [];
  for (const type of TYPES) {
    const group = filteredHoldings.filter((h) => h.type === type);
    if (group.length === 0) continue;
    propertyBlocks.push({ kind: "band", key: `type-${type}`, type, label: type, count: group.length, ...groupTotals(group) });
    const funded = type === "Office" ? (["JV III", "NI LLC"] as FundGroup[]) : [];
    for (const fund of funded) {
      const items = group.filter((h) => h.fundGroup === fund);
      if (items.length === 0) continue;
      propertyBlocks.push({
        kind: "band", key: `fund-${fund}`, type, sub: true,
        label: `${FUND_LABEL[fund]} · ${fund}`, count: items.length, ...groupTotals(items),
      });
      for (const h of items) propertyBlocks.push({ kind: "prop", h });
    }
    const rest = funded.length ? group.filter((h) => !h.fundGroup) : group;
    if (rest.length === 0) continue;
    if (rest.length !== group.length) {
      propertyBlocks.push({ kind: "band", key: `fund-other-${type}`, type, sub: true, label: "Other", count: rest.length, ...groupTotals(rest) });
    }
    for (const h of rest) propertyBlocks.push({ kind: "prop", h });
  }

  const filteredInvestors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return investorIndex;
    return investorIndex.filter((i) =>
      i.name.toLowerCase().includes(q)
      || i.rows.some((r) =>
        r.holding.propertyName.toLowerCase().includes(q)
        || r.holding.propertyCode.toLowerCase().includes(q)
        || (r.investor.detailedName ?? "").toLowerCase().includes(q)
        || (r.investor.vendorCode ?? "").toLowerCase().includes(q)),
    );
  }, [investorIndex, query]);

  const totalInvestors = investorIndex.length;
  const totalHoldings = holdings.length;

  function exportToExcel() {
    const fmtPct = (n: number | undefined) => (n == null ? "" : (n * 100).toFixed(4) + "%");

    // Sheet 1: By Property (one row per legal payee).
    const byProperty: Record<string, string | number>[] = [];
    for (const h of holdings) {
      for (const o of h.owners) {
        byProperty.push({
          "Property Code": h.propertyCode,
          "Property Name": h.propertyName,
          "Type": h.type,
          "Fund": h.fundGroup ?? "",
          "K-1": h.hasK1Distribution ? "Yes" : "",
          "Vendor Code": o.vendorCode ?? "",
          "Owner": o.name,
          "Detail / Trust": o.detailedName ?? "",
          "Address": o.address ?? "",
          "City": o.city ?? "",
          "State": o.state ?? "",
          "Zip": o.zip ?? "",
          "Phone": o.phone ?? "",
          "Ownership %": fmtPct(ownershipFor(o)),
        });
      }
    }

    // Sheet 2: By Investor (one row per stake; rows grouped per person).
    const byInvestor: Record<string, string | number>[] = [];
    for (const inv of [...investorIndex].sort((a, b) => a.name.localeCompare(b.name))) {
      for (const r of inv.rows) {
        byInvestor.push({
          "Investor": inv.name,
          "Property Code": r.holding.propertyCode,
          "Property Name": r.holding.propertyName,
          "Type": r.holding.type,
          "Vendor Code": r.investor.vendorCode ?? "",
          "Detail / Trust": r.investor.detailedName ?? "",
          "Address": [r.investor.address, r.investor.city, r.investor.state, r.investor.zip].filter(Boolean).join(", "),
          "Phone": r.investor.phone ?? "",
          "Ownership %": fmtPct(ownershipFor(r.investor)),
        });
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byProperty), "By Property");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byInvestor), "By Investor");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Investor_Info_${stamp}.xlsx`);
  }

  /** Statement of Values export. Totals are written as live SUM formulas over
   *  the exact source cells (per the Excel-totals house rule) with the
   *  JS-computed value cached so the number shows before Excel recalcs. */
  function exportStatement() {
    const stamp = new Date().toISOString().slice(0, 10);
    const wb = XLSX.utils.book_new();

    const estLabel = estimates.asOf ? `Est. Value (${longDate(estimates.asOf)})` : "Est. Value (Today)";

    if (!beneficiary) {
      // Portfolio: one row per entity, TOTAL row sums the money columns.
      const rows = ENTITY_VALUES.map((e) => resolveEntity(e.entity, entityOverrides)!).sort((a, b) => (b.equityValue ?? 0) - (a.equityValue ?? 0));
      const header = ["Entity", "Property / Entity", "NOI", "Cap Rate", "Indicated Value", "Debt Balance", "Cash", "Future Capital", `Equity Value (${asOfLong()})`, estLabel];
      const aoa: (string | number | null)[][] = [
        [`Korman — Statement of Values`],
        header,
        ...rows.map((e) => [e.entity, e.name, e.noi, e.capRate, e.indicatedValue, e.debtBalance, e.cash, e.futureCapital, e.equityValue, estimateFor(e.entity, estimates, entityOverrides)]),
        ["", "TOTAL", null, null, null, null, null, null, null, null],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const firstData = 3;                 // Excel row of first entity (title=1, header=2)
      const lastData = firstData + rows.length - 1;
      const totalRow = lastData + 1;
      // Money columns to total: C(NOI) E(Value) F(Debt) G(Cash) H(FutureCap) I(Equity) J(Est)
      const sums: Record<string, number> = {
        C: rows.reduce((s, e) => s + (e.noi ?? 0), 0),
        E: rows.reduce((s, e) => s + (e.indicatedValue ?? 0), 0),
        F: rows.reduce((s, e) => s + (e.debtBalance ?? 0), 0),
        G: rows.reduce((s, e) => s + (e.cash ?? 0), 0),
        H: rows.reduce((s, e) => s + (e.futureCapital ?? 0), 0),
        I: rows.reduce((s, e) => s + (e.equityValue ?? 0), 0),
        J: rows.reduce((s, e) => s + estimateFor(e.entity, estimates, entityOverrides), 0),
      };
      for (const [col, val] of Object.entries(sums)) {
        ws[`${col}${totalRow}`] = { t: "n", f: `SUM(${col}${firstData}:${col}${lastData})`, v: val };
      }
      ws["!cols"] = [{ wch: 8 }, { wch: 38 }, { wch: 12 }, { wch: 9 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 13 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, "Statement of Values");
      XLSX.writeFile(wb, `Statement_of_Values_${stamp}.xlsx`);
      return;
    }

    // One owner: one row per entity they hold, value = % × equity, TOTAL sums value.
    const lines = statementForBeneficiary(beneficiary);
    const contact = resolveContact(beneficiary);
    const sendTo = contact ? [contact.address, contact.email].filter(Boolean).join("  ·  ") : "";
    const header = ["Entity", "Property / Entity", "Held Through", "Ownership %", `Value (${asOfLong()})`, estLabel];
    const aoa: (string | number | null)[][] = [
      [`${beneficiary} — Statement of Values`],
      ...(sendTo ? [[`Send to: ${sendTo}`]] : []),
      header,
      ...lines.map((l) => [l.entity, resolveEntity(l.entity, entityOverrides)?.name ?? l.entityName, l.partners.join("; "), l.pct, Math.round(l.pct * resolveEquity(l.entity, entityOverrides)), Math.round(l.pct * estimateFor(l.entity, estimates, entityOverrides))]),
      ["", "TOTAL", "", null, null, null],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const firstData = sendTo ? 4 : 3;    // title (+ optional send-to) + header
    const lastData = firstData + lines.length - 1;
    const totalRow = lastData + 1;
    ws[`E${totalRow}`] = { t: "n", f: `SUM(E${firstData}:E${lastData})`, v: Math.round(lines.reduce((s, l) => s + l.pct * resolveEquity(l.entity, entityOverrides), 0)) };
    ws[`F${totalRow}`] = { t: "n", f: `SUM(F${firstData}:F${lastData})`, v: Math.round(lines.reduce((s, l) => s + l.pct * estimateFor(l.entity, estimates, entityOverrides), 0)) };
    // Percent column formatting.
    for (let i = 0; i < lines.length; i++) ws[`D${firstData + i}`] = { t: "n", v: lines[i].pct, z: "0.0000%" };
    ws["!cols"] = [{ wch: 8 }, { wch: 34 }, { wch: 44 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
    const safe = beneficiary.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    XLSX.utils.book_append_sheet(wb, ws, "Statement of Values");
    XLSX.writeFile(wb, `Statement_of_Values_${safe}_${stamp}.xlsx`);
  }

  /** Presentation-ready PDF for circulating to ownership. */
  async function exportStatementPdf() {
    const stamp = new Date().toISOString().slice(0, 10);
    const generatedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const asOfEstimate = estimates.asOf ? longDate(estimates.asOf) : "";
    let rows: StatementPdfRow[];
    let totals: { yearEnd: number; estimated: number };
    let ownerName: string | undefined;
    let contact: { address?: string; email?: string } | undefined;
    let filename: string;

    if (!beneficiary) {
      const src = ENTITY_VALUES.map((e) => resolveEntity(e.entity, entityOverrides)!).sort((a, b) => (b.equityValue ?? 0) - (a.equityValue ?? 0));
      rows = src.map((e) => ({ code: e.propertyCode ?? e.entity, name: e.name, yearEnd: e.equityValue, estimated: estimateFor(e.entity, estimates, entityOverrides) }));
      totals = {
        yearEnd: src.reduce((s, e) => s + (e.equityValue ?? 0), 0),
        estimated: src.reduce((s, e) => s + estimateFor(e.entity, estimates, entityOverrides), 0),
      };
      filename = `Statement_of_Values_${stamp}.pdf`;
    } else {
      ownerName = beneficiary;
      const c = resolveContact(beneficiary);
      if (c && (c.address || c.email)) contact = { address: c.address, email: c.email };
      const lines = statementForBeneficiary(beneficiary);
      rows = lines.map((l) => ({ code: l.propertyCode ?? l.entity, name: resolveEntity(l.entity, entityOverrides)?.name ?? l.entityName, pct: l.pct, yearEnd: l.pct * resolveEquity(l.entity, entityOverrides), estimated: l.pct * estimateFor(l.entity, estimates, entityOverrides) }));
      totals = {
        yearEnd: lines.reduce((s, l) => s + l.pct * resolveEquity(l.entity, entityOverrides), 0),
        estimated: lines.reduce((s, l) => s + l.pct * estimateFor(l.entity, estimates, entityOverrides), 0),
      };
      const safe = beneficiary.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
      filename = `Statement_of_Values_${safe}_${stamp}.pdf`;
    }

    const bytes = await buildStatementOfValuesPdf({ ownerName, ownerContact: contact, asOfYearEnd: asOfLong(), asOfEstimate, generatedOn, rows, totals });
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Build one presentation PDF per owner (plus the portfolio statement) and
   *  download them as a single ZIP — the annual mail-merge to ownership. */
  async function exportAllOwnerStatements() {
    setZipping(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const generatedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const asOfEstimate = estimates.asOf ? longDate(estimates.asOf) : "";
      const zip = new JSZip();

      // Portfolio statement first.
      {
        const src = ENTITY_VALUES.map((e) => resolveEntity(e.entity, entityOverrides)!).sort((a, b) => (b.equityValue ?? 0) - (a.equityValue ?? 0));
        const rows: StatementPdfRow[] = src.map((e) => ({ code: e.propertyCode ?? e.entity, name: e.name, yearEnd: e.equityValue, estimated: estimateFor(e.entity, estimates, entityOverrides) }));
        const totals = { yearEnd: src.reduce((s, e) => s + (e.equityValue ?? 0), 0), estimated: src.reduce((s, e) => s + estimateFor(e.entity, estimates, entityOverrides), 0) };
        const bytes = await buildStatementOfValuesPdf({ asOfYearEnd: asOfLong(), asOfEstimate, generatedOn, rows, totals });
        zip.file(`_Portfolio Statement of Values ${stamp}.pdf`, bytes);
      }

      // One statement per owner.
      for (const name of benNames) {
        const lines = statementForBeneficiary(name);
        if (lines.length === 0) continue;
        const c = resolveContact(name);
        const rows: StatementPdfRow[] = lines.map((l) => ({ code: l.propertyCode ?? l.entity, name: resolveEntity(l.entity, entityOverrides)?.name ?? l.entityName, pct: l.pct, yearEnd: l.pct * resolveEquity(l.entity, entityOverrides), estimated: l.pct * estimateFor(l.entity, estimates, entityOverrides) }));
        const totals = { yearEnd: lines.reduce((s, l) => s + l.pct * resolveEquity(l.entity, entityOverrides), 0), estimated: lines.reduce((s, l) => s + l.pct * estimateFor(l.entity, estimates, entityOverrides), 0) };
        const bytes = await buildStatementOfValuesPdf({
          ownerName: name,
          ownerContact: c && (c.address || c.email) ? { address: c.address, email: c.email } : undefined,
          asOfYearEnd: asOfLong(), asOfEstimate, generatedOn, rows, totals,
        });
        const safe = name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
        zip.file(`Statement of Values - ${safe} - ${stamp}.pdf`, bytes);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Statements_of_Value_All_Owners_${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  /**
   * One property, as a row in the roster table plus the detail row it opens.
   *
   * This used to be a free-standing card per property with a coloured top
   * rail; fifteen of them read as a stack of banners rather than a roster,
   * and matched nothing else in the portal. It is now the same shape as the
   * Monthly Statements roster — one table, tinted band rows opening each
   * group, a row that expands in place.
   */
  function renderHoldingRows(h: PropertyHolding) {
    const open = !!openIds[h.propertyCode];
    const pv = propValue(h.propertyCode); // property year-end + estimated value (null if no entity)
    const hasVal = !!pv;
    const share = (frac: number | undefined, base: number) => money0((frac ?? 0) * base);
    // The K-1 columns join the ownership table rather than repeating the roster
    // in a second one below it.
    const showK1 = !!(h.hasK1Distribution && canK1);
    const k1 = showK1 ? k1reg.slice(h.propertyCode) : null;
    const k1Th = { padding: "10px 16px", fontWeight: 700 } as React.CSSProperties;
      /**
       * A partner that is itself a partnership heads a band carrying its share
       * of the property, and still takes a K-1 — 0800 issues one to Hyman
       * Korman Co. as much as to the fourteen trusts.
       */
      const renderEntityBand = (sec: OwnerSection, _h: PropertyHolding, _pv: typeof pv, _showK1: boolean, _k1: typeof k1) => {
        const ent = sec.entity!;
        return (
          <tr key={`entity-${ent.id}`} style={{ background: GROUP_ROW_BG, borderTop: "2px solid var(--border)" }}>
            {showK1 && k1 && (
              <td style={{ padding: "12px 0 12px 16px", ...GROUP_RAIL }} className="no-print">
                <K1SelectCell ownerId={ent.id} k1={k1} />
              </td>
            )}
            {showK1 && !k1 && <td className="no-print" style={GROUP_RAIL} />}
            <td style={{ padding: "12px 16px", ...(showK1 ? null : GROUP_RAIL) }}>
              {ent.vendorCode ? (
                <span style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "2px 8px",
                  borderRadius: 999, background: "rgba(15,23,42,0.05)", color: "var(--text)",
                  border: "1px solid var(--border)", display: "inline-block",
                }}>{ent.vendorCode}</span>
              ) : <span style={{ color: "var(--muted)" }}>&mdash;</span>}
            </td>
            <td style={{ padding: "12px 16px" }}>
              <div style={{ ...INVESTOR_NAME, textTransform: "uppercase", letterSpacing: "0.02em" }}>{ent.name}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {sec.owners.length} investors in {ent.name} · their K-1 comes from {ent.name}
              </div>
            </td>
            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800 }}>{pct(sec.frac)}</td>
            {hasVal && <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{share(sec.frac, pv!.ye)}</td>}
            {hasVal && <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{share(sec.frac, pv!.est)}</td>}
            {showK1 && k1 && k1.ownerFor(ent.id) && (
              <td style={{ padding: "12px 16px" }} className="no-print"><K1Cell owner={k1.ownerFor(ent.id)!} k1={k1} /></td>
            )}
            {showK1 && k1 && !k1.ownerFor(ent.id) && <td className="no-print" />}
            {showK1 && k1 && (
              <td style={{ padding: "12px 16px", textAlign: "right" }} className="no-print">
                {k1.ownerFor(ent.id) && <K1PortalCell owner={k1.ownerFor(ent.id)!} k1={k1} />}
              </td>
            )}
          </tr>
        );
      };

      /**
       * One investor inside an entity. Their stored percentage is a share of
       * the ENTITY, so the property columns carry `sub × entity` — which is
       * what makes the $ their net value in this property.
       */
      const renderSubOwner = (sub: PropertyOwner, ent: PropertyOwner, _h: PropertyHolding, _pv: typeof pv, _showK1: boolean) => {
        const eff = (ownershipFor(sub) ?? 0) * (ownershipFor(ent) ?? 0);
        return (
          <tr key={sub.id} style={{ borderTop: "1px solid rgba(11,74,125,0.08)", background: GROUP_SUB_BG }}>
            {showK1 && <td className="no-print" style={GROUP_RAIL} />}
            <td style={{ padding: "8px 16px", ...(showK1 ? null : GROUP_RAIL) }} />
            <td style={{ padding: "8px 16px", paddingLeft: 36 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{sub.name}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                {sub.detailedName ? `${sub.detailedName} · ` : ""}{pct(ownershipFor(sub))} of {ent.name}
              </div>
            </td>
            <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 12 }}>{pct(eff)}</td>
            {hasVal && <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{share(eff, pv!.ye)}</td>}
            {hasVal && <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{share(eff, pv!.est)}</td>}
            {showK1 && <td className="no-print" colSpan={2} />}
          </tr>
        );
      };

      /** One person's row (or their roll-up plus a row per interest). */
      const renderOwnerGroup = (g: { key: string; name: string; total: number; owners: PropertyOwner[] }) => {
                const multi = g.owners.length > 1;
                // Scoped to the property: the same person shows on several
                // property cards and each one opens on its own.
                const gKey = `${h.propertyCode}::${g.key}`;
                // A search that hits an interest opens its block — a trust name
                // or vendor code only exists on the rows underneath, so a
                // collapsed block would answer a matching query with nothing.
                const gOpen = !!openGroups[gKey] || groupMatchesQuery(g.owners);
                if (!multi) {
                  const inv = g.owners[0];
                  return [(
                    <tr key={inv.id} style={{ borderTop: "1px solid var(--border)", background: k1?.uploading === inv.id ? "rgba(15,118,110,0.06)" : undefined }}>
                      {showK1 && k1 && (
                        <td style={{ padding: "12px 0 12px 16px" }} className="no-print"><K1SelectCell ownerId={inv.id} k1={k1} /></td>
                      )}
                      <td style={{ padding: "12px 16px" }}>
                        {inv.vendorCode ? (
                          <span style={{
                            fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                            padding: "2px 8px", borderRadius: 999,
                            background: "rgba(15,23,42,0.05)", color: "var(--text)",
                            border: "1px solid var(--border)",
                            display: "inline-block",
                          }}>{inv.vendorCode}</span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={INVESTOR_NAME}>{inv.name}</div>
                        {inv.detailedName && (
                          <div className="muted small" style={{ marginTop: 2 }}>{inv.detailedName}</div>
                        )}
                      </td>

                      <td style={{ padding: "12px 16px", textAlign: "right" }}>{pct(ownershipFor(inv))}</td>
                      {hasVal && <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{share(ownershipFor(inv), pv!.ye)}</td>}
                      {hasVal && <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{share(ownershipFor(inv), pv!.est)}</td>}
                      {showK1 && k1 && k1.ownerFor(inv.id) && (
                        <td style={{ padding: "12px 16px" }} className="no-print"><K1Cell owner={k1.ownerFor(inv.id)!} k1={k1} /></td>
                      )}
                      {showK1 && k1 && !k1.ownerFor(inv.id) && <td className="no-print" />}
                      {showK1 && k1 && (
                        <td style={{ padding: "12px 16px", textAlign: "right" }} className="no-print">
                          {k1.ownerFor(inv.id) && <K1PortalCell owner={k1.ownerFor(inv.id)!} k1={k1} />}
                        </td>
                      )}
                    </tr>
                  )];
                }
                // How many of this person's interests already have a K-1 on
                // file. Collapsing hides the per-interest cells, so the gap has
                // to survive on the roll-up — otherwise a missing K-1 is only
                // findable by opening every multi-stake investor in turn.
                const onFile = k1 ? g.owners.filter((o) => k1.docFor(o.id)).length : 0;
                const rows = [(
                  <tr
                    key={`${g.key}-primary`}
                    onClick={() => toggleGroup(gKey)}
                    aria-expanded={gOpen}
                    title={gOpen ? `Hide ${g.name}'s ${g.owners.length} interests` : `Show ${g.name}'s ${g.owners.length} interests`}
                    style={{ borderTop: "1px solid var(--border)", background: GROUP_ROW_BG, cursor: "pointer" }}
                  >
                    {/* One tick per PERSON: their interests share a single link
                        and a single PIN, so ticking an interest would be a lie.
                        Ticking must not also open the block underneath it. */}
                    {showK1 && k1 && (
                      <td style={{ padding: "12px 0 12px 16px", ...GROUP_RAIL }} className="no-print" onClick={(e) => e.stopPropagation()}>
                        <K1SelectCell ownerId={g.owners[0].id} k1={k1} />
                      </td>
                    )}
                    {showK1 && !k1 && <td className="no-print" style={GROUP_RAIL} />}
                    <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 11, ...(showK1 ? null : GROUP_RAIL) }}>—</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span aria-hidden style={{ color: "#0b4a7d", fontSize: 10, width: 10, display: "inline-block" }}>{gOpen ? "\u25BC" : "\u25B6"}</span>
                        <span style={INVESTOR_NAME}>{g.name}</span>
                        <span style={{
                          fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em",
                          color: "#0b4a7d", background: "rgba(11,74,125,0.10)",
                          border: "1px solid rgba(11,74,125,0.28)", borderRadius: 999, padding: "1px 8px",
                        }}>{g.owners.length} STAKES</span>
                      </div>
                    </td>

                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700 }}>{pct(g.total)}</td>
                    {hasVal && <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{share(g.total, pv!.ye)}</td>}
                    {hasVal && <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{share(g.total, pv!.est)}</td>}
                    {/* A person's stakes get SEPARATE K-1s, so the roll-up
                        row takes no upload target — the interests below do.
                        It reports the COUNT instead, because with the block
                        collapsed that is the only place a missing K-1 shows. */}
                    {showK1 && k1 && (
                      <>
                        <td style={{ padding: "12px 16px" }} className="no-print">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <Pill tone={onFile === g.owners.length ? TONE_GREEN : TONE_RED}>
                              {onFile} OF {g.owners.length}
                            </Pill>
                            <span className="muted" style={{ fontSize: 11 }}>K-1s on file · one link</span>
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }} className="no-print" onClick={(e) => e.stopPropagation()}>
                          {k1.ownerFor(g.owners[0].id) && <K1PortalCell owner={k1.ownerFor(g.owners[0].id)!} k1={k1} />}
                        </td>
                      </>
                    )}
                  </tr>
                )];
                g.owners.forEach((inv) => {
                  rows.push(
                    // Rendered whether or not the block is open — `.screen-collapsed`
                    // hides it on screen only, so Print / PDF still produces the
                    // full schedule, one row per interest.
                    <tr key={inv.id} className={gOpen ? undefined : "screen-collapsed"} style={{ borderTop: "1px solid rgba(11,74,125,0.08)", background: k1?.uploading === inv.id ? "rgba(15,118,110,0.06)" : GROUP_SUB_BG }}>
                      {showK1 && <td className="no-print" style={GROUP_RAIL} />}
                      <td style={{ padding: "8px 16px", paddingLeft: 36, ...(showK1 ? null : GROUP_RAIL) }}>
                        {inv.vendorCode ? (
                          <span style={{
                            fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
                            padding: "1px 7px", borderRadius: 999,
                            background: "rgba(15,23,42,0.05)", color: "var(--text)",
                            border: "1px solid var(--border)",
                            display: "inline-block",
                          }}>{inv.vendorCode}</span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 16px", fontSize: 12, color: "var(--muted)" }}>
                        {inv.detailedName || <span style={{ fontStyle: "italic" }}>(direct)</span>}
                      </td>

                      <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 12 }}>{pct(ownershipFor(inv))}</td>
                      {hasVal && <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{share(ownershipFor(inv), pv!.ye)}</td>}
                      {hasVal && <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{share(ownershipFor(inv), pv!.est)}</td>}
                      {showK1 && k1 && (
                        <td style={{ padding: "8px 16px" }} className="no-print">
                          {k1.ownerFor(inv.id) && <K1Cell owner={k1.ownerFor(inv.id)!} k1={k1} />}
                        </td>
                      )}
                      {showK1 && <td className="no-print" />}
                    </tr>,
                  );
                });
                return rows;
      };

    return (
      <Fragment key={h.propertyCode}>
        <tr
          onClick={() => toggleOpen(h.propertyCode)}
          aria-expanded={open}
          style={{
            borderTop: "1px solid var(--border)", cursor: "pointer",
            background: open ? "rgba(11,74,125,0.05)" : undefined,
          }}
        >
          <td style={tdL}>
            <code style={{
              background: "#0b1220", color: "#e0f0ff",
              padding: "2px 8px", borderRadius: 5,
              fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
            }}>{h.propertyCode}</code>
          </td>
          <td style={{ ...tdL, whiteSpace: "normal" }}>
            <span style={{ fontWeight: 700, fontSize: 14.5 }}>{h.propertyName}</span>
            {h.hasK1Distribution && (
              <span style={{
                marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap",
                background: "rgba(15,118,110,0.08)", color: "#0f766e",
                border: "1px solid rgba(15,118,110,0.25)",
              }}>K-1</span>
            )}
          </td>
          <td style={{ ...td, color: "var(--muted)" }}>{h.owners.length}</td>
          <td style={td}>{hasVal ? money0(pv!.ye) : <span style={{ color: "var(--muted)" }}>&mdash;</span>}</td>
          <td style={{ ...td, fontWeight: 700 }}>{hasVal ? money0(pv!.est) : <span style={{ color: "var(--muted)", fontWeight: 400 }}>&mdash;</span>}</td>
          <td style={{ ...td, color: "var(--muted)", width: 30, paddingLeft: 0 }} aria-hidden>{open ? "▲" : "▼"}</td>
        </tr>
        {open && (
          <tr>
            {/* `maxWidth: 0` keeps this cell from contributing to the outer
                table's intrinsic width: without it a wide detail table (0800's
                is ~1700px) stretches the roster above it off the card instead
                of scrolling inside its own wrapper. */}
            <td colSpan={6} style={{ padding: 0, maxWidth: 0, background: "rgba(11,74,125,0.03)", borderTop: "1px solid var(--border)" }}>
          {showK1 && k1 && <K1Header k1={k1} />}
          {showK1 && k1reg.batch?.key === h.propertyCode && (
            <K1ShareResults batch={k1reg.batch} onClose={k1reg.clearBatch} />
          )}
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, borderTop: "1px solid var(--border)", ...(showK1 ? { minWidth: 1180 } : null) }}>
            <thead>
              <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                {showK1 && <th style={{ ...k1Th, width: 34, paddingRight: 0 }} className="no-print" aria-label="Select" />}
                <th style={{ padding: "10px 16px", fontWeight: 700, width: 140, whiteSpace: "nowrap" }}>VENDOR CODE</th>
                <th style={{ padding: "10px 16px", fontWeight: 700, ...(showK1 ? { minWidth: 190 } : null) }}>OWNER</th>

                <th style={{ padding: "10px 16px", fontWeight: 700, textAlign: "right" }}>OWNERSHIP %</th>
                {hasVal && <th style={{ padding: "10px 16px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>YEAR-END $</th>}
                {hasVal && <th style={{ padding: "10px 16px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>ESTIMATED $</th>}
                {showK1 && k1 && <th style={{ ...k1Th, whiteSpace: "nowrap" }} className="no-print">{k1.year} K-1</th>}
                {showK1 && <th style={{ ...k1Th, textAlign: "right" }} className="no-print">PORTAL</th>}
              </tr>
            </thead>
            <tbody>
              {ownerSections(h.owners).flatMap((sec) => [
                // An entity partner heads its own band, carrying its share of
                // the property and its own K-1 row; the investors behind it
                // read underneath, the way the K-1 schedule prints.
                ...(sec.entity ? [renderEntityBand(sec, h, pv, showK1, k1)] : []),
                ...(sec.label ? [(
                  <tr key={`band-${sec.key}`} style={{ background: GROUP_ROW_BG, borderTop: "2px solid var(--border)" }}>
                    {showK1 && <td className="no-print" style={GROUP_RAIL} />}
                    <td style={{ padding: "10px 16px", ...(showK1 ? null : GROUP_RAIL) }} colSpan={2}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#0b4a7d" }}>{sec.label}</span>
                      <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}>{sec.owners.length} investors</span>
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800 }}>{pct(sec.frac)}</td>
                    {hasVal && <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{share(sec.frac, pv!.ye)}</td>}
                    {hasVal && <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{share(sec.frac, pv!.est)}</td>}
                    {showK1 && k1 && <td className="no-print" colSpan={2} />}
                  </tr>
                )] : []),
                ...(sec.entity
                  ? sec.owners.map((sub) => renderSubOwner(sub, sec.entity!, h, pv, showK1))
                  : buildOwnerGroups(sec.owners).flatMap(renderOwnerGroup)),
              ])}
            </tbody>
            {hasVal && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "rgba(11,74,125,0.04)" }}>
                  {showK1 && <td className="no-print" />}
                  <td style={{ padding: "12px 16px", fontWeight: 800, letterSpacing: "0.04em", fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }} colSpan={3}>Property total</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800 }}>100.0%</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money0(pv!.ye)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money0(pv!.est)}</td>
                  {showK1 && <td className="no-print" colSpan={2} />}
                </tr>
              </tfoot>
            )}
          </table>
          </div>
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span className="muted small">Year-end as of {asOfLong()} · Estimated {estAsOfLabel}.</span>
            {hasVal && (
              <button type="button" className="btn no-print" style={{ fontSize: 12, padding: "5px 10px", fontWeight: 600 }} onClick={() => exportPropertySoV(h)}>⤓ Excel</button>
            )}
          </div>
          {/* The rest of the return, which arrives with the K-1 batch. Staff
              only — never circulated to investors. */}
          {canK1 && <PartnershipTaxDocs propertyCode={h.propertyCode} defaultOpen={false} />}
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Investor Info</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            Ownership detail across properties · {totalInvestors} unique investor{totalInvestors === 1 ? "" : "s"} across {totalHoldings} {totalHoldings === 1 ? "property" : "properties"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
            <div>COMMERCIAL</div><div>PROPERTIES</div>
          </div>
        </div>
      </header>

      {/* ── View toggle + search + exports ──────────────────────────────── */}
      <div className="card no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div role="tablist" aria-label="View" style={{
            display: "inline-flex", border: "1px solid var(--border)", borderRadius: 999,
            overflow: "hidden", background: "var(--card)",
          }}>
            {[
              { id: "property" as const, label: "By Property" },
              { id: "investor" as const, label: "By Investor" },
              { id: "statement" as const, label: "Statement of Values" },
            ].map((v) => {
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  role="tab"
                  aria-selected={active}
                  style={{
                    padding: "6px 14px", fontSize: 12, fontWeight: 700,
                    background: active ? "var(--brand)" : "transparent",
                    color: active ? "#fff" : "var(--text)",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          {view === "statement" ? (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", whiteSpace: "nowrap" }}>Owner</span>
              {/* The control this tab is driven by, so it takes the brand tier.
                  It sizes to its content — stretched across the toolbar it read
                  as a text field rather than a picker. */}
              <Select value={beneficiary} onChange={setBeneficiary} aria-label="Owner">
                <option value="">All entities (portfolio)</option>
                {benNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </label>
          ) : (
            /* Border, radius and focus ring come from the input baseline in
               globals.css — only the width is this page's business. */
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search investors, vendor codes, properties…"
              style={{ flex: 1, minWidth: 220 }}
            />
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {view === "statement" ? (
              <DownloadMenu
                label={zipping ? "Building…" : "Download"}
                variant="primary"
                disabled={zipping}
                items={[
                  { label: "PDF — presentation", description: beneficiary ? `${beneficiary}'s statement, ready to send` : "Portfolio statement, ready to circulate", onClick: () => { void exportStatementPdf(); } },
                  { label: "Excel — workbook", description: "Live SUM totals; year-end + estimated values", onClick: exportStatement },
                  ...(!beneficiary ? [{ label: "All owner statements (ZIP)", description: `One PDF per owner + the portfolio — the annual mailing (${benNames.length} owners)`, onClick: () => { void exportAllOwnerStatements(); } }] : []),
                ]}
              />
            ) : null}
            {view === "statement" && beneficiary && canEdit && (
              <SendStatementButton beneficiary={beneficiary} email={resolveContact(beneficiary)?.email} />
            )}
            {view === "statement" ? null : (
              <>
                <button
                  type="button"
                  onClick={exportToExcel}
                  className="btn"
                  title="Download ownership data as an Excel workbook"
                  style={{ fontSize: 12 }}
                >
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn"
                  title="Print or Save as PDF"
                  style={{ fontSize: 12 }}
                >
                  Print / PDF
                </button>
              </>
            )}
          </div>
        </div>

        <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
          Source: <code>lib/properties/ownership.ts</code> — the canonical ownership table. The Filing Tracker K-1 task investors derive from the same data.
        </p>
      </div>

      {/* ── By Property view ───────────────────────────────────────────── */}
      {view === "property" && (
        filteredHoldings.length === 0 ? (
          <div className="card muted small">No matches.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...thL, width: 90 }}>Code</th>
                  <th style={thL}>Property</th>
                  <th style={th}>Owners</th>
                  <th style={th}>Year-end $</th>
                  <th style={th}>Estimated $</th>
                  <th style={{ ...th, width: 30 }} aria-label="Expand" />
                </tr>
              </thead>
              <tbody>
                {propertyBlocks.map((b) =>
                  b.kind === "prop" ? renderHoldingRows(b.h) : (
                    <tr key={b.key} style={{
                      background: b.sub ? "rgba(11,74,125,0.035)" : TYPE_STYLE[b.type].bg,
                      borderTop: "2px solid var(--border)",
                    }}>
                      <td style={{ ...tdL, paddingTop: 9, paddingBottom: 9, whiteSpace: "normal" }} colSpan={2}>
                        <span style={{
                          fontSize: b.sub ? 12 : 12.5, fontWeight: 800,
                          letterSpacing: "0.06em", textTransform: "uppercase",
                          color: b.sub ? "var(--muted)" : TYPE_STYLE[b.type].text,
                          paddingLeft: b.sub ? 14 : 0,
                        }}>{b.label}</span>
                        <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}>
                          {b.count} {b.count === 1 ? "property" : "properties"}
                        </span>
                      </td>
                      {/* Owners is a per-property count; summing it across a
                          group would count a person once per stake. */}
                      <td />
                      <td style={{ ...td, fontWeight: 700 }}>{money0(b.ye)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{money0(b.est)}</td>
                      <td />
                    </tr>
                  ),
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "rgba(11,74,125,0.04)" }}>
                  <td style={{ ...tdL, fontWeight: 800 }} colSpan={2}>
                    Portfolio total — {filteredHoldings.length} {filteredHoldings.length === 1 ? "property" : "properties"}
                  </td>
                  <td />
                  <td style={{ ...td, fontWeight: 800 }}>{money0(portfolioValue.ye)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{money0(portfolioValue.est)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <div className="muted small" style={{ padding: "9px 12px", borderTop: "1px solid var(--border)" }}>
              Year-end as of {asOfLong()} · Estimated {estAsOfLabel}. Select a property for its owners.
            </div>
          </div>
        )
      )}
      {/* ── By Investor view ───────────────────────────────────────────── */}
      {view === "investor" && (
        filteredInvestors.length === 0 ? (
          <div className="card muted small">No matches.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={thL}>Investor</th>
                  <th style={th}>Properties</th>
                  <th style={th}>Year-end $</th>
                  <th style={th}>Estimated $</th>
                  <th style={{ ...thL, width: 1 }} aria-label="Actions" />
                  <th style={{ ...th, width: 30 }} aria-label="Expand" />
                </tr>
              </thead>
              <tbody>
                {filteredInvestors.map((agg) => {
                  const open = !!openIds[agg.key];
                  // The K-1 columns join this table too — the standalone block under
                  // it repeated prop, name and vendor code from the rows above.
                  if (canK1 && open) k1reg.ensureInvestor(agg.name);
                  const inv = canK1 && open ? k1reg.investorSlice(agg.name) : null;
                  const totals = agg.rows.reduce((a, r) => {
                    const p = propValue(r.holding.propertyCode);
                    const frac = ownershipFor(r.investor) ?? 0;
                    return { ye: a.ye + (p ? frac * p.ye : 0), est: a.est + (p ? frac * p.est : 0) };
                  }, { ye: 0, est: 0 });
                  return (
                    <Fragment key={agg.key}>
                      <tr
                        onClick={() => toggleOpen(agg.key)}
                        aria-expanded={open}
                        style={{
                          borderTop: "1px solid var(--border)", cursor: "pointer",
                          background: open ? "rgba(11,74,125,0.05)" : undefined,
                        }}
                      >
                        <td style={{ ...tdL, whiteSpace: "normal" }}>
                          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{agg.name}</span>
                        </td>
                        <td style={{ ...td, color: "var(--muted)" }}>{agg.rows.length}</td>
                        <td style={td}>{money0(totals.ye)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{money0(totals.est)}</td>
                        {/* Actions live in the row, not a card header — but a click
                            in here must not toggle the row open underneath them. */}
                        <td style={{ ...tdL, whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                            {inv && <K1InvestorShare name={agg.name} inv={inv} />}
                            {beneficiaryMatch(agg.name) && (
                              <button
                                type="button"
                                onClick={() => goToOwnerStatement(agg.name)}
                                className="linkBtn"
                                title={`View ${agg.name}'s Statement of Values`}
                                style={{ fontSize: 12, fontWeight: 700, color: "#0b4a7d", whiteSpace: "nowrap" }}
                              >
                                Statement of Values →
                              </button>
                            )}
                          </span>
                        </td>
                        <td style={{ ...td, color: "var(--muted)", width: 30, paddingLeft: 0 }} aria-hidden>{open ? "▲" : "▼"}</td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0, background: "rgba(11,74,125,0.03)", borderTop: "1px solid var(--border)" }}>
                      {/* The hub. An investor's details belong on the investor,
                          not spread over the Statement of Values tab and the
                          inside of a share popover. */}
                      <div style={{ padding: "14px 16px 4px", maxWidth: 640 }}>
                        <InvestorContactCard
                          name={agg.name}
                          contact={resolveContact(agg.name)}
                          canEdit={canEdit}
                          onSave={saveContact}
                        />
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, borderTop: "1px solid var(--border)" }}>
                        <thead>
                          <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                            <th style={{ padding: "10px 16px", fontWeight: 700, width: 70 }}>PROP</th>
                            <th style={{ padding: "10px 16px", fontWeight: 700 }}>PROPERTY</th>
                            <th style={{ padding: "10px 16px", fontWeight: 700, width: 140, whiteSpace: "nowrap" }}>VENDOR CODE</th>
                            <th style={{ padding: "10px 16px", fontWeight: 700 }}>ADDRESS</th>
                            <th style={{ padding: "10px 16px", fontWeight: 700, textAlign: "right" }}>OWNERSHIP %</th>
                            <th style={{ padding: "10px 16px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>YEAR-END $</th>
                            <th style={{ padding: "10px 16px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>ESTIMATED $</th>
                            {inv && <th style={{ padding: "10px 16px", fontWeight: 700, whiteSpace: "nowrap" }} className="no-print">K-1</th>}
                            {inv && <th style={{ padding: "10px 16px", fontWeight: 700, textAlign: "right" }} className="no-print">PORTAL</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {agg.rows.map((r, i) => {
                            const ipv = propValue(r.holding.propertyCode);
                            const ifrac = ownershipFor(r.investor);
                            return (
                            <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ padding: "12px 16px" }}>{r.holding.propertyCode}</td>
                              <td style={{ padding: "12px 16px" }}>
                                <div style={{ fontWeight: 600 }}>{r.holding.propertyName}</div>
                                {r.investor.detailedName && (
                                  <div className="muted small" style={{ marginTop: 2 }}>{r.investor.detailedName}</div>
                                )}
                              </td>
                              <td style={{ padding: "12px 16px" }}>
                                {r.investor.vendorCode ? (
                                  <span style={{
                                    fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                                    padding: "2px 8px", borderRadius: 999,
                                    background: "rgba(15,23,42,0.05)", color: "var(--text)",
                                    border: "1px solid var(--border)",
                                    display: "inline-block",
                                  }}>{r.investor.vendorCode}</span>
                                ) : (
                                  <span style={{ color: "var(--muted)" }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: 12.5 }}>
                                {[r.investor.address, r.investor.city, r.investor.state, r.investor.zip].filter(Boolean).join(", ") || "—"}
                              </td>
                              <td style={{ padding: "12px 16px", textAlign: "right" }}>{pct(ifrac)}</td>
                              <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ipv ? money0((ifrac ?? 0) * ipv.ye) : "—"}</td>
                              <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{ipv ? money0((ifrac ?? 0) * ipv.est) : "—"}</td>
                              {inv && <K1InvestorCells interest={inv.forOwner(r.investor.id)} inv={inv} />}
                            </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "2px solid var(--border)", background: "rgba(11,74,125,0.04)" }}>
                            <td style={{ padding: "12px 16px", fontWeight: 800, letterSpacing: "0.04em", fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }} colSpan={4}>Total across {agg.rows.length} {agg.rows.length === 1 ? "property" : "properties"}</td>
                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money0(agg.rows.reduce((s, r) => { const p = propValue(r.holding.propertyCode); return s + (p ? (ownershipFor(r.investor) ?? 0) * p.ye : 0); }, 0))}</td>
                            <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money0(agg.rows.reduce((s, r) => { const p = propValue(r.holding.propertyCode); return s + (p ? (ownershipFor(r.investor) ?? 0) * p.est : 0); }, 0))}</td>
                            {inv && <td className="no-print" colSpan={2} />}
                          </tr>
                        </tfoot>
                      </table>
                      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <span className="muted small">Year-end as of {asOfLong()} · Estimated {estAsOfLabel}.</span>
                        <button type="button" className="btn no-print" style={{ fontSize: 12, padding: "5px 10px", fontWeight: 600 }} onClick={() => exportInvestorSoV(agg)}>⤓ Excel</button>
                      </div>
                      {inv && k1reg.batch?.key === `inv:${agg.name}` && (
                        <K1ShareResults batch={k1reg.batch} onClose={k1reg.clearBatch} />
                      )}
                      {inv?.error && (
                        <div style={{ padding: "8px 16px", color: "#b91c1c", fontSize: 12.5, fontWeight: 600 }} className="no-print">{inv.error}</div>
                      )}
                      {inv && (
                        <div className="muted no-print" style={{ padding: "0 16px 10px", fontSize: 11.5 }}>
                          K-1s are uploaded on the property — they arrive as one batch per partnership. Sending here
                          re-sends that investor&rsquo;s own link.
                        </div>
                      )}
                      <InvestorStructureBlock investorName={agg.name} structure={structureFor(agg.name)} canEdit={canEdit} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "rgba(11,74,125,0.04)" }}>
                  <td style={{ ...tdL, fontWeight: 800 }}>
                    {filteredInvestors.length} {filteredInvestors.length === 1 ? "investor" : "investors"}
                  </td>
                  {/* Deliberately no totals: an investor holds a share of a
                      property, and two investors in the same property would
                      have their slices added to something that is not a figure. */}
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
            <div className="muted small" style={{ padding: "9px 12px", borderTop: "1px solid var(--border)" }}>
              Year-end as of {asOfLong()} · Estimated {estAsOfLabel}. Select an investor for their holdings.
            </div>
          </div>
        )
      )}

      {/* ── Statement of Values view ───────────────────────────────────── */}
      {view === "statement" && <StatementView beneficiary={beneficiary} estimates={estimates} onSaveEstimates={saveEstimates} resolveContact={resolveContact} canEdit={canEdit} onSaveContact={saveContact} ownerNames={benNames} onPickOwner={setBeneficiary} entityOverrides={entityOverrides} onSaveEntity={saveEntity} />}

      <p className="muted small" style={{ marginTop: 4 }}>
        {view === "statement" ? (
          <>Statement of values sourced from <code>lib/properties/entityValues.ts</code> (entity financials, {asOfLong()} snapshot) and <code>lib/properties/beneficiaries.ts</code> (ownership map). Each owner&rsquo;s value = their effective % × the entity&rsquo;s equity value.</>
        ) : (
          <>Source of truth: <code>lib/properties/ownership.ts</code>. Filing Tracker K-1 investors are derived from this file.</>
        )}
      </p>
    </main>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--muted)", transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", flexShrink: 0 }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/** Supplementary partnership / trustee structure shown inside the
 *  investor card. Only renders when the investor has an entry in
 *  lib/investors/structures.ts (e.g. Hyman Korman Co.). */
function InvestorStructureBlock({ investorName, structure, canEdit }: { investorName: string; structure: InvestorStructure | null; canEdit: boolean }) {
  const [structureOpen, setStructureOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const dirKey = normInvestorKey(investorName);
  const [trusteeOverrides, setTrusteeOverrides] = useState<Record<string, TrusteeRowOverride>>({});
  const [editRow, setEditRow] = useState<string | null>(null); // normalized name being edited, or "__new__"
  const hasDirectory = !!structure?.directory;
  useEffect(() => {
    if (!hasDirectory) return;
    fetch(`/api/ownership/trustees?dir=${encodeURIComponent(dirKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.overrides) setTrusteeOverrides(d.overrides); })
      .catch(() => {});
  }, [dirKey, hasDirectory]);

  async function saveTrustee(key: string, row: (TrusteeRowOverride) | null): Promise<boolean> {
    try {
      const res = await fetch("/api/ownership/trustees", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: dirKey, key, row }),
      });
      if (!res.ok) return false;
      const d = await res.json();
      setTrusteeOverrides(d.overrides ?? {});
      return true;
    } catch { return false; }
  }

  if (!structure) return null;

  const dirRows = structure.directory ? mergeTrusteeRows(structure.directory.rows, trusteeOverrides) : [];
  const safeName = investorName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  const stamp = new Date().toISOString().slice(0, 10);

  function downloadStructure() {
    const rows = structure!.entries.flatMap((e) =>
      e.trustees.length === 0
        ? [{
            "Entity / Trust": e.entity,
            "Type": e.type,
            "Role": e.role,
            "Trustee / Partner": "",
            "Capacity": "",
          }]
        : e.trustees.map((t) => ({
            "Entity / Trust": e.entity,
            "Type": e.type,
            "Role": e.role,
            "Trustee / Partner": t.trustee,
            "Capacity": t.capacity ?? "",
          })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Structure");
    XLSX.writeFile(wb, `${safeName}_Structure_${stamp}.xlsx`);
  }

  function downloadDirectory() {
    if (!structure!.directory) return;
    const rows = dirRows.map((r) => ({
      "Trustee / Partner Name": r.name,
      "Email": r.email ?? "",
      "Address": r.address,
      "City": r.city,
      "State": r.state,
      "Zip": r.zip ?? "",
      "Serving Individually?": r.servingIndividually,
      "Trust(s) / Entity": r.trusts,
      "Source Will / Instrument": r.sourceInstrument,
      "Notes": r.notes ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Trustee Directory");
    XLSX.writeFile(wb, `${safeName}_Trustee_Directory_${stamp}.xlsx`);
  }

  return (
    <>
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setStructureOpen((v) => !v)}
            aria-expanded={structureOpen}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "transparent", border: "none", padding: 0,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}
          >
            <Chevron open={structureOpen} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
              {structure.title}
            </span>
            <span className="muted small">{structure.entries.length}</span>
          </button>
          <button
            type="button"
            onClick={downloadStructure}
            className="btn"
            style={{ fontSize: 12, padding: "5px 10px", fontWeight: 600 }}
          >⤓ Excel</button>
        </div>
        {structureOpen && structure.subtitle && (
          <div className="muted small" style={{ marginTop: 4 }}>{structure.subtitle}</div>
        )}
        {structureOpen && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top" }}>ENTITY / TRUST</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top", width: 180, whiteSpace: "nowrap" }}>TYPE</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top", width: 200 }}>ROLE</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top" }}>TRUSTEE / PARTNER</th>
              </tr>
            </thead>
            <tbody>
              {structure.entries.map((e, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 10px", verticalAlign: "top", fontWeight: 600, lineHeight: 1.4 }}>
                    {e.entity}
                  </td>
                  <td style={{ padding: "10px 10px", verticalAlign: "top", color: "var(--muted)" }}>{e.type}</td>
                  <td style={{ padding: "10px 10px", verticalAlign: "top" }}>{e.role}</td>
                  <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                    {e.trustees.length === 0 ? (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {e.trustees.map((t, j) => (
                          <div key={j} style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontWeight: 600 }}>{t.trustee}</span>
                            {t.capacity && (
                              <span className="muted small">{t.capacity}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {structure.directory && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setDirectoryOpen((v) => !v)}
              aria-expanded={directoryOpen}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "transparent", border: "none", padding: 0,
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
            >
              <Chevron open={directoryOpen} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
                {structure.directory.title}
              </span>
              <span className="muted small">{dirRows.length}</span>
            </button>
            <div style={{ display: "inline-flex", gap: 8 }}>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { setDirectoryOpen(true); setEditRow("__new__"); }}
                  className="btn"
                  style={{ fontSize: 12, padding: "5px 10px", fontWeight: 600 }}
                >+ Add trustee</button>
              )}
              <button
                type="button"
                onClick={downloadDirectory}
                className="btn"
                style={{ fontSize: 12, padding: "5px 10px", fontWeight: 600 }}
              >⤓ Excel</button>
            </div>
          </div>
          {directoryOpen && (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            {editRow !== null && (
              <TrusteeEditor
                key={editRow}
                row={editRow === "__new__" ? null : dirRows.find((r) => normInvestorKey(r.name) === editRow) ?? null}
                onCancel={() => setEditRow(null)}
                onSave={async (row) => { const ok = await saveTrustee(row.name, row); if (ok) setEditRow(null); return ok; }}
                onDelete={editRow !== "__new__" ? async () => { const name = dirRows.find((r) => normInvestorKey(r.name) === editRow)?.name ?? editRow; const ok = await saveTrustee(name, { name, deleted: true } as TrusteeRowOverride); if (ok) setEditRow(null); return ok; } : undefined}
              />
            )}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top", width: 180 }}>NAME</th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top" }}>ADDRESS</th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top", width: 110, whiteSpace: "nowrap" }}>SERVING INDIVIDUALLY?</th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top" }}>TRUST(S) / ENTITY</th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top", width: 180 }}>SOURCE WILL / INSTRUMENT</th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, verticalAlign: "top" }}>NOTES</th>
                </tr>
              </thead>
              <tbody>
                {dirRows.map((r, i) => {
                  const cityState = [r.city, r.state, r.zip].filter(Boolean).join(", ").replace(/, ([A-Z]{2}|Canada), (\d{5})/, ", $1 $2");
                  return (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 10px", verticalAlign: "top", fontWeight: 600 }}>
                        <div>{r.name}</div>
                        {r.email && (
                          <a href={`mailto:${r.email}`} className="small" style={{ marginTop: 2, display: "inline-block", color: "var(--brand)", fontWeight: 500, wordBreak: "break-all" }}>{r.email}</a>
                        )}
                        {canEdit && (
                          <button type="button" className="no-print" onClick={() => setEditRow(normInvestorKey(r.name))}
                            style={{ display: "block", marginTop: 4, background: "transparent", border: "none", padding: 0, color: "var(--brand)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                        )}
                      </td>
                      <td style={{ padding: "10px 10px", verticalAlign: "top", lineHeight: 1.4 }}>
                        <div>{r.address}</div>
                        <div className="muted small" style={{ marginTop: 2 }}>{cityState}</div>
                      </td>
                      <td style={{ padding: "10px 10px", verticalAlign: "top" }}>{r.servingIndividually}</td>
                      <td style={{ padding: "10px 10px", verticalAlign: "top", lineHeight: 1.5 }}>
                        {r.trusts.split(/;\s*/).map((s, j, arr) => (
                          <span key={j}>
                            {s}{j < arr.length - 1 ? <span style={{ color: "var(--muted)" }}> · </span> : null}
                          </span>
                        ))}
                      </td>
                      <td style={{ padding: "10px 10px", verticalAlign: "top", color: "var(--muted)" }}>{r.sourceInstrument}</td>
                      <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                        {r.notes ?? <span style={{ color: "var(--muted)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </>
  );
}

/** Inline add/edit form for one trustee-directory row (authorized users only). */
function TrusteeEditor({ row, onSave, onCancel, onDelete }: {
  row: { name: string; email?: string; address: string; city: string; state: string; zip?: string; servingIndividually: string; trusts: string; sourceInstrument: string; notes?: string } | null;
  onSave: (row: TrusteeRowOverride) => Promise<boolean>;
  onCancel: () => void;
  onDelete?: () => Promise<boolean>;
}) {
  const [f, setF] = useState({
    name: row?.name ?? "", email: row?.email ?? "", address: row?.address ?? "", city: row?.city ?? "",
    state: row?.state ?? "", zip: row?.zip ?? "", servingIndividually: row?.servingIndividually ?? "",
    trusts: row?.trusts ?? "", sourceInstrument: row?.sourceInstrument ?? "", notes: row?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const inp: React.CSSProperties = { padding: "6px 9px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)", fontFamily: "inherit", fontSize: 12, width: "100%" };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: 3 };
  const field = (label: string, k: keyof typeof f, wide = false) => (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <label style={lbl}>{label}</label>
      <input value={f[k]} onChange={set(k)} style={inp} />
    </div>
  );

  async function commit() {
    if (!f.name.trim()) return;
    setSaving(true);
    const ok = await onSave({ ...f, name: f.name.trim() });
    setSaving(false);
    if (!ok) return;
  }

  return (
    <div className="no-print" style={{ marginBottom: 14, padding: 14, border: "1px dashed var(--border)", borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
        {row ? `Edit trustee · ${row.name}` : "Add trustee"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        {field("Name", "name")}
        {field("Email", "email")}
        {field("Serving individually?", "servingIndividually")}
        <div />
        {field("Address", "address", true)}
        {field("City", "city")}
        {field("State", "state")}
        {field("Zip", "zip")}
        <div />
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Trust(s) / Entity</label>
          <textarea value={f.trusts} onChange={set("trusts")} rows={2} style={{ ...inp, resize: "vertical" }} />
        </div>
        {field("Source Will / Instrument", "sourceInstrument", true)}
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Notes</label>
          <textarea value={f.notes} onChange={set("notes")} rows={2} style={{ ...inp, resize: "vertical" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button type="button" className="btn primary" disabled={saving || !f.name.trim()} onClick={commit} style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700 }}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" className="btn" disabled={saving} onClick={onCancel} style={{ fontSize: 12, padding: "6px 12px" }}>Cancel</button>
        {onDelete && (
          <button type="button" className="btn" disabled={saving} onClick={() => { void onDelete(); }} style={{ fontSize: 12, padding: "6px 12px", marginLeft: "auto", color: "#b91c1c" }}>Remove</button>
        )}
      </div>
    </div>
  );
}

/** Inline editor for one entity's full financial row (authorized users only).
 *  Overlays the seed; unchanged fields fall back so pre-seeded rows are intact. */
function EntityEditor({ entity, hasOverride, onSave, onCancel, onReset }: {
  entity: NonNullable<ReturnType<typeof entityValue>>;
  hasOverride: boolean;
  onSave: (ov: EntityOverride) => Promise<boolean>;
  onCancel: () => void;
  onReset: () => Promise<boolean>;
}) {
  const numStr = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [f, setF] = useState({
    name: entity.name,
    noi: numStr(entity.noi),
    capRate: entity.capRate == null ? "" : String(+(entity.capRate * 100).toFixed(4)),
    indicatedValue: numStr(entity.indicatedValue),
    debtBalance: numStr(entity.debtBalance),
    cash: numStr(entity.cash),
    futureCapital: numStr(entity.futureCapital),
    equityValue: numStr(entity.equityValue),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const parse = (v: string): number | null => { const t = v.replace(/[$,\s]/g, ""); if (t === "") return null; const n = Number(t); return Number.isFinite(n) ? n : null; };

  const inp: React.CSSProperties = { padding: "6px 9px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)", fontFamily: "inherit", fontSize: 12, width: "100%", textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: 3 };
  const moneyField = (label: string, k: keyof typeof f) => (
    <div><label style={lbl}>{label}</label><input inputMode="decimal" value={f[k]} onChange={set(k)} style={inp} /></div>
  );

  // Suggested equity = indicated − debt + cash − future capital (helper).
  const suggestedEquity = (parse(f.indicatedValue) ?? 0) - (parse(f.debtBalance) ?? 0) + (parse(f.cash) ?? 0) - (parse(f.futureCapital) ?? 0);

  async function commit() {
    setSaving(true);
    const ov: EntityOverride = {
      name: f.name.trim(),
      noi: parse(f.noi),
      capRate: f.capRate.trim() === "" ? null : (parse(f.capRate) ?? 0) / 100,
      indicatedValue: parse(f.indicatedValue),
      debtBalance: parse(f.debtBalance),
      cash: parse(f.cash),
      futureCapital: parse(f.futureCapital),
      equityValue: parse(f.equityValue),
    };
    const ok = await onSave(ov);
    setSaving(false);
    void ok;
  }

  return (
    <div className="no-print" style={{ padding: 14, border: "1px dashed var(--border)", borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
        Edit entity · <code style={{ fontSize: 11 }}>{entity.entity}</code>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <div style={{ gridColumn: "1 / 3" }}><label style={lbl}>Name</label><input value={f.name} onChange={set("name")} style={{ ...inp, textAlign: "left" }} /></div>
        {moneyField("NOI", "noi")}
        <div><label style={lbl}>Cap rate %</label><input inputMode="decimal" value={f.capRate} onChange={set("capRate")} style={inp} /></div>
        {moneyField("Indicated value", "indicatedValue")}
        {moneyField("Debt balance", "debtBalance")}
        {moneyField("Cash", "cash")}
        {moneyField("Future capital", "futureCapital")}
        <div>
          <label style={lbl}>Equity value</label>
          <input inputMode="decimal" value={f.equityValue} onChange={set("equityValue")} style={inp} />
          {Math.round(suggestedEquity) !== Math.round(parse(f.equityValue) ?? 0) && (
            <button type="button" onClick={() => setF((p) => ({ ...p, equityValue: String(Math.round(suggestedEquity)) }))}
              className="small" style={{ marginTop: 3, background: "transparent", border: "none", padding: 0, color: "var(--brand)", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>
              = {money0(suggestedEquity)} (indicated − debt + cash − future cap)
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button type="button" className="btn primary" disabled={saving || !f.name.trim()} onClick={commit} style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700 }}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" className="btn" disabled={saving} onClick={onCancel} style={{ fontSize: 12, padding: "6px 12px" }}>Cancel</button>
        {hasOverride && <button type="button" className="btn" disabled={saving} onClick={() => { void onReset(); }} style={{ fontSize: 12, padding: "6px 12px", marginLeft: "auto", color: "#b91c1c" }}>Reset to seed</button>}
      </div>
    </div>
  );
}

/** Δ vs. year-end, shown next to the estimate when it differs. */
function DeltaTag({ base, now }: { base: number; now: number }) {
  if (!base || Math.round(now) === Math.round(base)) return null;
  const d = now - base;
  const pct = (d / base) * 100;
  const up = d > 0;
  return (
    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: up ? "#15803d" : "#b91c1c" }}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/** Small residency chip derived from the owner's mailing address. Flags likely
 *  nonresident owners (PA withholding indicator); silent when unknown. */
function ResidencyChip({ contact }: { contact: OwnerContact | undefined }) {
  const r = residencyOf(contact?.address);
  if (r.category === "unknown") return null;
  const amber = r.nonresident;
  return (
    <span
      title={r.nonresident ? "Likely nonresident — may be subject to PA nonresident withholding (confirm with CPA)" : "PA resident"}
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999,
        background: amber ? "rgba(217,119,6,0.10)" : "rgba(15,23,42,0.05)",
        color: amber ? "#b45309" : "var(--muted)",
        border: `1px solid ${amber ? "rgba(217,119,6,0.30)" : "var(--border)"}`,
      }}
    >{r.label}</span>
  );
}

/** Manual "email this statement to the owner" action — gated + confirmed, never
 *  automatic. Disabled until the owner has an email on file. */
function SendStatementButton({ beneficiary, email }: { beneficiary: string; email?: string }) {
  const [state, setState] = useState<"idle" | "confirm" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send() {
    setState("sending");
    try {
      const res = await fetch("/api/ownership/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beneficiary }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error || "Send failed."); setState("error"); return; }
      setMsg(`Sent to ${d.sentTo || email}`); setState("sent");
    } catch { setMsg("Send failed."); setState("error"); }
  }

  if (!email) {
    return <span className="muted small" title="Add an email to this owner's contact to enable sending" style={{ alignSelf: "center" }}>No email on file</span>;
  }
  if (state === "sent") return <span className="small" style={{ alignSelf: "center", color: "#15803d", fontWeight: 600 }}>✓ {msg}</span>;
  if (state === "confirm" || state === "sending") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span className="small" style={{ color: "var(--muted)" }}>Email to {email}?</span>
        <button type="button" className="btn primary" disabled={state === "sending"} onClick={send} style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700 }}>{state === "sending" ? "Sending…" : "Send"}</button>
        <button type="button" className="btn" disabled={state === "sending"} onClick={() => setState("idle")} style={{ fontSize: 12, padding: "6px 12px" }}>Cancel</button>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button type="button" className="btn" onClick={() => setState("confirm")} title={`Email ${beneficiary}'s statement`} style={{ fontSize: 12, padding: "8px 14px", fontWeight: 700 }}>Email to owner</button>
      {state === "error" && <span className="small" style={{ color: "#b91c1c" }}>{msg}</span>}
    </span>
  );
}

/** Owner send-to contact line, with an inline editor for authorized users
 *  (Harry / Alison / Drew). Empty + editable shows an "Add contact" affordance. */
function StatementView({ beneficiary, estimates, onSaveEstimates, resolveContact, canEdit, onSaveContact, ownerNames, onPickOwner, entityOverrides, onSaveEntity }: {
  beneficiary: string;
  estimates: OwnershipEstimates;
  onSaveEstimates: (next: OwnershipEstimates) => Promise<boolean>;
  resolveContact: (name: string) => OwnerContact | undefined;
  canEdit: boolean;
  onSaveContact: (name: string, override: Partial<OwnerContact> | null) => Promise<boolean>;
  ownerNames: string[];
  onPickOwner: (name: string) => void;
  entityOverrides: EntityOverrides;
  onSaveEntity: (code: string, override: EntityOverride | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [asOfDraft, setAsOfDraft] = useState(estimates.asOf);
  const [saving, setSaving] = useState(false);
  const [editEntity, setEditEntity] = useState<string | null>(null);

  const codeChip = (code?: string) =>
    code ? (
      <code style={{
        background: "#0b1220", color: "#e0f0ff",
        padding: "1px 6px", borderRadius: 4,
        fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      }}>{code}</code>
    ) : null;

  // The shared roster footprint, so this tab reads as the same kind of table
  // as By Property and By Investor rather than a third variant.
  const numTd = td;
  const colHead = thL;
  const colHeadR = th;
  const estLabel = estimates.asOf ? `EST. (${longDate(estimates.asOf).toUpperCase()})` : "EST. (TODAY)";

  function beginEdit() {
    const d: Record<string, string> = {};
    for (const e of ENTITY_VALUES) {
      const ov = estimates.values[e.entity];
      if (ov != null) d[e.entity] = String(ov);
    }
    setDraft(d);
    setAsOfDraft(estimates.asOf || new Date().toISOString().slice(0, 10));
    setEditing(true);
  }
  async function commit() {
    setSaving(true);
    // Persist only values that differ from year-end (others revert to default).
    const values: Record<string, number> = {};
    for (const e of ENTITY_VALUES) {
      const raw = (draft[e.entity] ?? "").replace(/[$,\s]/g, "");
      if (raw === "") continue;
      const n = Number(raw);
      if (Number.isFinite(n) && Math.round(n) !== Math.round(resolveEquity(e.entity, entityOverrides))) values[e.entity] = Math.round(n);
    }
    const ok = await onSaveEstimates({ asOf: asOfDraft, values });
    setSaving(false);
    if (ok) setEditing(false);
  }

  // ── Portfolio (no owner selected) ──────────────────────────────────────
  if (!beneficiary) {
    const rows = ENTITY_VALUES.map((e) => resolveEntity(e.entity, entityOverrides)!).sort((a, b) => (b.equityValue ?? 0) - (a.equityValue ?? 0));
    const sum = (f: (e: typeof ENTITY_VALUES[number]) => number | null | undefined) =>
      rows.reduce((s, e) => s + (f(e) ?? 0), 0);
    const estTotal = rows.reduce((s, e) => s + estimateFor(e.entity, estimates, entityOverrides), 0);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="pills">
          <StatPill label="Total equity value" value={money0(ENTITY_VALUES.reduce((s, e) => s + resolveEquity(e.entity, entityOverrides), 0))} sub={`as of ${asOfLong()}`} />
          <StatPill label="Est. value today" value={money0(estTotal)} sub={estimates.asOf ? `as of ${longDate(estimates.asOf)}` : "= year-end (not yet set)"} />
          <StatPill label="Total debt" value={money0(sum((e) => e.debtBalance))} />
          <StatPill label="Entities" value={rows.length} />
        </div>

        {(() => {
          const missing = ownerNames.filter((n) => { const c = resolveContact(n); return !c || (!c.address && !c.email); });
          if (missing.length === 0) return null;
          return (
            <div className="card no-print" style={{ borderLeft: "3px solid #d97706", background: "rgba(217,119,6,0.05)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {missing.length} of {ownerNames.length} owners have no send-to contact
              </div>
              <div className="muted small" style={{ marginBottom: 8 }}>Add a mailing address or email before the annual mailing so each statement is ready to send.{canEdit ? " Click a name to add it." : ""}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {missing.map((n) => (
                  <button key={n} type="button" onClick={() => onPickOwner(n)}
                    style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(217,119,6,0.3)", background: "var(--card)", color: "var(--text)", cursor: "pointer", fontFamily: "inherit" }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {(() => {
          const nonres = ownerNames
            .map((n) => ({ n, r: residencyOf(resolveContact(n)?.address) }))
            .filter((x) => x.r.nonresident);
          if (nonres.length === 0) return null;
          return (
            <div className="card no-print" style={{ borderLeft: "3px solid #b45309", background: "rgba(217,119,6,0.04)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {nonres.length} nonresident owner{nonres.length === 1 ? "" : "s"} — potential PA withholding
              </div>
              <div className="muted small" style={{ marginBottom: 8 }}>
                Out-of-state / foreign owners may be subject to PA nonresident tax withholding (3.07% of PA-source income) — and other-state withholding for non-PA properties. This is a K-1-time determination; <strong>confirm with your CPA</strong>. Owners with no address on file aren&rsquo;t assessed here.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {nonres.map(({ n, r }) => (
                  <button key={n} type="button" onClick={() => onPickOwner(n)}
                    title={r.label}
                    style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(180,83,9,0.35)", background: "var(--card)", color: "var(--text)", cursor: "pointer", fontFamily: "inherit" }}>
                    {n} <span style={{ color: "#b45309" }}>· {r.state ?? r.country}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 16px 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Statement of Values</div>
              <div className="muted small" style={{ marginTop: 2 }}>Year-end equity as of {asOfLong()}, with a current estimate. Pick an owner above for a per-beneficiary statement.</div>
            </div>
            {editing ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }} className="no-print">
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                  Est. as of
                  <input type="date" value={asOfDraft} onChange={(e) => setAsOfDraft(e.target.value)}
                    style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)", fontFamily: "inherit", fontSize: 12 }} />
                </label>
                <button type="button" className="btn primary" disabled={saving} onClick={commit} style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700 }}>{saving ? "Saving…" : "Save"}</button>
                <button type="button" className="btn" disabled={saving} onClick={() => setEditing(false)} style={{ fontSize: 12, padding: "6px 12px" }}>Cancel</button>
              </div>
            ) : canEdit ? (
              <button type="button" className="btn no-print" onClick={beginEdit} style={{ fontSize: 12, padding: "6px 12px" }}>Edit estimates</button>
            ) : null}
          </div>
          {editEntity && (
            <div style={{ padding: "0 16px 12px" }}>
              <EntityEditor
                entity={resolveEntity(editEntity, entityOverrides)!}
                hasOverride={!!entityOverrides[editEntity]}
                onCancel={() => setEditEntity(null)}
                onSave={async (ov) => { const ok = await onSaveEntity(editEntity, ov); if (ok) setEditEntity(null); return ok; }}
                onReset={async () => { const ok = await onSaveEntity(editEntity, null); if (ok) setEditEntity(null); return ok; }}
              />
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, borderTop: "1px solid var(--border)" }}>
              <thead>
                <tr>
                  <th style={colHead}>ENTITY</th>
                  <th style={colHead}>PROPERTY / ENTITY</th>
                  <th style={colHeadR}>NOI</th>
                  <th style={colHeadR}>CAP</th>
                  <th style={colHeadR}>INDICATED VALUE</th>
                  <th style={colHeadR}>DEBT</th>
                  <th style={colHeadR}>EQUITY VALUE</th>
                  <th style={colHeadR}>{estLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const est = estimateFor(e.entity, estimates, entityOverrides);
                  return (
                    <tr key={e.entity} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 16px" }}>{codeChip(e.propertyCode ?? e.entity)}</td>
                      <td style={{ padding: "10px 16px", fontWeight: 600 }}>
                        <span>{e.name}</span>
                        {entityOverrides[e.entity] && <span title="Edited" style={{ marginLeft: 6, color: "#d97706", fontSize: 11 }}>✎</span>}
                        {canEdit && !editing && (
                          <button type="button" className="no-print" onClick={() => setEditEntity(e.entity)}
                            style={{ marginLeft: 8, background: "transparent", border: "none", padding: 0, color: "var(--brand)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                        )}
                      </td>
                      <td style={{ ...numTd, color: (e.noi ?? 0) < 0 ? "#b91c1c" : undefined }}>{e.noi == null ? "—" : money0(e.noi)}</td>
                      <td style={numTd}>{e.capRate == null ? "—" : (e.capRate * 100).toFixed(2) + "%"}</td>
                      <td style={numTd}>{money0(e.indicatedValue)}</td>
                      <td style={numTd}>{e.debtBalance ? money0(e.debtBalance) : "—"}</td>
                      <td style={{ ...numTd, fontWeight: 700 }}>{money0(e.equityValue)}</td>
                      <td style={numTd}>
                        {editing ? (
                          <input
                            inputMode="numeric"
                            value={draft[e.entity] ?? ""}
                            placeholder={money0(e.equityValue)}
                            onChange={(ev) => setDraft((p) => ({ ...p, [e.entity]: ev.target.value }))}
                            style={{ width: 120, textAlign: "right", padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)", fontFamily: "inherit", fontSize: 12, fontVariantNumeric: "tabular-nums" }}
                          />
                        ) : (
                          <span style={{ fontWeight: 700 }}>{money0(est)}<DeltaTag base={e.equityValue ?? 0} now={est} /></span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "rgba(15,23,42,0.03)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 800 }} colSpan={2}>TOTAL</td>
                  <td style={{ ...numTd, fontWeight: 800 }}>{money0(sum((e) => e.noi))}</td>
                  <td style={numTd}>—</td>
                  <td style={{ ...numTd, fontWeight: 800 }}>{money0(sum((e) => e.indicatedValue))}</td>
                  <td style={{ ...numTd, fontWeight: 800 }}>{money0(sum((e) => e.debtBalance))}</td>
                  <td style={{ ...numTd, fontWeight: 900 }}>{money0(ENTITY_VALUES.reduce((s, e) => s + resolveEquity(e.entity, entityOverrides), 0))}</td>
                  <td style={{ ...numTd, fontWeight: 900 }}>{money0(estTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Single owner ───────────────────────────────────────────────────────
  const lines = statementForBeneficiary(beneficiary);
  const yearEndVal = (l: typeof lines[number]) => l.pct * resolveEquity(l.entity, entityOverrides);
  const total = lines.reduce((s, l) => s + yearEndVal(l), 0);
  const estTotal = lines.reduce((s, l) => s + l.pct * estimateFor(l.entity, estimates, entityOverrides), 0);
  const largest = [...lines].sort((a, b) => yearEndVal(b) - yearEndVal(a))[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="pills">
        <StatPill label="Total value" value={money0(total)} sub={`as of ${asOfLong()}`} />
        <StatPill label="Est. value today" value={money0(estTotal)} sub={estimates.asOf ? `as of ${longDate(estimates.asOf)}` : "= year-end"} />
        <StatPill label="Entities held" value={lines.length} />
        {largest && <StatPill label="Largest holding" value={money0(yearEndVal(largest))} sub={resolveEntity(largest.entity, entityOverrides)?.name ?? largest.entityName} />}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{beneficiary} — Statement of Values</span>
            <ResidencyChip contact={resolveContact(beneficiary)} />
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>Ownership by partner / trust vehicle. Value = effective % × the entity&rsquo;s equity value ({asOfLong()}).</div>
          <div style={{ marginTop: 10, maxWidth: 620 }}>
            <InvestorContactCard name={beneficiary} contact={resolveContact(beneficiary)} canEdit={canEdit} onSave={onSaveContact} />
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, borderTop: "1px solid var(--border)" }}>
            <thead>
              <tr>
                <th style={colHead}>ENTITY</th>
                <th style={colHead}>PROPERTY / ENTITY</th>
                <th style={colHead}>HELD THROUGH</th>
                <th style={colHeadR}>OWNERSHIP %</th>
                <th style={colHeadR}>VALUE</th>
                <th style={colHeadR}>{estLabel}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const yeVal = yearEndVal(l);
                const est = l.pct * estimateFor(l.entity, estimates, entityOverrides);
                return (
                  <tr key={l.entity} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 16px" }}>{codeChip(l.propertyCode ?? l.entity)}</td>
                    <td style={{ padding: "10px 16px", fontWeight: 600 }}>{resolveEntity(l.entity, entityOverrides)?.name ?? l.entityName}</td>
                    <td style={{ padding: "10px 16px", color: "var(--muted)", lineHeight: 1.5 }}>
                      {l.partners.length === 0 ? "—" : l.partners.map((p, i) => (
                        <span key={i}>{p}{i < l.partners.length - 1 ? <span style={{ opacity: 0.5 }}> · </span> : null}</span>
                      ))}
                      {l.positions > 1 && <span className="muted small" style={{ marginLeft: 6 }}>({l.positions} stakes)</span>}
                    </td>
                    <td style={numTd}>{(l.pct * 100).toFixed(4)}%</td>
                    <td style={{ ...numTd, fontWeight: 700 }}>{yeVal ? money0(yeVal) : "—"}</td>
                    <td style={numTd}>{est ? <span style={{ fontWeight: 700 }}>{money0(est)}<DeltaTag base={yeVal} now={est} /></span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", background: "rgba(15,23,42,0.03)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 800 }} colSpan={3}>TOTAL — {lines.length} {lines.length === 1 ? "entity" : "entities"}</td>
                <td style={numTd}>—</td>
                <td style={{ ...numTd, fontWeight: 900 }}>{money0(total)}</td>
                <td style={{ ...numTd, fontWeight: 900 }}>{money0(estTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
