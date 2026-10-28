// The Shops of Lafayette Hill — the designed page's suites (the Claude Design
// handoff's SUITES array). Geometry (x, y, w, h) is in the ORIGINAL site-plan
// pixels (3300 × 2550) and never changes unless the plan does. The tenant copy,
// links and logos are curated here; WHO is in each suite and its SF come from
// the rent roll at request time (sync.ts), so a move-out or a new lease shows
// on the page without an edit here.
//
// `rollName` is the name the RENT ROLL carries for the tenant this copy was
// written about (often a legal name: Toyosu is "Liang Jiang", Miles Pet
// Grooming is "DKMNK"). When the roll's occupant stops matching it, the suite
// has turned over and the page shows the roll's tenant without this copy.
// `units` lists the rent-roll suites drawn as one storefront (From The Boot
// occupies 400 + 404).

import type { DesignedSuite } from "./sync";

export const LAFAYETTE_HILL_SUITES: DesignedSuite[] = [
{id:"428",addr:true,x:660,y:1353,w:98,h:320,tenant:"Boostin' Bowls",use:"Açaí bowls · Smoothies",sf:1400,status:"leased",url:"https://www.boostinbowls.com/",order:"https://www.boostinbowls.com/",popLogo:"/centers/lafayette-hill/assets/logo-428.png",blurb:"Açaí bowls, smoothies and toast, with online ordering for pickup or delivery."},
 {id:"426",rollName:"Marvel Agency",addr:true,x:759,y:1353,w:91,h:320,tenant:"Marvel Agency Inc",use:"Insurance agency",sf:1300,status:"leased",url:"https://www.marvelagents.com/",popLogo:"/centers/lafayette-hill/assets/logo-426.png",logoBg:"#1c1c1c",blurb:"Independent insurance agency for businesses and families: auto, home, commercial and specialty coverage."},
 {id:"424",rollName:"DKMNK",addr:true,x:850,y:1353,w:90,h:320,tenant:"Miles Pet Grooming",use:"Dog grooming",sf:1300,status:"leased",order:"https://www.diamonddoggroomers.com/",orderLabel:"Book online",popLogo:"/centers/lafayette-hill/assets/logo-424.png"},
 {id:"422",rollName:"Liang Jiang",addr:true,x:941,y:1353,w:132,h:320,tenant:"Toyosu Sushi & Poke",use:"Sushi & poke · Takeout",sf:1900,status:"leased",url:"https://sites.google.com/view/toyosusushi-poke/",order:"https://toyosu.square.site/"},
 {id:"420",rollName:"Lafayette Hill Cleaners",addr:true,x:1074,y:1353,w:145,h:320,tenant:"Lafayette Hill Fabricare Cleaners",use:"Dry cleaner",sf:2100,status:"leased",url:"https://www.google.com/maps/place/Lafayette+Hill+Fabricare+Cleaners/@40.0921457,-75.2608993,55a,75y,242.99h,93.22t/data=!3m7!1e1!3m5!1sBais2Rpl0ccXosLM5WWB6Q!2e0!6shttps:%2F%2Fstreetviewpixels-pa.clients6.google.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-3.2232910822967966%26panoid%3DBais2Rpl0ccXosLM5WWB6Q%26yaw%3D242.99061038460715!7i13312!8i6656!4m9!1m2!2m1!1sshops+of+lafayette+hill!3m5!1s0x89c6bea7f5b4e1fb:0xafc9714694f7fe78!8m2!3d40.0921103!4d-75.2610321!16s%2Fg%2F1w1133zr",linkLabel:"View on Google Maps"},
 {id:"416",addr:true,x:1416,y:1317,w:239,h:356,tenant:"",use:"Retail / service · Two bays with interior opening",sf:2486,status:"available"},
 {id:"414",rollName:"Hair Concepts",addr:true,x:1656,y:1317,w:82,h:356,tenant:"Hair Concepts",use:"Hair salon",sf:1300,status:"leased",url:"https://www.google.com/maps/place/Hair+Concepts/@40.0923358,-75.2611789,55a,75y,240.86h,96.44t/data=!3m7!1e1!3m5!1shequMNpfdZF_G8xq68N9UA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.clients6.google.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-6.444777015448636%26panoid%3DhequMNpfdZF_G8xq68N9UA%26yaw%3D240.85661858541062!7i16384!8i8192!4m9!1m2!2m1!1sshops+of+lafayette+hill!3m5!1s0x89c6bea7f5a615d5:0x5429f674e5818628!8m2!3d40.0923072!4d-75.2613069!16s%2Fg%2F1td9x23h",linkLabel:"View on Google Maps"},
 {id:"412",rollName:"Touch of Class",addr:true,x:1739,y:1317,w:125,h:356,tenant:"Touch of Class Gifts",use:"Gift shop · Custom baskets",sf:2000,status:"leased",url:"https://www.touchofclassgiftbaskets.com/",order:"https://www.touchofclassgiftbaskets.com/shop",orderLabel:"Shop online",popLogo:"/centers/lafayette-hill/assets/logo-412.png",blurb:"Custom gift baskets and trays, plus locally made food and hand-picked gifts."},
 {id:"410",rollName:"Hunan Wok",addr:true,x:1865,y:1317,w:106,h:356,tenant:"Hunan Wok",use:"Chinese restaurant · Takeout",sf:1700,status:"leased",url:"https://www.hunanwoklh.com/",order:"https://www.hunanwoklh.com/0gkd5tla/hunan-wok-lafayette-hill-19444/order-online?menu=All+Day+Menu",popLogo:"/centers/lafayette-hill/assets/logo-410.png"},
 {id:"408",rollName:"Vino's Pizza",addr:true,x:1971,y:1317,w:102,h:356,tenant:"Vino's Pizza",use:"Pizzeria · Takeout",sf:1600,status:"leased",url:"https://www.google.com/maps/place/Vino%27s+Pizza/@40.0925034,-75.2614703,74m/data=!3m1!1e3!4m9!1m2!2m1!1sshops+of+lafayette+hill!3m5!1s0x89c6bc1d6049bb75:0xfdaf77b8de67fb64!8m2!3d40.0923218!4d-75.2615038!16s%2Fg%2F1tg4mb5l",linkLabel:"View on Google Maps"},
 {id:"406",rollName:"Wawa",addr:true,x:2074,y:1238,w:314,h:444,tenant:"Wawa",logo:"/centers/lafayette-hill/assets/logo-207.png",use:"Convenience store · Coffee",sf:7400,status:"leased",url:"https://www.wawa.com/",order:"https://www.wawa.com/",blurb:"Fresh food, built-to-order hoagies, coffee and everyday essentials."},
 {id:"404",units:["400","404"],addr:true,x:2388,y:1317,w:313,h:356,tenant:"From The Boot",use:"Italian restaurant · BYOB",sf:5000,status:"leased",url:"https://fromthebootlh.com/",order:"https://order.toasttab.com/online/from-the-boot-lafayette-hill-517-germantown-pike",logo:"/centers/lafayette-hill/assets/logo-208.png",blurb:"Family-run Italian, open since 1999. Dine-in BYOB, carry-out, catering and private events."}
];
