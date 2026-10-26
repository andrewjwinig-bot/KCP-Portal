// Brookwood Shopping Center (2300) — the designed page's suites (the Claude
// Design handoff's SUITES array), on the same model as Lafayette Hill
// (lafayetteHill.ts): geometry in ORIGINAL site-plan pixels (3300 × 2550),
// curated copy here, and WHO is in each suite and its SF from the rent roll at
// request time (sync.ts). Suite ids are street numbers ("1881 Street Road").
// `rollName` is the rent roll's name for the tenant the copy describes
// ("Citizens Bank of PA", "T-Mobile Northeast LLC") — matched loosely, so a
// fragment of it is enough. `shadow` suites (Regency Furniture, Ashley) are not
// part of the centre: not on the roll, so sync leaves them as designed, and the
// page leaves them out of the tenant index. SF here is the 2025 recon roster's,
// used only when the roll carries no figure.

import type { DesignedSuite } from "./sync";

export const BROOKWOOD_SUITES: DesignedSuite[] = [
 {id:"1881",rollName:"Citizens Bank",sf:2700,x:700,y:913,w:102,h:209,tenant:"Citizens Bank",status:"leased",use:"Bank · Drive-thru",url:"https://locations.citizensbank.com/pa/bensalem/1881-street-rd.html",linkLabel:"Branch details",popLogo:"/centers/brookwood/assets/logo-1881.png"},
 {id:"1879",x:803,y:913,w:37,h:185,tenant:"",status:"available",sf:0,use:"Retail / service"},
 {id:"1877",rollName:"Evolve Nails",sf:1600,x:841,y:913,w:48,h:185,tenant:"Evolve Nails and Spa",status:"leased",use:"Nail salon · Spa",url:"https://www.facebook.com/p/Evolve-Nails-Spa-100067025430373/",linkLabel:"View on Facebook",popLogo:"/centers/brookwood/assets/logo-1877.png"},
 {id:"1871",rollName:"Lee's Hoagie",sf:1600,x:890,y:913,w:46,h:185,tenant:"Lee's Hoagie House",status:"leased",use:"Hoagies · Cheesesteaks",url:"https://leeshoagiesabh.com/locations/",popLogo:"/centers/brookwood/assets/logo-1871.png"},
 {id:"1869",rollName:"China Sun",sf:1600,x:937,y:862,w:47,h:236,tenant:"China Sun",status:"leased",use:"Chinese restaurant · Takeout",url:"https://chinasun.menufy.com/",order:"https://chinasun.menufy.com/order",popLogo:"/centers/brookwood/assets/logo-1869.png"},
 {id:"1867",rollName:"T-Mobile",sf:3200,x:985,y:934,w:65,h:188,tenant:"T-Mobile",status:"leased",use:"Wireless store",url:"https://www.t-mobile.com/stores/bd/t-mobile-bensalem-pa-19020-9071",linkLabel:"Store details",popLogo:"/centers/brookwood/assets/logo-1867.png"},
 {id:"1863",rollName:"Cohen",sf:1600,x:1051,y:934,w:65,h:188,tenant:"Cohen's Fashion Optical",status:"leased",use:"Eyewear · Eye exams",url:"https://www.cohensfashionoptical.com/locations/brookwood-plaza-bensalem/",order:"https://www.cohensfashionoptical.com/locations/brookwood-plaza-bensalem/#schedule",orderLabel:"Book an eye exam",popLogo:"/centers/brookwood/assets/logo-1863.png"},
 {id:"1861",rollName:"Edible Arrangements",sf:2000,x:1117,y:934,w:66,h:188,tenant:"Edible Arrangements",status:"leased",use:"Fruit arrangements · Gifts",url:"https://www.ediblearrangements.com/stores/1861-street-road-bensalem-pa-19020",linkLabel:"Store details",order:"https://www.ediblearrangements.com/all-fruit-arrangements",orderLabel:"Order online",popLogo:"/centers/brookwood/assets/logo-1861.png"},
 {id:"1851",rollName:"National Fitness Partners",sf:20433,x:1184,y:747,w:326,h:375,tenant:"Planet Fitness",status:"leased",use:"Fitness club",url:"https://www.planetfitness.com/gyms/bensalem-street-road-pa/",logo:"/centers/brookwood/assets/logo-1851.png"},
 {id:"1847",rollName:"Crafty Crab",sf:12759,x:1511,y:747,w:166,h:375,tenant:"Crafty Crab",status:"leased",use:"Seafood restaurant",url:"https://www.craftycrabrestaurant.com/",order:"https://craftycrabbensalem.kwickmenu.com/",logo:"/centers/brookwood/assets/logo-1847.png",blurb:"Cajun-style seafood boils, crab legs, shrimp and fried baskets."},
 {id:"regency",shadow:true,x:1679,y:587,w:294,h:535,tenant:"Regency Furniture",use:"Furniture showroom",status:"leased",logo:"/centers/brookwood/assets/logo-regency.png",sf:0},
 {id:"ashley",shadow:true,x:1975,y:587,w:318,h:535,tenant:"Ashley",use:"Furniture · Home store",status:"leased",logo:"/centers/brookwood/assets/logo-ashley.png",sf:0},
 {id:"1885",rollName:"Dunkin",sf:4000,x:517,y:1269,w:173,h:153,tenant:"Dunkin'",use:"Coffee · Donuts · Drive-thru",status:"leased",url:"https://www.dunkindonuts.com/",order:"https://www.dunkindonuts.com/menu/",logo:"/centers/brookwood/assets/logo-1885.png"},
 {id:"1883",rollName:"Wawa",sf:5000,x:955,y:1783,w:231,h:129,tenant:"Wawa",use:"Convenience store · Coffee",status:"leased",logo:"/centers/brookwood/assets/logo-207.png",url:"https://www.wawa.com/",order:"https://www.wawa.com/",blurb:"Fresh food, built-to-order hoagies, coffee and everyday essentials."},
 {id:"1817",rollName:"M&T Bank",sf:3800,x:1796,y:1754,w:96,h:180,tenant:"M&T Bank",use:"Bank · Drive-up ATM",status:"leased",url:"https://locations.mtb.com/pa/bensalem/bank-branches-and-atms-bensalem-pa-4103.html",linkLabel:"Branch details",popLogo:"/centers/brookwood/assets/logo-1817.png"}
];
