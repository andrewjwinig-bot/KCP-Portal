import type { Metadata } from "next";
import "./globals.css";
import AppShell from "./components/AppShell";
import { UserProvider } from "./components/UserProvider";
import { ImportProvider } from "./components/import/ImportProvider";
import { cookies, headers } from "next/headers";
import { SITE_COOKIE, siteAuthConfigured, verifySiteToken } from "../lib/site-auth";
import { ACTIVE_USER_COOKIE, SKIN_COOKIE } from "../lib/ui/firstPaint";
import { hostBase } from "../lib/hostRoutes";

export const metadata: Metadata = {
  title: "KCP Portal",
  description: "Korman Commercial Properties internal portal",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A request on a website domain (kormancommercial.com, the Office Works
  // domain) is rewritten into /site or /office-works by middleware, but the
  // page sees the domain's own path ("/", "/company") — so the shell is told
  // by the HOST that this is the public website, never the staff portal.
  const website = !!hostBase(headers().get("host"));
  // Who is signed in, read HERE so the first frame is their own sidebar and
  // dashboard — the browser used to draw Admin's, then swap (the "old
  // sidebar" flash on refresh). Same check as /api/site/status.
  const jar = cookies();
  const initialUser = siteAuthConfigured()
    ? await verifySiteToken(jar.get(SITE_COOKIE)?.value, process.env.SITE_AUTH_SECRET!).catch(() => null)
    : "admin";
  const initialActive = jar.get(ACTIVE_USER_COOKIE)?.value ?? null;
  const initialSkin = jar.get(SKIN_COOKIE)?.value === "classic" ? "classic" : "studio";
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Hanken+Grotesk:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
        {/* Apply persisted theme before paint to avoid a light → dark flicker. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('kcp:theme');if(t==='dark')document.documentElement.dataset.theme='dark';}catch(e){}})();`,
          }}
        />
        {/* The new look (data-skin="studio") — per browser, staff pages only.
            ?skin=studio / ?skin=classic sets it. Public pages stay classic. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var q=new URLSearchParams(location.search).get('skin');if(q==='studio'||q==='classic'){localStorage.setItem('kcp:skin',q);document.cookie=q==='classic'?'kcp_skin=classic; Path=/; Max-Age=31536000; SameSite=Lax':'kcp_skin=; Path=/; Max-Age=0; SameSite=Lax';}if(localStorage.getItem('kcp:skin')==='classic')return;var h=location.hostname;if(!/^portal\\.|vercel\\.app$|^localhost$|^127\\./.test(h))return;if(/^\\/(site|centers|portal|statement|investor|budget-review|commissions-review|office-works|submit|service|reserve|login)(\\/|$)/.test(location.pathname))return;document.documentElement.dataset.skin='studio';}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <UserProvider initialUser={initialUser} initialActive={initialActive} initialSkin={website ? "classic" : initialSkin}>
          <ImportProvider>
            <AppShell website={website}>{children}</AppShell>
          </ImportProvider>
        </UserProvider>
      </body>
    </html>
  );
}
