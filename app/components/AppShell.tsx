"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { useUser } from "./UserProvider";
import { isPathAllowed } from "../../lib/users";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const sidebarW = open ? 220 : 60;
  const pathname = usePathname();
  const router = useRouter();
  const { user, hydrated } = useUser();

  useEffect(() => {
    if (!hydrated) return;
    if (!isPathAllowed(user.id, pathname)) {
      router.replace("/dashboard");
    }
  }, [hydrated, pathname, user.id, router]);

  return (
    <div style={{ paddingLeft: sidebarW, transition: "padding-left 0.2s ease", minHeight: "100vh", overflowX: "hidden" }}>
      <Sidebar open={open} onToggle={() => setOpen((o) => !o)} />
      {children}
    </div>
  );
}
