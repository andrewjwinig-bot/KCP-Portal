// Daily session expiry — sessions end at the next local (Eastern) midnight, so
// everyone re-authenticates each day. Derives the current Eastern wall-clock
// (handles DST) and returns the seconds until the upcoming midnight. Pure
// Intl/Date, so it's safe in both the Node routes (signing) and the Edge
// middleware module graph.

const TZ = "America/New_York";

export function dailyExpiry(now: number = Date.now()): { expiresSec: number; maxAge: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  let h = get("hour");
  if (h === 24) h = 0; // some ICU builds emit "24" at midnight
  const elapsed = h * 3600 + get("minute") * 60 + get("second");
  let maxAge = 86400 - elapsed;
  if (maxAge <= 0 || maxAge > 86400) maxAge = 86400;
  return { expiresSec: Math.floor(now / 1000) + maxAge, maxAge };
}
