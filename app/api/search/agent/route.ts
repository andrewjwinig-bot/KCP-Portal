import { NextResponse } from "next/server";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { ownerNamesForProperty } from "@/lib/properties/ownership";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { taskOccurrencesBetween } from "@/lib/tracker/taskDefs";
import { listRequests } from "@/lib/maintenance/requestsStorage";
import { getCamConfig } from "@/lib/cam/configStorage";
import { seedCamConfig } from "@/lib/cam/retailConfigSeed";
import { buildMonthlyReport } from "@/lib/reports/monthly";
import { listLoans } from "@/lib/debt/storage";
import { summarizeLoan } from "@/lib/debt/amortization";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { listFullGls } from "@/lib/financials/operating-statements/statementStore";
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
];

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

    // ── Financial (gated) ──
    case "get_operating_statement": {
      if (!showFinancials) return { error: "Not authorized to view financials." };
      const code = String(input.property_code ?? "").trim();
      if (!code) return { error: "property_code is required" };
      const year = Number.isFinite(input.year) ? Number(input.year) : new Date().getFullYear();
      try {
        const [mappings, fulls] = await Promise.all([availableStatements(), listFullGls()]);
        const m = mappings.find((x) => x.propertyCode === code || x.key === code);
        if (!m) return { error: `No operating statement mapped for "${code}".` };
        const gls = fulls.filter((g) => g.key === m.key && g.year === year);
        const stored = assembleGls(gls);
        if (!stored) return { error: `No GL imported for ${code} in ${year}.` };
        const mapping = await getMapping(m.key);
        if (!mapping) return { error: `No mapping for ${code}.` };
        const period = Math.max(1, Math.min(12, stored.maxPeriodInFile));
        const glSum = summaryForPeriod(stored.monthly, period);
        const budget = await resolvePropertyBudget(m.propertyCode, year);
        const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
        const st = computeStatement({ mapping, propertyName: mapping.entityName, year, period, gl: glSum, budgetLookup });
        const r = st.rollups;
        const pick = (t: { ytdActual: number; ytdBudget: number | null }) => ({ ytdActual: Math.round(t.ytdActual), ytdBudget: t.ytdBudget == null ? null : Math.round(t.ytdBudget) });
        return {
          property: code, name: mapping.entityName, year, throughPeriod: period,
          totalRevenues: pick(r.totalRevenues),
          totalOperatingExpenses: pick(r.totalOperatingExpenses),
          netOperatingIncome: pick(r.netOperatingIncome),
          cashFlowAfterDebtService: pick(r.cashFlowAfterDebtService),
        };
      } catch (e) { return { error: e instanceof Error ? e.message : "Failed to compute statement." }; }
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
  let body: { q?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const q = (body.q ?? "").trim();
  if (!q) return NextResponse.json({ error: "Empty question" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI isn't configured (ANTHROPIC_API_KEY not set)." }, { status: 503 });

  const showFinancials = await canSeeFinancials();
  const tools = showFinancials ? [...OPERATIONAL_TOOLS, ...FINANCIAL_TOOLS] : OPERATIONAL_TOOLS;

  const system =
    `You are the built-in assistant for Korman Commercial Properties' internal property-management portal — the "brain" of the program. ` +
    `Answer the user's question by calling the provided tools to look up live data, then giving a concise, direct answer. ` +
    `Use the tools as many times as needed; chain them (e.g. find a property code, then pull its operating statement). ` +
    `Rules: answer ONLY from tool results — NEVER guess, estimate, or invent numbers, names, or dates. If the tools don't have the answer, say so plainly and point to the most relevant page. ` +
    `Every figure in your answer must come from a tool result. Today is ${new Date().toISOString().slice(0, 10)}.\n\n` +
    (showFinancials ? "" : "You do NOT have access to financial figures (NOI, budget, debt) for this user — do not attempt to state them.\n\n") +
    `When you have enough to answer, reply with ONLY a JSON object (no prose around it): ` +
    `{"answer": "markdown string", "links": [{"label": "...", "href": "/route"}]}. ` +
    `Put 1-4 relevant page links in "links", choosing hrefs ONLY from this list of routes: ${ROUTES.map((r) => r.path).join(", ")}. ` +
    `Keep the answer focused on what was asked. Use short markdown (bullets, bold) where it helps.`;

  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: q }];

  try {
    const MAX_TURNS = 6;
    let finalText = "";
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, system, tools, messages }),
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
    let parsed: { answer?: string; links?: { label?: string; href?: string }[] };
    try { parsed = JSON.parse(match[0]); } catch { return NextResponse.json({ answer: finalText.trim(), links: [] }); }
    const validPaths = new Set(ROUTES.map((r) => r.path));
    const links = (parsed.links ?? [])
      .filter((l) => l && typeof l.href === "string" && l.href.startsWith("/") && validPaths.has(l.href.split("?")[0]))
      .slice(0, 4)
      .map((l) => ({ label: String(l.label ?? l.href), href: l.href as string }));
    return NextResponse.json({ answer: (parsed.answer ?? "").trim() || "No answer.", links });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Assistant failed" }, { status: 500 });
  }
}
