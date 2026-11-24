// Client-safe: no server imports.

/** Where the KCP share drive syncs on a Windows PC (owner, 11/2026: the path
 *  shown was "missing the full file path"). A path written from the share's
 *  top ("Data\…") is shown from the C: drive, so it pastes into Explorer as
 *  is. The user folder is the person's own where we know it; anyone else gets
 *  %USERPROFILE%, which Explorer's address bar expands itself. */
export const WINDOWS_PROFILE: Record<string, string> = { drew: "Drew Winig" };
export function shareRoot(userId?: string): string {
  const who = userId ? WINDOWS_PROFILE[userId] : undefined;
  return `${who ? `C:\\Users\\${who}` : "%USERPROFILE%"}\\OneDrive - Korman Commercial Properties\\KCP - Documents`;
}
export function fullSharePath(path: string, userId?: string): string {
  return /^Data[\\/]/.test(path) ? `${shareRoot(userId)}\\${path}` : path;
}

