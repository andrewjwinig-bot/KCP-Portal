/** @type {import('next').NextConfig} */

// Baseline HTTP security headers applied to every response. Conservative set —
// no Content-Security-Policy yet (the app uses inline styles heavily, so a
// strict CSP needs dedicated tuning). Safe with the current app: it uses no
// camera/mic/geolocation, and the only framing it does is same-origin (the
// floorplan PDF preview loads /api/blob in an <iframe>).
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
