// Parkwood Commons (1100, the registry's "parkwood-professional") — the
// designed page's suites (the Claude Design handoff's SUITES array), on the
// same model as the other designed centres: geometry in the marketing site
// plan's pixels, curated copy here, WHO and SF from the rent roll at request
// time (sync.ts). Suite numbers are the roll's, non-sequential (30, 32, 36,
// 12330, 34 from Byberry Rd to Medford Rd); `addr` gives "Suite 30".

import type { DesignedSuite } from "./sync";

export const PARKWOOD_COMMONS_SUITES: DesignedSuite[] = [
  {id:"30",x:591,y:905,w:775,h:745,pts:"591,905 1366,905 1366,1650 591,1650",cx:978,cy:1279,rot:0,addr:"Suite 30",tenant:"Available",use:"Office / retail · Former bank",status:"available",sf:3025},
  {id:"32",x:1368,y:908,w:255,h:742,pts:"1368,908 1623,908 1623,1650 1368,1650",cx:1495,cy:1279,rot:0,addr:"Suite 32",tenant:"Available",use:"In-line retail",status:"available",sf:1000},
  {id:"36",rollName:"Honest",sf:0,x:1626,y:908,w:254,h:742,pts:"1626,908 1880,908 1880,1650 1626,1650",cx:1753,cy:1279,rot:0,addr:"Suite 36",tenant:"Honest Real Estate",use:"Real estate office",status:"leased",url:"https://honestrealestate.com/",logo:"/centers/parkwood-commons/assets/logo-honest.png",lw:220,lh:127,lx:1643,ly:1216},
  {id:"12330",rollName:"Ferry Good",sf:0,x:1883,y:908,w:313,h:742,pts:"1883,908 2196,908 2196,1650 1883,1650",cx:2039,cy:1279,rot:0,tenant:"Ferry Good Treats",use:"Sweets · Treats",status:"leased",url:"https://www.instagram.com/ferrygoodtreats/",linkLabel:"View on Instagram",order:"https://www.facebook.com/ferrygoodtreats/",orderLabel:"View on Facebook",noRow:true},
  {id:"34",rollName:"Shear Sensation",sf:0,x:2199,y:908,w:554,h:742,pts:"2199,908 2753,908 2753,1650 2199,1650",cx:2476,cy:1279,rot:0,addr:"Suite 34",tenant:"Shear Sensation",use:"Hair salon",status:"leased",url:"https://www.facebook.com/p/Shear-Sensation-100022837254964/",linkLabel:"View on Facebook",logo:"/centers/parkwood-commons/assets/logo-shear.png",lw:420,lh:168,lx:2266,ly:1195},
];
