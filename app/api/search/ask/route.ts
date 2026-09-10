import { NextResponse } from "next/server";
import { buildMonthlyReport } from "@/lib/reports/monthly";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { ownerNamesForProperty } from "@/lib/properties/ownership";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { taskOccurrencesBetween } from "@/lib/tracker/taskDefs";
import { listRequests } from "@/lib/maintenance/requestsStorage";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { isPathAllowed, ALL_USERS, type UserId } from "@/lib/users";

// Resolve the signed-in user so financial data can be gated to those who may
// see the Monthly Review (limited users get everything except financials).
async function canSeeFinancials(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  try {
    const token = (await cookies()).get(SITE_COOKIE)?.value;
    const id = await verifySiteToken(token, secret);
    return !!id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/reports/monthly");
  } catch { return false; }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// The pages the assistant can point at (for grounded links).
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

export async function POST(req: Request) {
  let body: { q?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const q = (body.q ?? "").trim();
  if (!q) return NextResponse.json({ error: "Empty question" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI isn't configured (ANTHROPIC_API_KEY not set)." }, { status: 503 });

  const now = new Date();
  const showFinancials = await canSeeFinancials();

  // ── Assemble a grounded snapshot of the program ──
  const report = await buildMonthlyReport(now.getFullYear(), now.getMonth() + 1, now).catch(() => null);

  const properties = PROPERTY_DEFS.map((p) => ({
    code: p.id, name: p.name, type: p.type,
    address: [p.address, p.city, p.state].filter(Boolean).join(", ") || null,
    owner: ownerNamesForProperty(p.id).join(", ") || null,
    sqft: p.sqft ?? null,
  }));

  const roll = (await getJSON("rentroll", "current").catch(() => null)) as RentRollData | null;
  const tenants: { tenant: string; property: string; unit: string; sqft: number; leaseTo: string | null }[] = [];
  for (const p of roll?.properties ?? []) for (const u of p.units ?? []) {
    if (u.isVacant || u.amenity || !u.occupantName) continue;
    tenants.push({ tenant: u.occupantName, property: p.propertyCode, unit: u.unitRef, sqft: u.sqft ?? 0, leaseTo: u.leaseTo });
  }

  const sinceMon = (now.getDay() + 6) % 7;
  const wkStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
  const wkEnd = new Date(wkStart.getFullYear(), wkStart.getMonth(), wkStart.getDate() + 6, 23, 59, 59);
  const tasksThisWeek = taskOccurrencesBetween(wkStart, wkEnd).map((t) => ({ task: t.label, due: t.date.toISOString().slice(0, 10), category: t.category }));

  let serviceRequests: { subject: string; property: string | null; priority: string; status: string }[] = [];
  try {
    serviceRequests = (await listRequests())
      .filter((r) => r.status !== "Complete")
      .slice(0, 25)
      .map((r) => ({ subject: r.subject, property: r.propertyCode, priority: r.priority || "—", status: r.status }));
  } catch { /* best-effort */ }

  const context = {
    today: now.toISOString().slice(0, 10),
    properties,
    tenants: tenants.slice(0, 600),
    tenantCount: tenants.length,
    tasksThisWeek,
    openServiceRequests: serviceRequests,
    // Occupancy + leasing are visible to everyone; NOI / budget only to users
    // who may see the Monthly Review.
    occupancyAndLeasing: report ? {
      month: report.monthLabel,
      portfolioOccPct: Math.round(report.portfolio.occPct * 10) / 10,
      portfolioSqft: report.portfolio.totalSqft, vacantSqft: report.portfolio.vacantSqft,
      groups: report.groups.map((g) => ({ group: g.label, occPct: Math.round(g.occPct * 10) / 10, totalSqft: g.totalSqft, vacantUnits: g.vacantUnits, ...(showFinancials ? { noiActual: g.noiActual, noiBudget: g.noiBudget } : {}) })),
      newLeases: report.newLeases, vacated: report.vacated, expirations: report.expirations.slice(0, 30), upcoming: report.upcoming,
    } : null,
    ...(showFinancials && report ? { financials: { noiActualYTD: report.portfolio.noiActual, noiBudgetYTD: report.portfolio.noiBudget, openServiceRequests: report.portfolio.openRequests } } : {}),
    routes: ROUTES,
  };

  const prompt =
    `You are the built-in assistant for Korman Commercial Properties' internal portal — the "brain" of the program. Answer the user's question using ONLY the DATA below (a live snapshot). ` +
    `Be concise and direct. Use real names, properties, and figures from the data. If the answer isn't in the data, say so plainly and point to the page most likely to have it — never guess or invent numbers.\n\n` +
    `Return ONLY JSON: {"answer": "markdown string", "links": [{"label": "...", "href": "/route"}]}. ` +
    `The answer may use short markdown (bullets, bold). Put 1-4 relevant page links in "links", choosing hrefs ONLY from routes[].path. Keep the answer focused on what was asked.\n\n` +
    `QUESTION: ${q}\n\nDATA:\n${JSON.stringify(context).slice(0, 90000)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return NextResponse.json({ error: `Assistant failed (${res.status}).` }, { status: 502 });
    const j = await res.json();
    const text: string = (j?.content ?? []).filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "").join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ answer: text.trim() || "No answer.", links: [] });
    const parsed = JSON.parse(match[0]) as { answer?: string; links?: { label?: string; href?: string }[] };
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
