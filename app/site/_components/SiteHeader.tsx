"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SITE_BASE, sitePath, siteAsset } from "@/lib/site/paths";
import { SITE_CATEGORIES, SITE_PROPERTIES, type SiteProperty } from "@/lib/site/content";
import { useSiteLoading } from "./SiteLoading";
import { ArrowRight, Building, ChevronDown, ExternalLink, Mail, MapPin, Menu, Phone, Search, WalletMinimal, Wrench, X } from "./icons";

// The company website's header, as the original built it: a fixed bar with the
// menu button, the centred logo and search. On the home page it starts clear
// over the hero and fades to navy between 425 and 575px of scroll (the logo
// fades in with it); everywhere else it is navy from the start. The menu is a
// full-height overlay — a photo on the left half, the navy menu on the right.

const NAVY = (a: number) => `rgba(15, 23, 42, ${a})`;
const DUR = { transitionDuration: "600ms" } as const;

export default function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === SITE_BASE;
  const { isLoading } = useSiteLoading();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shade, setShade] = useState(isHome ? 0 : 1); // 0 clear → 1 navy
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoading) requestAnimationFrame(() => setReady(true));
  }, [isLoading]);

  // Mount, then fade the overlay in; on close fade out, then unmount.
  useEffect(() => {
    if (menuOpen) {
      requestAnimationFrame(() => {
        setMenuMounted(true);
        requestAnimationFrame(() => setMenuVisible(true));
      });
      return;
    }
    setMenuVisible(false);
    const t = setTimeout(() => setMenuMounted(false), 600);
    return () => clearTimeout(t);
  }, [menuOpen]);

  useEffect(() => {
    if (!isHome) { setShade(1); return; }
    let frame = 0;
    const update = () => {
      const y = window.scrollY;
      setShade(y < 425 ? 0 : y > 575 ? 1 : Math.max(0, Math.min(1, (y - 425) / 150)));
      frame = 0;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [isHome]);

  const closeMenu = () => { if (menuOpen) { setMenuVisible(false); setTimeout(() => setMenuOpen(false), 600); } };

  if (isLoading && !ready) return null;

  const item = (delay: number) => ({
    className: `transition-all duration-600 ease-out transform ${menuVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`,
    style: { transitionDelay: `${delay}ms`, transitionDuration: "600ms", willChange: "opacity, transform" },
  });
  const navLink = "hover:text-slate-300 transition-colors duration-300";
  const side = "flex items-center text-slate-400 hover:text-white transition-colors duration-300";

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          backgroundColor: NAVY(0.85 * shade),
          backdropFilter: `blur(${8 * shade}px)`,
          transition: "background-color .5s ease, backdrop-filter .5s ease",
        }}
      >
        <div className={`transition-colors duration-500 ${menuOpen ? "bg-slate-900" : "bg-transparent"}`}>
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="text-white hover:text-slate-300 transition-colors duration-300 relative w-6 h-6"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
              >
                <Menu className={`absolute inset-0 transition-all duration-500 ease-in-out ${menuOpen ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"}`} />
                <X className={`absolute inset-0 transition-all duration-500 ease-in-out ${menuOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"}`} />
              </button>
              <Link
                href={sitePath("/")}
                onClick={closeMenu}
                className="absolute left-1/2 -translate-x-1/2 transition-opacity duration-300 ease-in-out"
                aria-hidden={menuOpen}
                style={{ opacity: menuOpen ? 1 : shade }}
              >
                <img src={siteAsset("images/Korman_CORPORATE_logo_WHT.png")} alt="Korman Commercial Properties" width={200} height={50} className="object-contain" style={{ width: 200, height: 50 }} />
              </Link>
              <button onClick={() => setSearchOpen(true)} className="text-white hover:text-slate-300 transition-colors duration-300" aria-label="Search">
                <Search className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {menuMounted && (
        <div className={`fixed top-16 left-0 right-0 bottom-0 z-40 transition-opacity ease-in-out ${menuVisible ? "opacity-100" : "opacity-0"}`} style={DUR}>
          <div className="flex h-full">
            <div className="hidden md:block w-1/2 h-full relative">
              <div className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${menuVisible ? "opacity-100" : "opacity-0"}`}>
                <img src={siteAsset("images/nav/3.jpg")} alt="Korman Commercial Properties" className="object-cover" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              </div>
            </div>
            <div className="w-full md:w-1/2 h-full bg-slate-900 text-white flex flex-col">
              <nav className="flex-1 flex flex-col pt-10 px-10">
                <ul className="space-y-7 text-3xl font-light">
                  <li {...item(100)}>
                    <div className="relative">
                      <div className="flex items-center w-full">
                        <Link href={sitePath("/current-properties")} onClick={closeMenu} className={`${navLink} text-3xl font-light`}>Current Properties</Link>
                        <button onClick={(e) => { e.preventDefault(); setPropsOpen(!propsOpen); }} className={`ml-2 ${navLink}`} aria-label="Toggle property types dropdown">
                          <ChevronDown className={`h-5 w-5 transition-transform duration-300 ${propsOpen ? "rotate-180" : ""}`} />
                        </button>
                      </div>
                      <div className={`overflow-hidden transition-all duration-500 ease-in-out ${propsOpen ? "max-h-60 opacity-100 mt-3" : "max-h-0 opacity-0"}`}>
                        <ul className="pl-6 space-y-3 text-xl font-light">
                          {(["office", "retail", "residential", "land"] as const).map((c) => (
                            <li key={c}><Link href={sitePath(`/${c}`)} onClick={closeMenu} className={navLink}>{SITE_CATEGORIES[c].title}</Link></li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </li>
                  <li {...item(180)}><Link href={sitePath("/available-space")} onClick={closeMenu} className={navLink}>Available Space</Link></li>
                  <li {...item(180)}><Link href={sitePath("/company")} onClick={closeMenu} className={navLink}>Company</Link></li>
                  <li {...item(420)}><Link href={sitePath("/contact")} onClick={closeMenu} className={navLink}>Contact</Link></li>
                </ul>
              </nav>
              <div
                className={`px-10 py-10 text-sm transition-all duration-800 ease-out transform ${menuVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={{ transitionDelay: "500ms", willChange: "opacity, transform" }}
              >
                <div className="flex flex-col space-y-4">
                  <Link href="/service" target="_blank" rel="noopener noreferrer" className={side}><Wrench className="h-4 w-4 mr-2" /><span>Service Requests</span></Link>
                  <Link href="/" target="_blank" rel="noopener noreferrer" className={side}><ExternalLink className="h-4 w-4 mr-2" /><span>Portal</span></Link>
                  <a href="https://www.rentpayment.com/pay/login.html" target="_blank" rel="noopener noreferrer" className={side}><WalletMinimal className="h-4 w-4 mr-2" /><span>Pay Rent</span></a>
                  <a href="mailto:info@kormancommercial.com" className={side}><Mail className="h-4 w-4 mr-2" /><span>info@kormancommercial.com</span></a>
                  <a href="tel:2152445100" className={side}><Phone className="h-4 w-4 mr-2" /><span>215.244.5100</span></a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

// ── Search ──────────────────────────────────────────────────────────────────
// The original queried its CMS: a property matches on a name or address that
// starts with the query (or has a word starting with it) or a description that
// contains it; pages match Contact / Company and the four category pages.

type PageHit = { id: string; title: string; href: string };

const STATIC_PAGES = [
  { id: "contact", title: "Contact Us", href: "/contact", description: "Get in touch with Korman Commercial Properties" },
  { id: "company", title: "Company", href: "/company", description: "Learn about Korman Commercial Properties" },
];

const bodyText = (p: SiteProperty) => (p.body ?? []).map((b) => b.children.map((c) => c.text).join("")).join(" ");
const wordStarts = (hay: string | null, q: string) => !!hay && (hay.toLowerCase().startsWith(q) || hay.toLowerCase().includes(` ${q}`));

function searchSite(query: string): { properties: SiteProperty[]; pages: PageHit[] } {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { properties: [], pages: [] };
  const scored = SITE_PROPERTIES.map((p) => {
    const name = p.name.toLowerCase().startsWith(q) || wordStarts(p.name, q);
    const addr = wordStarts(p.address, q);
    const desc = bodyText(p).toLowerCase().includes(q);
    return { p, score: (name ? 3 : 0) + (addr ? 2 : 0) + (desc ? 1 : 0) };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  const pages: PageHit[] = [
    ...STATIC_PAGES.filter((pg) => pg.title.toLowerCase().includes(q) || pg.description.toLowerCase().includes(q)),
    ...Object.values(SITE_CATEGORIES)
      .filter((c) => wordStarts(c.title, q))
      .map((c) => ({ id: c.slug, title: c.title, href: `/${c.slug}` })),
  ];
  return { properties: scored.slice(0, 10).map((x) => x.p), pages: pages.slice(0, 7) };
}

const propertyHref = (p: SiteProperty) => sitePath(`/${p.category}/${p.slug}`);

function SearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ properties: SiteProperty[]; pages: PageHit[] }>({ properties: [], pages: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  useEffect(() => {
    if (query.length > 1) {
      setLoading(true);
      const t = setTimeout(() => { setResults(searchSite(query)); setLoading(false); }, 300);
      return () => clearTimeout(t);
    }
    setResults({ properties: [], pages: [] });
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [isOpen, onClose]);

  const has = results.properties.length > 0 || results.pages.length > 0;
  const none = query.length > 1 && !loading && !has;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm transition-opacity ease-in-out"
      style={{ opacity: isOpen ? 1 : 0, visibility: isOpen ? "visible" : "hidden", transitionDuration: "600ms" }}
    >
      <div
        ref={panelRef}
        className="fixed inset-x-0 top-0 z-50 bg-white shadow-lg transform transition-all ease-in-out"
        style={{ opacity: isOpen ? 1 : 0, transform: isOpen ? "translateY(0)" : "translateY(-10px)", transitionDuration: "600ms" }}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center h-16">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (results.properties.length) { router.push(propertyHref(results.properties[0])); onClose(); }
                else if (results.pages.length) { router.push(sitePath(results.pages[0].href)); onClose(); }
              }}
              className="flex-1 flex items-center"
            >
              <Search className="h-5 w-5 text-slate-400 mr-3" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search properties and pages"
                className="flex-1 text-lg text-slate-800 placeholder-slate-400 bg-transparent border-none focus:outline-none focus:ring-0"
                autoComplete="off"
              />
            </form>
            <button onClick={onClose} className="ml-4 text-slate-800 hover:text-slate-600 transition-colors" aria-label="Close search">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
        {(has || loading || none) && (
          <div className="border-t border-slate-200 max-h-[calc(100vh-5rem)] overflow-y-auto">
            <div className="container mx-auto px-4 py-8">
              {loading && (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800" />
                </div>
              )}
              {none && (
                <div className="text-center py-12">
                  <p className="text-slate-600 text-lg">No results found for &quot;{query}&quot;</p>
                  <p className="text-slate-500 mt-2">Try a different search term or browse our properties</p>
                </div>
              )}
              {!loading && results.properties.length > 0 && (
                <div className="mb-10">
                  <h3 className="text-lg font-medium text-slate-800 mb-4">Properties</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {results.properties.map((p) => (
                      <Link key={p.id} href={propertyHref(p)} onClick={onClose} className="group flex flex-col bg-white border border-slate-200  overflow-hidden hover:shadow-md transition-shadow duration-300">
                        <div className="relative aspect-[16/9] overflow-hidden">
                          {p.mainImage && (
                            <img src={p.mainImage} alt={p.name} loading="lazy" className="object-cover transition-transform duration-500 group-hover:scale-105" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
                          )}
                        </div>
                        <div className="p-4">
                          <div className="text-sm font-medium text-slate-500 mb-1">{SITE_CATEGORIES[p.category].title}</div>
                          <h4 className="text-lg font-medium text-slate-800 mb-1 group-hover:text-slate-600 transition-colors">{p.name}</h4>
                          <div className="flex items-center text-slate-500 text-sm">
                            <MapPin className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                            {p.address}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {!loading && results.pages.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-slate-800 mb-4">Pages</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {results.pages.map((pg) => (
                      <Link key={pg.id} href={sitePath(pg.href)} onClick={onClose} className="flex items-start p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors group">
                        <div className="mr-4 mt-1">
                          <div className="bg-slate-100 p-2 rounded-full"><Building className="h-5 w-5 text-slate-600" /></div>
                        </div>
                        <div><h4 className="text-lg font-medium text-slate-800 group-hover:text-slate-600 transition-colors">{pg.title}</h4></div>
                        <ArrowRight className="h-5 w-5 text-slate-400 ml-auto flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
