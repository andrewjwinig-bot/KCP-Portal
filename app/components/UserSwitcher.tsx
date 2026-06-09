"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "./UserProvider";
import { ALL_USERS, USERS, type UserId } from "../../lib/users";

const AVATAR_COLOR: Record<UserId, string> = {
  admin:  "#16a34a",
  drew:   "#4338ca",
  marie:  "#db2777",
  nancy:  "#0b4a7d",
  harry:  "#d97706",
  maint:  "#7c3aed",
  alison: "#0d9488",
};

function Avatar({ id, size = 24 }: { id: UserId; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 999,
        background: AVATAR_COLOR[id],
        color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size <= 24 ? 11 : 13,
        fontWeight: 800,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      {USERS[id].label.slice(0, 1)}
    </div>
  );
}

/** Static user badge — shown to users who can't switch profiles. */
function UserBadge({ id, collapsed }: { id: UserId; collapsed: boolean }) {
  if (collapsed) return <Avatar id={id} size={32} />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, padding: "6px 10px 6px 6px" }}>
      <Avatar id={id} size={26} />
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.1 }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>
          User
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {USERS[id].label}
        </div>
      </div>
    </div>
  );
}

export default function UserSwitcher({ collapsed }: { collapsed: boolean }) {
  const { user, setUserId, canSwitch } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Users other than admin / alison are pinned to their own profile.
  if (!canSwitch) return <UserBadge id={user.id} collapsed={collapsed} />;

  if (collapsed) return <Avatar id={user.id} size={32} />;

  function pickUser(id: UserId) {
    setUserId(id);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Signed in as ${user.label}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "6px 10px 6px 6px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.08)",
          color: "#fff",
          cursor: "pointer",
          textAlign: "left",
          minWidth: 0,
        }}
      >
        <Avatar id={user.id} size={26} />
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.1 }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>
            User
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.label}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "var(--card)",
            borderRadius: 10,
            border: "1px solid rgba(15,23,42,0.12)",
            boxShadow: "0 10px 28px rgba(15,23,42,0.18)",
            padding: 4,
            zIndex: 100,
          }}
        >
          {[...ALL_USERS].sort((a, b) => USERS[a].label.localeCompare(USERS[b].label)).map((id) => {
            const isActive = id === user.id;
            return (
              <button
                key={id}
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => pickUser(id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "7px 9px",
                  borderRadius: 7,
                  border: "none",
                  background: isActive ? "rgba(11,74,125,0.08)" : "transparent",
                  color: "#0f172a",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(15,23,42,0.05)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <Avatar id={id} size={24} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{USERS[id].label}</span>
                {isActive && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b4a7d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
