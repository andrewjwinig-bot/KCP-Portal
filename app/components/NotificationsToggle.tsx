"use client";

import { useEffect, useState } from "react";
import { notificationsEnabled, notificationsSupported, setNotificationsEnabled } from "../../lib/notifications";

export default function NotificationsToggle() {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(notificationsSupported());
    setOn(notificationsEnabled());
  }, []);

  if (!supported) return null;

  async function toggle() {
    const next = !on;
    const ok = await setNotificationsEnabled(next);
    setOn(ok);
    if (!ok && next) {
      // User declined the permission prompt
      alert("Notifications were blocked. Enable them in your browser site settings to turn this on.");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={on ? "Notifications: ON" : "Notifications: OFF"}
      aria-label="Toggle notifications"
      style={{
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.18)",
        color: "#bfdbfe",
        cursor: "pointer",
        padding: 6,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {on ? (
        // Bell ON
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ) : (
        // Bell OFF
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
          <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
          <path d="M18 8a6 6 0 0 0-9.33-5" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      )}
    </button>
  );
}
