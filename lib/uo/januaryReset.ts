// THE JANUARY U&O RESET (owner, 11/2026: "how does this get reset for 2027 and
// future years"; "tanya keys the U&O charges, code is UO"). Every January the
// City's new assessed value moves Line 1, so every taxable tenant's monthly U&O
// charge moves with it — and the charge in Skyline does not move on its own.
//
// From the 15th of December (the next business day), the U&O cron emails
// Tanya — Drew copied — every tenant whose January U&O differs from what
// they are billed today: suite, tenant, today's charge, January's, the change,
// with the U&O by Tenant workbook for January attached. She updates each
// recurring UO charge effective 1/1. Once a year (`uo-resets/<year>`); the
// page's "Send the January reset" sends it again on demand.
//
// The amounts are the SAME computation the January return will file (the
// rent roll as it stands, the year's assessed value — the City's open data
// once certified), so the charge and the return agree from the first month.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { sendMailDetailed, VERIFIED_FROM } from "@/lib/mail";
import { portalEmail } from "@/lib/email/portalEmail";
import { etToday } from "@/lib/statements/reminderSchedule";
import { chargesWorkbook } from "./chargesExport";
import { loadUoMonth, type UoMonthView } from "./load";
import { businessDayFrom, monthName, UO_FILER_TO, UO_PAGE } from "./cycle";

/** Who keys the UO charges in Skyline. */
export const UO_CHARGES_TO = (process.env.UO_CHARGES_TO ?? "trovkin@kormancommercial.com").trim();
/** Skyline's charge code for U&O. */
export const UO_CHARGE_CODE = "UO";

const PREFIX = "uo-resets";

export type ResetRow = { code: string; unitRef: string; tenant: string; today: number | null; january: number; change: number | null };

/** Every taxable tenant whose January share differs from today's charge. */
export function resetRows(view: Pick<UoMonthView, "properties">): ResetRow[] {
  const out: ResetRow[] = [];
  for (const p of view.properties) {
    if (p.noTenancy) continue;
    for (const b of p.billed) {
      const today = b.billed != null ? Math.round(b.billed * 100) / 100 : null;
      const change = today != null ? Math.round((b.share - today) * 100) / 100 : null;
      if (change != null && Math.abs(change) < 1) continue;
      out.push({ code: p.code, unitRef: b.unitRef, tenant: b.tenant, today, january: b.share, change });
    }
  }
  return out;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const signed = (n: number) => (n < 0 ? `(${money(-n)})` : `+${money(n)}`);

export async function sendJanuaryReset(year: number, now = new Date()): Promise<{ ok: boolean; rows: number; error?: string }> {
  const month = `${year}-01`;
  const view = await loadUoMonth(month);
  const rows = resetRows(view);
  const notCertified = view.properties.flatMap((p) => p.warnings.filter((w) => /not certified/.test(w)).map((w) => `${p.code} ${w}`));
  const e = portalEmail({
    subject: `U&O charges for ${year} — ${rows.length} tenant${rows.length === 1 ? "" : "s"} to update`,
    eyebrow: "Philadelphia U&O",
    title: `Update the U&O charges for January ${year}`,
    lead: rows.length
      ? `The City's ${year} assessments move each tenant's monthly U&O. Please update each recurring ${UO_CHARGE_CODE} charge below in Skyline, effective 1/1/${year}. The full schedule for every tenant is attached.`
      : `Every tenant's ${UO_CHARGE_CODE} charge already matches ${year}'s figure — nothing to change. The full schedule is attached for reference.`,
    rows: notCertified.map((w) => ({ label: "Check", value: w, tone: "warn" as const })),
    table: rows.length ? {
      title: `${UO_CHARGE_CODE} charges, effective 1/1/${year}`,
      columns: ["Suite", "Tenant", "Today", `Jan ${year}`, "Change"],
      align: ["left", "left", "right", "right", "right"],
      rows: rows.map((r) => [r.unitRef, r.tenant, r.today != null ? money(r.today) : "Not billed", money(r.january), r.change != null ? signed(r.change) : "New"]),
    } : undefined,
    link: { label: "Open the U&O page", path: `${UO_PAGE}?month=${month}` },
  });
  const xlsx = await chargesWorkbook(view, monthName(month));
  const res = await sendMailDetailed({
    to: `${UO_CHARGES_TO}, ${UO_FILER_TO}`, from: `KCP Portal <${VERIFIED_FROM}>`, subject: e.subject, htmlBody: e.html, textBody: e.text,
    attachments: [{ name: `U&O by Tenant - January ${year}.xlsx`, content: new Uint8Array(xlsx), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
  });
  if (!res.ok) return { ok: false, rows: rows.length, error: "The email could not be sent." };
  await storeJSON(PREFIX, String(year), { year, sentAt: now.toISOString(), rows: rows.length, to: UO_CHARGES_TO });
  return { ok: true, rows: rows.length };
}

/** Run by the U&O cron: once a year, from the 15th of December. */
export async function januaryResetTick(now = new Date()): Promise<string | null> {
  const today = etToday(now);
  if (today.slice(5, 7) !== "12") return null;
  const year = Number(today.slice(0, 4)) + 1;
  if (today < businessDayFrom(`${year - 1}-12`, 15)) return null;
  const done = await getJSON(PREFIX, String(year), { retryOnMiss: true }).catch(() => null);
  if (done) return null;
  const r = await sendJanuaryReset(year, now);
  return r.ok ? `january reset sent (${r.rows})` : `january reset: ${r.error}`;
}
