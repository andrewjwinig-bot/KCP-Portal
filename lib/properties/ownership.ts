// ─── PROPERTY OWNERSHIP — SOURCE OF TRUTH ────────────────────────────────────
// Canonical ownership data per property. The Filing Tracker K-1 distribution
// task investors and the Investor Info page both read from here.
//
// Notes on shape:
//  - "id" on each owner must stay stable: it's used as the localStorage key
//    for K-1 filing checkboxes on the Filing Tracker.
//  - "vendorCode" is the GL vendor key (e.g. "THEK1") — added field, fill in
//    as data becomes available.
//  - "ownerPct" represents the overall ownership stake when profit/loss/capital
//    aren't tracked separately (e.g. wholly-owned properties). For K-1
//    investors with explicit profit/loss/capital percentages we leave it
//    unset and rely on those.

export interface PropertyOwner {
  /** Stable id, used as localStorage key on the Filing Tracker. */
  id: string;
  /** Plain owner name as it appears in the master schedule. */
  name: string;
  /** GL vendor key (e.g. "THEK1"). */
  vendorCode?: string;
  /** Trust/UWO/etc. subtitle that follows the name in source docs. */
  detailedName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** Work / cell phone if recorded. */
  phone?: string;
  /** State on the K-1 if different from mailing state (e.g. "Pennsylvania"). */
  stateIfDifferent?: string;
  /** Overall ownership % (used when profit/loss/capital aren't broken out). */
  ownerPct?: number;
  profitPct?: number;
  lossPct?: number;
  capitalPct?: number;
}

export interface PropertyOwnership {
  /** Property code, e.g. "1100", "7200". */
  propertyCode: string;
  /** Optional display label; otherwise PROPERTY_DEFS lookup is used. */
  propertyName?: string;
  /** Whether this property files K-1 distributions (drives Filing Tracker). */
  hasK1Distribution?: boolean;
  owners: PropertyOwner[];
}

export const PROPERTY_OWNERSHIP: PropertyOwnership[] = [
  // ─── Wholly-owned ─────────────────────────────────────────────────────────
  {
    propertyCode: "1100",
    owners: [
      { id: "own-1100-thek1", name: "The Korman Co", vendorCode: "THEK1", ownerPct: 1.0 },
    ],
  },

  {
    propertyCode: "2300",
    owners: [
      { id: "own-2300-hyma1", name: "Hyman Korman Co.", vendorCode: "HYMA1", ownerPct: 0.475 },
      { id: "own-2300-thek1", name: "The Korman Co",    vendorCode: "THEK1", ownerPct: 0.525 },
    ],
  },

  {
    propertyCode: "4500",
    owners: [
      { id: "own-4500-19721", name: "Alison Korman Feldman",  detailedName: "1972 Tr for Alison Korman Feldman", vendorCode: "19721", address: "6015 Sheaff Lane",       city: "Fort Washington", state: "PA", zip: "19034",                              ownerPct: 0.055560 },
      { id: "own-4500-19722", name: "Catherine Korman Altman",    detailedName: "1972 Tr for Catherine S. Korman",   vendorCode: "19722", address: "241 S. 6th Street",      city: "Philadelphia",    state: "PA", zip: "19106",                              ownerPct: 0.055560 },
      { id: "own-4500-19723", name: "Susan Korman Schurr",    detailedName: "1972 Tr for Susan Korman Schurr",   vendorCode: "19723", address: "380 1st Ave North",      city: "Naples",          state: "FL", zip: "34102",                              ownerPct: 0.055560 },
      { id: "own-4500-brad2", name: "Bradley J. Korman",                 vendorCode: "BRAD2", address: "120 Norristown Road",    city: "Blue Bell",       state: "PA", zip: "19422", phone: "(215) 646-1655",     ownerPct: 0.055550 },
      { id: "own-4500-caro2", name: "Carolyn Korman Jacobs",             vendorCode: "CARO2", address: "6114 Butler Pike",       city: "Blue Bell",       state: "PA", zip: "19422", phone: "(215) 646-8785",     ownerPct: 0.055560 },
      { id: "own-4500-gray2", name: "GRAYS FERRY SC ASSOC. INC",         vendorCode: "GRAY2", address: "8 Neshaminy Interplex",  city: "Trevose",         state: "PA", zip: "19053",                              ownerPct: 0.001000 },
      { id: "own-4500-jame4", name: "James S. Korman",                   vendorCode: "JAME4", address: "360 Harrow Lane",        city: "Blue Bell",       state: "PA", zip: "19422", phone: "(215) 646-3137",     ownerPct: 0.055550 },
      { id: "own-4500-john1", name: "John P. Korman",                    vendorCode: "JOHN1", address: "805 Penllyn Pike",       city: "Lower Gwynedd",   state: "PA", zip: "19002", phone: "(215) 542-1544",     ownerPct: 0.055560 },
      { id: "own-4500-lawr1", name: "Lawrence M. Korman",                vendorCode: "LAWR1", address: "6019 Sheaff Lane",       city: "Ft Washington",   state: "PA", zip: "19034", phone: "(215) 646-9936",     ownerPct: 0.055550 },
      { id: "own-4500-mark1", name: "Mark G. Korman",                    vendorCode: "MARK1", address: "6220 Sheaff Lane",       city: "Ft. Washington",  state: "PA", zip: "19034", phone: "(215) 542-7888",     ownerPct: 0.055550 },
      { id: "own-4500-thek1", name: "The Korman Co",                     vendorCode: "THEK1",                                                                                                                       ownerPct: 0.499000 },
    ],
  },

  {
    propertyCode: "5600",
    owners: [
      { id: "own-5600-hyma1", name: "Hyman Korman Co.", vendorCode: "HYMA1", ownerPct: 1.0 },
    ],
  },

  {
    propertyCode: "2010",
    owners: [
      { id: "own-2010-alis1", name: "Alison Korman Feldman", vendorCode: "ALIS1", address: "6015 Sheaff Lane", city: "Fort Washington", state: "Pennsylvania", zip: "19034", ownerPct: 1.0 },
    ],
  },

  {
    propertyCode: "8200",
    owners: [
      { id: "own-8200-joan2", name: "Joan R. Sohn",      vendorCode: "JOAN2", detailedName: "Joan R. Sohn 1942 Trust · C/O Baker Tilly US, LLP",      address: "1650 Market St., Suite 4500",              city: "Philadelphia", state: "Pennsylvania", zip: "19103", ownerPct: 0.500000 },
      { id: "own-8200-judi2", name: "Judith K. Langsfeld", vendorCode: "JUDI2", detailedName: "Judith K. Langsfeld 1942 Trust",                          address: "1673 Paper Mill Road",                     city: "Meadowbrook",  state: "Pennsylvania", zip: "19046", ownerPct: 0.250000 },
      { id: "own-8200-lynn2", name: "Lynne Honickman",   vendorCode: "LYNN2", detailedName: "Lynne Honickman 1942 Trust · C/O The Honickman Co., Eric D. Pisauro", address: "c/o Honickman Co · 8275 N. Crescent Blvd.", city: "Pennsauken",   state: "New Jersey",   zip: "08110", ownerPct: 0.250000 },
    ],
  },

  {
    propertyCode: "7010",
    owners: [
      { id: "own-7010-akgst", name: "Alison Korman Feldman",          detailedName: "LIK GST TR FBO Alison Feldman",                    vendorCode: "AKGST", address: "6015 Sheaff Lane",   city: "Ft. Washington", state: "PA", zip: "19034",                              ownerPct: 0.049464 },
      { id: "own-7010-alis1", name: "Alison Korman Feldman",                                                                      vendorCode: "ALIS1", address: "6015 Sheaff Lane",   city: "Fort Washington", state: "PA", zip: "19034",                              ownerPct: 0.016230 },
      { id: "own-7010-bert4", name: "Berton E. Korman",        detailedName: "Berton E Korman TUA Dtd 02232018 As Amended",      vendorCode: "BERT4", address: "410 Lancaster Ave",  city: "Haverford",       state: "PA", zip: "19041",                              ownerPct: 0.148390 },
      { id: "own-7010-cagst", name: "Catherine Korman Altman",        detailedName: "LIK GST TR FBO Catherine Altman",                  vendorCode: "CAGST", address: "241 A South 6th St.", city: "Philadelphia",   state: "PA", zip: "19106",                              ownerPct: 0.049463 },
      { id: "own-7010-caro2", name: "Carolyn Korman Jacobs",                                                                      vendorCode: "CARO2", address: "6114 Butler Pike",   city: "Blue Bell",       state: "PA", zip: "19422", phone: "(215) 646-8785",     ownerPct: 0.016230 },
      { id: "own-7010-caro3", name: "Carol Isard",             detailedName: "IRR TR-MC Isard 07/28/20 FBO Carol Isard",         vendorCode: "CARO3", address: "8603 Prospect Avenue", city: "Philadelphia",   state: "PA", zip: "19118",                              ownerPct: 0.075000 },
      { id: "own-7010-cath2", name: "Catherine Korman Altman",                                                                    vendorCode: "CATH2", address: "241 S 6th Street",   city: "Philadelphia",    state: "PA", zip: "19106",                              ownerPct: 0.016230 },
      { id: "own-7010-eliz1", name: "Elizabeth Langsfeld",     detailedName: "Elizabeth Langsfeld 1982 Trust",                   vendorCode: "ELIZ1", address: "4797 Crescent Street", city: "Bethesda",      state: "MD", zip: "20816", phone: "(301) 320-0831",     ownerPct: 0.016230 },
      { id: "own-7010-jame4", name: "James S. Korman",                                                                            vendorCode: "JAME4", address: "360 Harrow Lane",    city: "Blue Bell",       state: "PA", zip: "19422", phone: "(215) 646-3137",     ownerPct: 0.016230 },
      { id: "own-7010-joan1", name: "Joan R. Sohn",                                                                               vendorCode: "JOAN1", detailedName: "C/O Baker Tilly US, LLP",                                                                  address: "1650 Market St., Suite 4500", city: "Philadelphia", state: "PA", zip: "19103", ownerPct: 0.200000 },
      { id: "own-7010-john1", name: "John P. Korman",                                                                             vendorCode: "JOHN1", address: "805 Penllyn Pike",   city: "Lower Gwynedd",   state: "PA", zip: "19002", phone: "(215) 542-1544",     ownerPct: 0.016230 },
      { id: "own-7010-judi1", name: "Judith K. Langsfeld",                                                                        vendorCode: "JUDI1", address: "1673 Paper Mill Road", city: "Meadowbrook",    state: "PA", zip: "19046", phone: "(215) 947-5097",     ownerPct: 0.023380 },
      { id: "own-7010-lawr2", name: "Lawrence Isard",          detailedName: "IRR TR- MC Isard 07/28/20 FBO Lawrence Isard",     vendorCode: "LAWR2", address: "901 N. Penn Street", city: "Philadelphia",    state: "PA", zip: "19123",                              ownerPct: 0.075000 },
      { id: "own-7010-mark2", name: "Mark Langsfeld",          detailedName: "Mark Langsfeld 1982 Trust",                        vendorCode: "MARK2", address: "1085 Herkness Drive", city: "Meadowbrook",    state: "PA", zip: "19046", phone: "(215) 886-0784",     ownerPct: 0.016230 },
      { id: "own-7010-ssgst", name: "Susan Korman Schurr",            detailedName: "LIK GST TR FBO Susan Schurr",                      vendorCode: "SSGST", address: "6100 Sheaff Lane",   city: "Ft. washington", state: "PA", zip: "19034",                              ownerPct: 0.049463 },
      { id: "own-7010-susat", name: "Susan Korman Schurr",  detailedName: "Susan J Korman Schurr Revocable Trust",            vendorCode: "SUSAT", address: "1035 3rd Ave South", city: "Naples",          state: "FL", zip: "24102",                              ownerPct: 0.016230 },
      { id: "own-7010-tru1",  name: "Jeffrey Honickman",       detailedName: "Tr U/I 3 SJK FBO Jeffery Honickman",               vendorCode: "TRU/1",                                                                                                                  ownerPct: 0.040000 },
      { id: "own-7010-tru2",  name: "Shirley Honickman Hahn",  detailedName: "Tr U/I 3 SJK FBO Shirley Honickman Hahn",          vendorCode: "TRU/2",                                                                                                                  ownerPct: 0.040000 },
      { id: "own-7010-tru3",  name: "Bradley J. Korman",             detailedName: "Tr U/I3 U/W SJK FBO Steven Korman / BJK",          vendorCode: "TRU/3",                                                                                                                  ownerPct: 0.040000 },
      { id: "own-7010-tru4",  name: "Lawrence M. Korman",            detailedName: "Tr U/I3 U/W SJK FBO Steven Korman / LMK",          vendorCode: "TRU/4",                                                                                                                  ownerPct: 0.040000 },
      { id: "own-7010-tru5",  name: "Mark G. Korman",             detailedName: "Tr U/I3 U/W SJK FBO Steven Korman / MGK",          vendorCode: "TRU/5",                                                                                                                  ownerPct: 0.040000 },
    ],
  },

  // ─── K-1 distributions ───────────────────────────────────────────────────
  {
    propertyCode: "2070",
    hasK1Distribution: true,
    owners: [
      { id: "k1-2070-schurr",  name: "Susan Korman Schurr",   address: "6100 Sheaff Ln", city: "Fort Washington", state: "PA", zip: "19034" },
      { id: "k1-2070-altman",  name: "Catherine Korman Altman" },
      { id: "k1-2070-korman",  name: "Alison Korman Feldman" },
      { id: "k1-2070-segal",   name: "Gerald Segal"   },
      { id: "k1-2070-saul",    name: "Saul XXX"       },
    ],
  },

  {
    propertyCode: "7200",
    hasK1Distribution: true,
    owners: [
      { id: "k1-7200-langsfeld-1",  name: "Judith K. Langsfeld",      vendorCode: "TRFO2", detailedName: "U/W of Max Korman",                                                                                              address: "1673 Paper Mill Road",               city: "Meadowbrook",      state: "Pennsylvania", zip: "19046", phone: "(215) 947-5097",          profitPct: 0.093820200, lossPct: 0.093820200, capitalPct: 0.093820200 },
      { id: "k1-7200-skorman",      name: "Steven H. Korman",         vendorCode: "STEV1",                                                                                                                                            address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462",                                profitPct: 0.019452200, lossPct: 0.019452200, capitalPct: 0.019452200 },
      { id: "k1-7200-lhonickman",   name: "Lynne Honickman",          vendorCode: "LYNN1", detailedName: "C/o The Honickman Co., Eric Pisauro",                                                                            address: "c/o Honickman Co · 8275 N. Cresent Blvd.", city: "Pennsauken",      state: "New Jersey",   zip: "08110", stateIfDifferent: "Pennsylvania", profitPct: 0.019452200, lossPct: 0.019452200, capitalPct: 0.019452200 },
      { id: "k1-7200-jhonickman-1", name: "Jeffrey Honickman",        vendorCode: "JEFF1", detailedName: "Lynne Honickman FBO Jeffrey Honickman",                                                                          address: "c/o Honickman Co · 8275 N. Cresent Blvd.", city: "Pennsauken",      state: "New Jersey",   zip: "08110", stateIfDifferent: "Pennsylvania", profitPct: 0.004863000, lossPct: 0.004863000, capitalPct: 0.004863000 },
      { id: "k1-7200-hahn-1",       name: "Shirley Honickman Hahn",   vendorCode: "SHIR1", detailedName: "DTD 9/29/89, C/O The Honickman Co.",                                                                              address: "c/o Honickman Co · 8275 N. Cresent Blvd.", city: "Pennsauken",      state: "New Jersey",   zip: "08110", phone: "(310) 858-2579",          profitPct: 0.004863000, lossPct: 0.004863000, capitalPct: 0.004863000 },
      { id: "k1-7200-jkorman-1",    name: "John P. Korman",           vendorCode: "JOHN1",                                                                                                                                              address: "805 Penllyn Pike",                   city: "Lower Gwynedd",    state: "Pennsylvania", zip: "19002", phone: "(215) 542-1544",          profitPct: 0.004863000, lossPct: 0.004863000, capitalPct: 0.004863000 },
      { id: "k1-7200-feldman-1",    name: "Alison Korman Feldman",    vendorCode: "ALIS1",                                                                                                                                            address: "6015 Sheaff Ln",                     city: "Fort Washington",  state: "Pennsylvania", zip: "19034",                                profitPct: 0.004863000, lossPct: 0.004863000, capitalPct: 0.004863000 },
      { id: "k1-7200-lkorman",      name: "Lawrence M. Korman",       vendorCode: "TRU/4", detailedName: "GST Exempt Trust U/I 3 U/W SJK FBO Steven H. Korman/LMK",                                                        address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", stateIfDifferent: "Various",     profitPct: 0.056292180, lossPct: 0.056292180, capitalPct: 0.056292180 },
      { id: "k1-7200-bkorman",      name: "Bradley J. Korman",        vendorCode: "TRU/3", detailedName: "GST Exempt Trust U/I 3 U/W SJK FBO Steven H. Korman/BJK",                                                        address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", stateIfDifferent: "Various",     profitPct: 0.056292180, lossPct: 0.056292180, capitalPct: 0.056292180 },
      { id: "k1-7200-mkorman",      name: "Mark G. Korman",           vendorCode: "TRU/5", detailedName: "GST Exempt Trust U/I 3 U/W SJK FBO Steven H. Korman/MGK",                                                        address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", stateIfDifferent: "Various",     profitPct: 0.056292180, lossPct: 0.056292180, capitalPct: 0.056292180 },
      { id: "k1-7200-jhonickman-2", name: "Jeffrey Honickman",        vendorCode: "TRU/1", detailedName: "GST Exempt Trust U/I 3 UWO Samuel Korman FBO LRH/Jeffrey Honickman c/o the honickman co, 8275 N. Cresent Blvd", address: "c/o Honickman Co · 8275 N. Cresent Blvd.", city: "Pennsauken",      state: "New Jersey",   zip: "08110", stateIfDifferent: "Various",     profitPct: 0.056292180, lossPct: 0.056292180, capitalPct: 0.056292180 },
      { id: "k1-7200-hahn-2",       name: "Shirley Honickman Hahn",   vendorCode: "TRU/2", detailedName: "GST Exempt Trust U/I 3 UWO Samuel Korman FBO LRH/Shirley Honickman Hahn",                                       address: "c/o Honickman Co · 8275 N. Cresent Blvd.", city: "Pennsauken",      state: "New Jersey",   zip: "08110",                                profitPct: 0.056292180, lossPct: 0.056292180, capitalPct: 0.056292180 },
      { id: "k1-7200-sohn",         name: "Joan R. Sohn",             vendorCode: "JOAN1", detailedName: "Joan Sohn C/O Baker Tilly US, LLP",                                                                              address: "1650 Market St., Suite 4500",        city: "Philadelphia",     state: "Pennsylvania", zip: "19103", stateIfDifferent: "Various",     profitPct: 0.320365300, lossPct: 0.320365300, capitalPct: 0.320365300 },
      { id: "k1-7200-langsfeld-2",  name: "Judith K. Langsfeld",      vendorCode: "JUDI1", detailedName: "Judith Langsfeld",                                                                                                address: "1673 Paper Mill Road",               city: "Meadowbrook",      state: "Pennsylvania", zip: "19046", phone: "(215) 947-5097",          profitPct: 0.019452200, lossPct: 0.019452200, capitalPct: 0.019452200 },
      { id: "k1-7200-bkorman-tua",  name: "Berton E. Korman",         vendorCode: "BERT4", detailedName: "Berton E Korman TUA Dtd 02232018 As Amended",                                                                     address: "C/O 410 Lancaster Ave, Suite 5a",    city: "Haverford",        state: "Pennsylvania", zip: "19041", stateIfDifferent: "Various",     profitPct: 0.019452200, lossPct: 0.019452200, capitalPct: 0.019452200 },
      { id: "k1-7200-jkorman-2",    name: "John P. Korman",           vendorCode: "T7JPK", detailedName: "Max WM Korman TUW Item 7th FBO John P Korman Trust",                                                              address: "C/o 410 Lancaster Ave, Suite 5a",    city: "Haverford",        state: "Pennsylvania", zip: "19041",                                profitPct: 0.031273433, lossPct: 0.031273433, capitalPct: 0.031273433 },
      { id: "k1-7200-jameskorman",  name: "James S. Korman",          vendorCode: "T7JSK", detailedName: "Max WM Korman TUW Item 7th FBO James S Korman Trust",                                                             address: "C/O 410 Lancaster Ave, Suite 5a",    city: "Haverford",        state: "Pennsylvania", zip: "19041",                                profitPct: 0.031273433, lossPct: 0.031273433, capitalPct: 0.031273433 },
      { id: "k1-7200-jacobs",       name: "Carolyn Korman Jacobs",    vendorCode: "T7CKJ", detailedName: "Max WM Korman TUW Item 7th FBO Carolyn K Jacobs Trust",                                                           address: "C/O 410 Lancaster Ave, Suite 5a",    city: "Haverford",        state: "Pennsylvania", zip: "19041",                                profitPct: 0.031273434, lossPct: 0.031273434, capitalPct: 0.031273434 },
      { id: "k1-7200-afeldman-lik", name: "Alison Korman Feldman",    vendorCode: "AKGST", detailedName: "Leonard I Korman GST Subject TR FBO Alison Feldman",                                                              address: "6015 Sheaff Lane",                   city: "Fort Washington",  state: "Pennsylvania", zip: "19034", stateIfDifferent: "Florida",     profitPct: 0.006484067, lossPct: 0.006484067, capitalPct: 0.006484067 },
      { id: "k1-7200-altman-lik",   name: "Catherine Korman Altman",  vendorCode: "CAGST", detailedName: "Leonard I Korman GST Subject TR FBO Catherine Altman",                                                            address: "210 Eagle Drive",                    city: "Jupiter",          state: "Florida",      zip: "33477",                                profitPct: 0.006484067, lossPct: 0.006484067, capitalPct: 0.006484067 },
      { id: "k1-7200-schurr-lik",   name: "Susan Korman Schurr",      vendorCode: "SSGST", detailedName: "Leonard I Korman GST Subject TR FBO Susan Schurr",                                                                address: "6100 Sheaff Ln",                     city: "Fort Washington",  state: "PA",           zip: "19034",                                profitPct: 0.006484066, lossPct: 0.006484066, capitalPct: 0.006484066 },
      { id: "k1-7200-feldman-maxwm",name: "Alison Korman Feldman",    vendorCode: "T7AKF", detailedName: "Trust Under Item Seventh of the Will of Max Korman FBO Alison K. Feldman",                                       address: "6015 Sheaff Ln",                     city: "Fort Washington",  state: "Pennsylvania", zip: "19034",                                profitPct: 0.031273433, lossPct: 0.031273433, capitalPct: 0.031273433 },
      { id: "k1-7200-altman-maxwm", name: "Catherine Korman Altman",  vendorCode: "T7CKA", detailedName: "Trust Under Item Seventh of the Will of Max Korman FBO Catherine Altman",                                        address: "210 Eagle Drive",                    city: "Jupiter",          state: "Pennsylvania", zip: "33477",                                profitPct: 0.031273433, lossPct: 0.031273433, capitalPct: 0.031273433 },
      { id: "k1-7200-schurr-maxwm", name: "Susan Korman Schurr",      vendorCode: "T7SKS", detailedName: "Trust Under Item Seventh of the Will of Max Korman FBO Susan Schurr",                                            address: "6100 Sheaff Ln",                     city: "Fort Washington",  state: "PA",           zip: "19034",                                profitPct: 0.031273434, lossPct: 0.031273434, capitalPct: 0.031273434 },
    ],
  },

  {
    propertyCode: "9510",
    hasK1Distribution: true,
    owners: [
      { id: "k1-9510-feldman",     name: "Alison Korman Feldman", detailedName: "Friedman Appointive TR FBO Alison K Feldman UAR JFK RVOC TR",  address: "1650 Market Street, STE 2800", city: "Philadelphia",    state: "Pennsylvania",  zip: "19103", stateIfDifferent: "Florida", profitPct: 0.166700000, lossPct: 0.166700000, capitalPct: 0.166700000 },
      { id: "k1-9510-altman",      name: "Catherine Korman Altman",      detailedName: "Friedman Appointive TR FBO Catherine K Altman UAR JFK RVOC TR", address: "1650 Market Street, STE 2800", city: "Philadelphia",    state: "Pennsylvania",  zip: "19103", stateIfDifferent: "Florida", profitPct: 0.166700000, lossPct: 0.166700000, capitalPct: 0.166700000 },
      { id: "k1-9510-schurr",      name: "Susan Korman Schurr",          detailedName: "Friedman Appointive TR FBO Susan K Schurr UAR JFK RVOC TR",     address: "6100 Sheaff Ln",               city: "Fort Washington", state: "PA",            zip: "19034",                                profitPct: 0.166600000, lossPct: 0.166600000, capitalPct: 0.166600000 },
      { id: "k1-9510-egoldenberg", name: "Elizabeth Goldenberg",  detailedName: "Elizabeth M. Goldenberg Trust",                                  address: "194 Hoffman Road",             city: "Tully",           state: "New York",      zip: "13159", stateIfDifferent: "Florida", profitPct: 0.166700000, lossPct: 0.166700000, capitalPct: 0.166700000 },
      { id: "k1-9510-jgoldenberg", name: "James Goldenberg",      detailedName: "James B. Goldenberg Trust",                                      address: "20 Marshall Street",           city: "Duxbury",         state: "Massachusetts", zip: "02332", stateIfDifferent: "Florida", profitPct: 0.166700000, lossPct: 0.166700000, capitalPct: 0.166700000 },
      { id: "k1-9510-wgoldenberg", name: "William Goldenberg",    detailedName: "William J. Goldenberg Trust",                                    address: "31 Bens Landing Road",         city: "Boothbay",        state: "Maine",         zip: "04537", stateIfDifferent: "Florida", profitPct: 0.166600000, lossPct: 0.166600000, capitalPct: 0.166600000 },
    ],
  },

  {
    propertyCode: "7300",
    hasK1Distribution: true,
    owners: [
      { id: "k1-7300-langsfeld", name: "Judith K. Langsfeld",      vendorCode: "JUDI2", detailedName: "Judith K. Langsfeld 1942 Trust",          address: "1673 Paper Mill Road",                     city: "Meadowbrook",   state: "Pennsylvania", zip: "19046", profitPct: 0.187400000, lossPct: 0.187400000, capitalPct: 0.187400000 },
      { id: "k1-7300-sohn",      name: "Joan R. Sohn",             vendorCode: "JOAN2", detailedName: "Joan R. Sohn 1942 Trust · C/O Baker Tilly US, LLP",                  address: "1650 Market St., Suite 4500",     city: "Philadelphia",  state: "Pennsylvania", zip: "19103", profitPct: 0.374800000, lossPct: 0.374800000, capitalPct: 0.374800000 },
      { id: "k1-7300-honickman", name: "Lynne Honickman",          vendorCode: "LYNN2", detailedName: "Lynne Honickman 1942 Trust · C/O The Honickman Co., Eric D. Pisauro", address: "c/o Honickman Co · 8275 N. Crescent Blvd.", city: "Pennsauken",   state: "New Jersey",   zip: "08110", profitPct: 0.187400000, lossPct: 0.187400000, capitalPct: 0.187400000 },
      { id: "k1-7300-aisard",    name: "Amy C Isard",              vendorCode: "AMYC1",                                                                                     address: "c/o Stephen Isard",              city: "Philadelphia",  state: "Pennsylvania", zip: "19102", profitPct: 0.031300000, lossPct: 0.031300000, capitalPct: 0.031300000 },
      { id: "k1-7300-misard",    name: "Michael A Isard",          vendorCode: "MICH2",                                                                                     address: "160 Russ Street",                city: "San Francisco", state: "California",   zip: "94103", profitPct: 0.031300000, lossPct: 0.031300000, capitalPct: 0.031300000 },
      { id: "k1-7300-agisard",   name: "Alexander G Isard",        vendorCode: "ALEX2",                                                                                     address: "2317 East York Street",          city: "Philadelphia",  state: "Pennsylvania", zip: "19125", profitPct: 0.031300000, lossPct: 0.031300000, capitalPct: 0.031300000 },
      { id: "k1-7300-bkisard",   name: "Brendan K Isard",          vendorCode: "BREN1",                                                                                     address: "757 Columbus Parkway",           city: "Buffalo",       state: "New York",     zip: "14213", profitPct: 0.031300000, lossPct: 0.031300000, capitalPct: 0.031300000 },
      { id: "k1-7300-lisard",    name: "Lawrence Isard",           vendorCode: "LAWR2", detailedName: "Irrev At Margaret C Isard Dtd 7-28-20",   address: "901 N. Penn Street Unit P-1401", city: "Philadelphia",  state: "Pennsylvania", zip: "19123", profitPct: 0.062600000, lossPct: 0.062600000, capitalPct: 0.062600000 },
      { id: "k1-7300-cisard",    name: "Carol Isard",              vendorCode: "CARO3", detailedName: "Irrev At Margaret C Isard Dtd 7-28-20",   address: "8603 Prospect Avenue",           city: "Philadelphia",  state: "Pennsylvania", zip: "19118", profitPct: 0.062600000, lossPct: 0.062600000, capitalPct: 0.062600000 },
    ],
  },

  {
    propertyCode: "9800",
    hasK1Distribution: true,
    owners: [
      { id: "k1-9800-feldman",  name: "Alison Korman Feldman", address: "6015 Sheaff Ln", city: "Fort Washington", state: "Pennsylvania", zip: "19034", profitPct: 0.750000000, lossPct: 0.750000000, capitalPct: 0.750000000 },
      { id: "k1-9800-hfeldman", name: "Harry Feldman",         address: "7524 Fir Rd",    city: "Ambler",          state: "Pennsylvania", zip: "19002", profitPct: 0.250000000, lossPct: 0.250000000, capitalPct: 0.250000000 },
    ],
  },

  {
    propertyCode: "9820",
    hasK1Distribution: true,
    owners: [
      { id: "k1-9820-feldman",  name: "Alison Korman Feldman", address: "6015 Sheaff Ln", city: "Fort Washington", state: "Pennsylvania", zip: "19034", profitPct: 0.750000000, lossPct: 0.750000000, capitalPct: 0.750000000 },
      { id: "k1-9820-hfeldman", name: "Harry Feldman",         address: "7524 Fir Rd",    city: "Ambler",          state: "Pennsylvania", zip: "19002", profitPct: 0.250000000, lossPct: 0.250000000, capitalPct: 0.250000000 },
    ],
  },

  {
    propertyCode: "9840",
    hasK1Distribution: true,
    owners: [
      { id: "k1-9840-feldman", name: "Alison Korman Feldman", address: "6015 Sheaff Ln", city: "Fort Washington", state: "Pennsylvania", zip: "19034", profitPct: 1.000000000, lossPct: 1.000000000, capitalPct: 1.000000000 },
    ],
  },

  {
    propertyCode: "9860",
    hasK1Distribution: true,
    owners: [
      { id: "k1-9860-feldman",  name: "Alison Korman Feldman", address: "6015 Sheaff Ln", city: "Fort Washington", state: "Pennsylvania", zip: "19034", profitPct: 0.750000000, lossPct: 0.750000000, capitalPct: 0.750000000 },
      { id: "k1-9860-hfeldman", name: "Harry Feldman",         address: "7524 Fir Rd",    city: "Ambler",          state: "Pennsylvania", zip: "19002", profitPct: 0.250000000, lossPct: 0.250000000, capitalPct: 0.250000000 },
    ],
  },
];

export function getOwnersForProperty(propertyCode: string): PropertyOwner[] {
  const entry = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === propertyCode);
  return entry?.owners ?? [];
}
