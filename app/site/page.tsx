import Link from "next/link";
import { sitePath, siteAsset } from "@/lib/site/paths";
import HomeLoader from "./_home/HomeLoader";
import StatsShowcase from "./_home/StatsShowcase";

// The company website's home page: the hero photo with the logo, the four
// counters, four tall tiles into the site, and the welcome copy.

const HERO = siteAsset("images/home/option2.jpg");

const TILES: { href: string; label: React.ReactNode; alt: string; img: string; imgClass?: string; imgStyle?: React.CSSProperties }[] = [
  { href: "/current-properties", label: <>Current<br />Properties</>, alt: "Current Properties", img: "images/categories_duplicate/current-properties.jpg" },
  { href: "/company", label: "Company", alt: "Company", img: "images/categories_duplicate/hyman-korman-inc-truck-bw.jpg", imgClass: "object-left", imgStyle: { objectPosition: "-37px 0" } },
  { href: "/available-space", label: <>Available<br />Space</>, alt: "Available Space", img: "images/categories_duplicate/Neshaminy-Mall-Totem.jpg", imgClass: "object-left" },
  { href: "/contact", label: "Contact", alt: "Contact", img: "images/categories_duplicate/8-neshaminy-inside.jpg" },
];

const FILL: React.CSSProperties = { position: "absolute", height: "100%", width: "100%", left: 0, top: 0, right: 0, bottom: 0 };

export default function SiteHome() {
  return (
    <HomeLoader preload={HERO}>
      <main className="min-h-screen">
        <section className="relative w-full h-screen">
          <div className="absolute inset-0 w-full h-full overflow-hidden bg-slate-900 -mt-16">
            <div className="absolute inset-0 z-0">
              <div style={{ backgroundImage: `url('${HERO}')`, filter: "brightness(0.85)" }} className="w-full h-full bg-cover bg-center">
                <div className="absolute inset-0 bg-black/10 flex flex-col items-center justify-center text-white px-4">
                  <div className="text-center max-w-4xl animate-fade-in">
                    <div className="flex justify-center items-center">
                      <img
                        src={siteAsset("images/Korman_CORPORATE_logo_WHT.png")}
                        alt="Korman Commercial Properties Logo"
                        style={{ objectFit: "contain" }}
                        className="w-[350px] md:w-[500px] lg:w-[650px] max-w-full h-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <StatsShowcase />

        <section className="w-full relative" style={{ marginBottom: -1 }}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {TILES.map((t) => (
              <div className="relative" key={t.href}>
                <Link className="group block relative h-[90vh] md:h-[90vh] overflow-hidden" href={sitePath(t.href)}>
                  <div className="absolute inset-0 w-full h-full">
                    <img
                      alt={t.alt}
                      src={siteAsset(t.img)}
                      className={`object-cover transition-transform duration-700 group-hover:scale-110 ${t.imgClass ?? ""}`}
                      style={{ ...FILL, ...t.imgStyle }}
                    />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent flex flex-col items-center justify-center">
                    <h3 className="text-2xl md:text-3xl font-semibold text-white tracking-wider text-center uppercase">{t.label}</h3>
                    <div className="w-12 h-0.5 bg-white/70 mt-3" />
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="py-24 bg-white w-full">
          <div className="w-full">
            <div className="w-full text-center">
              <h2 className="text-5xl md:text-7xl font-light text-slate-800 mb-10 w-full" style={{ lineHeight: 1.1 }}>
                Excellence in Commercial Real Estate
              </h2>
              <div className="max-w-4xl mx-auto px-4 md:px-8 lg:px-12">
                <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                  Korman Commercial Properties is a fifth-generation, family-owned real estate company building bold,
                  people-first spaces across Pennsylvania and New Jersey. From vibrant office parks to retail hubs and
                  industrial flex spaces, we make places where businesses thrive.
                </p>
                <p className="text-lg text-slate-600 leading-relaxed">
                  We’re all about smart locations, standout service, and lasting partnerships—with a legacy built on trust
                  and a future focused on growth. Let’s build what’s next, together.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </HomeLoader>
  );
}
