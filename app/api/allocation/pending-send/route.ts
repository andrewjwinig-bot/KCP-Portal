import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listPendingSends, getPendingSend } from "@/lib/allocated-invoicer/pendingSendStore";
import { sendAllocation } from "@/lib/allocated-invoicer/autoProcess";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUserLabel(): Promise<string | undefined> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return undefined;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? USERS[id as UserId].label : undefined;
}

// Never ship the stashed source file to the client — just the review summary.
function slim(p: Awaited<ReturnType<typeof getPendingSend>>) {
  if (!p) return null;
  const { fileBase64, ...rest } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

// GET [?period=YYYY-MM] — the staged "allocated" pending send awaiting review.
// With ?period, that one period; otherwise every un-sent allocated pending send.
export async function GET(req: Request) {
  const period = new URL(req.url).searchParams.get("period");
  if (period) {
    return NextResponse.json({ pending: slim(await getPendingSend("allocated", period)) });
  }
  const all = (await listPendingSends()).filter((p) => p.source === "allocated");
  return NextResponse.json({ pending: all.map(slim) });
}

// POST { period } — the reviewer's "Send to AvidXchange" click. Recomputes the
// staged invoices, finalizes carryover, and emails AP (Avid) cc controller + Drew.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const period = String(body?.period ?? "").trim();
    // A single month "YYYY-MM" or a range "YYYY-MM_to_YYYY-MM".
    if (!/^\d{4}-\d{2}(_to_\d{4}-\d{2})?$/.test(period)) {
      return NextResponse.json({ error: "A valid period (YYYY-MM, or a YYYY-MM_to_YYYY-MM range) is required." }, { status: 400 });
    }
    const by = await currentUserLabel();
    const result = await sendAllocation(period, by ?? null);
    if (!result.ok) {
      const status = result.reason === "not-prepared" ? 404 : 409;
      return NextResponse.json({ ...result, error: sendError(result.reason) }, { status });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to send" }, { status: 500 });
  }
}

function sendError(reason?: string): string {
  switch (reason) {
    case "not-prepared": return "No prepared allocation is staged for that period. Re-import the 2000 G&A GL.";
    case "already-sent": return "This period has already been sent to AvidXchange.";
    case "already-finalized": return "This period was already finalized — it's been sent.";
    case "no-statement-month": return "The staged GL has no readable statement month.";
    case "partial-send": return "Some invoices didn't reach AvidXchange — click Send again to retry just the ones that didn't go.";
    case "mail-not-configured": return "Email isn't configured, so nothing was sent to AvidXchange — the period is still open. Configure mail, then click Send again.";
    default: return "Failed to send the allocated invoices.";
  }
}
