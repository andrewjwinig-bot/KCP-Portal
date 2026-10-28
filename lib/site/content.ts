// THE COMPANY WEBSITE'S CONTENT — ours now, not the vendor's CMS.
//
// Extracted 10/2026 from the live kormancommercial.com (a Next.js site a vendor
// hosted at korman-commercial-properties.vercel.app, its content in their
// Sanity CMS). Every property, its photos, facts and availabilities are here;
// photos live in /public/site/img. Edit a property by editing its entry.
// `body` is the CMS's portable text (paragraph blocks) kept as-is.

export type SiteCategory = "retail" | "office" | "residential" | "land";

export type PortableSpan = { _type?: string; text: string; marks?: string[] };
export type PortableBlock = { _type?: string; style?: string; listItem?: string; level?: number; children: PortableSpan[]; markDefs?: { _type?: string; href?: string; _key?: string }[] };

export type SiteImage = { url: string; alt: string | null };

export type SiteProperty = {
  id: string;
  slug: string;
  name: string;
  category: SiteCategory;
  subcategory: string | null;
  displayOrder: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  coordinates: { lat: number; lng: number } | null;
  body: PortableBlock[] | null;
  mainImage: string | null;
  mainImageAlt: string | null;
  gallery: SiteImage[] | null;
  sitePlan: SiteImage | null;
  externalLink: string | null;
  gla: string | null;
  acres: string | null;
  units: string | null;
  beds: string | null;
  baths: string | null;
  keyTenants: string | null;
  leasingInquiryName: string | null;
  leasingInquiryPhone: string | null;
  leasingInquiryEmail: string | null;
};

export type SiteListing = {
  id: string;
  property: string; // property slug
  space: string;
  size: number | null;
  minSize: number | null;
  maxSize: number | null;
  term: string | null;
  rentalRate: string | null;
  rentType?: string | null;
  spaceUse: string | null;
  condition: string | null;
  available: string | null;
  details: { text: string }[] | null;
  images: SiteImage[] | null;
  requestMoreInfoEmail: string | null;
};

export type SiteCategoryInfo = { slug: SiteCategory; title: string; description: PortableBlock[] | string | null };

export const SITE_CATEGORIES: Record<SiteCategory, SiteCategoryInfo> = {
  "retail": {
    "slug": "retail",
    "title": "Retail",
    "description": null
  },
  "office": {
    "slug": "office",
    "title": "Office",
    "description": null
  },
  "land": {
    "slug": "land",
    "title": "Land",
    "description": null
  },
  "residential": {
    "slug": "residential",
    "title": "Residential",
    "description": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Our residential rental portfolio features well-appointed properties located exclusively in premier areas and established neighborhoods, offering residents exceptional living experiences. "
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Each home is professionally managed by our seasoned commercial management team, ensuring responsive service, meticulous upkeep, and peace of mind. Discover the difference of quality living, backed by a commitment to excellence."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ]
  }
};

/** In each category's display order (the vendor CMS's list order). */
export const SITE_PROPERTIES: SiteProperty[] = [
  {
    "acres": null,
    "address": "2897 Grays Ferry Ave, Philadelphia, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Gray’s Ferry Shopping Center is a key neighborhood retail center serving the daily needs of a growing and emerging community. With a mix of essential services and conveniences, it remains a trusted destination for local residents. Its strategic location offers proximity to the Pennovation Center and easy accessibility to the Health District of West Philadelphia, making it well-positioned to support the area’s continued growth."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Philadelphia",
    "coordinates": {
      "lat": 39.94032625724617,
      "lng": -75.19294722763335
    },
    "displayOrder": 1,
    "externalLink": "https://www.loopnet.com/Listing/3021-Grays-Ferry-Ave-Philadelphia-PA/26412131/",
    "gallery": [
      {
        "alt": null,
        "url": "/site/img/708c7b56515c0ac355d4f4408fd9222ebd59a258.webp"
      },
      {
        "alt": null,
        "url": "/site/img/6f2de27cc2a3f774c7425fe562ecb993603d5d3e.webp"
      },
      {
        "alt": null,
        "url": "/site/img/b316b0ca9a6cfc41e7cf2cd0af7d26c833f98be8.webp"
      },
      {
        "alt": null,
        "url": "/site/img/472cbcd4c9a6813e34b6874ae7ef89ee9541c602.webp"
      }
    ],
    "gla": "82,809",
    "id": "3dff8443-12a9-4d54-93c7-106235f22d71",
    "keyTenants": "The Fresh Grocer, Fine Wine & Good Spirits, Chase Bank, JP Morgan, McDonald's",
    "leasingInquiryEmail": "hfeldman@kormancommercial.com",
    "leasingInquiryName": "Harry Feldman",
    "leasingInquiryPhone": "(215) 244-5148",
    "mainImage": "/site/img/9dc023bfe7f4d99bb4d539fbbd6fcafd6ea7c846.webp",
    "mainImageAlt": null,
    "name": "Gray’s Ferry Shopping Center",
    "sitePlan": {
      "alt": null,
      "url": "/site/img/9bbe3ff1b402bee9b818de737c9d32544083b4f6.webp"
    },
    "slug": "grays-ferry-shopping-center",
    "state": "PA",
    "units": null,
    "subcategory": "Shopping Centers"
  },
  {
    "acres": null,
    "address": "1847 Street Rd, Bensalem, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Brookwood Shopping Center is a well-established retail destination that has long served the surrounding community with everyday essentials and services. Its diverse tenant mix caters to local needs, making it a convenient stop for residents and commuters alike. Situated along the heavily traveled Street Road corridor, the center benefits from strong visibility and easy access in one of Bucks County’s busiest commercial areas."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Bensalem",
    "coordinates": {
      "lat": 40.09575768400342,
      "lng": -74.94318528258037
    },
    "displayOrder": 2,
    "externalLink": null,
    "gallery": [
      {
        "alt": null,
        "url": "/site/img/abf9fce50c88806cc09f9e1ba7b67722e1b3b6fb.webp"
      },
      {
        "alt": null,
        "url": "/site/img/c22645995592a03177a4c60f0c9c26e324042bf9.webp"
      },
      {
        "alt": null,
        "url": "/site/img/3874236f80ab5e65ff1bb3a5667eddecb65763b6.webp"
      },
      {
        "alt": null,
        "url": "/site/img/7529cecae530e4007fd210a4f012947152430475.webp"
      },
      {
        "alt": null,
        "url": "/site/img/5dff87f2c07ac2d077d296846574e39082cc8f94.webp"
      }
    ],
    "gla": "61,572",
    "id": "f96ba46a-8db6-4402-b055-45a7e4151d72",
    "keyTenants": "Planet Fitness, Amazon Fresh (Shadow), Ashley Homestore (Shadow), Wawa",
    "leasingInquiryEmail": "hfeldman@kormancommercial.com",
    "leasingInquiryName": "Harry Feldman",
    "leasingInquiryPhone": "(215) 244-5148",
    "mainImage": "/site/img/4b8106c2cca725a74af34f7efbefa8a3b5c46120.webp",
    "mainImageAlt": null,
    "name": "Brookwood Shopping Center",
    "sitePlan": {
      "alt": null,
      "url": "/site/img/fe2ef60a188996cbfde8cb83458ea3db83d35122.webp"
    },
    "slug": "brookwood-shopping-center",
    "state": "PA",
    "units": null,
    "subcategory": "Shopping Centers"
  },
  {
    "acres": null,
    "address": "12301-12377 Academy Rd, Philadelphia, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Parkwood Shopping Center is a long-standing retail hub serving the needs of the surrounding community. With a diverse mix of tenants offering dining, services, and everyday essentials, it’s a convenient and reliable destination for local residents. As a true community staple, Parkwood remains deeply woven into the fabric of the neighborhood for over seventy years."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Philadelphia",
    "coordinates": {
      "lat": 40.095766509289525,
      "lng": -74.97508549382222
    },
    "displayOrder": 3,
    "externalLink": "https://www.loopnet.com/Listing/12301-12377-Academy-Rd-Philadelphia-PA/17530657/",
    "gallery": [
      {
        "alt": null,
        "url": "/site/img/eb108317c23e293ebe1e8ffbde79abd7fbf14cfd.webp"
      },
      {
        "alt": null,
        "url": "/site/img/a3ad24ef2b03f96dd3629fb8de439dee5ee85f1f.webp"
      },
      {
        "alt": null,
        "url": "/site/img/9da892be81d00a24577006d3922e815d79a2a001.webp"
      },
      {
        "alt": null,
        "url": "/site/img/b5bb9192f5922ded37a1e4e92efabea105348c92.webp"
      },
      {
        "alt": null,
        "url": "/site/img/7c9d28f6301ce998306fa690cdb41d6346e7dcb9.webp"
      }
    ],
    "gla": "61,036",
    "id": "dc0dc421-8e24-407e-aa23-ab9fb0b6b338",
    "keyTenants": "Rite Aid, Wawa, Dunkin, Trumark Financial, Coldwell Banker",
    "leasingInquiryEmail": "hfeldman@kormancommercial.com",
    "leasingInquiryName": "Harry Feldman",
    "leasingInquiryPhone": "(215) 244-5148",
    "mainImage": "/site/img/33fd9cf302538a7861dbee0943fc3ce88e38e17e.webp",
    "mainImageAlt": null,
    "name": "Parkwood Shopping Center",
    "sitePlan": {
      "alt": null,
      "url": "/site/img/5dae2c9e277720d8f19b824c1d52bee146627da2.webp"
    },
    "slug": "parkwood-shopping-center",
    "state": "PA",
    "units": null,
    "subcategory": "Shopping Centers"
  },
  {
    "acres": null,
    "address": "400-428 Germantown Pike, Lafayette Hill, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "The Shops of Lafayette Hill is a long-standing retail destination woven into the fabric of the Lafayette Hill community. With deep roots in the neighborhood, this center has served generations of residents with essential services and beloved local businesses. Positioned at a prominent main-and-main intersection, it benefits from high daily traffic and close proximity to several schools. This prime location makes it a vital and convenient hub for the surrounding community."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Lafayette Hill",
    "coordinates": {
      "lat": 40.0923000048474,
      "lng": -75.26142415840198
    },
    "displayOrder": 4,
    "externalLink": "https://www.loopnet.com/Listing/400-428-Germantown-Pike-Lafayette-Hill-PA/16546433/",
    "gallery": null,
    "gla": "18,487",
    "id": "3127f3c2-6915-4d0c-942f-231a8f2b0c21",
    "keyTenants": "Wawa, Touch of Class",
    "leasingInquiryEmail": "hfeldman@kormancommercial.com",
    "leasingInquiryName": "Harry Feldman",
    "leasingInquiryPhone": "(215) 244-5148",
    "mainImage": "/site/img/shops-of-lafayette-hill-wawa.webp",
    "mainImageAlt": "Wawa Food Market at the Shops of Lafayette Hill",
    "name": "Shops of Lafayette Hill",
    "sitePlan": {
      "alt": null,
      "url": "/site/img/98eb05c3aad6bb92d2f92f0d304b4e3fdb5df1ae.webp"
    },
    "slug": "shops-of-lafayette-hill",
    "state": "PA",
    "units": null,
    "subcategory": "Shopping Centers"
  },
  {
    "acres": null,
    "address": "12300-12310 Academy Rd, Philadelphia, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Parkwood Commons is a neighborhood retail strip center that offers convenient access to everyday services and dining. Positioned directly across from the larger Parkwood Shopping Center, it complements the area’s retail offerings and serves as an easy stop for local residents. With strong visibility along a busy stretch of Academy Road, Parkwood Commons plays a consistent role in meeting the community’s daily needs."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Philadelphia",
    "coordinates": {
      "lat": 40.09654443927702,
      "lng": -74.97641552750888
    },
    "displayOrder": 5,
    "externalLink": "https://www.loopnet.com/Listing/12300-12310-Academy-Rd-Philadelphia-PA/32199361/",
    "gallery": [
      {
        "alt": null,
        "url": "/site/img/5ac5083730e6f987d106b4878d7576f4486295ef.webp"
      },
      {
        "alt": null,
        "url": "/site/img/849415e0015ed069db452073c873346b5d476b96.webp"
      },
      {
        "alt": null,
        "url": "/site/img/9154ba9bd9072e3dd7103f987137f63a1a895ce1.webp"
      },
      {
        "alt": null,
        "url": "/site/img/8ca79529e1e104a41ccd76840899fb34ffe7e583.webp"
      },
      {
        "alt": null,
        "url": "/site/img/f8139542b264783095de49cb0a7bf580dd6cc7c1.webp"
      },
      {
        "alt": null,
        "url": "/site/img/a3ad24ef2b03f96dd3629fb8de439dee5ee85f1f.webp"
      },
      {
        "alt": null,
        "url": "/site/img/fb42d4da993a157bfa14bbc817ed3c5e124fa5f8.webp"
      },
      {
        "alt": null,
        "url": "/site/img/198b97d44e3aa82cb389dce9060382b0c5dabbfa.webp"
      }
    ],
    "gla": "8,287",
    "id": "7e4ea26f-b3af-4bf4-8a6b-2dd390920c92",
    "keyTenants": "Honest Real Estate, Sheer Sensations",
    "leasingInquiryEmail": "hfeldman@kormancommercial.com",
    "leasingInquiryName": "Harry Feldman",
    "leasingInquiryPhone": "(215) 244-5148",
    "mainImage": "/site/img/849415e0015ed069db452073c873346b5d476b96.webp",
    "mainImageAlt": null,
    "name": "Parkwood Commons",
    "sitePlan": null,
    "slug": "parkwood-commons",
    "state": "PA",
    "units": null,
    "subcategory": "Shopping Centers"
  },
  {
    "acres": null,
    "address": "6412-22 Castor Ave, Philadelphia, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Freestanding Save-A-Lot supermarket with parking"
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Philadelphia",
    "coordinates": {
      "lat": 40.04049094100843,
      "lng": -75.07738528973124
    },
    "displayOrder": null,
    "externalLink": null,
    "gallery": null,
    "gla": "14,866",
    "id": "9e005d72-57fa-4a70-81fa-f312f7d0d8b2",
    "keyTenants": "Save-A-Lot",
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/71b221f8ae9bf1a76134826175513396c4017896.webp",
    "mainImageAlt": null,
    "name": "Castor Ave - Save-A-Lot",
    "sitePlan": null,
    "slug": "castor-ave-save-a-lot",
    "state": "PA",
    "units": null,
    "subcategory": "Single-Tenant Retail"
  },
  {
    "acres": null,
    "address": "6382 Castor Ave, Philadelphia, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "In-line single-tenant building occupied by United States Postal Service"
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Philadelphia",
    "coordinates": {
      "lat": 40.039390841750816,
      "lng": -75.07811887314736
    },
    "displayOrder": null,
    "externalLink": null,
    "gallery": null,
    "gla": "1,512",
    "id": "7f25a085-deab-48ea-ab9c-a3292e44531e",
    "keyTenants": "United States Postal Service",
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/1ab5d59bc07a2b293ad23c8ff0ea5ec0887c33d3.webp",
    "mainImageAlt": null,
    "name": "Castor Ave - USPS",
    "sitePlan": null,
    "slug": "castor-ave-usps",
    "state": "PA",
    "units": null,
    "subcategory": "Single-Tenant Retail"
  },
  {
    "acres": null,
    "address": "2811 Cottman Ave, Philadelphia, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "This 5,000 square-foot property is designed as a diner and bakery. The building is located along the primary traffic corridor serving the Mayfair section of Philadelphia."
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "\n"
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Philadelphia",
    "coordinates": {
      "lat": 40.044229391793266,
      "lng": -75.05302513514178
    },
    "displayOrder": null,
    "externalLink": null,
    "gallery": null,
    "gla": "5,000",
    "id": "6a606b14-edf8-49d9-9ff1-fe2fa8c65ca9",
    "keyTenants": "Four Seasons Diner",
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/7026eca926224fb8505d03a353d1381cbef3b213.webp",
    "mainImageAlt": null,
    "name": "Cottman Ave - Four Seasons Diner",
    "sitePlan": null,
    "slug": "cottman-ave-four-seasons-diner",
    "state": "PA",
    "units": null,
    "subcategory": "Single-Tenant Retail"
  },
  {
    "acres": null,
    "address": "2801 Cottman Avenue, Philadelphia, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "2801 Cottman Avenue is a single-tenant building located at Roosevelt Boulevard (US Route 1) and Cottman Avenue (Route 73) in the Mayfair section of Philadelphia, Pennsylvania 19149. Roosevelt Boulevard is a commercial corridor and is among the primary traffic corridors serving this marketplace."
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": ""
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "\n"
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Philadelphia",
    "coordinates": {
      "lat": 40.04460159441533,
      "lng": -75.05335180000932
    },
    "displayOrder": null,
    "externalLink": null,
    "gallery": null,
    "gla": "3,405",
    "id": "5118c899-85ea-4b11-8fe5-5ee46597dddf",
    "keyTenants": "McDonald's",
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/6ae972810d33402652f14a85592463243b019d12.webp",
    "mainImageAlt": null,
    "name": "Cottman Ave - McDonald's",
    "sitePlan": null,
    "slug": "cottman-ave-mcdonald-s",
    "state": "PA",
    "units": null,
    "subcategory": "Single-Tenant Retail"
  },
  {
    "acres": null,
    "address": "2448 Island Ave, Philadelphia, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Freestanding single-tenant restaurant building. Dunkin' coming soon."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Philadelphia",
    "coordinates": {
      "lat": 39.91366151047754,
      "lng": -75.24394624674828
    },
    "displayOrder": null,
    "externalLink": null,
    "gallery": null,
    "gla": "2,208",
    "id": "2e30fdfa-f958-400c-9688-f88815d9fe15",
    "keyTenants": "Dunkin' (Coming Soon)",
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/70098a9d346c15d87dd1282fe27260bee92cd182.webp",
    "mainImageAlt": null,
    "name": "Island Ave - Future Dunkin'",
    "sitePlan": null,
    "slug": "island-ave",
    "state": "PA",
    "units": null,
    "subcategory": "Single-Tenant Retail"
  },
  {
    "acres": null,
    "address": "7201 Roosevelt Boulevard  Philadelphia, PA ",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "This property located in the hub of Northeast Philadelphia, Roosevelt Boulevard (US Route 1) below Cottman Avenue (US Route 73), is a 22,500 square-foot building currently occupied by K & G Fashion Superstore."
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "K & G Fashion Wearhouse is a division of Men’s Wearhouse, a chain of men’s and woman’s apparel stores that has been offering quality clothing and personalized service for more than 35 years."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "retail",
    "city": "Philadelphia",
    "coordinates": {
      "lat": 40.04283641793689,
      "lng": -75.05498335701739
    },
    "displayOrder": null,
    "externalLink": null,
    "gallery": null,
    "gla": "22,500",
    "id": "e0c72529-cfb5-4281-903d-ee4edbe76748",
    "keyTenants": "K & G Fashion Superstore",
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/f7b845fac85e6b5643e96cfe6f23129b06e6c256.webp",
    "mainImageAlt": null,
    "name": "Roosevelt Blvd - K & G Fashion Superstore",
    "sitePlan": null,
    "slug": "roosevelt-blvd-k-and-g-fashion-superstore",
    "state": "PA",
    "units": null,
    "subcategory": "Single-Tenant Retail"
  },
  {
    "acres": null,
    "address": "8 Neshaminy Interplex, Trevose, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "The premier Bucks County commercial real estate that specializes in Class A office suites for lease in Bensalem Township, PA. The Neshaminy Interplex® offers a prestigious corporate office environment as well as an impressive array of on-site amenities and services.\n"
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "The premier Bucks County commercial real estate that specializes in Class A office suites for lease in Bensalem Township, PA. The Neshaminy Interplex® offers a prestigious corporate office environment as well as an impressive array of on-site amenities and services."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "office",
    "city": "Trevose",
    "coordinates": {
      "lat": 40.1220800209996,
      "lng": -74.98046981667054
    },
    "displayOrder": 1,
    "externalLink": "https://www.loopnet.com/Listing/8-Neshaminy-Interplex-Trevose-PA/14599012/",
    "gallery": [
      {
        "alt": null,
        "url": "/site/img/b25e54406b74116c9f43332ed0fc327b98f491db.webp"
      },
      {
        "alt": null,
        "url": "/site/img/f4a524b3cb3893e22dcc4f4d9b3ede802569381a.webp"
      },
      {
        "alt": null,
        "url": "/site/img/4ff2906412e44a7915f39a34b754a3986c926948.webp"
      },
      {
        "alt": null,
        "url": "/site/img/2798b9a2fee02087b142383b61a63d5fdc4a4c76.webp"
      },
      {
        "alt": null,
        "url": "/site/img/3b12988e4ed6886dd18d45957d0a663e99b6ede8.webp"
      },
      {
        "alt": null,
        "url": "/site/img/54ebc12bf72cdcf66f3b5dfaa4b01d6d4e3f892a.webp"
      },
      {
        "alt": null,
        "url": "/site/img/d7bcf24bbd603de9e9f19bc50a7bbb2043bc71e6.webp"
      },
      {
        "alt": null,
        "url": "/site/img/097ad4e8c3a81de9b5543af7b61b9e92d59ef8f2.webp"
      },
      {
        "alt": null,
        "url": "/site/img/27c75c940982e99afbc07a4097f2b99c2a771aaa.webp"
      }
    ],
    "gla": "379,315",
    "id": "b3d91df7-8a09-4098-b49e-9ea54e9d2b40",
    "keyTenants": null,
    "leasingInquiryEmail": "nfox@kormancommercial.com",
    "leasingInquiryName": "Nancy Fox",
    "leasingInquiryPhone": "(215) 244-5175",
    "mainImage": "/site/img/4972f8659ba5a2fe4b849e091be0f039f20ad425.webp",
    "mainImageAlt": null,
    "name": "Neshaminy Interplex",
    "sitePlan": {
      "alt": "Neshaminy Interplex Site Plan",
      "url": "/site/img/a4efc6557e24751e2e819e397f6776e8ad97c2db.webp"
    },
    "slug": "neshaminy-interplex",
    "state": "PA",
    "units": null,
    "subcategory": null
  },
  {
    "acres": null,
    "address": "1 Neshaminy Interplex, Trevose, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Comprised of buildings 1, 2, and 4 along Interplex Drive, Interplex Drive Office Park provides full-service office space to fit every tenant's needs. Prime location near the PA Turnpike and US Route 1, just 20 miles from Philadelphia and 75 miles from NYC, featuring on-site management, a conference center, a Radisson Hotel, Wawa, daycare, and a fitness center with locker rooms."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "office",
    "city": "Trevose",
    "coordinates": {
      "lat": 40.124694660397914,
      "lng": -74.97831676585268
    },
    "displayOrder": 2,
    "externalLink": "https://www.loopnet.com/Listing/4-Neshaminy-Interplex-Trevose-PA/14599014/",
    "gallery": [
      {
        "alt": "Campus Courtyard",
        "url": "/site/img/0cdb6e3bc0c87da8f94cd040f72338f851c61930.webp"
      },
      {
        "alt": "Lobby",
        "url": "/site/img/8f2a291e6b5ff4ecfbff21625b0fe5b9f247efa5.webp"
      },
      {
        "alt": "Entrance",
        "url": "/site/img/3f9e8717ea223a9a1af62d122d8eb9a02e0c2640.webp"
      },
      {
        "alt": "Parking",
        "url": "/site/img/91b47e7fe41776fe5b23a7acb217e5701c61b220.webp"
      },
      {
        "alt": "Food Trucks",
        "url": "/site/img/097ad4e8c3a81de9b5543af7b61b9e92d59ef8f2.webp"
      },
      {
        "alt": "Exer-Trail",
        "url": "/site/img/0e34e333a3df96c5574385fe624970a90e0f18a8.webp"
      }
    ],
    "gla": "139,635",
    "id": "db177dde-4f50-4b28-b2a9-5694cb490a37",
    "keyTenants": null,
    "leasingInquiryEmail": "nfox@kormancommercial.com",
    "leasingInquiryName": "Nancy Fox",
    "leasingInquiryPhone": "(215) 244-5175",
    "mainImage": "/site/img/653dd0481f89c00b16a1c1d574faad23834d934e.webp",
    "mainImageAlt": null,
    "name": "Interplex Drive Office Park",
    "sitePlan": {
      "alt": "Neshaminy Interplex Site Plan",
      "url": "/site/img/a4efc6557e24751e2e819e397f6776e8ad97c2db.webp"
    },
    "slug": "interplex-drive-office-park",
    "state": "PA",
    "units": null,
    "subcategory": null
  },
  {
    "acres": null,
    "address": "2607 Interplex Dr, Trevose, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Flex space available for lease, featuring a partial build-out, private restrooms, and easy access to major transit and highways."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "office",
    "city": "Trevose",
    "coordinates": {
      "lat": 40.12623486380969,
      "lng": -74.97931809287346
    },
    "displayOrder": 3,
    "externalLink": "https://www.loopnet.com/Listing/2607-Interplex-Dr-Trevose-PA/27546178/",
    "gallery": [
      {
        "alt": null,
        "url": "/site/img/7ae82ae1c5b0143e72cca0c2167fec0ca5e77271.webp"
      },
      {
        "alt": null,
        "url": "/site/img/b25e54406b74116c9f43332ed0fc327b98f491db.webp"
      },
      {
        "alt": null,
        "url": "/site/img/512c759f55999bb7bff0a438286a5b9484888b0a.webp"
      }
    ],
    "gla": "43,874",
    "id": "c06aee48-f0a8-425c-81a9-24a4a3b0732c",
    "keyTenants": null,
    "leasingInquiryEmail": "nfox@kormancommercial.com",
    "leasingInquiryName": "Nancy Fox",
    "leasingInquiryPhone": "(215) 244-5175",
    "mainImage": "/site/img/10fed1d4fdd6d57279ed97b659b0ab532922e4b5.webp",
    "mainImageAlt": "kor center b building outside",
    "name": "Kor Center",
    "sitePlan": {
      "alt": "Neshaminy Interplex Site Plan",
      "url": "/site/img/a4efc6557e24751e2e819e397f6776e8ad97c2db.webp"
    },
    "slug": "kor-center",
    "state": "PA",
    "units": null,
    "subcategory": null
  },
  {
    "acres": null,
    "address": "5 Hilton Drive, Trevose, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "The Office Works® offers an innovative office solution featuring instant furnished offices, shared business support, and advanced technologies. Set amidst a beautiful business campus with outstanding on-site amenities, The Office Works® is the perfect working environment for small firms, satellite offices, and independent executives."
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Get a professional address and identity for start-ups, position personnel by region, and quickly accommodate relocating executives, all in one easy solution with The Office Works®."
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Located within The Neshaminy Interplex®, The Office Works® offers our tenant companies a full-service business community. By providing the most comprehensive on-site amenities and services, Korman Commercial allows individuals to function in comfort while at work."
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Landscaped courtyards, seating areas, well-lighted walkways, and ample parking make The Neshaminy Interplex® a productive working environment. As a tenant, you will enjoy convenient business amenities and an unparalleled array of services all within one location."
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Let us know your specific preferences from a selection of interior and window offices, and we can help you create the perfect working environment. With flexible term lengths and a range of office accommodations, your business has room to grow at The Office Works®."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "office",
    "city": "Trevose",
    "coordinates": {
      "lat": 40.12325478005067,
      "lng": -74.97981567484281
    },
    "displayOrder": 4,
    "externalLink": "https://www.loopnet.com/Listing/The-Office-Works-Instant-Offices-Feasterville-Trevose-PA/15539387/",
    "gallery": [
      {
        "alt": "Office Works Sign",
        "url": "/site/img/eb242fb1bf68e8fda4a08fee737950a311d8a874.webp"
      },
      {
        "alt": null,
        "url": "/site/img/85bba6574aa1f3ce50837b0bcfbac0a1bcb51434.webp"
      },
      {
        "alt": null,
        "url": "/site/img/49e9ac883bba5861dab615e814a8c6b0c7fc6e34.webp"
      },
      {
        "alt": null,
        "url": "/site/img/8896ab30323325ac2414a8a57f25170a3cdc9b38.webp"
      },
      {
        "alt": null,
        "url": "/site/img/bc232b091fc75d60e989c726e5799504a1b849cd.webp"
      },
      {
        "alt": null,
        "url": "/site/img/f85c47f3fa59c0d00c9af686ca994ea45b53f270.webp"
      },
      {
        "alt": null,
        "url": "/site/img/185a7f114986b2f5cdc602719838ab64747bc4ee.webp"
      },
      {
        "alt": "Courtyard Fountain",
        "url": "/site/img/27c75c940982e99afbc07a4097f2b99c2a771aaa.webp"
      },
      {
        "alt": "Food Trucks",
        "url": "/site/img/097ad4e8c3a81de9b5543af7b61b9e92d59ef8f2.webp"
      },
      {
        "alt": "Exer-Trail Sign",
        "url": "/site/img/0e34e333a3df96c5574385fe624970a90e0f18a8.webp"
      }
    ],
    "gla": null,
    "id": "1b4b7523-2870-4bbe-9900-aa195b8e06d9",
    "keyTenants": null,
    "leasingInquiryEmail": "nfox@kormancommercial.com",
    "leasingInquiryName": "Nancy Fox",
    "leasingInquiryPhone": "(215) 244-5175",
    "mainImage": "/site/img/60cbbeedfe7cbc79894241c5085f7de67890968e.webp",
    "mainImageAlt": "office-works building",
    "name": "The Office Works® Instant Offices",
    "sitePlan": {
      "alt": "Neshaminy Interplex Site Plan",
      "url": "/site/img/a4efc6557e24751e2e819e397f6776e8ad97c2db.webp"
    },
    "slug": "the-office-works-instant-offices",
    "state": "PA",
    "units": null,
    "subcategory": null
  },
  {
    "acres": "0.82153",
    "address": "8675 Tinicum Blvd, Philadelphia, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "One of the most versatile mixed-use properties in the Philadelphia region, Airport Interplex is an 88-acre airport-related commercial site with seven nationally renowned hotels plus restaurants and conference facilities. Convenient access to Philadelphia International Airport makes the Interplex a favorable property location for businesses with a mobile workforce."
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Close to I-95 and adjoining public transportation service to Center City Philadelphia, this prime location quickly filled up with hotels taking advantage of convenient accessibility to everything the region has to offer. Airport Interplex is an example of vision, opportunity and location coming together to create a competitive advantage for a wide range of businesses."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "land",
    "city": "Philadelphia",
    "coordinates": {
      "lat": 39.88746407750421,
      "lng": -75.24666354817644
    },
    "displayOrder": null,
    "externalLink": null,
    "gallery": [
      {
        "alt": null,
        "url": "/site/img/fd9c703ceee355f90360858f972163314e8c7e3a.webp"
      }
    ],
    "gla": null,
    "id": "db4f0b5c-1c5e-4998-88fa-0449524fc2bd",
    "keyTenants": null,
    "leasingInquiryEmail": "hfeldman@kormancommercial.com",
    "leasingInquiryName": "Harry Feldman",
    "leasingInquiryPhone": "(215) 244-5148",
    "mainImage": "/site/img/87203fc344de0b4282afc5d8faa7d85803743ff9.webp",
    "mainImageAlt": null,
    "name": "Airport Interplex Site",
    "sitePlan": null,
    "slug": "airport-interplex",
    "state": "PA",
    "units": null,
    "subcategory": null
  },
  {
    "acres": "5.07",
    "address": "Benigno Ave, Bellmawr, NJ",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "• Vacant land fronts Interstate Business Park, abutting a new off-ramp from Route 42\n• Visibility from Route 42\n• Strong commercial, highly dense area\n• 175,430 VPD on Route 42"
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "land",
    "city": "Bellmawr",
    "coordinates": {
      "lat": 39.85825476947904,
      "lng": -75.09779797344265
    },
    "displayOrder": null,
    "externalLink": null,
    "gallery": [
      {
        "alt": null,
        "url": "/site/img/fc41d49db489046cdb156b016171930c48392d57.webp"
      }
    ],
    "gla": null,
    "id": "e12bc632-8733-42d5-ad0d-acbf8fdf59e9",
    "keyTenants": null,
    "leasingInquiryEmail": "hfeldman@kormancommercial.com",
    "leasingInquiryName": "Harry Feldman",
    "leasingInquiryPhone": "(215) 244-5148",
    "mainImage": "/site/img/83b2db5e5213770ace560cd623d54c572687570c.webp",
    "mainImageAlt": null,
    "name": "Bellmawr Benigno Ave Site",
    "sitePlan": null,
    "slug": "bellmawr-benigno-ave-site",
    "state": "NJ",
    "units": null,
    "subcategory": null
  },
  {
    "acres": "5.90",
    "address": "Walnut Ave, Bellmawr, NJ",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "development site"
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "land",
    "city": "Bellmawr",
    "coordinates": {
      "lat": 39.864431630372465,
      "lng": -75.0882937982311
    },
    "displayOrder": null,
    "externalLink": null,
    "gallery": null,
    "gla": null,
    "id": "f1789b85-ddc0-4eeb-9c2c-47d27374cb22",
    "keyTenants": null,
    "leasingInquiryEmail": "hfeldman@kormancommercial.com",
    "leasingInquiryName": "Harry Feldman",
    "leasingInquiryPhone": "(215) 244-5148",
    "mainImage": "/site/img/a8f873b37026219be7ecae871fff173a5c5f82d5.webp",
    "mainImageAlt": null,
    "name": "Bellmawr Walnut Ave Site",
    "sitePlan": null,
    "slug": "bellmawr-walnut-ave-site",
    "state": "NJ",
    "units": null,
    "subcategory": null
  },
  {
    "acres": "20.74",
    "address": "Easton Road, Ottsville, PA",
    "baths": null,
    "beds": null,
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "20.74 Acres of Commercial Land for Lease in Ottsville, PA 18942"
          }
        ],
        "markDefs": [],
        "style": "normal"
      },
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "\n"
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "land",
    "city": "Ottsville",
    "coordinates": {
      "lat": 40.494893318823316,
      "lng": -75.17449631803119
    },
    "displayOrder": null,
    "externalLink": "https://www.loopnet.com/Listing/Easton-Rd-Ottsville-PA/30078789/",
    "gallery": null,
    "gla": null,
    "id": "4e573d94-b101-491e-95ba-12ce432cb566",
    "keyTenants": null,
    "leasingInquiryEmail": "hfeldman@kormancommercial.com",
    "leasingInquiryName": "Harry Feldman",
    "leasingInquiryPhone": "(215) 244-5148",
    "mainImage": "/site/img/7530fa85885882a57c1598750061ad49128704e6.webp",
    "mainImageAlt": null,
    "name": "Nockamixon Site",
    "sitePlan": null,
    "slug": "nockamixon-site",
    "state": "PA",
    "units": null,
    "subcategory": null
  },
  {
    "acres": null,
    "address": "509 Bellaire Ave, Fort Washington, PA",
    "baths": "3",
    "beds": "3",
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "$13"
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "residential",
    "city": "Fort Washington",
    "coordinates": {
      "lat": 2,
      "lng": 0
    },
    "displayOrder": 1,
    "externalLink": null,
    "gallery": [
      {
        "alt": null,
        "url": "/site/img/87cceb075588d49e1f058c08fe3cb6d2a961d7f1.webp"
      },
      {
        "alt": null,
        "url": "/site/img/30f4783f631ba2a05cba5757efa151cda3d98228.webp"
      },
      {
        "alt": null,
        "url": "/site/img/e29e18da88dbde82689dcf157920270f55cd128c.webp"
      },
      {
        "alt": null,
        "url": "/site/img/4f47acc143a2e83e4bee56cfa16a821f6bbeff0a.webp"
      },
      {
        "alt": null,
        "url": "/site/img/3f3960b1316c8d8b69d47131256ab9b9905851b5.webp"
      },
      {
        "alt": null,
        "url": "/site/img/26ca328c0ec48487016dd321c8d7b165b348f1d4.webp"
      },
      {
        "alt": null,
        "url": "/site/img/572f5ae3c83ea3b59427ca0bdeab9644ad1b1403.webp"
      },
      {
        "alt": null,
        "url": "/site/img/9535d98d3e0d42b703b0c64b3e9c67fde32c813a.webp"
      },
      {
        "alt": null,
        "url": "/site/img/9115a8f142132b9fdd72281057d6e57491e53341.webp"
      },
      {
        "alt": null,
        "url": "/site/img/cac040897facb7605bcfcc38776292f77a960b5a.webp"
      },
      {
        "alt": null,
        "url": "/site/img/0945e172dc5e323190059a7ce168485230755acf.webp"
      },
      {
        "alt": null,
        "url": "/site/img/378bdffa1ef81cc5f864e95d95aedd1e53e768fe.webp"
      }
    ],
    "gla": null,
    "id": "29e2915b-7594-483f-9ab8-b93925c3aa90",
    "keyTenants": null,
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/737825e03954de377160b001f8e5f7cc23caa65f.webp",
    "mainImageAlt": null,
    "name": "Bellaire Avenue",
    "sitePlan": null,
    "slug": "bellaire-avenue",
    "state": "PA",
    "units": "1",
    "subcategory": null
  },
  {
    "acres": null,
    "address": "3044 joshua road lafayette hill pa",
    "baths": "2",
    "beds": "3",
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Joshua Road house is a beautifully maintained 3-bedroom, 2-bathroom home in the heart of Lafayette Hill. Enjoy serene golf course views from the bright living room, or relax in the fully fenced backyard perfect for entertaining. The main level features a well-appointed kitchen, a cozy dining room, and a comfortable living area. The full, unfinished basement spans the entire footprint of the home, offering endless possibilities. A one-car garage adds convenience and additional storage space. Just a short walk to the popular Shops of Lafayette Hill, which features a variety of dining and shopping options. Located within the esteemed Colonial School District. "
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "residential",
    "city": "Lafayette Hill",
    "coordinates": {
      "lat": 40.09215368857267,
      "lng": -75.26216903599442
    },
    "displayOrder": 2,
    "externalLink": null,
    "gallery": null,
    "gla": "1,628",
    "id": "8fd1e0e9-15bb-4b97-aaa4-bd3f1491a08f",
    "keyTenants": null,
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/c9d5523b5ebe64069c7a306e7acd99ac5429d9db.webp",
    "mainImageAlt": null,
    "name": "Joshua Road",
    "sitePlan": null,
    "slug": "joshua-road",
    "state": "PA",
    "units": "1",
    "subcategory": null
  },
  {
    "acres": null,
    "address": "120-122 N Spring Garden St, Ambler, PA",
    "baths": "1",
    "beds": "2",
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "This perfect twin features two 2-bedroom, 1-bath units nestled in a great neighborhood in the heart of Ambler. The first floor has open layout with large living room followed by a large kitchen and dining area, along with a laundry nook! Sliding glass doors in the dining area open out to the private deck and private off-street parking area. Upstairs are two spacious bedrooms and a full bath. Central A/C."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "residential",
    "city": "Ambler",
    "coordinates": {
      "lat": 40.156687017221316,
      "lng": -75.22507029999984
    },
    "displayOrder": 3,
    "externalLink": null,
    "gallery": null,
    "gla": "1,904",
    "id": "d07e7604-c4d7-4bb4-93b9-5bb31e7ed49b",
    "keyTenants": null,
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/1cb1281c964c6bf78f47a0f5eb442c9f6b06564a.webp",
    "mainImageAlt": null,
    "name": "Spring Garden Street Duplex",
    "sitePlan": null,
    "slug": "spring-garden-duplex",
    "state": "PA",
    "units": "2",
    "subcategory": null
  },
  {
    "acres": null,
    "address": "3051 Edmonds Rd, Lafayette Hill, PA",
    "baths": "1.5",
    "beds": "3",
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": "Nestled in the heart of Lafayette Hill, Edmonds Rd House is a charming brick Colonial home offering 1,496 square feet of comfortable living space. This residence exudes classic character with its traditional architecture and cozy fireplace. The home features forced air gas heating, in-unit laundry, and a spacious layout ideal for family living. Additionally, the property provides ample outdoor space for relaxation and entertainment. Located within the highly rated Colonial School District, and just minutes from parks, schools, and local amenities, this home combines timeless appeal with everyday convenience."
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "residential",
    "city": "Lafayette Hill",
    "coordinates": {
      "lat": 1,
      "lng": 1
    },
    "displayOrder": 4,
    "externalLink": null,
    "gallery": null,
    "gla": "1,496",
    "id": "0bdbe5e9-989e-4f27-8a7f-0bb05918e76a",
    "keyTenants": null,
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/00cda7bc69541f92ae875a5c85e4503677cb193d.webp",
    "mainImageAlt": null,
    "name": "Edmonds Road",
    "sitePlan": null,
    "slug": "edmonds-road",
    "state": "PA",
    "units": "1",
    "subcategory": null
  },
  {
    "acres": null,
    "address": "Fort Washington Ave",
    "baths": "1",
    "beds": "4",
    "body": [
      {
        "_type": "block",
        "children": [
          {
            "_type": "span",
            "marks": [],
            "text": " Fort Washington Avenue is a thoughtfully preserved single-family residence that blends historic charm with thoughtful updates in the highly sought-after Upper Dublin School District. A wide, welcoming front porch sets the tone, leading into a home filled with original character, including two cozy fireplaces and sunlit living spaces. Inside, the traditional floor plan features a gracious formal dining room, an inviting eat-in kitchen, and four bright bedrooms, each offering warmth and natural light. The expansive lot is ideal for outdoor living, gardening, or entertaining Perfectly positioned for both small-town charm and everyday convenience, this home is just a short walk to the Fort Washington Regional Rail Station—offering easy access to Center City Philadelphia and even New York City. The neighborhood boasts tree-lined streets, parks, trails, and beloved local shops and restaurants, creating a truly connected lifestyle"
          }
        ],
        "markDefs": [],
        "style": "normal"
      }
    ],
    "category": "residential",
    "city": "Fort Washington",
    "coordinates": null, // the CMS carried a placeholder (1, 1)
    "displayOrder": null,
    "externalLink": null,
    "gallery": null,
    "gla": "1603",
    "id": "cf09e674-a593-414c-9813-a0cdbc872153",
    "keyTenants": null,
    "leasingInquiryEmail": null,
    "leasingInquiryName": null,
    "leasingInquiryPhone": null,
    "mainImage": "/site/img/45bcbb31103862d29f55d7aafa23941e0113ba44.webp",
    "mainImageAlt": null,
    "name": "Fort Washington Ave",
    "sitePlan": null,
    "slug": "fort-washington-ave",
    "state": "PA",
    "units": "1",
    "subcategory": null
  }
];

export const AVAILABLE_SPACE_PAGE = {"title": "", "description": ""};

export const SITE_LISTINGS: SiteListing[] = [
  {
    "id": "7dd0114a-8675-4dd8-be8d-05ef9ab17e10",
    "space": "1st Floor",
    "size": 1228,
    "minSize": null,
    "maxSize": null,
    "term": "Negotiable",
    "rentalRate": "Upon Request",
    "spaceUse": "Retail",
    "condition": "Spec Suite",
    "available": "Now",
    "rentType": "TBD",
    "details": [
      {
        "text": "Private restroom"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/7e13c2b3697f9baacd36d5ab7f511582d58ea60e.webp"
      }
    ],
    "requestMoreInfoEmail": "hfeldman@kormancommercial.com",
    "property": "parkwood-commons"
  },
  {
    "id": "2d95f4dd-8800-4f50-9d33-a7eb2ffac4cf",
    "space": "1st Floor - End Cap",
    "size": 3025,
    "minSize": null,
    "maxSize": null,
    "term": "Negotiable",
    "rentalRate": "Upon Request",
    "spaceUse": "Retail",
    "condition": null,
    "available": "Now",
    "rentType": "TBD",
    "details": [
      {
        "text": "Desirable End-Cap "
      },
      {
        "text": "Pylon Signage Opportunity"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/8e7667abbfa5c7258512d16dd13ed66107908f6c.webp"
      }
    ],
    "requestMoreInfoEmail": "hfeldman@kormancommercial.com",
    "property": "parkwood-commons"
  },
  {
    "id": "02783691-3fa1-45c3-94ca-ca509f13dd42",
    "space": "205",
    "size": 1000,
    "minSize": null,
    "maxSize": null,
    "term": "Negotiable",
    "rentalRate": "Upon Request",
    "spaceUse": "Office",
    "condition": "Full Build-Out",
    "available": "Now",
    "rentType": "Negotiable",
    "details": [
      {
        "text": "2nd Floor Office Space"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/615454bbd0b14672c9e19b40d5c07edb02e0579d.webp"
      }
    ],
    "requestMoreInfoEmail": null,
    "property": "parkwood-shopping-center"
  },
  {
    "id": "38867782-09f2-49d5-b349-8f9dbbd1b374",
    "space": "206",
    "size": 1220,
    "minSize": null,
    "maxSize": null,
    "term": "Negotiable",
    "rentalRate": "Upon Request",
    "spaceUse": "Office",
    "condition": "Full Build-Out",
    "available": "Now",
    "rentType": "Negotiable",
    "details": [
      {
        "text": "2nd Floor Office Space"
      },
      {
        "text": "Mostly Open Floor Plan Layout"
      },
      {
        "text": "Fits 4 - 11 People"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/10b90778671d84ad2239b646d0b7ac693da01aad.webp"
      }
    ],
    "requestMoreInfoEmail": "hfeldman@kormancommercial.com",
    "property": "parkwood-shopping-center"
  },
  {
    "id": "21b6ea14-fb22-4691-8df1-5ede138c674b",
    "space": "208",
    "size": 1075,
    "minSize": null,
    "maxSize": null,
    "term": "Negotiable",
    "rentalRate": "Upon Request",
    "spaceUse": "Office",
    "condition": "Full Build-Out",
    "available": "Now",
    "rentType": "Negotiable",
    "details": [
      {
        "text": "2nd Floor Office Space"
      },
      {
        "text": "Fits 3 - 9 People"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/a582ec71bab7bfb074121fc1e8ace3bd6d017a54.webp"
      }
    ],
    "requestMoreInfoEmail": "hfeldman@kormancommercial.com",
    "property": "parkwood-shopping-center"
  },
  {
    "id": "5989904b-227c-4566-99a7-cfbd0cf9a772",
    "space": "210",
    "size": 560,
    "minSize": null,
    "maxSize": null,
    "term": "Negotiable",
    "rentalRate": "Upon Request",
    "spaceUse": "Office",
    "condition": "Full Build-Out",
    "available": "Now",
    "rentType": "Negotiable",
    "details": [
      {
        "text": "2nd Floor Office Space"
      },
      {
        "text": "Fully Open Office"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/3b0b604d06b629196037b5f731fe95160d5b673c.webp"
      }
    ],
    "requestMoreInfoEmail": "hfeldman@kormancommercial.com",
    "property": "parkwood-shopping-center"
  },
  {
    "id": "eeb7f872-9d71-47ab-ba07-16a8295c3f3e",
    "space": "212",
    "size": 1845,
    "minSize": null,
    "maxSize": null,
    "term": "Negotiable",
    "rentalRate": "Upon Request",
    "spaceUse": "Office",
    "condition": "Full Build-Out",
    "available": "Now",
    "rentType": "Negotiable",
    "details": [
      {
        "text": "2nd Floor Office Space"
      },
      {
        "text": "Fits 5 - 15 People"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/86bb777ec41220e9d7b09f645c80d62186fd9508.webp"
      }
    ],
    "requestMoreInfoEmail": "hfeldman@kormancommercial.com",
    "property": "parkwood-shopping-center"
  },
  {
    "id": "0951e0d9-9d9c-4e06-8281-794fae4d5898",
    "space": "214",
    "size": 740,
    "minSize": null,
    "maxSize": null,
    "term": "Negotiable",
    "rentalRate": "Upon Request",
    "spaceUse": "Office",
    "condition": "Full Build-Out",
    "available": "Now",
    "rentType": "Negotiable",
    "details": [
      {
        "text": "2nd Floor Office Space"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/d777c6806ad390f1553aac9a6c859aa43a00f627.webp"
      }
    ],
    "requestMoreInfoEmail": "hfeldman@kormancommercial.com",
    "property": "parkwood-shopping-center"
  },
  {
    "id": "86cc4195-e200-48d8-be82-936d159ec8a0",
    "space": "216",
    "size": 554,
    "minSize": null,
    "maxSize": null,
    "term": "Negotiable",
    "rentalRate": "Upon Request",
    "spaceUse": "Office",
    "condition": "Full Build-Out",
    "available": "Now",
    "rentType": "Negotiable",
    "details": [
      {
        "text": "2nd Floor Office Space"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/f87c0114d76947b16ec0112ac89ec05b9418e48f.webp"
      }
    ],
    "requestMoreInfoEmail": "hfeldman@kormancommercial.com",
    "property": "parkwood-shopping-center"
  },
  {
    "id": "49f736f4-2482-4dc8-a8d4-80afaacf66cc",
    "space": "416",
    "size": 2486,
    "minSize": null,
    "maxSize": null,
    "term": "Negotiable",
    "rentalRate": "Upon Request",
    "spaceUse": "Retail",
    "condition": "Full Build-Out",
    "available": "Now",
    "rentType": "NNN",
    "details": [
      {
        "text": "Highly Desirable End Cap Space"
      },
      {
        "text": "Fully Built-Out as Standard Retail Space"
      },
      {
        "text": "Lease rate does not include utilities, property expenses or building services"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/02359931f70226a84c8f5385fd5f7c11819968a0.webp"
      }
    ],
    "requestMoreInfoEmail": null,
    "property": "shops-of-lafayette-hill"
  },
  {
    "id": "72d54aba-a0df-4f2d-a8f0-ec741b65228e",
    "space": "Pad Site",
    "size": 2500,
    "minSize": null,
    "maxSize": null,
    "term": " 5-10 Years",
    "rentalRate": "Upon Request",
    "spaceUse": "Retail",
    "condition": "Shell Space",
    "available": "30 Days",
    "rentType": "Negotiable",
    "details": [
      {
        "text": "Space is an outparcel at this property"
      }
    ],
    "images": [
      {
        "alt": null,
        "url": "/site/img/73e4c9af1f9bd67724f451657d33e445a121fc6c.webp"
      },
      {
        "alt": null,
        "url": "/site/img/c58007ecb9aa545add071609fafbd4e7b581ca45.webp"
      }
    ],
    "requestMoreInfoEmail": "hfeldman@kormancommercial.com",
    "property": "grays-ferry-shopping-center"
  }
];

export const propertiesIn = (c: SiteCategory) => SITE_PROPERTIES.filter((p) => p.category === c);
export const propertyBySlug = (category: string, slug: string) =>
  SITE_PROPERTIES.find((p) => p.category === category && p.slug === slug);
export const listingsFor = (slug: string) => SITE_LISTINGS.filter((l) => l.property === slug);
