"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ALL_USERS, USERS, canSwitchUsers, type UserDef, type UserId } from "../../lib/users";
import { rememberActiveUser } from "../../lib/ui/firstPaint";

type Ctx = {
  user: UserDef;
  setUserId: (id: UserId) => void;
  hydrated: boolean;
  authed: boolean;
  /** Whether the signed-in user may switch profiles (admin / alison only). */
  canSwitch: boolean;
  /** The user the site cookie was actually issued for. */
  loggedInUser: UserId;
  /** The look the server drew the first frame in (so hooks start where the
   *  server did and nothing swaps on hydration). */
  initialSkin: "studio" | "classic";
};

const UserContext = createContext<Ctx | null>(null);

const ACTIVE_USER_KEY = "kcp:activeUser";

function isUserId(s: unknown): s is UserId {
  return typeof s === "string" && (ALL_USERS as readonly string[]).includes(s);
}

export function UserProvider({ children, initialUser, initialActive, initialSkin = "studio" }: {
  children: React.ReactNode;
  /** Who the server read off the site cookie — so the FIRST frame is the real
   *  person's sidebar, not Admin's (the flash the owner saw on refresh). */
  initialUser?: string | null;
  initialActive?: string | null;
  initialSkin?: "studio" | "classic";
}) {
  // loggedInUser is who the server says is signed in; activeUser is the
  // profile currently being viewed (only admin / alison can make these differ).
  const firstUser: UserId = isUserId(initialUser) ? initialUser : "admin";
  const firstActive: UserId = canSwitchUsers(firstUser) && isUserId(initialActive) ? initialActive : firstUser;
  const [loggedInUser, setLoggedInUser] = useState<UserId>(firstUser);
  const [activeUser, setActiveUser] = useState<UserId>(firstActive);
  const [hydrated, setHydrated] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    Promise.all([
      fetch("/api/site/status").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/history/status").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([siteJ, histJ]) => {
        const li: UserId = isUserId(siteJ?.user) ? siteJ.user : "admin";
        setLoggedInUser(li);
        setAuthed(!!histJ?.authed);

        if (canSwitchUsers(li)) {
          // admin / alison resume whichever profile they last pivoted to.
          let stored: string | null = null;
          try { stored = localStorage.getItem(ACTIVE_USER_KEY); } catch { /* ignore */ }
          const next = isUserId(stored) ? stored : li;
          setActiveUser(next);
          rememberActiveUser(next);
        } else {
          // Everyone else is pinned to their own profile.
          setActiveUser(li);
          rememberActiveUser(null);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  const canSwitch = canSwitchUsers(loggedInUser);

  function setUserId(id: UserId) {
    if (!canSwitch) return;
    setActiveUser(id);
    rememberActiveUser(id);
  }

  return (
    <UserContext.Provider
      value={{ user: USERS[activeUser], setUserId, hydrated, authed, canSwitch, loggedInUser, initialSkin }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): Ctx {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
