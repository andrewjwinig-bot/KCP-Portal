/** @type {import('next').NextConfig} */

// Baseline HTTP security headers applied to every response.
//
// The Content-Security-Policy here is deliberately CONSERVATIVE: it only sets
// the directives that are safe with this app as-is (which uses inline styles +
// Next.js inline hydration scripts heavily). It does NOT set script-src /
// style-src / img-src / connect-src, so those stay unrestricted and nothing
// breaks — a fully script-locking, nonce-based CSP is a larger follow-up. What
// it DOES close: plugin/object injection, <base> hijacking, cross-origin form
// posts, and cross-origin framing (defense-in-depth beyond X-Frame-Options),
// plus upgrading any stray http subresource to https.
const csp = [
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // Force HTTPS for 2 years (incl. subdomains).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Don't let browsers MIME-sniff responses into a different content type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Anti-clickjacking: refuse cross-origin framing. SAMEORIGIN (not DENY) so the
  // app can still frame its own content — e.g. the floorplan PDF preview, which
  // embeds the same-origin /api/blob proxy in an <iframe>. DENY blocked it,
  // showing a "refused to display" box instead of the floorplan.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Trim the Referer sent cross-origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable powerful browser features the app doesn't use.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Conservative CSP (see note above) — safe hardening without a script lockdown.
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig = {
  // pdf-parse (and its pdfjs core) ship their own runtime assets — keep them out
  // of the bundle so the Cash Sheet AP PDF parser loads them at runtime.
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
