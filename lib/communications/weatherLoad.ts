import "server-only";
import { INTERPLEX_POINT, weatherSignals, type ForecastPeriod, type WeatherAlert, type WeatherSignal } from "./weather";

// The National Weather Service asks every caller for a User-Agent naming the
// app. Nothing else is sent.
const UA = { "User-Agent": "kcp-portal weather check", Accept: "application/geo+json" };
const nws = async (url: string) => {
  const r = await fetch(url, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`National Weather Service answered ${r.status}`);
  return r.json();
};

// Read at most every 30 minutes per server instance — the forecast is issued a
// few times a day, and the sidebar asks on every page.
let cached: { at: number; signals: WeatherSignal[] } | null = null;

/** What is coming to the Interplex in the next 48 hours. Throws if the
 *  forecast cannot be read (the caller shows nothing rather than "all clear"). */
export async function loadWeatherSignals(now = new Date()): Promise<WeatherSignal[]> {
  if (cached && now.getTime() - cached.at < 30 * 60_000) return cached.signals;
  const { lat, lon } = INTERPLEX_POINT;
  const point = await nws(`https://api.weather.gov/points/${lat},${lon}`);
  const [forecast, alerts] = await Promise.all([
    nws(point.properties.forecast),
    nws(`https://api.weather.gov/alerts/active?point=${lat},${lon}`).catch(() => ({ features: [] })),
  ]);
  const periods: ForecastPeriod[] = forecast?.properties?.periods ?? [];
  const active: WeatherAlert[] = (alerts?.features ?? []).map((f: { properties: WeatherAlert }) => f.properties);
  const signals = weatherSignals(periods, active, now);
  cached = { at: now.getTime(), signals };
  return signals;
}
