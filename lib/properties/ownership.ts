import type { PropType } from "./data";
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
  /**
   * When this partner is ITSELF a partnership or company, its own partners.
   *
   * Their `ownerPct` is a share of THIS OWNER, not of the property — an
   * investor's effective interest in the property is `sub.ownerPct ×
   * owner.ownerPct`. Their K-1 is issued by this entity, not by the property,
   * which is why they are shown for value attribution but are not K-1 upload
   * targets on the property's roster.
   */
  subOwners?: PropertyOwner[];
  profitPct?: number;
  lossPct?: number;
  capitalPct?: number;
}

export interface PropertyOwnership {
  /** Property code, e.g. "1100", "7200". */
  propertyCode: string;
  /** Optional display label; otherwise PROPERTY_DEFS lookup is used. */
  propertyName?: string;
  /**
   * Category, for an entity the property directory does not carry.
   *
   * An entity that files its own return is not always a building: Lincoln
   * Subsidiary Joint Venture III owns the three Neshaminy office buildings
   * rather than being one, so the directory has 3610/3620/3640 and not 3600.
   * Absent from the directory it fell to "Misc", which grouped an office park
   * with the odds and ends. The type is a fact about the entity, so it is
   * recorded here beside its name rather than by adding a phantom building to
   * the directory.
   */
  propertyType?: PropType;
  /** Whether this property files K-1 distributions (drives Filing Tracker). */
  hasK1Distribution?: boolean;
  owners: PropertyOwner[];
}

/**
 * The Eastwick / airport ownership chain.
 *
 * Three properties are held by the same small set of entities in different
 * proportions — Airport Interplex Two (0300), Eastwick Development JV XII
 * (9200) and Eastwick JV I (1500) — so the entities are defined once here and
 * composed per property. Three hand-kept copies of a twenty-row chain is how
 * they quietly stop agreeing.
 *
 * Ids are prefixed per property throughout, because an id is a K-1 upload
 * target and a Filing Tracker key: each property issues its own K-1s and must
 * never share a row with another.
 *
 * SHAPE: an entity heads a band with its share of the PROPERTY; its investors
 * sit beneath with their share of THAT ENTITY, never of the property. Steven
 * Korman holds a third of The Korman Co — which is 75% of 1500, so 25% of it,
 * and 74.5% of 0300, so 24.8% of that.
 */
function kormanCoInvestors(p: string): PropertyOwner[] {
  return [
    { id: `${p}-stev1`, name: "Steven H. Korman", address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", ownerPct: 0.333333 },
    { id: `${p}-akgst`, name: "Alison Korman Feldman", detailedName: "Leonard I Korman GST Subject TR FBO Alison Feldman", address: "6015 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.111111 },
    { id: `${p}-cagst`, name: "Catherine Korman Altman", detailedName: "Leonard I Korman GST Subject TR FBO Catherine Altman", address: "241 A South 6th St.", city: "Philadelphia", state: "PA", zip: "19106", ownerPct: 0.111111 },
    { id: `${p}-ssgst`, name: "Susan Korman Schurr", detailedName: "Leonard I Korman GST Subject TR FBO Susan Schurr", address: "6100 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.111112 },
    // Keyed as the trusts themselves. The schedule's beneficiary column names a
    // person for the GST Subject trusts but merely repeats the trust for these
    // two, so it does not say whose interest they are — and Berton E. Korman
    // has died, so attributing them to him would group two further K-1s behind
    // a link in the name of someone who cannot receive it.
    { id: `${p}-bk2012`, name: "The Berton E Korman 2012 Family Trust", ownerPct: 0.231333 },
    { id: `${p}-bkirr`, name: "The Berton E Korman Irrev TR Dtd 03031999", ownerPct: 0.102000 },
  ];
}

/**
 * Hyman Korman Company's own shareholders — twenty-four of them.
 *
 * HKC holds interests in several partnerships (0800 at 80%, 3600 at 70.857%,
 * 4000 at 0.209%) and its shareholder roster is its OWN: the same people in
 * the same proportions whatever it holds. Defined once here so the copies
 * cannot drift.
 *
 * The id SUFFIXES are preserved exactly as 0800 first keyed them, because an
 * id is a K-1 upload target and a Filing Tracker key — renaming one would
 * orphan a document already attached to it. Only the prefix varies, giving
 * each property its own set.
 */
function hymanKormanCoInvestors(p: string): PropertyOwner[] {
  return [
            { id: `${p}-lawrence-m-korman-dba4ef`, name: "Lawrence M. Korman", detailedName: "GST EXEMPT TRUST U/I 3 U/W SJK FBO STEVEN H. KORMAN/LMK", ownerPct: 0.054693 },
            { id: `${p}-bradley-j-korman-ae45ab`, name: "Bradley J. Korman", detailedName: "GST EXEMPT TRUST U/I 3 U/W SJK FBO STEVEN H. KORMAN/BJK", ownerPct: 0.054693 },
            { id: `${p}-mark-g-korman-10fda2`, name: "Mark G. Korman", detailedName: "GST EXEMPT TRUST U/I 3 U/W SJK FBO STEVEN H. KORMAN/MGK", ownerPct: 0.054693 },
            { id: `${p}-jeffrey-honickman-d0e7c8`, name: "Jeffrey Honickman", detailedName: "GST EXEMPT TRUST U/I 3 U/W SJK FBO LYNNE HONICKMAN/JAH", ownerPct: 0.054693 },
            { id: `${p}-shirley-honickman-hahn-c39344`, name: "Shirley Honickman Hahn", detailedName: "GST EXEMPT TRUST U/I 3 U/W SJK FBO LYNNE HONICKMAN/SAH", ownerPct: 0.054692 },
            { id: `${p}-joan-r-sohn-a7230e`, name: "Joan R. Sohn", detailedName: "JOAN SOHN", ownerPct: 0.265496 },
            { id: `${p}-joan-r-sohn-4d7a34`, name: "Joan R. Sohn", detailedName: "RESIDUAL TRUST U/W I. B.  S. R. MOSS FBO JOAN SOHN", ownerPct: 0.038829 },
            { id: `${p}-berton-e-korman-fd04d7`, name: "Berton E. Korman", detailedName: "BERTON E KORMAN TUA  as amended", ownerPct: 0.026005 },
            { id: `${p}-alison-korman-feldman-99b3a2`, name: "Alison Korman Feldman", detailedName: "LEONARD I KORMAN GST SUBJECT TR FBO ALISON FELDMAN", ownerPct: 0.008668 },
            { id: `${p}-catherine-korman-altman-113d18`, name: "Catherine Korman Altman", detailedName: "LEONARD I KORMAN GST SUBJECT TR FBO CATHERINE ALTMAN", ownerPct: 0.008668 },
            { id: `${p}-susan-korman-schurr-36d3e9`, name: "Susan Korman Schurr", detailedName: "LEONARD I KORMAN GST SUBJECT TR FBO SUSAN SCHURR", ownerPct: 0.008668 },
            { id: `${p}-steven-h-korman-a1a668`, name: "Steven H. Korman", detailedName: "STEVEN H. KORMAN", ownerPct: 0.026005 },
            { id: `${p}-lynne-honickman-547796`, name: "Lynne Honickman", detailedName: "LYNNE HONICKMAN", ownerPct: 0.016644 },
            { id: `${p}-judith-k-langsfeld-dc0e90`, name: "Judith K. Langsfeld", detailedName: "JUDITH K. LANGSFELD eff. 04/19/10", ownerPct: 0.016644 },
            { id: `${p}-john-p-korman-597afb`, name: "John P. Korman", detailedName: "JOHN KORMAN - TRUST U/W OF MAX KORMAN", ownerPct: 0.030385 },
            { id: `${p}-carolyn-korman-jacobs-669c8b`, name: "Carolyn Korman Jacobs", detailedName: "CAROLYN K JACOBS - TRUST U/W OF MAX KORMAN", ownerPct: 0.030385 },
            { id: `${p}-james-s-korman-2fa4ab`, name: "James S. Korman", detailedName: "JAMES KORMAN - TRUST U/W OF MAX KORMAN", ownerPct: 0.030385 },
            { id: `${p}-alison-korman-feldman-8654df`, name: "Alison Korman Feldman", detailedName: "LEONARD I KORMAN GST SUBJECT TR FBO ALISON FELDMAN", ownerPct: 0.030385 },
            { id: `${p}-susan-korman-schurr-182730`, name: "Susan Korman Schurr", detailedName: "LIK SUBJECT FBO SUSAN K SCHURR", ownerPct: 0.030385 },
            { id: `${p}-catherine-korman-altman-7523e9`, name: "Catherine Korman Altman", detailedName: "LIK SUBJECT FBO CATHERINE K ALTMAN", ownerPct: 0.030385 },
            { id: `${p}-judith-k-langsfeld-77e3dd`, name: "Judith K. Langsfeld", detailedName: "JUDITH K. LANGSFELD-TRUST U/W OF MAX W. KORMAN", ownerPct: 0.091155 },
            { id: `${p}-joan-r-sohn-b99c78`, name: "Joan R. Sohn", detailedName: "JOAN SOHN (42 TRUST)", ownerPct: 0.018721 },
            { id: `${p}-judith-k-langsfeld-f60163`, name: "Judith K. Langsfeld", detailedName: "JUDITH K. LANGSFELD (42 TRUST)", ownerPct: 0.009361 },
            { id: `${p}-lynne-honickman-dde0f5`, name: "Lynne Honickman", detailedName: "LYNNE HONICKMAN (42 TRUST)", ownerPct: 0.009361 },
  ];
}

/** Hyman Korman Co. holding a property directly, at `pct` of it. */
function hymanKormanCoPartner(prefix: string, pct: number): PropertyOwner {
  return {
    id: `${prefix}-hkc`,
    name: "Hyman Korman Co.",
    detailedName: "HYMAN KORMAN COMPANY",
    ownerPct: pct,
    subOwners: hymanKormanCoInvestors(`${prefix}-hkc`),
  };
}

/** The Korman Co holding a property directly, at `pct` of it. */
function kormanCoPartner(prefix: string, pct: number): PropertyOwner {
  return { id: `${prefix}-kormanco`, name: "The Korman Co", ownerPct: pct, subOwners: kormanCoInvestors(`${prefix}-kc`) };
}

/** New Eastwick Corporation: Reynolds Metals, and The Korman Co again behind
 *  it. That inner 9.6% is a further slice of the property for the same
 *  company — carried so the chain is complete in the data, though the roster
 *  draws two tiers. */
function newEastwickPartner(prefix: string, pct: number): PropertyOwner {
  return {
    id: `${prefix}-neweastwick`,
    name: "New Eastwick Corporation",
    ownerPct: pct,
    subOwners: [
      { id: `${prefix}-ne-reynolds`, name: "Reynolds Metals Company", ownerPct: 0.904000 },
      { id: `${prefix}-ne-kormanco`, name: "The Korman Co", ownerPct: 0.096000, subOwners: kormanCoInvestors(`${prefix}-ne-kc`) },
    ],
  };
}

/** Airport Interplex Two, Inc. as a partner — the corporate general partner,
 *  a half point, which is what a GP interest usually looks like.
 *
 *  Its own investors total 99.990%, not 100%: the schedule rounds to three
 *  decimals and two thirds plus three ninths do not survive it. Keyed as it
 *  reads. */
function airportInterplexIncPartner(prefix: string, pct: number): PropertyOwner {
  return {
    id: `${prefix}-aitwo`,
    name: "Airport Interplex Two, Inc.",
    ownerPct: pct,
    subOwners: [
      // Held through his Trust Under Agreement, which survives him — the trust
      // is the partner, and the K-1 goes to its trustee.
      { id: `${prefix}-aitwo-bert4`, name: "Berton E. Korman", detailedName: "Berton E Korman TUA Dtd 02232018", address: "410 Lancaster Ave", city: "Haverford", state: "PA", zip: "19041", ownerPct: 0.333300 },
      { id: `${prefix}-aitwo-stev1`, name: "Steven H. Korman", address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", ownerPct: 0.333300 },
      { id: `${prefix}-aitwo-akgst`, name: "Alison Korman Feldman", detailedName: "Leonard I Korman GST Subject TR FBO Alison Feldman", address: "6015 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.111100 },
      { id: `${prefix}-aitwo-cagst`, name: "Catherine Korman Altman", detailedName: "Leonard I Korman GST Subject TR FBO Catherine Altman", address: "241 A South 6th St.", city: "Philadelphia", state: "PA", zip: "19106", ownerPct: 0.111100 },
      { id: `${prefix}-aitwo-ssgst`, name: "Susan Korman Schurr", detailedName: "Leonard I Korman GST Subject TR FBO Susan Schurr", address: "6100 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.111100 },
    ],
  };
}

/** 0300 and 9200: the Inc. as GP, then The Korman Co and New Eastwick. */
function eastwickAirportOwners(prefix: string): PropertyOwner[] {
  return [
    airportInterplexIncPartner(prefix, 0.005000),
    kormanCoPartner(prefix, 0.745000),
    newEastwickPartner(prefix, 0.250000),
  ];
}

/** 1500 Eastwick JV I: the same two companies, no GP interest. */
function eastwickJvOneOwners(prefix: string): PropertyOwner[] {
  return [kormanCoPartner(prefix, 0.750000), newEastwickPartner(prefix, 0.250000)];
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
    // Brookwood distributes: two partners, two K-1s. Without this flag the
    // property is absent from the K-1 picker entirely — the API lists only
    // partnerships marked here — so there was nowhere to drop its K-1s and no
    // task for them on the tax tracker.
    hasK1Distribution: true,
    owners: [
      { id: "own-2300-hyma1", name: "Hyman Korman Co.", vendorCode: "HYMA1", ownerPct: 0.475 },
      { id: "own-2300-thek1", name: "The Korman Co",    vendorCode: "THEK1", ownerPct: 0.525 },
    ],
  },

  {
    propertyCode: "4500",
    // Grays Ferry distributes to eleven partners. Unflagged, the property was
    // absent from the K-1 picker entirely — the API lists only partnerships
    // marked here — so there was nowhere to drop its K-1s.
    hasK1Distribution: true,
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
    hasK1Distribution: true,
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
    // Interstate Business Park (Bellmawr, NJ). Keyed from the property's own
    // K-1 schedule, NOT derived from `beneficiaries.ts` — that map is already
    // fragmented through to the end investors and has no Hyman Korman Company
    // in it at all, which is how an earlier derived version came to be wrong.
    //
    // Two tiers, because that is the real structure: Hyman Korman Company is a
    // partner holding 80%, and fourteen trusts hold the other 20% directly.
    // HKC's own 24 partners hang off it as `subOwners` — shares of HKC, so an
    // investor's effective interest in the property is that × 80%.
    propertyCode: "0800",
    hasK1Distribution: true,
    owners: [
      {
        id: "own-0800-hyman-korman-co",
        name: "Hyman Korman Co.",
        detailedName: "HYMAN KORMAN COMPANY",
        ownerPct: 0.80,
        subOwners: hymanKormanCoInvestors("own-0800-hkc"),
      },
      { id: "own-0800-joan-r-sohn-be66f0", name: "Joan R. Sohn", detailedName: "RESIDUAL TRUST U/W I. B. & S. R. MOSS FBO JOAN SOHN", ownerPct: 0.03 },
      { id: "own-0800-lawrence-m-korman-13b96a", name: "Lawrence M. Korman", detailedName: "GST EXEMPT TRUST U/I 3 U/W SJK FBO STEVEN H. KORMAN/LMK", ownerPct: 0.014 },
      { id: "own-0800-bradley-j-korman-9c0448", name: "Bradley J. Korman", detailedName: "GST EXEMPT TRUST U/I 3 U/W SJK FBO STEVEN H. KORMAN/BJK", ownerPct: 0.014 },
      { id: "own-0800-mark-g-korman-59db3a", name: "Mark G. Korman", detailedName: "GST EXEMPT TRUST U/I 3 U/W SJK FBO STEVEN H. KORMAN/MGK", ownerPct: 0.014 },
      { id: "own-0800-jeffrey-honickman-b25275", name: "Jeffrey Honickman", detailedName: "GST EXEMPT TRUST U/I 3 U/W SJK FBO LYNNE HONICKMAN/JAH", ownerPct: 0.014 },
      { id: "own-0800-shirley-honickman-hahn-946d85", name: "Shirley Honickman Hahn", detailedName: "GST EXEMPT TRUST U/I 3 U/W SJK FBO LYNNE HONICKMAN/SAH", ownerPct: 0.014 },
      { id: "own-0800-alison-korman-feldman-d979fe", name: "Alison Korman Feldman", detailedName: "TRUST U/I 7TH WILL OF MK FBO ALISON K FELDMAN", ownerPct: 0.007766667 },
      { id: "own-0800-susan-korman-schurr-5828d2", name: "Susan Korman Schurr", detailedName: "TRUST U/I 7TH WILL OF MK FBO SUSAN SCHURR", ownerPct: 0.007766667 },
      { id: "own-0800-catherine-korman-altman-a564bc", name: "Catherine Korman Altman", detailedName: "TRUST U/I 7TH WILL OF MK FBO CATHERINE ALTMAN", ownerPct: 0.007766667 },
      { id: "own-0800-judith-k-langsfeld-d2013d", name: "Judith K. Langsfeld", detailedName: "J. K. LANGSFELD - TRUST U/W OF MAX W KORMAN", ownerPct: 0.0234 },
      { id: "own-0800-john-p-korman-22ef3d", name: "John P. Korman", detailedName: "TRUST U/I 7TH WILL OF MK FBO JOHN P KORMAN", ownerPct: 0.007766667 },
      { id: "own-0800-james-s-korman-75a2cb", name: "James S. Korman", detailedName: "TRUST U/I 7TH WILL OF MK FBO JAMES S KORMAN", ownerPct: 0.007766667 },
      { id: "own-0800-carolyn-korman-jacobs-576e12", name: "Carolyn Korman Jacobs", detailedName: "TRUST U/I 7TH WILL OF MK FBO CAROLYN K JACOBS", ownerPct: 0.007766667 },
      { id: "own-0800-joan-r-sohn-74501f", name: "Joan R. Sohn", detailedName: "JOAN SOHN (PRIOR ESTATE OF SARAH MOSS)", ownerPct: 0.03 },
    ],
  },

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
    // AIRPORT INTERPLEX TWO, INC. — an S-corporation that files its OWN return
    // (Form 1120-S) and issues these five K-1s. It is NOT the joint venture.
    //
    // This was keyed as the JV for a while and it was wrong. The schedule it
    // came from describes EASTWICK DEVELOPMENT JV XII — that is 9200 — and the
    // Inc appears INSIDE it as a 0.50% partner heading a band of its own five
    // shareholders. Both entities are on the one sheet, which is what made it
    // read as a single structure. ENTITY_VALUES has always kept them apart:
    // 0300 is the Inc at $5,983, 9200 the JV at $396,227.
    //
    // Same shape as 4510 Grays Ferry — a small corporate GP that files
    // separately from the partnership it holds an interest in. It still
    // appears as a 0.50% partner of 9200, where it takes that partnership's
    // K-1; these five are the ones IT issues.
    //
    // Ids are the ORIGINAL ones from when 0300 was first keyed flat. An id is
    // a K-1 upload target, so restoring them reconnects any document uploaded
    // against them rather than leaving it orphaned.
    //
    // 99.99% is what the schedule totals and it is left as printed. The
    // missing hundredth is rounding in the source, not a shareholder we are
    // short of — inventing one to reach a round number hides which it is.
    propertyCode: "0300",
    propertyName: "Airport Interplex Two, Inc.",
    hasK1Distribution: true,
    owners: [
      // The trust is the shareholder — Berton E. Korman has died — and its K-1
      // goes to its trustee. Named "Berton E. Korman" with the trust as the
      // held-as, matching his five other interests: keying the trust wording
      // as the NAME split one trust across two identities and would have
      // issued it TWO links and TWO PINs, with half its K-1s behind each.
      { id: "k1-0300-bert4",  name: "Berton E. Korman", detailedName: "Berton E Korman TUA Dtd 02232018", address: "410 Lancaster Ave", city: "Haverford", state: "PA", zip: "19041", ownerPct: 0.333300 },
      { id: "k1-0300-stev1",  name: "Steven H. Korman", address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", ownerPct: 0.333300 },
      { id: "k1-0300-akgsts", name: "Alison Korman Feldman", detailedName: "Leonard I Korman GST Subject TR FBO Alison Feldman", address: "6015 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.111100 },
      { id: "k1-0300-cagsts", name: "Catherine Korman Altman", detailedName: "Leonard I Korman GST Subject TR FBO Catherine Altman", address: "241 A South 6th St.", city: "Philadelphia", state: "PA", zip: "19106", ownerPct: 0.111100 },
      { id: "k1-0300-ssgsts", name: "Susan Korman Schurr", detailedName: "Leonard I Korman GST Subject TR FBO Susan Schurr", address: "6100 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.111100 },
    ],
  },

  {
    // Lincoln Subsidiary Joint Venture III — the Neshaminy Interplex buildings
    // 1, 2 and 4. Two corporate partners, each collapsing to its own investors.
    //
    // Not in PROPERTY_DEFS: the directory carries the three BUILDINGS (3610,
    // 3620, 3640) and 3600 is the joint venture that owns them, which files
    // the return and issues the K-1s. So it names itself here, the way 4510
    // does.
    propertyCode: "3600",
    propertyName: "Lincoln Subsidiary Joint Venture III",
    // It owns the three Neshaminy office buildings, so it belongs with them
    // rather than in Misc with the odd entities.
    propertyType: "Office",
    hasK1Distribution: true,
    owners: [
      hymanKormanCoPartner("k1-3600", 0.708570),
      kormanCoPartner("k1-3600", 0.291430),
    ],
  },

  {
    // The Office Works. An even split between the two family companies —
    // Hyman Korman Co. and The Korman Co, half each — so two K-1s are issued
    // by the property and the thirty people behind them are served by those
    // companies' own returns.
    //
    // The 50/50 is CORROBORATED, not just keyed. The beneficiary map reached
    // 4900 from the other direction years ago, and every one of its thirty
    // rows is exactly half that person's share of their company: Lawrence
    // Korman holds 5.4693% of HKC and 2.73465% of 4900; Steven Korman holds
    // 33.3333% of The Korman Co and 16.666665% of 4900. Two independently
    // sourced maps agreeing to the fifth decimal is about as much evidence as
    // an ownership figure here ever gets.
    propertyCode: "4900",
    hasK1Distribution: true,
    owners: [
      hymanKormanCoPartner("k1-4900", 0.5),
      kormanCoPartner("k1-4900", 0.5),
    ],
  },


  {
    // Cherrywood Joint Venture. Twenty-three partners, all holding DIRECTLY —
    // no entity tier, so every row is a K-1 the partnership issues itself.
    //
    // Keyed from the partnership's own schedule. The beneficiary map reached
    // CWD independently and carries the same twenty-three rows at the same
    // percentages, which is unusual: normally that map is a look-through and
    // cannot substitute for a partner roster. Here the two levels coincide
    // because nothing sits between the partnership and its partners.
    //
    // Names are the app's canonical ones, with the schedule's own wording kept
    // as `detailedName` where it differs. That matters beyond tidiness: one
    // link per investor groups by NAME, so keying "Shirley Hahn" rather than
    // "Shirley Honickman Hahn" would hand her a SECOND link and PIN for the
    // same person, and her Cherrywood K-1 would not appear alongside the rest.
    //
    // Eight partners appear nowhere else in the portfolio — Sarah Drotman,
    // Mauri Honickman, Henry Hahn, Alec / Nicole / Jackson Korman, and the two
    // foundations — so they have no contact details on file yet.
    propertyCode: "CWD",
    propertyName: "Cherrywood Joint Venture",
    hasK1Distribution: true,
    owners: [
      { id: "k1-cwd-joan-r-sohn", name: "Joan R. Sohn", detailedName: "JOAN SOHN (from Estate of Sarah)", ownerPct: 0.333333333 },
      { id: "k1-cwd-john-p-korman", name: "John P. Korman", detailedName: "ITEM 7 TRUST FBO John P Korman Trust", ownerPct: 0.03703704 },
      { id: "k1-cwd-james-s-korman", name: "James S. Korman", detailedName: "ITEM 7 TRUST FBO James S Korman Trust", ownerPct: 0.03703704 },
      { id: "k1-cwd-carolyn-korman-jacobs", name: "Carolyn Korman Jacobs", detailedName: "ITEM 7 TRUST FBO Caroline K Jacobs Trust", ownerPct: 0.03703703 },
      { id: "k1-cwd-alison-korman-feldman", name: "Alison Korman Feldman", detailedName: "LEONARD I KORMAN GST SUBJECT TR FBO ALISON FELDMAN", ownerPct: 0.037037037 },
      { id: "k1-cwd-susan-korman-schurr", name: "Susan Korman Schurr", detailedName: "LEONARD I KORMAN GST SUBJECT TR FBO SUSAN SCHURR", ownerPct: 0.037037036 },
      { id: "k1-cwd-catherine-korman-altman", name: "Catherine Korman Altman", detailedName: "LEONARD I KORMAN GST SUBJECT TR FBO CATHERINE ALTMAN", ownerPct: 0.037037037 },
      { id: "k1-cwd-judith-k-langsfeld", name: "Judith K. Langsfeld", detailedName: "ITEM 5 GST FOR JUDITH K. LANGSFELD U/W Matilda Korman", ownerPct: 0.11111111 },
      { id: "k1-cwd-lynne-honickman", name: "Lynne Honickman", ownerPct: 0.00833333 },
      { id: "k1-cwd-jeffrey-honickman", name: "Jeffrey Honickman", ownerPct: 0.00833333 },
      { id: "k1-cwd-sarah-drotman", name: "Sarah Drotman", ownerPct: 0.00833333 },
      { id: "k1-cwd-mauri-honickman", name: "Mauri Honickman", ownerPct: 0.00833333 },
      { id: "k1-cwd-shirley-honickman-hahn", name: "Shirley Honickman Hahn", ownerPct: 0.016666666 },
      { id: "k1-cwd-the-honickman-foundation", name: "The Honickman Foundation", ownerPct: 0.108333339 },
      { id: "k1-cwd-the-steven-h-korman-family", name: "The Steven H Korman Family Foundation", ownerPct: 0.108333339 },
      { id: "k1-cwd-henry-hahn", name: "Henry Hahn", ownerPct: 0.00833333 },
      { id: "k1-cwd-steven-h-korman", name: "Steven H. Korman", ownerPct: 0.00833333 },
      { id: "k1-cwd-lawrence-m-korman", name: "Lawrence M. Korman", ownerPct: 0.00833333 },
      { id: "k1-cwd-alec-korman", name: "Alec Korman", ownerPct: 0.00833333 },
      { id: "k1-cwd-nicole-korman", name: "Nicole Korman", ownerPct: 0.00833333 },
      { id: "k1-cwd-bradley-j-korman", name: "Bradley J. Korman", ownerPct: 0.00833333 },
      { id: "k1-cwd-jackson-korman", name: "Jackson Korman", ownerPct: 0.00833333 },
      { id: "k1-cwd-mark-g-korman", name: "Mark G. Korman", ownerPct: 0.00833333 },
    ],
  },
  {
    // Whitpain Associates. The Korman Co holds three quarters; the remaining
    // quarter is held DIRECTLY by five partners, not through a company — so
    // five K-1s come off the property alongside the company's one.
    //
    // The five look like The Korman Co's own investor list and are not: the
    // company's Berton interest is two trusts (the 2012 Family Trust and the
    // 1999 Irrevocable), while the direct quarter carries a single BERTON E
    // KORMAN TUA DTD 02232018. A separate trust, a separate K-1 — reading the
    // two lists as the same one would post his K-1 to the wrong trust.
    //
    // Their percentages are of the PROPERTY, as the schedule prints them, and
    // the quarter is exact: 2 × 1/12 + 3 × 1/36 = 1/4.
    //
    // Cross-checked against the beneficiary map, which reached WHIT from the
    // other direction: it carries both tiers — Steven Korman at 25% through
    // the company AND 8.3333% directly — and $133,228 ÷ 8.3333% returns the
    // $1,598,741 equity the statement of values already holds for Whitpain.
    //
    // Not in PROPERTY_DEFS: it files the return and issues the K-1s without
    // being a building in the directory, so it names itself the way 3600 and
    // 4510 do.
    propertyCode: "WHIT",
    propertyName: "Whitpain Associates",
    hasK1Distribution: true,
    owners: [
      kormanCoPartner("k1-whit", 0.75),
      { id: "k1-whit-stev1", name: "Steven H. Korman", address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", ownerPct: 0.0833333 },
      // Same trust as his other six interests, so the same name — see 0300.
      // The schedule's beneficiary column repeats the trust rather than naming
      // a person, which is what this held-as records.
      { id: "k1-whit-bktua", name: "Berton E. Korman", detailedName: "Berton E Korman TUA Dtd 02232018", address: "410 Lancaster Ave", city: "Haverford", state: "PA", zip: "19041", ownerPct: 0.0833333 },
      { id: "k1-whit-akgst", name: "Alison Korman Feldman", detailedName: "Leonard I Korman GST Subject TR FBO Alison Feldman", address: "6015 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.0277778 },
      { id: "k1-whit-cagst", name: "Catherine Korman Altman", detailedName: "Leonard I Korman GST Subject TR FBO Catherine Altman", address: "241 A South 6th St.", city: "Philadelphia", state: "PA", zip: "19106", ownerPct: 0.0277778 },
      { id: "k1-whit-ssgst", name: "Susan Korman Schurr", detailedName: "Leonard I Korman GST Subject TR FBO Susan Schurr", address: "6100 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.0277778 },
    ],
  },

  {
    // Neshaminy Interplex MM LP. Three LIK GST Subject trusts hold a third
    // each; Steven Korman and LIK Management take a third of a point apiece,
    // and Hyman Korman Co. holds the small remainder.
    //
    // The 0.209% is DERIVED, not stated: the schedule lists the five below and
    // says the rest is HKC, and 100 − 99.791 = 0.209. Recorded here because a
    // figure nobody wrote down is the one that gets silently "corrected" later.
    propertyCode: "4000",
    hasK1Distribution: true,
    owners: [
      { id: "k1-4000-akgst", name: "Alison Korman Feldman", detailedName: "Leonard I Korman GST Subject TR FBO Alison Feldman", address: "6015 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.330354 },
      { id: "k1-4000-ssgst", name: "Susan Korman Schurr", detailedName: "Leonard I Korman GST Subject TR FBO Susan Schurr", address: "6100 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.330353 },
      { id: "k1-4000-cagst", name: "Catherine Korman Altman", detailedName: "Leonard I Korman GST Subject TR FBO Catherine Altman", address: "241 A South 6th St.", city: "Philadelphia", state: "PA", zip: "19106", ownerPct: 0.330353 },
      { id: "k1-4000-stev1", name: "Steven H. Korman", address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", ownerPct: 0.003425 },
      {
        // A company, so it collapses like the others rather than being listed
        // under its beneficiary's name. 2010's own roster is Alison Korman
        // Feldman at 100%, which is who the schedule names behind it.
        id: "k1-4000-lik",
        name: "LIK Management, Inc.",
        detailedName: "LIK-SS LLC",
        ownerPct: 0.003425,
        subOwners: [
          { id: "k1-4000-lik-alis1", name: "Alison Korman Feldman", address: "6015 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 1 },
        ],
      },
      hymanKormanCoPartner("k1-4000", 0.002090),
    ],
  },

  {
    // Grays Ferry SC Assoc., Inc. — the corporate GP of Grays Ferry Partners
    // LP (4500), where it already sits as a 0.10% owner. It files its OWN
    // return and issues K-1s to its own five shareholders, which is why it
    // needs a roster of its own: a sub-owner is not an upload target, so
    // without this there was nowhere to drop those five.
    //
    // Deliberately NOT in PROPERTY_DEFS. It owns no real estate and has no
    // place in the property directory — `propertyName` below is what the
    // Investor Info roster and the K-1 picker read instead.
    //
    // Deliberately NOT in ENTITY_VALUES either. Its $9,682 is 0.10% of 4500's
    // $9,681,628 and is already inside that entity's equity; a row of its own
    // would double-count it, which is exactly what 9200 did to 0300.
    propertyCode: "4510",
    propertyName: "Grays Ferry SC Assoc., Inc. (GP)",
    hasK1Distribution: true,
    owners: [
      { id: "k1-4510-stev1", name: "Steven H. Korman", address: "580 West Germantown Pike Suite 200", city: "Plymouth Meeting", state: "Pennsylvania", zip: "19462", ownerPct: 0.333333 },
      // Held through his Trust Under Agreement, which survives him.
      { id: "k1-4510-bert4", name: "Berton E. Korman", detailedName: "Berton E Korman TUA Dtd 02232018", address: "410 Lancaster Ave", city: "Haverford", state: "PA", zip: "19041", ownerPct: 0.333333 },
      { id: "k1-4510-akgst", name: "Alison Korman Feldman", detailedName: "Leonard I Korman GST Subject TR FBO Alison Feldman", address: "6015 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.111111 },
      { id: "k1-4510-ssgst", name: "Susan Korman Schurr", detailedName: "Leonard I Korman GST Subject TR FBO Susan Schurr", address: "6100 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", ownerPct: 0.111111 },
      { id: "k1-4510-cagst", name: "Catherine Korman Altman", detailedName: "Leonard I Korman GST Subject TR FBO Catherine Altman", address: "241 A South 6th St.", city: "Philadelphia", state: "PA", zip: "19106", ownerPct: 0.111111 },
    ],
  },

  {
    // Eastwick JV I — the same two companies as 9200 and 0300, without the
    // Airport Interplex Two GP interest. 75/25 rather than 74.5/25/0.5.
    //
    // The schedule's dollars ($401,544 + $133,848 = $535,392) tie exactly to
    // what ENTITY_VALUES carries for 1500, so unlike the 0300/9200 sheet this
    // one describes a single entity and nothing is double-counted.
    propertyCode: "1500",
    hasK1Distribution: true,
    owners: eastwickJvOneOwners("k1-1500"),
  },

  {
    // Eastwick Development JV XII — the same ownership chain as 0300, which is
    // why the schedule covers both at once.
    propertyCode: "9200",
    hasK1Distribution: true,
    owners: eastwickAirportOwners("k1-9200"),
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

/** Distinct owner name(s) for a property code — for search indexing so a
 *  property is findable by its owning entity (e.g. 5600 by "Hyman Korman Co"). */
export function ownerNamesForProperty(propertyCode: string): string[] {
  const owners = getOwnersForProperty(propertyCode);
  return [...new Set(owners.map((o) => o.name.trim()).filter(Boolean))];
}

/** The owning-entity label for the directory card: the sole owner's name when a
 *  property is wholly owned by one entity, else null (multi-owner properties
 *  show their owners on the detail page instead of cluttering the card). */
export function soleOwnerName(propertyCode: string): string | null {
  const owners = getOwnersForProperty(propertyCode);
  return owners.length === 1 ? owners[0].name.trim() : null;
}
