import type { Metadata } from "next";
import "./site.css";
import SiteHeader from "./_components/SiteHeader";
import SiteFooter from "./_components/SiteFooter";
import { SiteLoadingProvider } from "./_components/SiteLoading";

// THE COMPANY WEBSITE (kormancommercial.com), rebuilt inside the portal from
// the vendor's site in 10/2026 so we own it. Public — exempt from site auth in
// middleware.ts and from the staff chrome in AppShell.tsx. `.kcs` scopes it:
// the portal's globals.css skips every element inside it, and site.css (the
// vendor build's own Tailwind output) styles it. Light only, as the original.

export const metadata: Metadata = {
  title: { default: "Korman Commercial Properties", template: "%s | Korman Commercial Properties" },
  description:
    "Developers and managers of office, retail, industrial and rental housing. Neshaminy Interplex business center and The Office Works.",
  icons: { icon: "/site/favicon.ico" },
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
