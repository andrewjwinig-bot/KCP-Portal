// Reads the City's certified assessments for the U&O parcels from the open
// data, keeps them (`uo-assessments/current`) and emails Drew what changed.
// Run by the U&O cron daily; it reads the City once a year (`refreshDue`)
// and raises the alarm (`assessmentAlarm`). See assessments.ts.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { sendMailDetailed, VERIFIED_FROM } from "@/lib/mail";
import { portalEmail } from "@/lib/email/portalEmail";
import { UO_PROPERTIES } from "./config";
import {
  alarmDue, assessmentAlarm, assessmentChanges, cityQuery, emptyCityAssessments, mergeCity, parseCityRows, refreshDue, uoParcels, yearsToCheck,
  type AssessmentChange, type CityAssessments, type CityValues,
} from "./assessments";

const PREFIX = "uo-assessments";

export async function getCityAssessments(): Promise<CityAssessments> {
  const s = (await getJSON(PREFIX, "current", { retryOnMiss: true }).catch(() => null)) as CityAssessments | null;
  return s ? { ...emptyCityAssessments(), ...s } : emptyCityAssessments();
}

export async function fetchCityValues(parcels: string[], years: number[]): Promise<CityValues> {
  const url = `https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(cityQuery(parcels, years))}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`The City's open data answered ${res.status}.`);
  const body = (await res.json()) as { rows?: unknown; error?: unknown };
  if (body.error) throw new Error(`The City's open data refused the query: ${String(body.error)}`);
  return parseCityRows(body.rows);
}

const labelOf = (parcel: string) => {
  for (const p of UO_PROPERTIES) {
    const a = p.accounts.find((x) => x.parcel === parcel);
    if (a) return `${p.code} ${a.label}`;
  }
  return parcel;
};
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Read the City when it is due (once a year — `refreshDue`), or now with
 *  `force`; then email Drew the alarm if a value is missing (`assessmentAlarm`). */
export async function refreshCityAssessments(opts: { force?: boolean; now?: Date } = {}): Promise<{ checked: boolean; changes: number; error?: string; alarm?: string }> {
  const now = opts.now ?? new Date();
  const at = now.toISOString();
  const prev = await getCityAssessments();
  let state: CityAssessments = prev;
  let checked = false;
  let changeCount = 0;
  let error: string | undefined;

  if (opts.force || refreshDue(prev, now)) {
    checked = true;
    try {
      const read = await fetchCityValues(uoParcels(), yearsToCheck(at.slice(0, 10)));
      const changes = assessmentChanges(prev.values, read);
      changeCount = changes.length;
      state = { ...mergeCity(prev, read, at), alarmedAt: prev.alarmedAt };
      // The first read only fills the store: everything in it is already what
      // the returns use. After that, a new year or a moved value is news.
      if (changes.length && Object.keys(prev.values).length) await sendChanges(changes);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      state = { ...prev, checkedAt: at, error };
    }
  }

  // The alarm — the one thing that must not go quiet.
  const alarm = assessmentAlarm(state, now);
  if (alarm && alarmDue(state.alarmedAt, now)) {
    const e = portalEmail({
      subject: `${alarm.level === "danger" ? "ACTION NEEDED: " : ""}${alarm.title}`,
      eyebrow: "Philadelphia U&O",
      title: alarm.title,
      lead: alarm.text,
      rows: alarm.parcels.map((p) => ({ label: p, value: `No ${alarm.year} value`, tone: alarm.level === "danger" ? "bad" as const : "warn" as const })),
      link: { label: "Open the U&O returns", path: "/uo-tax" },
    });
    const res = await sendMailDetailed({ to: UO_ALARM_TO, from: `KCP Portal <${VERIFIED_FROM}>`, subject: e.subject, htmlBody: e.html, textBody: e.text }).catch(() => null);
    if (res?.ok) state = { ...state, alarmedAt: at };
  } else if (!alarm && state.alarmedAt) {
    state = { ...state, alarmedAt: undefined };
  }
  if (state !== prev) await storeJSON(PREFIX, "current", state);
  return { checked, changes: changeCount, error, alarm: alarm?.title };
}

/** Who is told when the City's values stop reaching the portal. */
export const UO_ALARM_TO = (process.env.UO_FILER_TO ?? "dwinig@kormancommercial.com").trim();

async function sendChanges(changes: AssessmentChange[]): Promise<void> {
  const years = [...new Set(changes.map((c) => c.year))].join(", ");
  const e = portalEmail({
    subject: `Philadelphia assessments: ${changes.length} new or changed (${years})`,
    eyebrow: "Philadelphia U&O",
    title: `The City's ${years} assessments are in`,
    lead: "The portal read the City's open data. The U&O returns use these from January of each year — nothing to key. Tenants' U&O charges in Skyline need the new amounts from the page's U&O by Tenant export.",
    rows: changes.map((c) => ({
      label: `${labelOf(c.parcel)} · ${c.year}`,
      value: `${c.before != null ? `${money(c.before)} → ` : ""}${money(c.after)} · Line 1 ${c.lineBefore != null ? `${money(c.lineBefore)} → ` : ""}${money(c.lineAfter)}/mo`,
    })),
    link: { label: "Open the U&O returns", path: "/uo-tax" },
  });
  await sendMailDetailed({ to: UO_ALARM_TO, from: `KCP Portal <${VERIFIED_FROM}>`, subject: e.subject, htmlBody: e.html, textBody: e.text }).catch(() => null);
}
