// What a self-chosen password must be (owner, 11/2026: "let users select and
// change their own passwords"). Pure, so the page and the server say the same
// thing. Long beats clever: a 10-character floor, nothing that is just the
// user's own name or a well-known word, and never the one being replaced.

export const PASSWORD_MIN_LENGTH = 10;

const COMMON = ["password", "korman", "kormancommercial", "welcome", "letmein", "qwerty", "123456", "admin", "portal", "interplex"];

/** Why `next` can't be used, in plain English — or null when it's fine. */
export function passwordProblem(next: string, opts: { userId: string; label?: string; current?: string }): string | null {
  const p = String(next ?? "");
  if (p.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (p.length > 200) return "That password is too long.";
  if (/^\s|\s$/.test(p)) return "Don't start or end it with a space.";
  if (opts.current && p === opts.current) return "Choose a password different from the one you have now.";
  const low = p.toLowerCase();
  const names = [opts.userId, opts.label].filter(Boolean).map((n) => String(n).toLowerCase());
  if (names.some((n) => n.length >= 3 && low.replace(/[^a-z]/g, "") === n)) return "Don't use your own name as the password.";
  const core = low.replace(/[^a-z]/g, "");
  if (COMMON.some((w) => core === w || low === w)) return "That password is too easy to guess — pick something less common.";
  if (/^(.)\1+$/.test(p)) return "That password is too easy to guess — pick something less common.";
  return null;
}
