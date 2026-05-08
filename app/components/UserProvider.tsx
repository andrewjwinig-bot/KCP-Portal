"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ALL_USERS, USERS, type UserDef, type UserId } from "../../lib/users";

type Ctx = {
  user: UserDef;
  setUserId: (id: UserId) => void;
  hydrated: boolean;
  authed: boolean;
};

const UserContext = createContext<Ctx | null>(null);

const NON_ADMIN_DEFAULT: UserId = "harry";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserIdState] = useState<UserId>("admin");
  const [hydrated, setHydrated] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("kcp:activeUser");
    let initial: UserId = "admin";
    if (stored && (ALL_USERS as readonly string[]).includes(stored)) {
      initial = stored as UserId;
    }
    setUserIdState(initial);
    fetch("/api/history/status")
      .then((r) => r.json())
      .then((j) => {
        const ok = !!j?.authed;
        setAuthed(ok);
        // If they were admin but cookie isn't valid, drop to a non-admin persona.
        if (!ok && initial === "admin") {
          setUserIdState(NON_ADMIN_DEFAULT);
          try { localStorage.setItem("kcp:activeUser", NON_ADMIN_DEFAULT); } catch { /* ignore */ }
        }
      })
      .catch(() => setAuthed(false))
      .finally(() => setHydrated(true));
  }, []);

  function setUserId(id: UserId) {
    setUserIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("kcp:activeUser", id);
    }
  }

  return (
    <UserContext.Provider value={{ user: USERS[userId], setUserId, hydrated, authed }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): Ctx {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
