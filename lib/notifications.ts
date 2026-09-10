/** Client-side browser-notification helpers. In-tab only — fires while the app
 *  is open. State is persisted in localStorage so toggling on/off and the
 *  per-item daily de-dup survive reloads. */

const STORAGE_ENABLED = "kcp:notifications:enabled";
const STORAGE_FIRED = "kcp:notifications:fired";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

export function notificationsEnabled(): boolean {
  if (!notificationsSupported()) return false;
  return localStorage.getItem(STORAGE_ENABLED) === "true"
    && Notification.permission === "granted";
}

export function notificationsPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** Turn notifications on (asks for permission if needed) or off. Resolves to
 *  the resulting enabled state. */
export async function setNotificationsEnabled(on: boolean): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (!on) {
    localStorage.setItem(STORAGE_ENABLED, "false");
    return false;
  }
  let perm = Notification.permission;
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") {
    localStorage.setItem(STORAGE_ENABLED, "false");
    return false;
  }
  localStorage.setItem(STORAGE_ENABLED, "true");
  return true;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadFiredMap(): Record<string, string> {
  if (!notificationsSupported()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_FIRED);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Fires a desktop notification if (a) the master toggle is on, (b) permission
 *  is granted, and (c) the same itemKey hasn't fired today yet. The URL the
 *  notification routes to when clicked defaults to the current page. */
export function fireNotification(opts: {
  title: string;
  body: string;
  itemKey: string;
  url?: string;
}) {
  if (!notificationsEnabled()) return;
  const map = loadFiredMap();
  if (map[opts.itemKey] === todayKey()) return;
  try {
    const n = new Notification(opts.title, { body: opts.body, icon: "/favicon.ico", tag: opts.itemKey });
    n.onclick = () => {
      window.focus();
      if (opts.url) window.location.href = opts.url;
      n.close();
    };
    map[opts.itemKey] = todayKey();
    localStorage.setItem(STORAGE_FIRED, JSON.stringify(map));
  } catch {
    /* ignore — likely a browser block */
  }
}
