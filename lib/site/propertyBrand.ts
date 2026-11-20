// A PROPERTY'S OWN BRAND ON ITS SPACE PAGES AND FLYERS (owner, 11/2026:
// "should the pages for availabilities at the interplex have more interplex
// branding … at least put the logo on the downloads so they know thats where
// it is"). Co-branding, not a re-skin: the space page keeps the website's look
// (compare, inquiry, similar spaces work across every property) and gains the
// park's logo, a link back to its page and its selling points; the flyer
// carries the logo above the space. The points are the park page's own
// (lib/interplex/interplex.html, the Office Works page) — never new claims.
// Pure, client-safe.

export type PropertyBrand = {
  /** The website property slug the brand belongs to. */
  slug: string;
  name: string;
  /** Same-origin logo for a light background, with its pixel size. */
  logo: { src: string; w: number; h: number };
  /** The property's own designed page. */
  href: string;
  /** "Explore the campus" — the link back. */
  linkLabel: string;
  /** Short selling points, the property page's own. */
  points: string[];
  /** What the other spaces here are called ("Other suites at the Interplex"). */
  othersLabel: string;
};

export const PROPERTY_BRANDS: Record<string, PropertyBrand> = {
  "neshaminy-interplex": {
    slug: "neshaminy-interplex",
    name: "Neshaminy Interplex Business Center",
    logo: { src: "/site/interplex/assets/logo-ip.png", w: 1200, h: 329 },
    href: "/site/office/neshaminy-interplex",
    linkLabel: "Explore the campus",
    points: [
      "10 Class A office buildings on one campus",
      "Radisson Hotel, fitness center & conference center",
      "Child care and Wawa on campus",
      "24-hour access · property manager on site",
      "On U.S. Route 1, near the PA Turnpike",
    ],
    othersLabel: "Other suites at the Interplex",
  },
  "the-office-works-instant-offices": {
    slug: "the-office-works-instant-offices",
    name: "The Office Works",
    logo: { src: "/office-works/assets/logo-ow.png", w: 900, h: 272 },
    href: "/office-works",
    linkLabel: "See every office",
    points: [
      "Furnished private offices",
      "Receptionist, mail, internet and coffee included",
      "Shared front desk and conference rooms",
      "Month-to-month terms",
      "On the Neshaminy Interplex campus",
    ],
    othersLabel: "Other offices at The Office Works",
  },
};

export const brandFor = (propertySlug: string | null | undefined): PropertyBrand | null =>
  (propertySlug && PROPERTY_BRANDS[propertySlug]) || null;
