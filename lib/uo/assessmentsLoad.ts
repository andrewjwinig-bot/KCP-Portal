// Reads the City's certified assessments for the U&O parcels from the open
// data, keeps them (`uo-assessments/current`) and emails Drew what changed.
// Run by the U&O cron once a week; see assessments.ts for the rule.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { sendMailDetailed, VERIFIED_FROM } from "@/lib/mail";
import { portalEmail } from "@/lib/email/portalEmail";
import { UO_PROPERTIES } from "./config";
import {
  assessmentChanges, cityQuery, emptyCityAssessments, mergeCity, parseCityRows, uoParcels, yearsToCheck,
  type CityAssessments, type CityValues,
} from "./assessments";

const PREFIX = "uo-assessments";
const CHECK_EVERY_DAYS = 6;

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

/** Check the City now (or only when a week has passed, unless `force`). */
export async function refreshCityAssessments(opts: { force?: boolean; now?: Date } = {}): Promise<{ checked: boolean; changes: number; error?: string }> {
  const now = opts.now ?? new Date();
  const prev = await getCityAssessments();
  if (!opts.force && prev.checkedAt && now.getTime() - Date.parse(prev.checkedAt) < CHECK_EVERY_DAYS * 86_400_000) {
    return { checked: false, changes: 0 };
  }
  const at = now.toISOString();
  let read: CityValues;
  try {
    read = await fetchCityValues(uoParcels(), yearsToCheck(at.slice(0, 10)));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await storeJSON(PREFIX, "current", { ...prev, checkedAt: at, error });
    return { checked: true, changes: 0, error };
  }
  const changes = assessmentChanges(prev.values, read);
  const next = mergeCity(prev, read, at);
  await storeJSON(PREFIX, "current", next);

  // The first read only fills the store: everything in it is already what the
  // returns use. After that, a new year or a moved value is news.
  if (changes.length && Object.keys(prev.values).length) {
    const to = (process.env.UO_FILER_TO ?? "dwinig@kormancommercial.com").trim();
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
    await sendMailDetailed({ to, from: `KCP Portal <${VERIFIED_FROM}>`, subject: e.subject, htmlBody: e.html, textBody: e.text }).catch(() => null);
  }
  return { checked: true, changes: changes.length };
}
