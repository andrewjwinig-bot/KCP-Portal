"use client";

// "Can this person open that page?" — for a link that should only be a link
// when it leads somewhere the viewer is allowed. A link to a page their
// profile lacks is not a dead link but a worse one: AppShell bounces them back
// to the dashboard with no word of why. Same rule as AppShell (`isPathAllowed`
// on the profile being viewed); the query string is ignored.

import { useCallback } from "react";
import { useUser } from "./UserProvider";
import { isPathAllowed } from "@/lib/users";

export function useCanOpen(): (href: string) => boolean {
  const { user } = useUser();
  return useCallback((href: string) => {
    if (!href || !href.startsWith("/")) return true;
    const path = href.split(/[?#]/)[0] || "/";
    return isPathAllowed(user.id, path);
  }, [user.id]);
}
