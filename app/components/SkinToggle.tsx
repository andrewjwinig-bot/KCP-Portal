"use client";

import { useEffect, useState } from "react";
import { useUser } from "./UserProvider";

/**
 * The portal's look: "classic" (the original navy rail) or "studio" (the
 * refreshed skin in globals.css under [data-skin="studio"]). Per browser,
 * like dark mode, so it can be tried on real data without changing anyone
 * else's portal. ?skin=studio / ?skin=classic in any URL sets it too.
 */
export const SKIN_KEY = "kcp:skin";
export type Skin = "classic" | "studio";

/** Who sees the new look while it is under review (owner: "just for me to
 *  review and approve before rolling out to everybody"). Everyone else gets
 *  the classic look and no switch. To roll out: return true for everyone. */
export const SKIN_REVIEWERS = new Set(["drew", "admin"]);
export function isSkinReviewer(loggedInUser: string | null | undefined): boolean {
  return !!loggedInUser && SKIN_REVIEWERS.has(loggedInUser);
}

export function readSkin(reviewer = true): Skin {
  if (!reviewer) return "classic";
  try {
    // The new look is the default; "classic" only when someone switched back.
    return localStorage.getItem(SKIN_KEY) === "classic" ? "classic" : "studio";
  } catch {
    return "studio";
  }
}

/** Public pages (website, tenant portal, forms) always render classic. */
export function applySkin(skin: Skin, isPublic = false) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (skin === "studio" && !isPublic) el.dataset.skin = "studio";
  else delete el.dataset.skin;
}

export default function SkinToggle() {
  const { loggedInUser, hydrated } = useUser();
  const [skin, setSkin] = useState<Skin>("studio");

  useEffect(() => {
    setSkin(readSkin());
  }, []);

  function toggle() {
    const next: Skin = skin === "studio" ? "classic" : "studio";
    setSkin(next);
    applySkin(next);
    try { localStorage.setItem(SKIN_KEY, next); } catch { /* ignore */ }
  }

  if (!hydrated || !isSkinReviewer(loggedInUser)) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={skin === "studio" ? "Switch to the classic look" : "Try the new look"}
      aria-label="Toggle the new look"
      aria-pressed={skin === "studio"}
      style={{
        background: "var(--sb-group-hover)",
        border: "1px solid var(--sb-line)",
        color: "var(--sb-group-text)",
        cursor: "pointer",
        padding: 6,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {/* Half-filled circle: "the other look". */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
