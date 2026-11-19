import type { Metadata } from "next";
import "./site.css";
import { DEFAULT_SHARE_IMAGE, PAGE_DESCRIPTIONS, SITE_NAME, SITE_ORIGIN } from "@/lib/site/seo";
import SiteHeader from "./_components/SiteHeader";
import SiteFooter from "./_components/SiteFooter";
import { SiteLoadingProvider } from "./_components/SiteLoading";

// THE COMPANY WEBSITE (kormancommercial.com), rebuilt inside the portal from
// the vendor's site in 10/2026 so we own it. Public — exempt from site auth in
// middleware.ts and from the staff chrome in AppShell.tsx. `.kcs` scopes it:
// the portal's globals.css skips every element inside it, and site.css (the
// vendor build's own Tailwind output) styles it. Light only, as the original.

// Search: every page names its canonical on kormancommercial.com, carries a
// written description and a share card (lib/site/seo.ts).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: PAGE_DESCRIPTIONS.home,
  icons: { icon: "/site/favicon.ico" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", images: [{ url: DEFAULT_SHARE_IMAGE }] },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="kcs __className_f367f3 bg-white text-slate-900" style={{ minHeight: "100vh", colorScheme: "light" }}>
      <SiteLoadingProvider>
        <SiteHeader />
        <main className="pt-16">{children}</main>
        <SiteFooter />
      </SiteLoadingProvider>
    </div>
  );
}
