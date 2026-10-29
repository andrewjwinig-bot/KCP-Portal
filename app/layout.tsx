import type { Metadata } from "next";
import "./globals.css";
import AppShell from "./components/AppShell";
import { UserProvider } from "./components/UserProvider";
import { ImportProvider } from "./components/import/ImportProvider";
import { headers } from "next/headers";
import { hostBase } from "../lib/hostRoutes";

export const metadata: Metadata = {
  title: "KCP Portal",
  description: "Korman Commercial Properties internal portal",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // A request on a website domain (kormancommercial.com, the Office Works
  // domain) is rewritten into /site or /office-works by middleware, but the
  // page sees the domain's own path ("/", "/company") — so the shell is told
  // by the HOST that this is the public website, never the staff portal.
  const website = !!hostBase(headers().get("host"));
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        {/* Apply persisted theme before paint to avoid a light → dark flicker. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('kcp:theme');if(t==='dark')document.documentElement.dataset.theme='dark';}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <UserProvider>
          <ImportProvider>
            <AppShell website={website}>{children}</AppShell>
          </ImportProvider>
        </UserProvider>
      </body>
    </html>
  );
}
