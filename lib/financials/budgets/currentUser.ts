// The signed-in user, server-side, for the budget routes that check who is
// saving (leasing calls, typed months). Unsigned outside production so local
// development works without a login.

import "server-only";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, type UserId } from "@/lib/users";

export async function budgetUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production" ? "admin" : null;
  try {
    const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
    return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
  } catch { return null; }
}
