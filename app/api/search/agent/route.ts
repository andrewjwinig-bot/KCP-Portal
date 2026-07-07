import { NextResponse } from "next/server";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { ownerNamesForProperty } from "@/lib/properties/ownership";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { taskOccurrencesBetween } from "@/lib/tracker/taskDefs";
import { listRequests } from "@/lib/maintenance/requestsStorage";
import { getCamConfig } from "@/lib/cam/configStorage";
import { seedCamConfig, RETAIL_CONFIG_SEED } from "@/lib/cam/retailConfigSeed";
import { buildMonthlyReport, groupOf, REPORT_GROUP_LABELS, type ReportGroupKey } from "@/lib/reports/monthly";
import { listLoans } from "@/lib/debt/storage";
import { summarizeLoan } from "@/lib/debt/amortization";
import { listDeposits } from "@/lib/deposits/storage";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { listFullGls, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import type { StatementMapping } from "@/lib/financials/operating-statements/types";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { resolvePropertyBudget, makeBudgetLookup } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { isPathAllowed, ALL_USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Financial data (NOI / budget / debt) is gated to the same users who may see
// the company-wide Monthly Review; everyone else gets operations + occupancy.
async function canSeeFinancials(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  try {
    const token = (await cookies()).get(SITE_COOKIE)?.value;
    const id = await verifySiteToken(token, secret);
    return !!id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/reports/monthly");
  } catch { return false; }
}

// Pages the assistant may link to (grounded links only).
const ROUTES = [
  { path: "/dashboard", desc: "Dashboard overview" },
  { path: "/reports/monthly", desc: "Company-wide Monthly Review" },
  { path: "/rentroll", desc: "Rent roll, occupancy, tenants" },
  { path: "/rentroll/leasing", desc: "Leasing activity (prospects, pending, vacating, renewals)" },
  { path: "/tracker", desc: "Task tracker" },
  { path: "/maintenance", desc: "Service requests / maintenance" },
  { path: "/cam-recon", desc: "CAM/RET reconciliation" },
  { path: "/cam-recon/interim", desc: "Interim / move-out CAM close-out" },
  { path: "/financials/operating-statements", desc: "Operating statements (GL)" },
  { path: "/financials/operating-statements/review", desc: "Flags to Investigate" },
  { path: "/financials/cash-analysis", desc: "Cash analysis" },
  { path: "/financials/budgets", desc: "Operating budgets" },
  { path: "/commissions", desc: "Leasing commissions" },
  { path: "/deposits", desc: "Security deposits" },
  { path: "/properties", desc: "Property directory" },
  { path: "/units", desc: "Unit info + CAM config" },
  { path: "/investors", desc: "Investor info" },
  { path: "/debt", desc: "Debt tracker" },
  { path: "/rentroll/base-years", desc: "Operating expense history (office base years + retail year-by-year)" },
];

// ── Deep links ────────────────────────────────────────────────────────────
// The assistant can point directly at a specific record, not just a page.
// Everything is validated server-side so only known routes/params/segments
// survive (no open redirects, no arbitrary paths).
const DYNAMIC_LINK_PREFIXES: { prefix: string; pattern: RegExp }[] = [
  { prefix: "/units/", pattern: /^[A-Za-z0-9-]{1,20}$/ },      // /units/2300-01
  { prefix: "/properties/", pattern: /^[A-Za-z0-9-]{1,20}$/ }, // /properties/4500
];
// Query params each page actually reads (anything else is stripped).
const DEEP_LINK_PARAMS: Record<string, string[]> = {
  "/maintenance": ["tab", "priority", "status", "assignee", "property", "category"],
  "/reservations": ["openId"],
  "/debt": ["openId"],
  "/rentroll/base-years": ["property"],
};
function sanitizeDeepLink(raw: unknown, validPaths: Set<string>): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const [pathPart, queryPart] = raw.split("?");
  let outPath: string | null = null;
  for (const d of DYNAMIC_LINK_PREFIXES) {
    if (pathPart.startsWith(d.prefix)) {
      const seg = pathPart.slice(d.prefix.length);
      if (seg.includes("/") || !d.pattern.test(seg)) return null;
      outPath = `${d.prefix}${seg}`;
      break;
    }
  }
  if (!outPath) {
    if (!validPaths.has(pathPart)) return null;
    outPath = pathPart;
  }
  if (queryPart) {
    const allowed = DEEP_LINK_PARAMS[outPath] ?? [];
    const out = new URLSearchParams();
    for (const [k, v] of new URLSearchParams(queryPart)) {
      if (allowed.includes(k) && v && v.length <= 40 && /^[A-Za-z0-9 _.-]+$/.test(v)) out.set(k, v);
    }
    const qs = out.toString();
    if (qs) return `${outPath}?${qs}`;
  }
  return outPath;
}

// ── Tool definitions handed to the model ──────────────────────────────────
type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

const OPERATIONAL_TOOLS: ToolDef[] = [
  {
    name: "get_property",
    description:
      "Look up a single property by its code (e.g. '3610', '2300', '7010') or by a name substring. Returns name, type, address, owner entity, and square footage.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Property code or a substring of its name" } },
      required: ["query"],
    },
  },
  {
    name: "list_properties",
    description: "List every property with code, name, type, and square footage. Use to answer portfolio-wide questions or to find a property code.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_tenants",
    description:
      "Search current-rent-roll tenants by occupant name substring and/or property code. Returns tenant name, property, unit ref, square footage, and lease-end date. Omit both args to list all occupied units.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Substring of the tenant/occupant name" },
        property: { type: "string", description: "Property code to restrict to (e.g. '2300')" },
      },
    },
  },
  {
    name: "list_expirations",
    description: "List leases whose end date falls within the next N days (default 90), soonest first. Good for renewal / expiration questions.",
    input_schema: {
      type: "object",
      properties: { within_days: { type: "number", description: "Look-ahead window in days (default 90)" } },
    },
  },
  {
    name: "get_cam_config",
    description:
      "Get a tenant's CAM/INS/RET reconciliation methodology by unit ref (e.g. '2300-01'): gross-lease flag, admin fee %, stipulated PRS per category, RET discount, and any expense-line exclusions or CAM cap. This is the source of truth for how a tenant reconciles.",
    input_schema: {
      type: "object",
      properties: { unit_ref: { type: "string", description: "Unit ref, e.g. '2300-01'" } },
      required: ["unit_ref"],
    },
  },
  {
    name: "get_tasks",
    description: "List task-tracker occurrences (recurring + one-off) due within the next N weeks (default 1). Returns task label, due date, and category.",
    input_schema: {
      type: "object",
      properties: { weeks: { type: "number", description: "How many weeks ahead to include (default 1)" } },
    },
  },
  {
    name: "list_service_requests",
    description: "List open (not-Complete) maintenance / service requests: subject, property, priority, status. Use for maintenance questions.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "aggregate_tenants",
    description:
      "Aggregate current-rent-roll tenants into totals computed in code: tenant count, total occupied square footage, total annual base rent, and average rent per square foot. Optionally filter by property, group, minimum square footage, or leases expiring within N days. Use for 'how many tenants / how much square footage / total rent / average rent psf …' questions.",
    input_schema: {
      type: "object",
      properties: {
        property: { type: "string", description: "Restrict to a property code" },
        group: { type: "string", enum: ["bp", "sc", "lik", "other"], description: "Restrict to a group" },
        min_sqft: { type: "number", description: "Only tenants at least this many sqft" },
        expiring_within_days: { type: "number", description: "Only tenants whose lease ends within this many days" },
      },
    },
  },
  {
    name: "get_occupancy",
    description:
      "Occupancy computed in code for a scope: a single property code, a group (bp/sc/lik/other), or the whole portfolio. Returns total / occupied / vacant square footage, occupancy %, unit count, and vacant-unit count.",
    input_schema: {
      type: "object",
      properties: {
        scope: { type: "string", description: "A property code (e.g. '4500'), a group key (bp/sc/lik/other), or 'portfolio'" },
      },
      required: ["scope"],
    },
  },
  {
    name: "get_property_rent_roll",
    description:
      "One property's rent-roll summary computed in code: unit count, occupied vs vacant, total & occupied square footage, total annual base rent, and the largest tenants by square footage.",
    input_schema: {
      type: "object",
      properties: { property_code: { type: "string", description: "Property code, e.g. '4500'" } },
      required: ["property_code"],
    },
  },
  {
    name: "get_security_deposit",
    description:
      "Look up a tenant's security deposit by unit ref (e.g. '2300-01') or tenant name: amount held, status (on file / refunded / forfeited / partially refunded), check number, and property. Use for move-out close-outs and any deposit question.",
    input_schema: {
      type: "object",
      properties: {
        unit_ref: { type: "string", description: "Unit ref, e.g. '2300-01'" },
        tenant: { type: "string", description: "Tenant/company name substring (used if no unit ref)" },
      },
    },
  },
  {
    name: "find_tenants_by_cam_term",
    description:
      "Find tenants across the portfolio whose CAM/INS/RET reconciliation methodology matches a lease term — the source of truth on the unit page. Use for questions like 'who has a CAM exclusion of security', 'which tenants are gross lease', 'who has a CAM cap or RET discount', 'which tenants have an admin fee'. `term` selects the kind of clause; `match` (optional) is a substring to filter excluded-line names (e.g. 'security', 'insurance', 'management'). Note: today this reads the CAM config methodology; it will broaden to full lease-abstract terms once leases are imported.",
    input_schema: {
      type: "object",
      properties: {
        term: { type: "string", enum: ["cam_exclusion", "admin_exclusion", "gross_lease", "cam_cap", "ret_discount", "admin_fee"], description: "The lease-term / methodology clause to search for" },
        match: { type: "string", description: "Optional substring to filter excluded-line names (e.g. 'security')" },
      },
      required: ["term"],
    },
  },
];

const FINANCIAL_TOOLS: ToolDef[] = [
  {
    name: "get_operating_statement",
    description:
      "Get a property's operating-statement rollups for a year (defaults to the current year): YTD revenue, operating expenses, NOI, and cash flow — actual vs budget where a budget exists. Numbers are computed from the imported GL.",
    input_schema: {
      type: "object",
      properties: {
        property_code: { type: "string", description: "Property code, e.g. '3610'" },
        year: { type: "number", description: "Statement year (defaults to current year)" },
      },
      required: ["property_code"],
    },
  },
  {
    name: "get_noi_trend",
    description:
      "Multi-year / year-over-year financials for one property: revenue, operating expenses, and NOI for each year, plus the year-over-year change. Give an explicit range with from_year and to_year (e.g. 2022 to 2025) OR omit them to get the last N years (default 3). Each year is reported through its own latest imported period, AND a strictly period-aligned series is included so the comparison is apples-to-apples. Every figure and delta is computed in code. Use this for any 'year over year', 'from YYYY to YYYY', 'vs last year', or multi-year trend question.",
    input_schema: {
      type: "object",
      properties: {
        property_code: { type: "string", description: "Property code, e.g. '4500'" },
        from_year: { type: "number", description: "First year of an explicit range (inclusive)" },
        to_year: { type: "number", description: "Last year of an explicit range (inclusive)" },
        years: { type: "number", description: "If no range given, how many recent years to include (default 3)" },
      },
      required: ["property_code"],
    },
  },
  {
    name: "get_statement_detail",
    description:
      "Full line-item detail of a property's operating statement for a year: every revenue and expense line with its YTD actual and budget, grouped by section. Use to answer 'what did we spend on <utilities / management fee / repairs / etc>' or 'break down the expenses'.",
    input_schema: {
      type: "object",
      properties: {
        property_code: { type: "string", description: "Property code, e.g. '4500'" },
        year: { type: "number", description: "Statement year (defaults to current year)" },
      },
      required: ["property_code"],
    },
  },
  {
    name: "rank_properties",
    description:
      "Rank every property that has an operating statement for a year by a metric: 'noi', 'revenue', 'opex', 'noi_margin' (NOI ÷ revenue), or 'noi_vs_budget' (actual NOI minus budgeted NOI). Optionally restrict to a group. Use for 'top / bottom / best / worst / which property has the most/least …' questions. Computed in code.",
    input_schema: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["noi", "revenue", "opex", "noi_margin", "noi_vs_budget"], description: "Metric to rank by" },
        year: { type: "number", description: "Year (defaults to current year)" },
        group: { type: "string", enum: ["bp", "sc", "lik", "other"], description: "Optional: restrict to Business Parks (bp), Shopping Centers (sc), LIK, or Other" },
        order: { type: "string", enum: ["desc", "asc"], description: "desc = highest first (default), asc = lowest first" },
      },
      required: ["metric"],
    },
  },
  {
    name: "portfolio_rollup",
    description:
      "Aggregate operating-statement totals for a year across the whole portfolio or one group: total revenue, operating expenses, NOI, and cash flow — actual vs budget — plus the count of properties included. Use for 'total NOI', 'how are the shopping centers doing overall', portfolio-wide sums. Computed in code.",
    input_schema: {
      type: "object",
      properties: {
        year: { type: "number", description: "Year (defaults to current year)" },
        group: { type: "string", enum: ["bp", "sc", "lik", "other"], description: "Optional: restrict to one group; omit for the whole portfolio" },
      },
    },
  },
  {
    name: "debt_summary",
    description:
      "Portfolio debt aggregates: total projected outstanding balance, weighted-average interest rate, total monthly & annual debt service, and loans maturing within 24 months. Computed in code.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_monthly_report",
    description:
      "Get the company-wide Monthly Review snapshot: portfolio occupancy, per-group (Business Parks / Shopping Centers / LIK / Other) occupancy and NOI vs budget, new & vacated leases, upcoming expirations, and open service requests.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_debt",
    description: "List the managed loans with lender, property, current projected balance, rate, monthly debt service, maturity date, and status.",
    input_schema: { type: "object", properties: {} },
  },
];

// ── Tool executors (read-only against existing stores) ─────────────────────
async function currentRoll(): Promise<RentRollData | null> {
  return (await getJSON("rentroll", "current").catch(() => null)) as RentRollData | null;
}

function propertySummary(p: (typeof PROPERTY_DEFS)[number]) {
  return {
    code: p.id, name: p.name, type: p.type,
    address: [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ") || null,
    owner: ownerNamesForProperty(p.id).join(", ") || null,
    sqft: p.sqft ?? null,
  };
}

// ── Shared operating-statement machinery (reused by every financial tool) ──
type StmtInputs = {
  mappings: { key: string; propertyCode: string; entityName: string }[];
  byKeyYear: Map<string, StoredGl[]>; // key -> `${glKey}::${year}`
};
async function loadStatementInputs(): Promise<StmtInputs> {
  const [mappings, fulls] = await Promise.all([availableStatements(), listFullGls()]);
  const byKeyYear = new Map<string, StoredGl[]>();
  for (const g of fulls) {
    const k = `${g.key}::${g.year}`;
    const a = byKeyYear.get(k) ?? [];
    a.push(g);
    byKeyYear.set(k, a);
  }
  return { mappings, byKeyYear };
}
function yearsForKey(byKeyYear: Map<string, StoredGl[]>, glKey: string): number[] {
  const ys = new Set<number>();
  for (const k of byKeyYear.keys()) {
    const idx = k.lastIndexOf("::");
    if (k.slice(0, idx) === glKey) ys.add(Number(k.slice(idx + 2)));
  }
  return [...ys].sort((a, b) => a - b);
}
type YearFinancials = {
  period: number;
  revenue: number; opex: number; noi: number; noiBudget: number | null; cfAfterDebt: number;
  statement: ReturnType<typeof computeStatement>;
};
// Compute one property-year. forcePeriod caps the YTD period for apples-to-apples
// alignment across years; otherwise the file's latest period is used.
async function computeYearFinancials(
  mapping: StatementMapping, propertyCode: string, year: number, gls: StoredGl[], forcePeriod?: number,
): Promise<YearFinancials | null> {
  const stored = assembleGls(gls);
  if (!stored) return null;
  const period = Math.max(1, Math.min(forcePeriod ?? stored.maxPeriodInFile, stored.maxPeriodInFile));
  if (period < 1) return null;
  const glSum = summaryForPeriod(stored.monthly, period);
  const budget = await resolvePropertyBudget(propertyCode, year);
  const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
  const st = computeStatement({ mapping, propertyName: mapping.entityName, year, period, gl: glSum, budgetLookup });
  const r = st.rollups;
  return {
    period,
    revenue: r.totalRevenues.ytdActual,
    opex: r.totalOperatingExpenses.ytdActual,
    noi: r.netOperatingIncome.ytdActual,
    noiBudget: r.netOperatingIncome.ytdBudget,
    cfAfterDebt: r.cashFlowAfterDebtService.ytdActual,
    statement: st,
  };
}
const round = (n: number) => Math.round(n);

async function runTool(name: string, input: Record<string, unknown>, showFinancials: boolean): Promise<unknown> {
  switch (name) {
    case "list_properties":
      return PROPERTY_DEFS.map(propertySummary);

    case "get_property": {
      const q = String(input.query ?? "").trim().toLowerCase();
      if (!q) return { error: "query is required" };
      const hit =
        PROPERTY_DEFS.find((p) => p.id.toLowerCase() === q) ??
        PROPERTY_DEFS.find((p) => p.id.toLowerCase().startsWith(q)) ??
        PROPERTY_DEFS.find((p) => p.name.toLowerCase().includes(q));
      return hit ? propertySummary(hit) : { error: `No property matching "${input.query}"` };
    }

    case "search_tenants": {
      const roll = await currentRoll();
      const nameQ = String(input.name ?? "").trim().toLowerCase();
      const propQ = String(input.property ?? "").trim().toLowerCase();
      const out: { tenant: string; property: string; unit: string; sqft: number; leaseTo: string | null }[] = [];
      for (const p of roll?.properties ?? []) {
        if (propQ && p.propertyCode.toLowerCase() !== propQ) continue;
        for (const u of p.units ?? []) {
          if (u.isVacant || u.amenity || !u.occupantName) continue;
          if (nameQ && !u.occupantName.toLowerCase().includes(nameQ)) continue;
          out.push({ tenant: u.occupantName, property: p.propertyCode, unit: u.unitRef, sqft: u.sqft ?? 0, leaseTo: u.leaseTo });
        }
      }
      return { count: out.length, tenants: out.slice(0, 200) };
    }

    case "list_expirations": {
      const days = Number.isFinite(input.within_days) ? Number(input.within_days) : 90;
      const roll = await currentRoll();
      const now = new Date();
      const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
      const out: { tenant: string; property: string; unit: string; leaseTo: string; sqft: number }[] = [];
      for (const p of roll?.properties ?? []) for (const u of p.units ?? []) {
        if (u.isVacant || u.amenity || !u.occupantName || !u.leaseTo) continue;
        const end = new Date(u.leaseTo);
        if (isNaN(end.getTime()) || end < now || end > cutoff) continue;
        out.push({ tenant: u.occupantName, property: p.propertyCode, unit: u.unitRef, leaseTo: u.leaseTo, sqft: u.sqft ?? 0 });
      }
      out.sort((a, b) => a.leaseTo.localeCompare(b.leaseTo));
      return { withinDays: days, count: out.length, expirations: out.slice(0, 100) };
    }

    case "get_cam_config": {
      const unitRef = String(input.unit_ref ?? "").trim();
      if (!unitRef) return { error: "unit_ref is required" };
      const cfg = (await getCamConfig(unitRef)) ?? seedCamConfig(unitRef);
      if (!cfg) return { error: `No CAM config for "${unitRef}" (not yet configured; defaults to computed-from-SF).` };
      return {
        unitRef: cfg.unitRef,
        grossLease: cfg.grossLease,
        cam: cfg.cam, ins: cfg.ins, ret: cfg.ret,
        retDiscountPct: cfg.retDiscountPct ?? null,
        camExcludedLines: cfg.camExcludedLines ?? [],
        camAdminExcludedLines: cfg.camAdminExcludedLines ?? [],
        camExcludedOther: cfg.camExcludedOther ?? null,
        camCap: cfg.camCap ?? null,
      };
    }

    case "get_tasks": {
      const weeks = Number.isFinite(input.weeks) ? Math.max(1, Number(input.weeks)) : 1;
      const now = new Date();
      const sinceMon = (now.getDay() + 6) % 7;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * weeks - 1, 23, 59, 59);
      return taskOccurrencesBetween(start, end).map((t) => ({ task: t.label, due: t.date.toISOString().slice(0, 10), category: t.category }));
    }

    case "list_service_requests": {
      try {
        const reqs = (await listRequests())
          .filter((r) => r.status !== "Complete")
          .slice(0, 60)
          .map((r) => ({ subject: r.subject, property: r.propertyCode, priority: r.priority || "—", status: r.status }));
        return { count: reqs.length, requests: reqs };
      } catch { return { count: 0, requests: [] }; }
    }

    case "aggregate_tenants": {
      const roll = await currentRoll();
      const propQ = String(input.property ?? "").trim().toLowerCase();
      const groupQ = typeof input.group === "string" ? (input.group as ReportGroupKey) : null;
      const minSqft = Number.isFinite(input.min_sqft) ? Number(input.min_sqft) : 0;
      const expDays = Number.isFinite(input.expiring_within_days) ? Number(input.expiring_within_days) : null;
      const now = new Date();
      const cutoff = expDays != null ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + expDays) : null;
      let count = 0, totalSqft = 0, totalAnnualRent = 0;
      for (const p of roll?.properties ?? []) {
        if (propQ && p.propertyCode.toLowerCase() !== propQ) continue;
        if (groupQ && groupOf(p.propertyCode) !== groupQ) continue;
        for (const u of p.units ?? []) {
          if (u.isVacant || u.amenity || !u.occupantName) continue;
          if ((u.sqft ?? 0) < minSqft) continue;
          if (cutoff) {
            if (!u.leaseTo) continue;
            const end = new Date(u.leaseTo);
            if (isNaN(end.getTime()) || end < now || end > cutoff) continue;
          }
          count += 1;
          totalSqft += u.sqft ?? 0;
          totalAnnualRent += (u.baseRent ?? 0) * 12;
        }
      }
      return {
        filters: { property: propQ || null, group: groupQ ? REPORT_GROUP_LABELS[groupQ] : null, minSqft: minSqft || null, expiringWithinDays: expDays },
        tenantCount: count,
        totalOccupiedSqft: round(totalSqft),
        totalAnnualBaseRent: round(totalAnnualRent),
        avgRentPerSqft: totalSqft > 0 ? Math.round((totalAnnualRent / totalSqft) * 100) / 100 : null,
      };
    }

    case "get_occupancy": {
      const scope = String(input.scope ?? "").trim();
      if (!scope) return { error: "scope is required" };
      const roll = await currentRoll();
      const groupKeys: ReportGroupKey[] = ["bp", "sc", "lik", "other"];
      const asGroup = groupKeys.includes(scope.toLowerCase() as ReportGroupKey) ? (scope.toLowerCase() as ReportGroupKey) : null;
      const isPortfolio = scope.toLowerCase() === "portfolio" || scope.toLowerCase() === "all";
      let totalSqft = 0, occSqft = 0, units = 0, vacantUnits = 0;
      for (const p of roll?.properties ?? []) {
        if (!isPortfolio && !asGroup && p.propertyCode.toLowerCase() !== scope.toLowerCase()) continue;
        if (asGroup && groupOf(p.propertyCode) !== asGroup) continue;
        for (const u of p.units ?? []) {
          const sf = u.sqft ?? 0;
          totalSqft += sf; units += 1;
          if (u.isVacant) { vacantUnits += 1; } else { occSqft += sf; }
        }
      }
      if (units === 0) return { error: `No rent-roll units found for scope "${scope}".` };
      return {
        scope: isPortfolio ? "Whole portfolio" : asGroup ? REPORT_GROUP_LABELS[asGroup] : scope,
        totalSqft: round(totalSqft), occupiedSqft: round(occSqft), vacantSqft: round(totalSqft - occSqft),
        occupancyPct: totalSqft > 0 ? Math.round((occSqft / totalSqft) * 1000) / 10 : null,
        unitCount: units, vacantUnitCount: vacantUnits,
      };
    }

    case "get_property_rent_roll": {
      const code = String(input.property_code ?? "").trim();
      if (!code) return { error: "property_code is required" };
      const roll = await currentRoll();
      const p = (roll?.properties ?? []).find((x) => x.propertyCode.toLowerCase() === code.toLowerCase());
      if (!p) return { error: `No rent roll for property "${code}".` };
      let totalSqft = 0, occSqft = 0, occupied = 0, vacant = 0, totalAnnualRent = 0;
      const tenants: { tenant: string; unit: string; sqft: number; annualRent: number; leaseTo: string | null }[] = [];
      for (const u of p.units ?? []) {
        const sf = u.sqft ?? 0;
        totalSqft += sf;
        if (u.isVacant) { vacant += 1; continue; }
        occupied += 1; occSqft += sf;
        if (!u.amenity && u.occupantName) {
          totalAnnualRent += (u.baseRent ?? 0) * 12;
          tenants.push({ tenant: u.occupantName, unit: u.unitRef, sqft: sf, annualRent: round((u.baseRent ?? 0) * 12), leaseTo: u.leaseTo });
        }
      }
      tenants.sort((a, b) => b.sqft - a.sqft);
      return {
        property: code,
        unitCount: (p.units ?? []).length, occupiedUnits: occupied, vacantUnits: vacant,
        totalSqft: round(totalSqft), occupiedSqft: round(occSqft),
        occupancyPct: totalSqft > 0 ? Math.round((occSqft / totalSqft) * 1000) / 10 : null,
        totalAnnualBaseRent: round(totalAnnualRent),
        largestTenants: tenants.slice(0, 10),
      };
    }

    case "get_security_deposit": {
      const unitRef = String(input.unit_ref ?? "").trim().toLowerCase();
      const tenantQ = String(input.tenant ?? "").trim().toLowerCase();
      if (!unitRef && !tenantQ) return { error: "unit_ref or tenant is required" };
      try {
        const all = await listDeposits();
        let matches = unitRef ? all.filter((d) => d.unitRef.toLowerCase() === unitRef) : [];
        if (!matches.length && tenantQ) matches = all.filter((d) => d.tenantCompany.toLowerCase().includes(tenantQ));
        if (!matches.length) return { error: `No security deposit on record for ${input.unit_ref || input.tenant}.` };
        const statusOf = (d: (typeof all)[number]) => d.refunded ? "refunded" : d.tenantDefaulted ? "forfeited" : d.partialRefund ? "partially refunded" : "on file";
        return {
          count: matches.length,
          deposits: matches.slice(0, 10).map((d) => ({
            unitRef: d.unitRef, tenant: d.tenantCompany, property: d.propertyCode,
            amount: Math.round(d.amount), status: statusOf(d), checkNumber: d.checkNumber || null,
            partialRefundAmount: d.partialRefund ? Math.round(d.partialRefundAmount) : null,
          })),
        };
      } catch { return { error: "Deposit data unavailable." }; }
    }

    case "find_tenants_by_cam_term": {
      const termType = String(input.term ?? "").trim();
      const matchQ = String(input.match ?? "").trim().toLowerCase();
      const units = Object.keys(RETAIL_CONFIG_SEED);
      const hits: { unitRef: string; detail: string }[] = [];
      for (const unitRef of units) {
        const cfg = (await getCamConfig(unitRef)) ?? seedCamConfig(unitRef);
        if (!cfg) continue;
        const matchLine = (lines: string[]) => lines.filter((l) => !matchQ || l.toLowerCase().includes(matchQ));
        switch (termType) {
          case "cam_exclusion": {
            const ex = matchLine(cfg.camExcludedLines ?? []);
            const other = cfg.camExcludedOther && (!matchQ || cfg.camExcludedOther.description.toLowerCase().includes(matchQ)) ? [cfg.camExcludedOther.description] : [];
            if (ex.length || other.length) hits.push({ unitRef, detail: `CAM excluded: ${[...ex, ...other].join(", ")}` });
            break;
          }
          case "admin_exclusion": {
            const ex = matchLine(cfg.camAdminExcludedLines ?? []);
            if (ex.length) hits.push({ unitRef, detail: `Excluded from admin fee: ${ex.join(", ")}` });
            break;
          }
          case "gross_lease":
            if (cfg.grossLease) hits.push({ unitRef, detail: "Gross lease (no CAM/INS/RET reconciliation)" });
            break;
          case "cam_cap":
            if (cfg.camCap) hits.push({ unitRef, detail: `CAM cap: ${cfg.camCap.controllableAmount} (${cfg.camCap.priorYear} controllable) +${cfg.camCap.growthPct}%/yr` });
            break;
          case "ret_discount":
            if (cfg.retDiscountPct != null && cfg.retDiscountPct !== 0) hits.push({ unitRef, detail: `RET discount ${cfg.retDiscountPct}%` });
            break;
          case "admin_fee":
            if (cfg.cam.adminFeePct != null && cfg.cam.adminFeePct !== 0) hits.push({ unitRef, detail: `CAM admin fee ${cfg.cam.adminFeePct}%` });
            break;
          default:
            return { error: `Unknown term "${termType}". Use one of: cam_exclusion, admin_exclusion, gross_lease, cam_cap, ret_discount, admin_fee.` };
        }
      }
      return { term: termType, match: matchQ || null, count: hits.length, tenants: hits.slice(0, 200), note: "Searches per-tenant CAM/INS/RET methodology from the config seed (the source of truth on the unit page). This will broaden to full lease-abstract terms once leases are imported." };
    }

    // ── Financial (gated) ──
    case "get_operating_statement": {
      if (!showFinancials) return { error: "Not authorized to view financials." };
      const code = String(input.property_code ?? "").trim();
      if (!code) return { error: "property_code is required" };
      const year = Number.isFinite(input.year) ? Number(input.year) : new Date().getFullYear();
      try {
        const { mappings, byKeyYear } = await loadStatementInputs();
        const m = mappings.find((x) => x.propertyCode === code || x.key === code);
        if (!m) return { error: `No operating statement mapped for "${code}".` };
        const gls = byKeyYear.get(`${m.key}::${year}`) ?? [];
        if (!gls.length) return { error: `No GL imported for ${code} in ${year}.` };
        const mapping = await getMapping(m.key);
        if (!mapping) return { error: `No mapping for ${code}.` };
        const f = await computeYearFinancials(mapping, m.propertyCode, year, gls);
        if (!f) return { error: `Could not compute ${code} for ${year}.` };
        return {
          property: code, name: mapping.entityName, year, throughPeriod: f.period,
          totalRevenues: round(f.revenue),
          totalOperatingExpenses: round(f.opex),
          netOperatingIncome: round(f.noi),
          netOperatingIncomeBudget: f.noiBudget == null ? null : round(f.noiBudget),
          cashFlowAfterDebtService: round(f.cfAfterDebt),
        };
      } catch (e) { return { error: e instanceof Error ? e.message : "Failed to compute statement." }; }
    }

    case "get_noi_trend": {
      if (!showFinancials) return { error: "Not authorized to view financials." };
      const code = String(input.property_code ?? "").trim();
      if (!code) return { error: "property_code is required" };
      try {
        const { mappings, byKeyYear } = await loadStatementInputs();
        const m = mappings.find((x) => x.propertyCode === code || x.key === code);
        if (!m) return { error: `No operating statement mapped for "${code}".` };
        const mapping = await getMapping(m.key);
        if (!mapping) return { error: `No mapping for ${code}.` };
        const available = yearsForKey(byKeyYear, m.key);
        if (!available.length) return { error: `No GL imported for ${code} in any year.` };
        // Resolve the requested set of years.
        let wanted: number[];
        if (Number.isFinite(input.from_year) || Number.isFinite(input.to_year)) {
          const lo = Number.isFinite(input.from_year) ? Number(input.from_year) : Math.min(...available);
          const hi = Number.isFinite(input.to_year) ? Number(input.to_year) : Math.max(...available);
          wanted = available.filter((y) => y >= Math.min(lo, hi) && y <= Math.max(lo, hi));
        } else {
          const n = Number.isFinite(input.years) ? Math.max(1, Number(input.years)) : 3;
          wanted = available.slice(-n);
        }
        if (!wanted.length) return { error: `No GL imported for ${code} in the requested year range.` };
        // Each year at its own latest period.
        const own = (await Promise.all(wanted.map(async (y) => {
          const f = await computeYearFinancials(mapping, m.propertyCode, y, byKeyYear.get(`${m.key}::${y}`) ?? []);
          return f ? { year: y, throughPeriod: f.period, revenue: round(f.revenue), opex: round(f.opex), noi: round(f.noi), noiBudget: f.noiBudget == null ? null : round(f.noiBudget) } : null;
        }))).filter(Boolean) as { year: number; throughPeriod: number; revenue: number; opex: number; noi: number; noiBudget: number | null }[];
        if (!own.length) return { error: `Could not compute any year for ${code}.` };
        // Strictly period-aligned series for apples-to-apples YoY.
        const alignPeriod = Math.min(...own.map((o) => o.throughPeriod));
        const aligned = (await Promise.all(own.map(async (o) => {
          const f = await computeYearFinancials(mapping, m.propertyCode, o.year, byKeyYear.get(`${m.key}::${o.year}`) ?? [], alignPeriod);
          return f ? { year: o.year, revenue: round(f.revenue), opex: round(f.opex), noi: round(f.noi) } : null;
        }))).filter(Boolean) as { year: number; revenue: number; opex: number; noi: number }[];
        const yoy = aligned.slice(1).map((cur, i) => {
          const prev = aligned[i];
          const chg = cur.noi - prev.noi;
          return { from: prev.year, to: cur.year, noiChange: chg, noiPctChange: prev.noi !== 0 ? Math.round((chg / Math.abs(prev.noi)) * 1000) / 10 : null };
        });
        return {
          property: code, name: mapping.entityName,
          note: "byYear reports each year through its own latest imported period; aligned recomputes every year through the same YTD period (through period " + alignPeriod + ") so year-over-year is apples-to-apples.",
          byYear: own,
          alignedThroughPeriod: alignPeriod,
          aligned,
          yearOverYear: yoy,
        };
      } catch (e) { return { error: e instanceof Error ? e.message : "Failed to compute trend." }; }
    }

    case "get_statement_detail": {
      if (!showFinancials) return { error: "Not authorized to view financials." };
      const code = String(input.property_code ?? "").trim();
      if (!code) return { error: "property_code is required" };
      const year = Number.isFinite(input.year) ? Number(input.year) : new Date().getFullYear();
      try {
        const { mappings, byKeyYear } = await loadStatementInputs();
        const m = mappings.find((x) => x.propertyCode === code || x.key === code);
        if (!m) return { error: `No operating statement mapped for "${code}".` };
        const gls = byKeyYear.get(`${m.key}::${year}`) ?? [];
        if (!gls.length) return { error: `No GL imported for ${code} in ${year}.` };
        const mapping = await getMapping(m.key);
        if (!mapping) return { error: `No mapping for ${code}.` };
        const f = await computeYearFinancials(mapping, m.propertyCode, year, gls);
        if (!f) return { error: `Could not compute ${code} for ${year}.` };
        const sections = f.statement.sections.map((s) => ({
          section: s.name, role: s.role,
          lines: s.lines
            .filter((l) => Math.abs(l.ytdActual) > 0.5 || (l.ytdBudget ?? 0) !== 0)
            .map((l) => ({ line: l.label, ytdActual: round(l.ytdActual), ytdBudget: l.ytdBudget == null ? null : round(l.ytdBudget) })),
          subtotalYtdActual: round(s.subtotal.ytdActual),
        }));
        return { property: code, name: mapping.entityName, year, throughPeriod: f.period, sections, netOperatingIncome: round(f.noi) };
      } catch (e) { return { error: e instanceof Error ? e.message : "Failed to compute detail." }; }
    }

    case "rank_properties": {
      if (!showFinancials) return { error: "Not authorized to view financials." };
      const metric = String(input.metric ?? "noi");
      const year = Number.isFinite(input.year) ? Number(input.year) : new Date().getFullYear();
      const groupFilter = typeof input.group === "string" ? (input.group as ReportGroupKey) : null;
      const order = input.order === "asc" ? "asc" : "desc";
      try {
        const { mappings, byKeyYear } = await loadStatementInputs();
        const rows = (await Promise.all(mappings.map(async (m) => {
          if (groupFilter && groupOf(m.propertyCode) !== groupFilter) return null;
          const gls = byKeyYear.get(`${m.key}::${year}`) ?? [];
          if (!gls.length) return null;
          const mapping = await getMapping(m.key);
          if (!mapping) return null;
          const f = await computeYearFinancials(mapping, m.propertyCode, year, gls);
          if (!f) return null;
          let value: number | null;
          switch (metric) {
            case "revenue": value = f.revenue; break;
            case "opex": value = f.opex; break;
            case "noi_margin": value = f.revenue !== 0 ? Math.round((f.noi / f.revenue) * 1000) / 10 : null; break;
            case "noi_vs_budget": value = f.noiBudget == null ? null : f.noi - f.noiBudget; break;
            default: value = f.noi;
          }
          if (value == null) return null;
          return { property: m.propertyCode, name: mapping.entityName, group: REPORT_GROUP_LABELS[groupOf(m.propertyCode)], throughPeriod: f.period, value: metric === "noi_margin" ? value : round(value) };
        }))).filter(Boolean) as { property: string; name: string; group: string; throughPeriod: number; value: number }[];
        rows.sort((a, b) => order === "asc" ? a.value - b.value : b.value - a.value);
        return { metric, year, group: groupFilter ? REPORT_GROUP_LABELS[groupFilter] : "All", unit: metric === "noi_margin" ? "percent" : "dollars", count: rows.length, ranked: rows };
      } catch (e) { return { error: e instanceof Error ? e.message : "Failed to rank." }; }
    }

    case "portfolio_rollup": {
      if (!showFinancials) return { error: "Not authorized to view financials." };
      const year = Number.isFinite(input.year) ? Number(input.year) : new Date().getFullYear();
      const groupFilter = typeof input.group === "string" ? (input.group as ReportGroupKey) : null;
      try {
        const { mappings, byKeyYear } = await loadStatementInputs();
        let revenue = 0, opex = 0, noi = 0, noiBudget = 0, hasBudget = false, cf = 0, n = 0;
        const included: string[] = [];
        await Promise.all(mappings.map(async (m) => {
          if (groupFilter && groupOf(m.propertyCode) !== groupFilter) return;
          const gls = byKeyYear.get(`${m.key}::${year}`) ?? [];
          if (!gls.length) return;
          const mapping = await getMapping(m.key);
          if (!mapping) return;
          const f = await computeYearFinancials(mapping, m.propertyCode, year, gls);
          if (!f) return;
          revenue += f.revenue; opex += f.opex; noi += f.noi; cf += f.cfAfterDebt; n += 1;
          if (f.noiBudget != null) { noiBudget += f.noiBudget; hasBudget = true; }
          included.push(m.propertyCode);
        }));
        if (!n) return { error: `No operating statements found for ${year}${groupFilter ? ` in ${REPORT_GROUP_LABELS[groupFilter]}` : ""}.` };
        return {
          year, scope: groupFilter ? REPORT_GROUP_LABELS[groupFilter] : "Whole portfolio",
          propertiesIncluded: n, properties: included,
          totalRevenue: round(revenue), totalOperatingExpenses: round(opex),
          netOperatingIncome: round(noi), netOperatingIncomeBudget: hasBudget ? round(noiBudget) : null,
          cashFlowAfterDebtService: round(cf),
        };
      } catch (e) { return { error: e instanceof Error ? e.message : "Failed to roll up." }; }
    }

    case "debt_summary": {
      if (!showFinancials) return { error: "Not authorized to view financials." };
      try {
        const loans = await listLoans();
        const now = new Date();
        const in24 = new Date(now.getFullYear(), now.getMonth() + 24, now.getDate());
        let balance = 0, weightedRate = 0, monthly = 0;
        const maturing: { lender: string; property: string; maturityDate: string; projectedBalance: number }[] = [];
        for (const l of loans) {
          const s = summarizeLoan(l);
          balance += s.projectedBalance;
          weightedRate += s.projectedBalance * l.annualRatePct;
          monthly += s.monthlyDebtService;
          const mat = new Date(l.maturityDate);
          if (!isNaN(mat.getTime()) && mat >= now && mat <= in24) maturing.push({ lender: l.lender, property: l.property, maturityDate: l.maturityDate, projectedBalance: round(s.projectedBalance) });
        }
        maturing.sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));
        return {
          loanCount: loans.length,
          totalProjectedBalance: round(balance),
          weightedAvgRatePct: balance > 0 ? Math.round((weightedRate / balance) * 100) / 100 : null,
          totalMonthlyDebtService: round(monthly),
          totalAnnualDebtService: round(monthly * 12),
          maturingWithin24Months: maturing,
        };
      } catch (e) { return { error: e instanceof Error ? e.message : "Failed to summarize debt." }; }
    }

    case "get_monthly_report": {
      if (!showFinancials) return { error: "Not authorized to view financials." };
      const now = new Date();
      const report = await buildMonthlyReport(now.getFullYear(), now.getMonth() + 1, now).catch(() => null);
      if (!report) return { error: "Monthly report unavailable." };
      return {
        month: report.monthLabel,
        portfolio: {
          occPct: Math.round(report.portfolio.occPct * 10) / 10,
          totalSqft: report.portfolio.totalSqft, vacantSqft: report.portfolio.vacantSqft,
          noiActualYTD: report.portfolio.noiActual, noiBudgetYTD: report.portfolio.noiBudget,
          openServiceRequests: report.portfolio.openRequests,
        },
        groups: report.groups.map((g) => ({ group: g.label, occPct: Math.round(g.occPct * 10) / 10, totalSqft: g.totalSqft, vacantUnits: g.vacantUnits, noiActual: g.noiActual, noiBudget: g.noiBudget })),
        newLeases: report.newLeases, vacated: report.vacated, expirations: report.expirations.slice(0, 30), upcoming: report.upcoming,
      };
    }

    case "list_debt": {
      if (!showFinancials) return { error: "Not authorized to view financials." };
      try {
        const loans = await listLoans();
        return loans.map((l) => {
          const s = summarizeLoan(l);
          return {
            lender: l.lender, property: l.property, collateral: l.collateral, group: l.group,
            projectedBalance: Math.round(s.projectedBalance), annualRatePct: l.annualRatePct,
            monthlyDebtService: Math.round(s.monthlyDebtService), maturityDate: l.maturityDate, status: s.status,
          };
        });
      } catch { return { error: "Debt data unavailable." }; }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Agentic loop ───────────────────────────────────────────────────────────
type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: string; [k: string]: unknown };

export async function POST(req: Request) {
  let body: { q?: string; history?: { role?: string; content?: string }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const q = (body.q ?? "").trim();
  if (!q) return NextResponse.json({ error: "Empty question" }, { status: 400 });

  // Prior turns (plain text) so follow-ups keep context. Keep it bounded.
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t?.content === "string" && t.content.trim())
    .slice(-8)
    .map((t) => ({ role: t.role as "user" | "assistant", content: (t.content as string).slice(0, 4000) }));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI isn't configured (ANTHROPIC_API_KEY not set)." }, { status: 503 });

  const showFinancials = await canSeeFinancials();
  const tools = showFinancials ? [...OPERATIONAL_TOOLS, ...FINANCIAL_TOOLS] : OPERATIONAL_TOOLS;

  const system =
    `You are the built-in assistant for Korman Commercial Properties' internal property-management portal — the "brain" of the program. ` +
    `Answer the user's question by calling the provided tools to look up live data, then giving a concise, direct answer. ` +
    `Use the tools as many times as needed; chain them (e.g. find a property code, then pull its operating statement). ` +
    `Rules: answer ONLY from tool results — NEVER guess, estimate, or invent numbers, names, or dates. If the tools don't have the answer, say so plainly and point to the most relevant page. ` +
    `Every figure in your answer must come from a tool result. For totals, rankings, year-over-year, averages, or any cross-record math, ALWAYS use the aggregate/rank/rollup/trend tools that compute the number in code — do NOT add, subtract, or average figures yourself. When comparing years, prefer get_noi_trend's period-aligned series. Today is ${new Date().toISOString().slice(0, 10)}.\n\n` +
    (showFinancials ? "" : "You do NOT have access to financial figures (NOI, budget, debt) for this user — do not attempt to state them.\n\n") +
    `When you have enough to answer, reply with ONLY a JSON object (no prose around it): ` +
    `{"answer": "markdown string", "links": [{"label": "...", "href": "/route"}], "chart": null | {"type": "bar"|"line", "title": "...", "unit": "dollars"|"percent"|"sqft"|"count", "series": [{"label": "...", "value": number}]}, "letter": null | {"kind": "...", "to": "...", "subject": "...", "body": "..."}}. ` +
    `Put 1-4 relevant page links in "links", choosing hrefs from this list of routes: ${ROUTES.map((r) => r.path).join(", ")}. ` +
    `Prefer DEEP links straight to the specific record when you know it, using these exact shapes: /units/<unitRef> (a unit's tenant + CAM config page, e.g. /units/2300-01), /properties/<code> (a property page, e.g. /properties/4500), /maintenance?property=<code> (also tab=completed, priority, status, assignee, category), /rentroll/base-years?property=<code> (a property's expense history), /reservations?openId=<id>, /debt?openId=<id>. Use real unit refs / property codes from your tool results — never guess an id you don't have. ` +
    `Include a "chart" ONLY when the answer is naturally visual — a multi-year/YoY trend (use "line"), a ranking or a breakdown/comparison across properties or categories (use "bar"). Otherwise set "chart" to null. ` +
    `CRITICAL: every value in chart.series must be an exact number copied from a tool result — never invent, round differently, or interpolate. For year-over-year use the period-aligned series so the years are comparable. Pick the single most useful chart; keep it to at most ~12 points. Keep the text answer complete on its own — the chart supplements it. ` +
    `Include a "letter" ONLY when the user asks you to write/draft a letter, memo, email, or notice (e.g. a CAM statement cover letter, a lease-renewal inquiry, a move-out close-out notice). Compose it professionally on behalf of Korman Commercial Properties, using the tenant name, property, unit, and lease dates you looked up via tools. ` +
    `The letter is a DRAFT the user will review and send themselves — do NOT claim it has been sent. For a move-out close-out letter, call get_security_deposit for the tenant's real deposit amount and status and reference it. For any figure you still do not have from a tool result (e.g. a CAM balance you couldn't fetch), insert a clearly-bracketed placeholder like [CAM balance due: $____] rather than inventing a number. Set "kind" to a short label ("Renewal inquiry", "CAM cover letter", "Move-out close-out", etc.). When you include a letter, keep "answer" to one short line (e.g. "Draft renewal letter for Acme Corp — review before sending.") Otherwise set "letter" to null. ` +
    `Keep the answer focused on what was asked. Use short markdown (bullets, bold) where it helps. ` +
    `This may be a multi-turn conversation — resolve follow-ups ("now just the business parks", "chart that", "what about 2024") against the earlier turns, and re-run whatever tools you need for the new question.`;

  // Seed the conversation with prior turns so follow-ups have context, then the
  // new question. The agentic loop appends tool_use / tool_result for this turn.
  const messages: { role: "user" | "assistant"; content: unknown }[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: q },
  ];

  try {
    const MAX_TURNS = 6;
    let finalText = "";
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, system, tools, messages }),
      });
      if (!res.ok) return NextResponse.json({ error: `Assistant failed (${res.status}).` }, { status: 502 });
      const j = await res.json();
      const content = (j?.content ?? []) as Block[];
      messages.push({ role: "assistant", content });

      const toolUses = content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
      if (j?.stop_reason !== "tool_use" || toolUses.length === 0) {
        finalText = content.filter((b) => b.type === "text").map((b) => (b as { text?: string }).text ?? "").join("");
        break;
      }

      // Execute every requested tool and return all results in one user message.
      const results = await Promise.all(
        toolUses.map(async (tu) => {
          let out: unknown;
          try { out = await runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, showFinancials); }
          catch (e) { out = { error: e instanceof Error ? e.message : "tool failed" }; }
          return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 40000) };
        })
      );
      messages.push({ role: "user", content: results });
    }

    if (!finalText) return NextResponse.json({ answer: "I couldn't complete that lookup — try rephrasing or a more specific question.", links: [] });

    const match = finalText.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ answer: finalText.trim() || "No answer.", links: [] });
    type ChartIn = { type?: string; title?: string; unit?: string; series?: { label?: unknown; value?: unknown }[] };
    type LetterIn = { kind?: string; to?: string; subject?: string; body?: string };
    let parsed: { answer?: string; links?: { label?: string; href?: string }[]; chart?: ChartIn | null; letter?: LetterIn | null };
    try { parsed = JSON.parse(match[0]); } catch { return NextResponse.json({ answer: finalText.trim(), links: [] }); }
    const validPaths = new Set(ROUTES.map((r) => r.path));
    const links = (parsed.links ?? [])
      .map((l) => ({ raw: l, href: sanitizeDeepLink(l?.href, validPaths) }))
      .filter((l): l is { raw: { label?: string; href?: string }; href: string } => l.href !== null)
      .slice(0, 4)
      .map((l) => ({ label: String(l.raw.label ?? l.href), href: l.href }));
    // Validate the chart: only a bar/line with finite numeric series survives.
    let chart: { type: "bar" | "line"; title: string; unit: string; series: { label: string; value: number }[] } | null = null;
    const c = parsed.chart;
    if (c && (c.type === "bar" || c.type === "line") && Array.isArray(c.series)) {
      const series = c.series
        .map((p) => ({ label: String(p?.label ?? ""), value: Number(p?.value) }))
        .filter((p) => p.label && Number.isFinite(p.value))
        .slice(0, 12);
      const unit = ["dollars", "percent", "sqft", "count"].includes(String(c.unit)) ? String(c.unit) : "count";
      if (series.length >= 2) chart = { type: c.type, title: String(c.title ?? "").slice(0, 80), unit, series };
    }
    // Validate the letter: it's a review-and-send draft, so only body is required.
    let letter: { kind: string; to: string; subject: string; body: string } | null = null;
    const lt = parsed.letter;
    if (lt && typeof lt.body === "string" && lt.body.trim().length > 20) {
      letter = {
        kind: String(lt.kind ?? "Letter").slice(0, 60),
        to: String(lt.to ?? "").slice(0, 200),
        subject: String(lt.subject ?? "").slice(0, 200),
        body: lt.body.slice(0, 6000),
      };
    }
    return NextResponse.json({ answer: (parsed.answer ?? "").trim() || "No answer.", links, chart, letter });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Assistant failed" }, { status: 500 });
  }
}
