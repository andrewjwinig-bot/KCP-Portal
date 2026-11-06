// Where a sign-in lands. `next` is set by the middleware when it sends someone
// to /login — the page they asked for WITH its query string, because an
// emailed link names its record there (the move-out approval link is
// /cam-recon/interim?property=…&unitRef=…; with only the path kept, Nancy
// signed in to an empty close-out page). Client-safe, pure.

/** A path on this site only — never an absolute or protocol-relative URL. */
export function safeNext(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/dashboard";
}

/** The first sign-in of the day lands on the dashboard (the day's tasks) —
 *  unless the link names a specific record (it carries a query string), which
 *  is why the person is signing in at all. */
export function loginDestination(next: string, firstLoginToday: boolean): string {
  if (firstLoginToday && !next.includes("?")) return "/dashboard";
  return next;
}
