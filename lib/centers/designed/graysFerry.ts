// Gray's Ferry Shopping Center (4500) — the designed page's suites (the Claude
// Design handoff's SUITES array), on the Lafayette Hill / Brookwood model:
// geometry in ORIGINAL site-plan pixels (3300 × 2550), curated copy here, and
// WHO is in each suite and its SF from the rent roll at request time
// (sync.ts). Suite ids are street numbers ("3021 Grays Ferry Ave"). The in-line
// storefronts run on a diagonal along S Stanley St, so a suite can be a
// POLYGON (`pts`) with its label at `cx, cy` rotated `rot`; `lw/lh/lx/ly` place
// a logo explicitly (the stepped Fresh Grocer box, Fine Wine). `rollName` is a
// fragment of the rent roll's name ("JP Morgan" for Chase, "Victra" for
// Verizon, "PLCB" for Fine Wine). Clear Channel's billboard (3000) is on the
// roll with no SF and is not drawn. SF here is the 2025 recon roster's, used
// only when the roll carries no figure.

import type { DesignedSuite } from "./sync";

export const GRAYS_FERRY_SUITES: DesignedSuite[] = [
  {id:"3021",rollName:"Fresh Grocer",sf:56648,x:609,y:511,w:899,h:551,pts:"609,547 609,1062 1508,1062 1508,806 1336,806 1335,688 1090,688 1089,659 1031,659 1030,591 1064,590 1064,547 809,547 808,511 766,511 765,547",cx:1060,cy:880,rot:0,tenant:"The Fresh Grocer of Grays Ferry",use:"Supermarket",status:"leased",url:"https://www.thefreshgrocer.com/",logo:"/centers/grays-ferry/assets/logo-3021.png",lw:300,lh:270,lx:960,ly:740,order:"https://www.thefreshgrocer.com/sm/pickup/rsid/2000",orderLabel:"Order for pickup"},
  {id:"3007",rollName:"PLCB",sf:8000,x:1510,y:810,w:288,h:305,pts:"1510,843 1510,1062 1556,1062 1673,1115 1798,957 1613,810 1586,843",cx:1620,cy:960,rot:0,tenant:"Fine Wine & Good Spirits",use:"Wine & spirits",status:"leased",url:"https://www.finewineandgoodspirits.com/",order:"https://www.finewineandgoodspirits.com/",orderLabel:"Shop for pickup",logo:"/centers/grays-ferry/assets/logo-3007.png",lw:210,lh:84,lx:1522,ly:918},
  {id:"3005",rollName:"USPS",sf:1600,x:1676,y:959,w:163,h:189,pts:"1800,959 1676,1115 1715,1148 1839,992",cx:1758,cy:1054,rot:-51,tenant:"United States Post Office",use:"Post office · Shipping",status:"leased",url:"https://www.usps.com/",popLogo:"/centers/grays-ferry/assets/logo-3005.png"},
  {id:"3001",rollName:"Hilti",sf:3200,x:1717,y:992,w:198,h:215,pts:"1842,992 1717,1150 1789,1207 1915,1050",cx:1816,cy:1100,rot:-51,tenant:"Hilti",use:"Power tools · Fastening",status:"leased",url:"https://www.hilti.com/stores/philadelphia_downtown",linkLabel:"Store details",popLogo:"/centers/grays-ferry/assets/logo-3001.png"},
  {id:"2899",rollName:"Curl",sf:1600,x:1792,y:1052,w:164,h:188,pts:"1917,1052 1792,1209 1831,1240 1956,1083",cx:1874,cy:1146,rot:-51,tenant:"Curl & Care Hair",use:"Hair care · Beauty supply",status:"leased"},
  {id:"2897",rollName:"Victra",sf:1600,x:1833,y:1085,w:164,h:188,pts:"1959,1085 1833,1242 1872,1273 1997,1116",cx:1915,cy:1179,rot:-51,tenant:"Verizon (Victra)",use:"Wireless store · Authorized retailer",status:"leased",url:"https://victra.com/",popLogo:"/centers/grays-ferry/assets/logo-2897.png"},
  {id:"2895",rollName:"Nail Parlor",sf:1600,x:1875,y:1118,w:165,h:189,pts:"2000,1118 1875,1274 1915,1307 2040,1150",cx:1958,cy:1212,rot:-51,tenant:"Nail Parlor",use:"Nail salon",status:"leased",url:"https://www.instagram.com/nailparlor215/",linkLabel:"View on Instagram",popLogo:"/centers/grays-ferry/assets/logo-2895.png"},
  {id:"2893",rollName:"Grays Eye",sf:0,x:1917,y:1152,w:180,h:200,pts:"2043,1152 1917,1309 1972,1352 2097,1195",cx:2007,cy:1252,rot:-51,tenant:"Grays Eye Care",use:"Optometrist · Eyewear",status:"leased",url:"https://www.grayseyecare.com/",order:"https://www.grayseyecare.com/appointment",orderLabel:"Book an eye exam",popLogo:"/centers/grays-ferry/assets/logo-2893.png"},
  {id:"2891",rollName:"JP Morgan",sf:2486,x:1975,y:1197,w:235,h:200,pts:"2100,1197 1975,1353 2028,1397 2106,1300 2174,1353 2210,1309 2143,1255 2154,1240",cx:2060,cy:1300,rot:0,tenant:"Chase",use:"Bank · ATM",status:"leased",url:"https://www.chase.com/locator/banking/us/pa/philadelphia/2815-grays-ferry-ave",linkLabel:"Branch details",popLogo:"/centers/grays-ferry/assets/logo-2891.png"},
  {id:"2851",rollName:"McDonald",sf:3675,x:2472,y:1569,w:119,h:182,pts:"2484,1569 2472,1587 2472,1751 2591,1751 2591,1587 2531,1587 2530,1569",cx:2524,cy:1629,rot:0,tenant:"McDonald's",use:"Quick service · Drive-thru",status:"leased",url:"https://www.mcdonalds.com/us/en-us/location/PA/PHILADELPHIA/29--GRAYS-FERRY-AVE/14507.html",linkLabel:"Restaurant details",order:"https://mcdonalds.order.online/business/-5579",logo:"/centers/grays-ferry/assets/logo-2851.png"},
];
