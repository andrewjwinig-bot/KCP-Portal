import { NextResponse } from "next/server";
import { budgetUser as currentUser } from "@/lib/financials/budgets/currentUser";
import { USERS, type UserId } from "@/lib/users";
import { pendingTenantProfiles, designedSuiteExists } from "@/lib/centers/designed/render";
import { saveTenantProfile } from "@/lib/centers/designed/profileStore";

// New tenants on the designed center pages (the public /centers/<slug>) that
// nobody has described yet — GET lists them for the dashboard — and the
// details Harry enters for one (POST). What he saves is what the public page
// shows: the store name, its line, website, online-ordering link, logo and a
// short description. Until then the suite reads "Coming soon".

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Harry checks what goes on the public site; Drew, Alison and admin can too. */
const EDITORS: UserId[] = ["harry", "drew", "alison", "admin"];

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const link = (v: unknown) => {
  const s = clip(v, 600);
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try { return new URL(withScheme).protocol.startsWith("http") ? withScheme : ""; } catch { return ""; }
};

export async function GET() {
  const pending = await pendingTenantProfiles();
  return NextResponse.json({ pending });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !EDITORS.includes(user)) return NextResponse.json({ error: "Only Harry, Drew, Alison or admin can edit the public site." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const code = clip(b.code, 12), suite = clip(b.suite, 12);
  if (!designedSuiteExists(code, suite)) return NextResponse.json({ error: "Unknown suite" }, { status: 404 });
  const rollName = clip(b.rollName, 200), tenant = clip(b.tenant, 80);
  if (!rollName || !tenant) return NextResponse.json({ error: "The store name is required." }, { status: 400 });
  const logo = clip(b.logo, 600);
  await saveTenantProfile(code, suite, {
    rollName, tenant,
    use: clip(b.use, 80) || undefined,
    url: link(b.url) || undefined,
    order: link(b.order) || undefined,
    orderLabel: ["Order online", "Shop online", "Book online"].includes(b.orderLabel) ? b.orderLabel : undefined,
    logo: logo.startsWith("https://") ? logo : undefined,
    blurb: clip(b.blurb, 240) || undefined,
    updatedBy: USERS[user]?.label ?? user,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
