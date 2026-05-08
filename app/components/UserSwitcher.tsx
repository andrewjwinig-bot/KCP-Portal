"use client";

import { useUser } from "./UserProvider";
import { ALL_USERS, USERS, type UserId } from "../../lib/users";

export default function UserSwitcher({ collapsed }: { collapsed: boolean }) {
  const { user, setUserId } = useUser();

  if (collapsed) {
    return (
      <div
        title={user.label}
        style={{
          width: 32, height: 32, borderRadius: 999,
          background: "rgba(255,255,255,0.18)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, letterSpacing: "0.04em",
          flexShrink: 0,
        }}
      >
        {user.label.slice(0, 1)}
      </div>
    );
  }

  return (
    <select
      value={user.id}
      onChange={(e) => setUserId(e.target.value as UserId)}
      style={{
        background: "rgba(255,255,255,0.12)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: 8,
        padding: "5px 8px",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        cursor: "pointer",
        flex: 1,
        minWidth: 0,
      }}
    >
      {ALL_USERS.map((id) => (
        <option key={id} value={id} style={{ color: "#1e293b" }}>
          {USERS[id].label}
        </option>
      ))}
    </select>
  );
}
