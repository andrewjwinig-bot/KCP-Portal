"use client";

// Global search modal. Indexes everything we have static data for
// (properties, owners, vendor codes, tax filings, parcels, bank
// accounts) plus tenants from the rent roll (lazily fetched).
// Open with ⌘K / Ctrl+K or via the sidebar trigger.

import { useEffect, useMemo, useRef, useState } from "react";
import { PROPERTY_DEFS, BANK_ACCOUNTS, type PropertyDef } from "../../lib/properties/data";
import { PROPERTY_OWNERSHIP, ownerNamesForProperty, soleOwnerName } from "../../lib/properties/ownership";
import { useUser } from "./UserProvider";
import { TAX_TASKS, PARCEL_INFO, filingLabel, baseEntityName } from "../tracker/tax-data";
import { STAFF } from "@/lib/maintenance/staff";

// Minimal shapes — keeps us off the server-only Reservation export.
type SearchMaintRequest = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  categories: string[];
  propertyCode: string | null;
  propertyName: string;
  tenantCompany: string;
  tenantSuite: string;
  tenantName: string;
  tenantEmail: string;
  assignedTo: string | null;
};
type SearchReservation = {
  id: string;
  roomLabel: string;
  propertyCode: string;
  propertyName: string;
  tenantCompany: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
};

type Group =
  | "Answer"
  | "Page"
  | "Maintenance Request"
  | "Reservation"
  | "Property"
  | "Owner"
  | "Vendor Code"
  | "Tenant"
  | "Tax Filing"
  | "Bank Account"
  | "Parcel";

// Pages exposed to the search. Each entry lists the page title plus a
// handful of keywords / aliases so a user can find a page by what they
// know it as, not just its exact label. `navKey` mirrors the role-gating
// used by the sidebar — null means everyone with site access can land
// on the page.
type PageEntry = { label: string; href: string; navKey: string | null; description?: string; keywords: string[] };
const PAGES: PageEntry[] = [
  { label: "Dashboard", href: "/dashboard", navKey: "dashboard",
    description: "Action items and at-a-glance portfolio numbers",
    keywords: ["home", "action items", "overview", "alerts", "summary"] },
  { label: "Property Info", href: "/properties", navKey: "properties",
    description: "Property directory — addresses, ownership, EIN, contacts",
    keywords: ["properties", "buildings", "addresses", "directory", "ein", "owner", "ownership"] },
  { label: "Investor Info", href: "/investors", navKey: "investors",
    description: "Investor / partner directory and vendor codes",
    keywords: ["investors", "partners", "owners", "vendor", "vendor code"] },
  { label: "Debt Tracker", href: "/debt", navKey: "debt",
    description: "Loans, maturity dates, interest-only vs amortizing",
    keywords: ["loans", "mortgage", "debt", "maturity", "amortization", "interest"] },
  { label: "Rent Roll", href: "/rentroll", navKey: "rentroll",
    description: "Current tenant rent roll by property",
    keywords: ["tenants", "occupancy", "leases", "units", "suites"] },
  { label: "Occupancy Trends", href: "/rentroll/trends", navKey: "rentroll",
    description: "Historical occupancy chart by property",
    keywords: ["occupancy", "trends", "vacancy", "history"] },
  { label: "Leasing Activity", href: "/rentroll/leasing", navKey: "leasing-activity",
    description: "Prospects, pending leases, vacating, base year resets",
    keywords: ["prospects", "pending", "vacating", "renewals", "options", "base year", "reset"] },
  { label: "Expense History", href: "/rentroll/base-years", navKey: "base-years",
    description: "Operating expense history + CAM recovery analysis by base year",
    keywords: ["opex", "operating expenses", "cam", "ret", "recovery", "base year", "office", "reconciliation"] },
  { label: "Expense Trends", href: "/rentroll/base-years/trends", navKey: "base-years",
    description: "Year-over-year operating expense trends per building",
    keywords: ["opex", "trends", "history", "cam"] },
  { label: "Commissions", href: "/commissions", navKey: "commissions",
    description: "Office leasing commission memos",
    keywords: ["commission", "memo", "leasing", "office"] },
  { label: "Retail Commissions", href: "/commissions/retail", navKey: "commissions-retail",
    description: "Shopping center leasing commission memos",
    keywords: ["commission", "retail", "shopping centers", "memo"] },
  { label: "Security Deposits", href: "/deposits", navKey: "deposits",
    description: "Per-tenant security deposit ledger",
    keywords: ["deposit", "security deposit", "sd", "tenant deposits"] },
  { label: "Task Tracker", href: "/tracker", navKey: "tracker",
    description: "Weekly / monthly task checklist",
    keywords: ["tasks", "todo", "checklist", "weekly", "monthly"] },
  { label: "Filing Tracker", href: "/tracker/taxes", navKey: "tracker",
    description: "Annual tax filings tracker",
    keywords: ["taxes", "filings", "annual", "1065", "k1"] },
  { label: "Bank Acc Tracker", href: "/bank-rec", navKey: "bank-rec-tracker",
    description: "Bank reconciliation status by account, by month",
    keywords: ["bank rec", "reconciliation", "accounts", "statements", "marie"] },
  { label: "Bank Transfers", href: "/bank-transfers", navKey: "bank-transfers",
    description: "Inter-account transfer log",
    keywords: ["transfers", "wires", "advances", "reimbursements", "intercompany"] },
  { label: "Operating Budgets", href: "/financials/budgets", navKey: "financials-budgets",
    description: "Annual operating budgets by property — revenues, NOI, cash flow",
    keywords: ["budget", "operating budget", "noi", "cash flow", "reforecast", "proforma", "financials"] },
  { label: "Operating Statements", href: "/financials/operating-statements", navKey: "financials-budgets",
    description: "Monthly actuals vs budget — comparative income statement by property",
    keywords: ["operating statement", "income statement", "actuals", "variance", "p&l", "profit and loss", "comparative income", "gl", "general ledger", "financials"] },
  { label: "Payroll Invoicer", href: "/", navKey: "payroll-invoicer",
    description: "Generate payroll allocation invoices per property",
    keywords: ["payroll", "invoice", "allocation", "paychex"] },
  { label: "Payroll History", href: "/history", navKey: "payroll-history",
    description: "Archive of saved payroll pay periods",
    keywords: ["payroll", "history", "periods", "archive"] },
  { label: "CC Expense Coder", href: "/expenses", navKey: "expenses",
    description: "Code credit-card expenses to properties + send invoices",
    keywords: ["credit card", "expenses", "coding", "avidbill", "amex"] },
  { label: "CC Expense History", href: "/expenses/history", navKey: "expenses-history",
    description: "Archive of past credit-card coding sessions",
    keywords: ["credit card", "history", "expenses", "archive"] },
  { label: "Allocated Invoicer", href: "/allocated-invoicer", navKey: "allocated",
    description: "Allocate a single invoice across multiple properties",
    keywords: ["invoice", "allocation", "split", "vendor"] },
  { label: "Service Requests", href: "/maintenance", navKey: "maintenance",
    description: "Maintenance / service request queue",
    keywords: ["service", "maintenance", "tickets", "requests", "work orders"] },
  { label: "Reservations", href: "/reservations", navKey: "reservations",
    description: "Conference room reservation queue",
    keywords: ["conference", "rooms", "reservations", "bookings", "meetings"] },
];

type Hit = {
  group: Group;
  title: string;            // primary line
  subtitle?: string;        // secondary line
  badge?: string;           // chip text (property code, vendor, etc.)
  href: string;             // where clicking jumps to
  score: number;            // higher = better match
};

function propName(code: string): string {
  const d = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
  return d?.name ?? code;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Returns a score >0 if `needle` matches `haystack`, else 0.
 *  Exact prefix > substring > word-prefix. Empty needle returns 0. */
function score(needle: string, haystack: string | undefined | null): number {
  if (!haystack || !needle) return 0;
  const n = normalize(needle);
  const h = normalize(haystack);
  if (h === n) return 100;
  if (h.startsWith(n)) return 60;
  const idx = h.indexOf(n);
  if (idx === -1) {
    // word-prefix?
    const words = h.split(/\s+/);
    if (words.some((w) => w.startsWith(n))) return 25;
    return 0;
  }
  // earlier hits score higher
  return Math.max(10, 40 - idx);
}

/** Multi-token AND scoring. Splits the query on whitespace; each token must
 *  hit at least one of the candidate strings. Returns the summed best
 *  per-token score, or 0 if any token misses. Multipliers in `weights`
 *  apply to that field's contribution to every token's score (so a hit on
 *  a high-weight field is worth more). */
function scoreFields(query: string, fields: Array<[string | null | undefined, number]>): number {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const tok of tokens) {
    let best = 0;
    for (const [field, weight] of fields) {
      const s = score(tok, field) * weight;
      if (s > best) best = s;
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

// ── Smart answer ("1100 budgeted NOI") ──────────────────────────────────────
type BudgetKpi = { code: string; name: string; year: number; rollups: { name: string; total: number }[] };

function money(n: number): string {
  const s = "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
  return n < 0 ? `(${s})` : s;
}

// Metric aliases → the budget rollup that answers them.
const METRICS: { label: string; aliases: string[]; match: RegExp }[] = [
  { label: "NOI", aliases: ["noi", "net operating income", "operating income"], match: /net operating income/i },
  { label: "Total Revenues", aliases: ["total revenues", "total revenue", "revenues", "revenue", "income", "top line"], match: /total revenue/i },
  { label: "Operating Expenses", aliases: ["total operating expenses", "operating expenses", "opex", "expenses"], match: /total operating expense/i },
  { label: "Cash Flow Before Debt", aliases: ["cash flow before debt", "cfbds", "cf before debt"], match: /cash flow before debt/i },
  { label: "Cash Flow After Debt", aliases: ["cash flow after debt", "cfads", "cf after debt", "cash flow", "cashflow"], match: /cash flow after debt/i },
  { label: "Debt Service", aliases: ["total debt service", "debt service", "p&i"], match: /total debt service/i },
];

// Pick the metric whose longest alias appears in the query (so "cash flow
// before debt" beats the generic "cash flow").
function detectMetric(ql: string): typeof METRICS[number] | null {
  let best: typeof METRICS[number] | null = null;
  let bestLen = 0;
  for (const m of METRICS) for (const a of m.aliases) {
    if (ql.includes(a) && a.length > bestLen) { best = m; bestLen = a.length; }
  }
  return best;
}

function smartAnswer(q: string, kpis: BudgetKpi[]): Hit | null {
  if (!kpis.length) return null;
  const ql = normalize(q);
  const metric = detectMetric(ql);
  if (!metric) return null;
  // Resolve the property — prefer an exact code token, else a name word.
  let byCode: BudgetKpi | null = null;
  let byName: BudgetKpi | null = null;
  for (const k of kpis) {
    if (ql.includes(normalize(k.code))) { byCode = k; break; }
    if (!byName) {
      const words = normalize(k.name).split(/\s+/).filter((w) => w.length > 3);
      if (words.some((w) => ql.includes(w))) byName = k;
    }
  }
  const prop = byCode ?? byName;
  if (!prop) return null;
  const rollup = prop.rollups.find((r) => metric.match.test(r.name));
  if (!rollup) return null;
  return {
    group: "Answer",
    title: `${metric.label} · ${money(rollup.total)}`,
    subtitle: `${prop.code} ${prop.name} · Budgeted (FY ${prop.year})`,
    badge: prop.code,
    href: "/financials/budgets",
    score: 10000,
  };
}

type RentRollUnit = {
  unitRef: string;
  propertyCode: string;
  tenantName?: string | null;
  suite?: string | null;
};
type RentRollData = {
  properties: Array<{
    propertyCode: string;
    units: Array<{ unitRef: string; tenantName?: string | null; suite?: string | null }>;
  }>;
};

// Minimal markdown for the assistant's answer: **bold** + preserved newlines
// (the container is whitespace: pre-wrap). Good enough for short answers.
function renderLightMarkdown(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**")
      ? <b key={i}>{seg.slice(2, -2)}</b>
      : <span key={i}>{seg}</span>,
  );
}

// ── AI chart (server sends a validated spec; numbers already come from tools) ──
type AiChartSpec = { type: "bar" | "line"; title: string; unit: "dollars" | "percent" | "sqft" | "count"; series: { label: string; value: number }[] };
type ChatTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; answer: string; links: { label: string; href: string }[]; chart: AiChartSpec | null };
function fmtChartValue(v: number, unit: AiChartSpec["unit"]): string {
  if (unit === "percent") return `${Math.round(v * 10) / 10}%`;
  if (unit === "dollars") {
    const a = Math.abs(v);
    const s = a >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : a >= 1_000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`;
    return s;
  }
  return v >= 1000 ? v.toLocaleString() : String(Math.round(v));
}
function AiChart({ spec }: { spec: AiChartSpec }) {
  const vals = spec.series.map((p) => p.value);
  const maxV = Math.max(...vals, 0);
  const minV = Math.min(...vals, 0);
  const span = maxV - minV || 1;
  const accent = "#0b4a7d";
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 9, background: "var(--card)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 8 }}>{spec.title}</div>
      {spec.type === "bar" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {spec.series.map((p, i) => {
            const frac = (p.value - Math.min(minV, 0)) / span;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 74, flexShrink: 0, fontSize: 11, color: "var(--muted)", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.label}>{p.label}</div>
                <div style={{ flex: 1, height: 16, background: "rgba(15,23,42,0.05)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(2, frac * 100)}%`, height: "100%", background: accent, borderRadius: 4 }} />
                </div>
                <div style={{ width: 56, flexShrink: 0, fontSize: 11, fontWeight: 700, textAlign: "right" }}>{fmtChartValue(p.value, spec.unit)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        (() => {
          const W = 300, H = 90, pad = 4;
          const n = spec.series.length;
          const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, n - 1);
          const y = (v: number) => H - pad - ((v - minV) / span) * (H - 2 * pad);
          const pts = spec.series.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
          return (
            <div>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
                <polyline points={pts} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {spec.series.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={2.5} fill={accent} />)}
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                {spec.series.map((p, i) => (
                  <div key={i} style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{fmtChartValue(p.value, spec.unit)}</div>
                    <div>{p.label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

export default function GlobalSearch() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [tenants, setTenants] = useState<RentRollUnit[] | null>(null);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [maintRequests, setMaintRequests] = useState<SearchMaintRequest[] | null>(null);
  const [reservations, setReservations] = useState<SearchReservation[] | null>(null);
  const [budgetKpis, setBudgetKpis] = useState<BudgetKpi[] | null>(null);
  // AI assistant ("ask the brain") — a running conversation: grounded answers
  // with page links + optional charts, and follow-ups that keep prior context.
  const [chat, setChat] = useState<{ turns: ChatTurn[]; loading: boolean; error: string | null }>({ turns: [], loading: false, error: null });
  const askAi = () => {
    const q = query.trim();
    if (!q || chat.loading) return;
    // Send the prior turns as plain text so follow-ups ("now just the business
    // parks", "chart that") resolve against what was already asked/answered.
    const history = chat.turns.slice(-8).map((t) => ({ role: t.role, content: t.role === "user" ? t.text : t.answer }));
    setChat((c) => ({ turns: [...c.turns, { role: "user", text: q }], loading: true, error: null }));
    setQuery("");
    fetch("/api/search/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, history }) })
      .then((r) => r.json())
      .then((j) => setChat((c) => j.error
        ? { ...c, loading: false, error: j.error }
        : { turns: [...c.turns, { role: "assistant", answer: j.answer ?? "No answer.", links: j.links ?? [], chart: j.chart ?? null }], loading: false, error: null }))
      .catch(() => setChat((c) => ({ ...c, loading: false, error: "Couldn't reach the assistant." })));
  };
  const resetChat = () => setChat({ turns: [], loading: false, error: null });

  // ── Keyboard shortcut ⌘K / Ctrl+K + Esc + custom 'open-global-search' ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("open-global-search", onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("open-global-search", onOpenEvent);
    };
  }, [open]);

  // Focus input when modal opens.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQuery(""); setActiveIdx(0); }
  }, [open]);

  // Lazy-load tenants the first time the modal opens.
  useEffect(() => {
    if (!open || tenants !== null || tenantsLoading) return;
    setTenantsLoading(true);
    fetch("/api/rentroll")
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { rentroll: RentRollData } | null) => {
        if (!res?.rentroll) { setTenants([]); return; }
        const all: RentRollUnit[] = [];
        for (const p of res.rentroll.properties) {
          for (const u of p.units) {
            if (u.tenantName) {
              all.push({
                unitRef: u.unitRef,
                propertyCode: p.propertyCode,
                tenantName: u.tenantName,
                suite: u.suite,
              });
            }
          }
        }
        setTenants(all);
      })
      .catch(() => setTenants([]))
      .finally(() => setTenantsLoading(false));
  }, [open, tenants, tenantsLoading]);

  // Lazy-load maintenance requests + reservations on first open.
  useEffect(() => {
    if (!open) return;
    if (maintRequests === null) {
      fetch("/api/maintenance/requests")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setMaintRequests(j?.requests ?? []))
        .catch(() => setMaintRequests([]));
    }
    if (reservations === null) {
      fetch("/api/reservations")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setReservations(j?.reservations ?? []))
        .catch(() => setReservations([]));
    }
    if (budgetKpis === null) {
      fetch("/api/financials/budgets/kpis")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setBudgetKpis(j?.properties ?? []))
        .catch(() => setBudgetKpis([]));
    }
  }, [open, maintRequests, reservations, budgetKpis]);

  // ── Build all hits ──────────────────────────────────────────────────────
  const hits: Hit[] = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const out: Hit[] = [];

    // Smart answer — "1100 budgeted NOI", "Brookwood cash flow", etc.
    if (budgetKpis) {
      const ans = smartAnswer(q, budgetKpis);
      if (ans) out.push(ans);
    }

    // Pages — surface navigation targets the current user has access to.
    // Score against the page label, its description, and a keyword list
    // so people can search by what they call the page (e.g. "tickets" →
    // Service Requests, "opex" → Expense History).
    const canSee = (navKey: string | null) =>
      navKey === null || user.navKeys.has("all") || user.navKeys.has(navKey);
    for (const p of PAGES) {
      if (!canSee(p.navKey)) continue;
      const fields: Array<[string | null | undefined, number]> = [
        [p.label, 1.6],
        [p.description ?? null, 0.8],
        ...p.keywords.map((k): [string, number] => [k, 1.2]),
      ];
      const s = scoreFields(q, fields);
      if (s > 0) {
        out.push({
          group: "Page",
          title: p.label,
          subtitle: p.description,
          href: p.href,
          score: s + 4, // small floor so an exact page-name hit floats above noisy data matches
        });
      }
    }

    // Properties
    for (const p of PROPERTY_DEFS) {
      const ownerNames = ownerNamesForProperty(p.id);
      const s = Math.max(
        score(q, p.id) * 1.5,
        score(q, p.name),
        score(q, p.address ?? null),
        score(q, p.city ?? null),
        score(q, p.notes ?? null),
        score(q, p.fundGroup ?? null),
        score(q, p.ein ?? null) * 1.2,
        // Findable by the owning entity (e.g. 5600 by "Hyman Korman Co").
        ...ownerNames.map((n) => score(q, n)),
      );
      if (s > 0) {
        const owner = soleOwnerName(p.id);
        out.push({
          group: "Property",
          title: p.name,
          subtitle: [p.type, owner && owner.replace(/\.$/, "") !== p.name ? owner : null, p.address, p.city].filter(Boolean).join(" · "),
          badge: p.id,
          href: `/properties#prop-${p.id}`,
          score: s,
        });
      }
    }

    // Owners + Vendor codes
    const vendorBuckets = new Map<string, { code: string; properties: Set<string>; ownerName?: string }>();
    for (const entry of PROPERTY_OWNERSHIP) {
      for (const o of entry.owners) {
        // Owner hit
        const s = Math.max(
          score(q, o.name) * 1.3,
          score(q, o.detailedName ?? null),
          score(q, o.address ?? null),
          score(q, o.city ?? null),
          score(q, o.phone ?? null),
        );
        if (s > 0) {
          out.push({
            group: "Owner",
            title: o.name,
            subtitle: [o.detailedName, `on ${entry.propertyCode} ${propName(entry.propertyCode)}`].filter(Boolean).join(" · "),
            badge: o.vendorCode,
            href: `/investors?q=${encodeURIComponent(o.name)}`,
            score: s,
          });
        }
        // Vendor-code aggregation
        if (o.vendorCode) {
          if (!vendorBuckets.has(o.vendorCode)) {
            vendorBuckets.set(o.vendorCode, { code: o.vendorCode, properties: new Set(), ownerName: o.name });
          }
          vendorBuckets.get(o.vendorCode)!.properties.add(entry.propertyCode);
        }
      }
    }
    for (const v of vendorBuckets.values()) {
      const s = score(q, v.code) * 1.6;
      if (s > 0) {
        out.push({
          group: "Vendor Code",
          title: v.code,
          subtitle: `${v.ownerName ?? ""} · on ${v.properties.size} ${v.properties.size === 1 ? "property" : "properties"}`,
          href: `/investors?q=${encodeURIComponent(v.code)}`,
          score: s,
        });
      }
    }

    // Tenants (only if loaded)
    if (tenants) {
      for (const u of tenants) {
        const s = Math.max(
          score(q, u.tenantName ?? null) * 1.2,
          score(q, u.unitRef),
          score(q, u.suite ?? null),
        );
        if (s > 0) {
          out.push({
            group: "Tenant",
            title: u.tenantName ?? "(vacant)",
            subtitle: `${u.propertyCode} ${propName(u.propertyCode)}${u.suite ? ` · Suite ${u.suite}` : ""}`,
            badge: u.unitRef,
            href: `/rentroll#unit-${u.unitRef.replace(/[^a-zA-Z0-9]/g, "-")}`,
            score: s,
          });
        }
      }
    }

    // Tax filings
    for (const t of TAX_TASKS) {
      const label = filingLabel(t);
      const s = Math.max(
        score(q, label),
        score(q, t.entity),
        score(q, baseEntityName(t.entity)),
      );
      if (s > 0) {
        out.push({
          group: "Tax Filing",
          title: label,
          subtitle: `${t.entity} · Due ${t.dueMonth}/${t.dueDay}`,
          href: "/tracker/taxes",
          score: s,
        });
      }
    }

    // Bank accounts — dedupe by (bank, label, last4) and aggregate the
    // properties each account serves, so a shared account (e.g. one NI LLC
    // operating account across several buildings) shows once. Searching the
    // last four digits (with or without the "x") surfaces which property it's
    // for; an exact 4-digit match floats it to the top.
    const qDigits = q.replace(/\D/g, "");
    const acctMap = new Map<string, { bank: string; label: string; last4: string; link?: string; props: string[] }>();
    for (const [propCode, accts] of Object.entries(BANK_ACCOUNTS)) {
      for (const a of accts) {
        const k = `${a.bank}|${a.label}|${a.last4}`;
        const e = acctMap.get(k) ?? { bank: a.bank, label: a.label, last4: a.last4, link: a.link, props: [] };
        if (!e.props.includes(propCode)) e.props.push(propCode);
        acctMap.set(k, e);
      }
    }
    for (const a of acctMap.values()) {
      const last4Digits = a.last4.replace(/\D/g, "");
      let s = Math.max(
        score(q, a.last4) * 1.6,
        score(q, a.label),
        score(q, a.bank),
      );
      if (qDigits.length >= 3 && last4Digits.includes(qDigits)) {
        s = Math.max(s, qDigits === last4Digits ? 160 : 90);
      }
      if (s > 0) {
        const propsText = a.props.length === 1
          ? `${a.props[0]} ${propName(a.props[0])}`
          : `${a.props.length} properties (${a.props.join(", ")})`;
        out.push({
          group: "Bank Account",
          title: `${a.label} ${a.last4}`,
          subtitle: `${a.bank} · ${propsText}`,
          badge: a.last4,
          href: a.link || "/bank-rec",
          score: s,
        });
      }
    }

    // Parcels
    for (const [propCode, parcels] of Object.entries(PARCEL_INFO)) {
      for (const p of parcels) {
        const s = Math.max(
          score(q, p.number) * 1.4,
          score(q, p.label ?? null),
        );
        if (s > 0) {
          out.push({
            group: "Parcel",
            title: p.number,
            subtitle: `${p.label ?? "Parcel"} · ${propCode}`,
            href: p.link || "/properties",
            score: s,
          });
        }
      }
    }

    // Maintenance requests — multi-token AND across id, subject, tenant,
    // contact, property, category, status, priority, and assignee name.
    if (maintRequests) {
      for (const m of maintRequests) {
        const worker = m.assignedTo ? (STAFF.find((s) => s.id === m.assignedTo)?.name ?? m.assignedTo) : "Unassigned";
        const s = scoreFields(q, [
          [m.id, 1.5],
          [m.subject, 1.3],
          [m.tenantCompany, 1.2],
          [m.tenantName, 1.0],
          [m.tenantEmail, 0.9],
          [m.propertyName, 0.9],
          [m.tenantSuite, 1.0],
          [m.categories.join(" "), 1.1],
          [m.status, 0.7],
          [m.priority, 0.7],
          [worker, 1.0],
        ]);
        if (s > 0) {
          const parts = [m.status, m.priority || undefined, worker, m.tenantCompany, m.propertyName].filter(Boolean);
          out.push({
            group: "Maintenance Request",
            title: m.subject || "(no subject)",
            subtitle: parts.join(" · "),
            badge: m.id.slice(0, 8),
            href: `/maintenance?openId=${encodeURIComponent(m.id)}`,
            score: s,
          });
        }
      }
    }

    // Reservations — multi-token AND across id, tenant, contact, room, date.
    if (reservations) {
      for (const r of reservations) {
        const contactName = `${r.contactFirstName} ${r.contactLastName}`.trim();
        const s = scoreFields(q, [
          [r.id, 1.4],
          [r.tenantCompany, 1.3],
          [contactName, 1.1],
          [r.contactEmail, 0.9],
          [r.roomLabel, 1.2],
          [r.propertyName, 0.9],
          [r.date, 1.0],
          [r.status, 0.7],
        ]);
        if (s > 0) {
          const parts = [r.date, r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : "", r.status, r.tenantCompany].filter(Boolean);
          out.push({
            group: "Reservation",
            title: r.roomLabel || "(no room)",
            subtitle: parts.join(" · "),
            badge: r.id.slice(0, 8),
            href: `/reservations?openId=${encodeURIComponent(r.id)}`,
            score: s,
          });
        }
      }
    }

    out.sort((a, b) => b.score - a.score);
    return out;
  }, [query, tenants, maintRequests, reservations, budgetKpis, user.navKeys]);

  // Group results into sections, limiting each group to 6 with "+N more".
  const grouped = useMemo(() => {
    const order: Group[] = ["Answer", "Page", "Maintenance Request", "Reservation", "Property", "Owner", "Vendor Code", "Tenant", "Tax Filing", "Bank Account", "Parcel"];
    const map = new Map<Group, Hit[]>();
    for (const h of hits) {
      let arr = map.get(h.group);
      if (!arr) { arr = []; map.set(h.group, arr); }
      arr.push(h);
    }
    return order
      .filter((g) => map.has(g))
      .map((g) => ({ group: g, hits: map.get(g)! }));
  }, [hits]);

  // Flat list of currently-visible hits (top 6 per group) — drives arrow keys.
  const visible: Hit[] = useMemo(() => grouped.flatMap((g) => g.hits.slice(0, 6)), [grouped]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  function activate(hit: Hit) {
    setOpen(false);
    window.location.href = hit.href;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(visible.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // ⌘/Ctrl+Enter (or Enter with no matches) asks the AI assistant.
      if (e.metaKey || e.ctrlKey || visible.length === 0) { askAi(); return; }
      const hit = visible[activeIdx];
      if (hit) activate(hit);
    }
  }

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "10vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, calc(100vw - 32px))",
          maxHeight: "75vh",
          display: "flex", flexDirection: "column",
          background: "var(--card)", borderRadius: 14,
          border: "1px solid var(--border)",
          boxShadow: "0 22px 60px rgba(2,6,23,0.30)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search, or ask a question — try 'who vacated last month?' then ⌘⏎"
            style={{
              width: "100%", padding: "10px 12px",
              border: "1px solid var(--border)", borderRadius: 9,
              background: "var(--card)", color: "var(--text)",
              fontSize: 14, outline: "none", fontFamily: "inherit",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {(query.trim() || chat.turns.length > 0 || chat.loading || chat.error) && (
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
              {query.trim() && (
                <button
                  type="button"
                  onClick={askAi}
                  disabled={chat.loading}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(109,40,217,0.35)", background: "rgba(109,40,217,0.06)", cursor: "pointer", textAlign: "left", color: "inherit" }}
                >
                  <span style={{ fontSize: 16 }}>✨</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "#6d28d9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {chat.loading ? "Thinking…" : chat.turns.length > 0 ? <>Ask follow-up: &ldquo;{query.trim()}&rdquo;</> : <>Ask the assistant: &ldquo;{query.trim()}&rdquo;</>}
                  </span>
                  <span className="muted" style={{ fontSize: 11, flexShrink: 0 }}>⌘⏎</span>
                </button>
              )}
              {(chat.turns.length > 0 || chat.loading || chat.error) && (
                <div style={{ marginTop: query.trim() ? 8 : 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {chat.turns.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>✨ Assistant</span>
                      <button type="button" onClick={resetChat} className="muted" style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0 }}>Clear</button>
                    </div>
                  )}
                  {chat.turns.map((t, ti) => t.role === "user" ? (
                    <div key={ti} style={{ alignSelf: "flex-end", maxWidth: "85%", fontSize: 12.5, fontWeight: 600, padding: "6px 10px", borderRadius: 9, background: "rgba(109,40,217,0.08)", color: "#6d28d9" }}>{t.text}</div>
                  ) : (
                    <div key={ti} style={{ padding: "10px 12px", borderRadius: 9, background: "rgba(15,23,42,0.03)", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{renderLightMarkdown(t.answer)}</div>
                      {t.chart && t.chart.series.length >= 2 && <AiChart spec={t.chart} />}
                      {t.links.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                          {t.links.map((l, i) => (
                            <a key={i} href={l.href} onClick={() => setOpen(false)}
                              style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(11,74,125,0.3)", background: "var(--card)", color: "#0b4a7d", textDecoration: "none" }}>
                              {l.label} →
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {chat.loading && <div className="muted" style={{ fontSize: 12, fontStyle: "italic", padding: "2px 4px" }}>Thinking…</div>}
                  {chat.error && <div className="small" style={{ color: "#b91c1c" }}>{chat.error}</div>}
                  {chat.turns.length > 0 && !chat.loading && (
                    <div className="muted" style={{ fontSize: 10, fontStyle: "italic" }}>AI · grounded in live portal data — verify anything critical. Type a follow-up above and press ⌘⏎.</div>
                  )}
                </div>
              )}
            </div>
          )}
          {!query.trim() ? (
            chat.turns.length > 0 || chat.loading ? null : (
              <div style={{ padding: "20px 16px", color: "var(--muted)", fontSize: 13 }}>
                Start typing to search across the whole portal — maintenance requests, reservations, properties, owners, vendor codes, tenants, filings, parcels, banks.
                Multi-word queries match all words (try <code>jay plumbing</code> or <code>conference apple</code>).
                {tenantsLoading && <div style={{ marginTop: 8, fontStyle: "italic" }}>Loading tenant data…</div>}
              </div>
            )
          ) : grouped.length === 0 ? (
            <div style={{ padding: "20px 16px", color: "var(--muted)", fontSize: 13 }}>
              No matches.
              {tenants === null && (
                <div style={{ marginTop: 8, fontStyle: "italic" }}>Tenant data still loading…</div>
              )}
            </div>
          ) : (
            (() => {
              let globalIdx = -1;
              return grouped.map(({ group, hits: groupHits }) => {
                const shown = groupHits.slice(0, 6);
                const moreCount = groupHits.length - shown.length;
                return (
                  <div key={group} style={{ marginBottom: 4 }}>
                    <div style={{
                      padding: "8px 16px 4px", fontSize: 10, fontWeight: 800,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      color: "var(--muted)",
                    }}>
                      {group}{groupHits.length > 1 ? ` · ${groupHits.length}` : ""}
                    </div>
                    {shown.map((h) => {
                      globalIdx += 1;
                      const isActive = globalIdx === activeIdx;
                      return (
                        <button
                          key={`${h.group}-${h.title}-${h.href}-${globalIdx}`}
                          type="button"
                          onClick={() => activate(h)}
                          onMouseEnter={() => setActiveIdx(globalIdx)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            width: "100%", padding: "8px 16px",
                            background: isActive ? "rgba(11,74,125,0.08)" : "transparent",
                            border: "none", cursor: "pointer",
                            textAlign: "left", fontFamily: "inherit",
                            borderLeft: isActive ? "3px solid #0b4a7d" : "3px solid transparent",
                          }}
                        >
                          {h.badge && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                              padding: "2px 7px", borderRadius: 999,
                              background: "rgba(15,23,42,0.05)", color: "var(--text)",
                              border: "1px solid var(--border)",
                              flexShrink: 0,
                            }}>{h.badge}</span>
                          )}
                          <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {h.title}
                            </span>
                            {h.subtitle && (
                              <span style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {h.subtitle}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                    {moreCount > 0 && (
                      <div style={{ padding: "2px 16px 6px 16px", fontSize: 11, color: "var(--muted)" }}>
                        + {moreCount} more
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
        </div>

        <div style={{
          padding: "8px 16px", borderTop: "1px solid var(--border)",
          fontSize: 11, color: "var(--muted)", display: "flex", gap: 14, flexWrap: "wrap",
        }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}

/** Sidebar trigger button — opens the global search via a custom event
 *  that the always-mounted <GlobalSearch /> listens for. */
export function GlobalSearchTrigger({ collapsed }: { collapsed: boolean }) {
  function openSearch() {
    document.dispatchEvent(new Event("open-global-search"));
  }
  return (
    <button
      onClick={openSearch}
      title="Search (⌘K)"
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", padding: collapsed ? "8px" : "8px 10px",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 10,
        color: "#fff", cursor: "pointer",
        fontFamily: "inherit", fontSize: 13,
        justifyContent: collapsed ? "center" : "flex-start",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85, flexShrink: 0 }}>
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      {!collapsed && (
        <span style={{ opacity: 0.85 }}>Search</span>
      )}
    </button>
  );
}
