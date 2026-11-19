// WEATHER COMING → PROMPT GREG TO SEND THE WEATHER EMAIL (owner, 11/2026:
// "track the weather for our address at 8 neshaminy interplex trevose PA and
// if the forecast is predicting extreme cold, extreme heat, snow, ice or storm
// … prompt greg that is coming 24-48 hours before to suggest he send out these
// weather emails"). The National Weather Service's own forecast and active
// alerts for the Interplex (free, no key), read for the next 48 hours, and each
// of Greg's four weather templates matched to what is coming.
//
// Pure: periods + alerts in, the templates to suggest out. The fetch is
// `loadWeatherSignals` in weatherLoad.ts.

/** 8 Neshaminy Interplex, Trevose PA — NWS gridpoint PHI 56,88. */
export const INTERPLEX_POINT = { lat: 40.1366, lon: -74.9567 };

export type WeatherTemplate = "cold-alert" | "heat-alert" | "snow-alert" | "storm-alert";

/** One NWS forecast period ("Tonight", "Friday"). */
export type ForecastPeriod = {
  name: string; startTime: string; temperature: number; temperatureUnit?: string;
  shortForecast: string; detailedForecast?: string; windSpeed?: string;
  probabilityOfPrecipitation?: { value: number | null } | null;
};
/** One NWS active alert. */
export type WeatherAlert = { event: string; onset?: string | null; ends?: string | null; headline?: string | null };

export type WeatherSignal = { template: WeatherTemplate; reason: string; startsISO: string };

/** The thresholds (°F, mph, %). */
export const EXTREME_COLD_F = 15;
export const EXTREME_HEAT_F = 95;
export const STORM_WIND_MPH = 40;
export const PRECIP_LIKELY_PCT = 40;
export const LOOKAHEAD_HOURS = 48;

const ALERT_RULES: { template: WeatherTemplate; test: RegExp }[] = [
  { template: "cold-alert", test: /extreme cold|cold weather|wind chill|hard freeze/i },
  { template: "heat-alert", test: /heat/i },
  { template: "snow-alert", test: /winter storm|winter weather|ice storm|blizzard|snow|freezing rain|sleet/i },
  { template: "storm-alert", test: /severe thunderstorm|tornado|high wind|wind advisory|hurricane|tropical storm|flood/i },
];

const SNOW_ICE = /snow|sleet|freezing rain|freezing drizzle|\bice\b|wintry mix/i;
const SEVERE = /severe|damaging wind/i;

const toF = (p: ForecastPeriod) => (p.temperatureUnit === "C" ? p.temperature * 9 / 5 + 32 : p.temperature);
const maxWind = (s?: string) => Math.max(0, ...(s ?? "").match(/\d+/g)?.map(Number) ?? [0]);
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "long", hour: "numeric" });

/** What is coming in the next 48 hours, one signal per template (the earliest). */
export function weatherSignals(periods: ForecastPeriod[], alerts: WeatherAlert[], now: Date): WeatherSignal[] {
  const end = now.getTime() + LOOKAHEAD_HOURS * 3600_000;
  const found = new Map<WeatherTemplate, WeatherSignal>();
  const add = (s: WeatherSignal) => {
    const cur = found.get(s.template);
    if (!cur || s.startsISO < cur.startsISO) found.set(s.template, s);
  };

  for (const a of alerts) {
    const starts = a.onset ?? now.toISOString();
    if (Date.parse(starts) > end) continue;
    if (a.ends && Date.parse(a.ends) < now.getTime()) continue;
    const rule = ALERT_RULES.find((r) => r.test.test(a.event));
    if (rule) add({ template: rule.template, reason: `National Weather Service: ${a.event}`, startsISO: starts });
  }

  for (const p of periods) {
    const t = Date.parse(p.startTime);
    if (!Number.isFinite(t) || t > end) continue;
    const when = fmtWhen(p.startTime);
    const f = toF(p);
    const pop = p.probabilityOfPrecipitation?.value ?? null;
    const text = `${p.shortForecast} ${p.detailedForecast ?? ""}`;
    if (f <= EXTREME_COLD_F) add({ template: "cold-alert", reason: `${Math.round(f)}°F forecast ${p.name.toLowerCase()} (${when})`, startsISO: p.startTime });
    if (f >= EXTREME_HEAT_F) add({ template: "heat-alert", reason: `${Math.round(f)}°F forecast ${p.name.toLowerCase()} (${when})`, startsISO: p.startTime });
    if (SNOW_ICE.test(p.shortForecast) && (pop == null || pop >= PRECIP_LIKELY_PCT)) {
      add({ template: "snow-alert", reason: `${p.shortForecast}${pop != null ? ` (${pop}%)` : ""} ${p.name.toLowerCase()}`, startsISO: p.startTime });
    }
    if (SEVERE.test(text) || maxWind(p.windSpeed) >= STORM_WIND_MPH) {
      add({ template: "storm-alert", reason: `${p.shortForecast}${maxWind(p.windSpeed) >= STORM_WIND_MPH ? `, winds to ${maxWind(p.windSpeed)} mph` : ""} ${p.name.toLowerCase()}`, startsISO: p.startTime });
    }
  }
  return [...found.values()].sort((a, b) => a.startsISO.localeCompare(b.startsISO));
}

/** Already sent for this weather? A send in the 72 hours before it clears the prompt. */
export const SENT_COVERS_HOURS = 72;
export function stillToSend(signals: WeatherSignal[], lastSentById: Record<string, string | undefined>, now: Date): WeatherSignal[] {
  return signals.filter((s) => {
    const sent = lastSentById[s.template];
    return !sent || now.getTime() - Date.parse(sent) > SENT_COVERS_HOURS * 3600_000;
  });
}
