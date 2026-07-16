"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ALL_USERS, USERS, canSwitchUsers, type UserDef, type UserId } from "../../lib/users";

type Ctx = {
  user: UserDef;
  setUserId: (id: UserId) => void;
  hydrated: boolean;
  authed: boolean;
  /** Whether a valid site session (signed-in staff) backs this view. False for
   *  tenants opening a public link; true in local dev where auth is unconfigured. */
  staffAuthed: boolean;
  /** Whether the signed-in user may switch profiles (admin / alison only). */
  canSwitch: boolean;
  /** The user the site cookie was actually issued for. */
  loggedInUser: UserId;
};

const UserContext = createContext<Ctx | null>(null);

const ACTIVE_USER_KEY = "kcp:activeUser";

function isUserId(s: unknown): s is UserId {
  return typeof s === "string" && (ALL_USERS as readonly string[]).includes(s);
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  // loggedInUser is who the server says is signed in; activeUser is the
  // profile currently being viewed (only admin / alison can make these differ).
  const [loggedInUser, setLoggedInUser] = useState<UserId>("admin");
  const [activeUser, setActiveUser] = useState<UserId>("admin");
  const [hydrated, setHydrated] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [staffAuthed, setStaffAuthed] = useState(false);

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
        // Staff = a real site user when auth is configured; always true in local
        // dev (unconfigured). Tenants on a public link get user:null → false.
        setStaffAuthed(siteJ?.configured === false ? true : isUserId(siteJ?.user));

        if (canSwitchUsers(li)) {
          // admin / alison resume whichever profile they last pivoted to.
          let stored: string | null = null;
          try { stored = localStorage.getItem(ACTIVE_USER_KEY); } catch { /* ignore */ }
          setActiveUser(isUserId(stored) ? stored : li);
        } else {
          // Everyone else is pinned to their own profile.
          setActiveUser(li);
          try { localStorage.removeItem(ACTIVE_USER_KEY); } catch { /* ignore */ }
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  const canSwitch = canSwitchUsers(loggedInUser);

  function setUserId(id: UserId) {
    if (!canSwitch) return;
    setActiveUser(id);
    try { localStorage.setItem(ACTIVE_USER_KEY, id); } catch { /* ignore */ }
  }

  return (
    <UserContext.Provider
      value={{ user: USERS[activeUser], setUserId, hydrated, authed, staffAuthed, canSwitch, loggedInUser }}
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
