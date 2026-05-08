"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ALL_USERS, USERS, type UserDef, type UserId } from "../../lib/users";
import type { RentRollData } from "../../lib/rentroll/parseRentRollExcel";

type Ctx = {
  user: UserDef;
  setUserId: (id: UserId) => void;
  hydrated: boolean;
};

const UserContext = createContext<Ctx | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserIdState] = useState<UserId>("admin");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("kcp:activeUser");
    if (stored && (ALL_USERS as readonly string[]).includes(stored)) {
      setUserIdState(stored as UserId);
    }
    setHydrated(true);
  }, []);

  function setUserId(id: UserId) {
    setUserIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("kcp:activeUser", id);
    }
  }

  return (
    <UserContext.Provider value={{ user: USERS[userId], setUserId, hydrated }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): Ctx {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}

/** Filter a rent roll's properties to the active user's scope (returns the same object if no scope). */
export function useScopedRentroll(rentroll: RentRollData | null | undefined): RentRollData | null {
  const { user } = useUser();
  if (!rentroll) return null;
  const scope = user.propertyScope;
  if (!scope) return rentroll;
  return {
    ...rentroll,
    properties: rentroll.properties.filter((p) => scope.has(p.propertyCode.toUpperCase())),
  };
}
