import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CENTER_PROFILES, centerBySlug } from "@/lib/centers/registry";
import { getCenterData } from "@/lib/centers/data";
import LeasingForm from "./LeasingForm";
import { centerStyles } from "./styles";

// Public, SEO-findable property marketing + leasing page for a shopping
// center. One data-driven template drives all five centers (registry.ts); the
// tenant roster syncs from the live rent roll (data.ts). Design + copy per the
// Claude Design handoff. Light-theme only by design (built for bright photos
// on white). This route is exempted from site auth in middleware.ts +
// AppShell.tsx so it renders publicly with no staff chrome.

// Incrementally regenerate so the public page picks up rent-roll changes
// (new tenants, vacancies) without a redeploy, while staying fast + cached.
// Only the five known centers are valid slugs; anything else 404s.
export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
  return CENTER_PROFILES.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const profile = centerBySlug(params.slug);
  if (!profile) return { title: "Shopping Center" };
  const { seo } = profile;
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: `/centers/${profile.slug}` },
    openGraph: { title: seo.ogTitle, description: seo.ogDescription, type: "website" },
  };
}

const fmt = (n: number) => n.toLocaleString("en-US");

export default async function CenterPage({ params }: { params: { slug: string } }) {
  const profile = centerBySlug(params.slug);
  if (!profile) notFound();

  const data = await getCenterData(profile);
  const { tenants, vacancies, availTotal, specs, facts, spaceOptions } = data;
  const c = profile.contact;
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(
    `${profile.streetAddress}, ${profile.city}, ${profile.state}`,
  )}&z=15&output=embed`;
  // Hero eyebrow: "<street> · <city>, <state>" (uppercased in CSS).
  const [streetPart, ...restParts] = profile.addressLine.split(",").map((s) => s.trim());
  const heroEyebrow = `${streetPart} · ${restParts.join(", ")}`;
  // Street name (drop the leading house/range number) for the site-plan caption.
  const streetName = streetPart.replace(/^[\d\-–]+\s*/, "").trim() || streetPart;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ShoppingCenter",
    name: profile.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: profile.streetAddress,
      addressLocality: profile.city,
      addressRegion: profile.state,
      postalCode: profile.zip,
      addressCountry: "US",
    },
    email: c.email,
    telephone: `+1-${c.phone.replace(/[^\d]/g, "")}`,
    ...(profile.geo ? { geo: { "@type": "GeoCoordinates", latitude: profile.geo.lat, longitude: profile.geo.lng } } : {}),
  };

  return (
    <div
      className="gc"
      style={{ "--gc-accent": profile.accent, "--gc-accent-dark": profile.accentOnDark } as React.CSSProperties}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: centerStyles }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* NAV */}
      <header className="gc-nav-wrap">
        <nav className="gc-nav gc-wrap" aria-label="Primary">
          <a className="gc-brand" href="https://kormancommercial.com/">
            <span className="gc-brand-name">KORMAN</span>
            <span className="gc-brand-sub">Commercial Properties</span>
          </a>
          <div className="gc-nav-links">
            <a href="#overview">Overview</a>
            <a href="#tenants">Tenants</a>
            <a href="#spaces">Available</a>
            <a href="#location">Location</a>
            <a href="#inquire" className="gc-nav-cta">Leasing inquiry</a>
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section className="gc-hero" aria-label={profile.name}>
        {profile.assets.hero ? (
          <img className="gc-hero-img" src={profile.assets.hero} alt={`${profile.name} exterior`} />
        ) : (
          <>
            <div className="gc-hero-ph" aria-hidden="true" />
            <div className="gc-hero-ph-cap">Drop landscape hero photo — 3000 × 1500</div>
          </>
        )}
        <div className="gc-hero-scrim" aria-hidden="true" />
        <div className="gc-hero-in gc-wrap">
          <div className="gc-hero-row">
            <div className="gc-hero-left">
              <div className="gc-eyebrow gc-eyebrow-hero">
                <span className="gc-rule" aria-hidden="true" />
                {heroEyebrow}
              </div>
              <h1 className="gc-h1">{profile.h1[0]}<br />{profile.h1[1]}</h1>
              <p className="gc-hero-sub">{profile.heroSub}</p>
            </div>
            {vacancies.length > 0 && (
              <a href="#spaces" className="gc-hero-cta">
                <span className="gc-hero-cta-k">Now leasing</span>
                <span className="gc-hero-cta-v">{fmt(availTotal)} SF available</span>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* OVERVIEW */}
      <section id="overview" className="gc-overview gc-wrap">
        <div className="gc-overview-left">
          <p className="gc-lede">{profile.overview}</p>
          {vacancies.length > 0 && (
            <a href="#spaces" className="gc-btn-dark">View available space</a>
          )}
        </div>
        <div className="gc-specs">
          {specs.map((s) => (
            <div className="gc-spec" key={s.k}>
              <div className="gc-spec-k">{s.k}</div>
              <div className="gc-spec-v">{s.v}</div>
            </div>
          ))}
          <div className="gc-spec gc-spec-last">
            <div className="gc-spec-k">Lease inquiry</div>
            <div className="gc-spec-contact">
              <span className="gc-contact-name">{c.name}</span>
              <a href={`tel:${c.phoneHref}`} className="gc-contact-plain">{c.phone}</a>
              <a href={`mailto:${c.email}`} className="gc-contact-mail">{c.email}</a>
            </div>
          </div>
        </div>
      </section>

      {/* FACTS */}
      <section className="gc-wrap" aria-label="Key facts">
        <div className="gc-facts">
          {facts.map((f) => (
            <div className="gc-fact" key={f.k}>
              <div className="gc-fact-k">{f.k}</div>
              <div className="gc-fact-v">{f.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SITE PLAN */}
      <section className="gc-plan gc-wrap">
        <div className="gc-plan-head">
          <h2 className="gc-h2">Site plan</h2>
          <div className="gc-plan-cap">{streetName} frontage · {profile.parking}</div>
        </div>
        {profile.assets.sitePlan ? (
          <img className="gc-plan-img" src={profile.assets.sitePlan} alt={`${profile.name} site plan`} />
        ) : (
          <div className="gc-plan-ph">Drop site plan drawing — full width</div>
        )}
      </section>

      {/* TENANT ROSTER */}
      <section id="tenants" className="gc-tenants gc-wrap">
        <div className="gc-tenants-head">
          <h2 className="gc-h2">Tenant roster</h2>
        </div>
        <div className="gc-trows">
          {tenants.map((t, i) => {
            const meta = profile.showSquareFootage
              ? [t.cat, `${fmt(t.sf)} SF`].filter(Boolean).join(" · ")
              : t.cat;
            return (
              <div className="gc-trow" key={`${t.name}-${i}`}>
                <div className="gc-tname">{t.name}</div>
                <div className="gc-tcat">{meta}</div>
                <div className="gc-tstatus">Open</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* AVAILABLE NOW */}
      <section id="spaces" className="gc-avail">
        <div className="gc-avail-in gc-wrap">
          <div className="gc-avail-head">
            <h2 className="gc-h2-hero">Available now</h2>
            <div className="gc-avail-blurb">{profile.availableBlurb}</div>
          </div>
          <div className="gc-vrows">
            {vacancies.length === 0 ? (
              <div className="gc-vrow gc-vrow-empty">
                <div className="gc-vempty">Fully leased today — reach out to join the waitlist for this center.</div>
                <a href="#inquire" className="gc-inq" data-gc-space="Multiple / not sure">Inquire</a>
              </div>
            ) : (
              vacancies.map((v) => (
                <div className="gc-vrow" key={v.suite}>
                  <div className="gc-vsuite">{v.suite}</div>
                  <div className="gc-vdesc">
                    <div className="gc-vlabel">{v.notes}</div>
                    <div className="gc-vkind">{v.kind}</div>
                  </div>
                  <div className="gc-vsf">{fmt(v.sf)} SF</div>
                  <div className="gc-vfront">{v.frontage}</div>
                  <a href="#inquire" className="gc-inq" data-gc-space={`${v.suite} — available`}>Inquire</a>
                </div>
              ))
            )}
            <div className="gc-vrow-cap" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* LOCATION */}
      <section id="location" className="gc-loc">
        <div className="gc-loc-head gc-wrap">
          <h2 className="gc-h2 gc-loc-h">{profile.location.heading}</h2>
          {profile.location.blurb && <p className="gc-loc-blurb">{profile.location.blurb}</p>}
        </div>
        <div className="gc-map">
          <iframe
            title={`Map of ${profile.name}`}
            src={mapSrc}
            loading="lazy"
            className="gc-map-frame"
          />
        </div>
        {profile.location.access.length > 0 && (
          <div className="gc-wrap">
            <div className="gc-access">
              {profile.location.access.map((a) => (
                <div className="gc-access-cell" key={a.k}>
                  <div className="gc-access-v">{a.v}</div>
                  <div className="gc-access-k">{a.k}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* NEIGHBORHOOD */}
      {profile.neighborhood.length > 0 && (
        <section className="gc-hood">
          <div className="gc-hood-in gc-wrap">
            <div className="gc-hood-head">
              <h2 className="gc-h2">The neighborhood</h2>
              <div className="gc-plan-cap gc-cap-ondark">{profile.h1[0]} · {profile.city}</div>
            </div>
            <div className="gc-hood-grid">
              {profile.neighborhood.map((h) => (
                <div className="gc-hood-card" key={h.title}>
                  {h.photo ? (
                    <img className="gc-hood-img" src={h.photo} alt={h.title} />
                  ) : (
                    <div className="gc-hood-ph">{h.img}</div>
                  )}
                  <div className="gc-hood-text">
                    <div className="gc-hood-title">{h.title}</div>
                    <div className="gc-hood-body">{h.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* INQUIRY */}
      <section id="inquire" className="gc-inquire gc-wrap">
        <div className="gc-inquire-left">
          <h2 className="gc-h2-big">Let&rsquo;s talk space.</h2>
          <div className="gc-inquire-contact">
            <div className="gc-contact-name-lg">{c.name}</div>
            <div className="gc-contact-co">{c.company}</div>
            <a href={`tel:${c.phoneHref}`} className="gc-contact-plain">{c.phone}</a>
            <a href={`mailto:${c.email}`} className="gc-contact-mail">{c.email}</a>
            <a href="https://kormancommercial.com/" className="gc-contact-co">{c.site}</a>
          </div>
        </div>
        <LeasingForm slug={profile.slug} spaceOptions={spaceOptions} />
      </section>

      {/* FOOTER */}
      <footer className="gc-footer">
        <div className="gc-footer-in gc-wrap">
          <span>{profile.streetAddress}, {profile.city}, {profile.state}</span>
          <span>© Korman Commercial Properties</span>
        </div>
      </footer>
    </div>
  );
}
