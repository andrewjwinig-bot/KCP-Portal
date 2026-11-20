// SEARCH LANDING PAGES (owner, 11/2026, #6). One page per search a prospect
// actually types ("office space for lease Trevose PA", "retail space for lease
// Philadelphia"), each with its own written introduction and the LIVE spaces
// that answer it — the website's listings filtered by type, property and size,
// so the page is never stale and never empty for long. Served at
// /site/lease/<slug> (kormancommercial.com/lease/<slug>), in the sitemap, linked
// from Available Space. Pure.

import type { SiteListing } from "./content";
import { spaceSize } from "./spaces";

export type Landing = {
  slug: string;
  /** The page's h1 and search title. */
  h1: string;
  title: string;
  description: string;
  /** Two or three short paragraphs, written for the search. */
  intro: string[];
  category: "office" | "retail";
  /** Website property slugs; omitted = every property of the type. */
  properties?: string[];
  /** Only spaces at or under this many SF. */
  maxSf?: number;
  /** A photo for the band and the share card. */
  image: string;
  /** Questions a prospect asks, answered plainly (FAQPage). */
  faq: { q: string; a: string }[];
};

const INTERPLEX = "neshaminy-interplex";
const OFFICE_WORKS = "the-office-works-instant-offices";
const OFFICE_PHOTO = "/site/img/36cde9b65641ca5580ae4f317e43d62d2634b83c.webp";
const RETAIL_PHOTO = "/site/img/9dc023bfe7f4d99bb4d539fbbd6fcafd6ea7c846.webp";

const OFFICE_CONTACT = "Nancy Fox handles office leasing: (215) 244-5175, nfox@kormancommercial.com.";
const RETAIL_CONTACT = "Harry Feldman handles retail leasing: (215) 244-5148, hfeldman@kormancommercial.com.";

export const LANDINGS: Landing[] = [
  {
    slug: "office-space-trevose-pa",
    h1: "Office Space for Lease in Trevose & Bensalem, PA",
    title: "Office Space for Lease in Trevose & Bensalem, PA",
    description: "Office suites for lease at the Neshaminy Interplex Business Center in Trevose (Bensalem Township), Bucks County, PA — ten buildings, plus private offices at The Office Works. See every space available now.",
    intro: [
      "The Neshaminy Interplex Business Center is ten office buildings on one landscaped campus in Trevose, in Bensalem Township, Bucks County — owned and managed by Korman Commercial Properties, a family company in the Philadelphia region since 1919.",
      "Suites range from a few hundred square feet to full floors, and The Office Works on the same campus offers furnished private offices on flexible terms. Every space below is available now and listed straight from our current rent roll.",
    ],
    category: "office",
    properties: [INTERPLEX, OFFICE_WORKS],
    image: OFFICE_PHOTO,
    faq: [
      { q: "Where is the Neshaminy Interplex?", a: "In Trevose, Bensalem Township, Bucks County, Pennsylvania — the management office is at 8 Neshaminy Interplex, Suite 400, Trevose, PA 19053." },
      { q: "Can I lease a small office or a single room?", a: "Yes. The Office Works, on the Interplex campus, leases furnished private offices on flexible terms, and the Interplex buildings have suites from a few hundred square feet." },
      { q: "Who do I contact about a suite?", a: OFFICE_CONTACT },
    ],
  },
  {
    slug: "small-office-space-bucks-county",
    h1: "Small Office Space & Private Offices in Bucks County, PA",
    title: "Small Office Space & Private Offices for Lease in Bucks County, PA",
    description: "Small office suites and furnished private offices for lease in Trevose, Bucks County, PA — under 2,500 SF, available now at the Neshaminy Interplex and The Office Works.",
    intro: [
      "Need room for a small team, a practice or a single desk with a door? These are the spaces of 2,500 square feet or less available now at the Neshaminy Interplex Business Center and The Office Works in Trevose, Bucks County.",
      "The Office Works leases furnished private offices with a shared reception, conference room and break room on flexible terms; the Interplex buildings offer small suites on conventional leases.",
    ],
    category: "office",
    properties: [INTERPLEX, OFFICE_WORKS],
    maxSf: 2500,
    image: OFFICE_PHOTO,
    faq: [
      { q: "What is the smallest space available?", a: "A single furnished private office at The Office Works. The smallest suites in the Interplex buildings are listed above, smallest first." },
      { q: "Are flexible terms available?", a: "Private offices at The Office Works are leased on flexible terms. Interplex suites are leased on conventional terms, negotiated for each tenant." },
      { q: "Who do I contact?", a: OFFICE_CONTACT },
    ],
  },
  {
    slug: "retail-space-philadelphia",
    h1: "Retail Space for Lease in Philadelphia",
    title: "Retail Space for Lease in Philadelphia, PA — Shopping Centers & Storefronts",
    description: "Retail space for lease in Philadelphia, PA: in-line shops, end caps and pads at Parkwood Shopping Center, Parkwood Commons, Gray's Ferry Shopping Center and more. Every vacancy, live.",
    intro: [
      "Korman Commercial Properties owns and manages neighborhood shopping centers and storefronts across Philadelphia — Parkwood Shopping Center and Parkwood Commons in Northeast Philadelphia, Gray's Ferry Shopping Center in South Philadelphia, and free-standing retail on Cottman, Castor and Roosevelt Boulevard.",
      "Each space below is available now and comes straight from our rent roll. Open a space for its spot on the site plan, a leasing flyer and a direct line to our retail leasing team.",
    ],
    category: "retail",
    properties: [
      "parkwood-shopping-center", "parkwood-commons", "grays-ferry-shopping-center",
      "castor-ave-save-a-lot", "castor-ave-usps", "cottman-ave-four-seasons-diner", "cottman-ave-mcdonald-s",
      "island-ave", "roosevelt-blvd-k-and-g-fashion-superstore",
    ],
    image: RETAIL_PHOTO,
    faq: [
      { q: "What kinds of retail space do you lease?", a: "In-line shops, end caps and second-floor office suites in our shopping centers, and free-standing buildings and pads." },
      { q: "Who do I contact about a space?", a: RETAIL_CONTACT },
    ],
  },
  {
    slug: "retail-space-bensalem-pa",
    h1: "Retail Space for Lease in Bensalem, PA",
    title: "Retail Space for Lease in Bensalem, PA — Brookwood Shopping Center",
    description: "Retail space for lease at Brookwood Shopping Center on Street Road in Bensalem, Bucks County, PA. See the spaces available now.",
    intro: [
      "Brookwood Shopping Center sits on Street Road in Bensalem, Bucks County — a neighborhood center owned and managed by Korman Commercial Properties.",
      "The spaces below are available now, straight from our rent roll. Open one for its place on the site plan and a leasing flyer, or ask our retail leasing team about it directly.",
    ],
    category: "retail",
    properties: ["brookwood-shopping-center"],
    image: RETAIL_PHOTO,
    faq: [
      { q: "Where is Brookwood Shopping Center?", a: "1847 Street Road, Bensalem, PA, in Bucks County." },
      { q: "Who do I contact about a space?", a: RETAIL_CONTACT },
    ],
  },
  {
    slug: "retail-space-lafayette-hill-pa",
    h1: "Retail Space for Lease in Lafayette Hill, PA",
    title: "Retail Space for Lease in Lafayette Hill, PA — Shops of Lafayette Hill",
    description: "Retail space for lease at the Shops of Lafayette Hill on Germantown Pike in Lafayette Hill, Montgomery County, PA. See the spaces available now.",
    intro: [
      "The Shops of Lafayette Hill line Germantown Pike in Lafayette Hill, Whitemarsh Township, Montgomery County — a neighborhood center owned and managed by Korman Commercial Properties.",
      "The spaces below are available now, straight from our rent roll. Open one for its place on the site plan and a leasing flyer, or ask our retail leasing team about it directly.",
    ],
    category: "retail",
    properties: ["shops-of-lafayette-hill"],
    image: RETAIL_PHOTO,
    faq: [
      { q: "Where are the Shops of Lafayette Hill?", a: "400–428 Germantown Pike, Lafayette Hill, PA, in Montgomery County." },
      { q: "Who do I contact about a space?", a: RETAIL_CONTACT },
    ],
  },
];

export const landingBySlug = (slug: string) => LANDINGS.find((l) => l.slug === slug) ?? null;
export const landingPath = (l: Landing) => `/site/lease/${l.slug}`;

/** The live spaces that answer a landing page, smallest first when it is
 *  about size, else as listed. */
export function landingListings<T extends SiteListing & { category: string }>(page: Landing, all: T[]): T[] {
  const hits = all.filter((l) =>
    l.category === page.category
    && (!page.properties || page.properties.includes(l.property))
    && (page.maxSf == null || (spaceSize(l) > 0 && spaceSize(l) <= page.maxSf)));
  return page.maxSf != null ? [...hits].sort((a, b) => spaceSize(a) - spaceSize(b)) : hits;
}
