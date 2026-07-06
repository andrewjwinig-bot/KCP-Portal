import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseApSelection, apTextToRows } from "@/lib/financials/cash-sheet/apSelection";
import { applyBills } from "@/lib/financials/cash-sheet/store";
import { parseMonthKey } from "@/lib/financials/cash-sheet/util";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, USERS, canEditCashSheet, type UserId } from "@/lib/users";
import { recordImport } from "@/lib/tracker/importEvents";
import { cookies } from "next/headers";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

/** The Wednesday of the Sun–Sat week containing `iso`. */
function wednesdayOfWeek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(d + (3 - dt.getDay())); // shift to Wednesday (day 3)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// POST (multipart) — one or more AP AutoPay Selections Reports. Parses each,
// maps every property's payment total to its Cash-Sheet bill cell for the week
// (derived from the report date, or the `wednesday` field if given).
export async function POST(req: Request) {
  const user = await currentUser();
  if (user && !canEditCashSheet(user)) {
    return NextResponse.json({ error: "You have view-only access to the Cash Sheet." }, { status: 403 });
  }
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: "No files uploaded." }, { status: 400 });

    const byCode: Record<string, number> = {};
    let reportDate: string | null = null;
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      let rows: (string | number | null)[][];
      if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        // Skyline can export the report as a PDF; extract its text and parse the
        // same "Property/Company <CODE> Total" lines.
        const { PDFParse } = await import("pdf-parse");
        const { text } = await new PDFParse({ data: buf }).getText();
        rows = apTextToRows(text);
      } else {
        const wb = XLSX.read(buf, { type: "buffer" });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" }) as (string | number | null)[][];
      }
      const r = parseApSelection(rows);
      if (!reportDate && r.reportDate) reportDate = r.reportDate;
      for (const [c, v] of Object.entries(r.byCode)) byCode[c] = (byCode[c] ?? 0) + v;
    }

    const wedRaw = form.get("wednesday");
    const wednesday = typeof wedRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wedRaw)
      ? wedRaw
      : (reportDate ? wednesdayOfWeek(reportDate) : null);
    if (!wednesday) return NextResponse.json({ error: "Could not determine the pay week — no report date found." }, { status: 400 });

    const pm = parseMonthKey(wednesday.slice(0, 7));
    if (!pm) return NextResponse.json({ error: "Bad week." }, { status: 400 });

    const rounded: Record<string, number> = {};
    for (const [code, amount] of Object.entries(byCode)) rounded[code] = Math.round(amount);
    await applyBills(pm.year, pm.month, wednesday, rounded, user ?? undefined);
    const filled = Object.entries(rounded).map(([code, amount]) => ({ code, amount })).sort((a, b) => b.amount - a.amount);
    const total = filled.reduce((s, f) => s + f.amount, 0);
    await logAudit({ event: "cash-sheet.ap-upload", user: user ?? "?", ip: auditIp(req), detail: `${wednesday} · ${files.length} file(s) · ${filled.length} props · $${Math.round(total).toLocaleString()}` });
    // Tracks the AP import reminder only — "Pay Avid Bills" is its own separate
    // tracker task and is NOT auto-completed by importing the report.
    try { await recordImport("imp-ap", { at: new Date().toISOString(), by: user ? USERS[user as UserId]?.label ?? user : null }); } catch { /* best-effort */ }

    return NextResponse.json({ ok: true, wednesday, reportDate, filled, total });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to parse the AP report(s)." }, { status: 500 });
  }
}
