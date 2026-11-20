/**
 * What the SERVER needs to draw the first frame the way the browser will end
 * up showing it (owner, 11/2026: "i still see old sidebar when i refresh").
 * The page used to render as the Admin profile in the classic look and then
 * swap once the browser had asked who was signed in — that swap was the
 * flash. The signed-in user comes from the site cookie on the server; the
 * two browser-side choices below are mirrored into cookies so the server can
 * read them too. Client-safe (no server imports).
 */
export const ACTIVE_USER_COOKIE = "kcp_active_user";
export const SKIN_COOKIE = "kcp_skin";

const YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string | null) {
  if (typeof document === "undefined") return;
  document.cookie = value === null
    ? `${name}=; Path=/; Max-Age=0; SameSite=Lax`
    : `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
}

/** The profile admin / Alison are viewing (localStorage stays the client's copy). */
export function rememberActiveUser(id: string | null) {
  try {
    if (id) localStorage.setItem("kcp:activeUser", id);
    else localStorage.removeItem("kcp:activeUser");
  } catch { /* ignore */ }
  setCookie(ACTIVE_USER_COOKIE, id);
}

/** The look: only "classic" is worth recording — the new look is the default. */
export function rememberSkin(skin: "studio" | "classic") {
  setCookie(SKIN_COOKIE, skin === "classic" ? "classic" : null);
}
