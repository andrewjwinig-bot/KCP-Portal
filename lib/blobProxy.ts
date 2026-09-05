// The Vercel Blob store is configured with PRIVATE access, so raw blob URLs
// aren't directly fetchable by the browser — they must be streamed through our
// authenticated proxy (/api/blob), which is already gated by site auth in
// middleware. `blobSrc` wraps a stored blob URL into that proxy path. Empty or
// already-proxied values pass through unchanged.
export function blobSrc(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/api/blob")) return url;
  return `/api/blob?url=${encodeURIComponent(url)}`;
}
