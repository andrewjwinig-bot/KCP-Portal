import "server-only";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { isPathAllowed, ALL_USERS, type UserId } from "@/lib/users";

/** Gated with the other statement pages — the checklist carries GL figures.
 *  Shared by the checklist's email and download routes. */
export async function canReadChecklist(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  try {
    const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
    return !!id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/financials");
  } catch { return false; }
}
