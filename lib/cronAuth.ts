// The ONE check for a scheduled job (`/api/cron/*`): Vercel's cron sends
// `Authorization: Bearer <CRON_SECRET>`, and nothing else is accepted.
//
// Security audit 11/2026: these routes used to accept ANY signed-in staff
// cookie too — Randy (read-only) or a session still waiting on 2FA could fire
// an AvidXchange send or the tenant notices, and because they are GETs a link
// on another site could fire them from a staff member's browser. A manual run
// belongs on its page, behind that page's own gate.

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}
