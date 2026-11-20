"use client";

// A <Link> that is only a link for someone allowed to open where it goes —
// otherwise it renders `fallback` (nothing, by default; or plain text). Use it
// for any cross-page link on a page several profiles share, so nobody is sent
// to a page AppShell would bounce them out of.

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useCanOpen } from "./useCanOpen";

export default function AllowedLink({ fallback = null, ...props }: ComponentProps<typeof Link> & { fallback?: ReactNode }) {
  const canOpen = useCanOpen();
  const href = typeof props.href === "string" ? props.href : props.href.pathname ?? "";
  if (!canOpen(href)) return <>{fallback}</>;
  return <Link {...props} />;
}
