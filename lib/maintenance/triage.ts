// Keyword-based auto-triage for inbound maintenance descriptions.
//
// Single source of truth for the rules — edit RULES below to tune.
//
// Algorithm:
//   1. Lowercase the description (regexes are already /i, but the lowercased
//      string is what we scan).
//   2. Walk RULES in order. For every regex that matches, collect the rule's
//      category and (optional) priority.
//   3. Output: up to 3 unique categories in match order, and the strongest
//      priority observed (High > Medium > Low). Empty arrays / "" when
//      nothing matches.
//
// Greg can always override on the request modal — these defaults are just
// to save him a click on the obvious ones.

import type { RequestCategory, RequestPriority } from "@/lib/maintenance/requests";

type Rule = {
  re: RegExp;
  category: RequestCategory;
  /** If this rule fires, bump priority to at least this value. */
  priority?: RequestPriority;
};

// Categories aliased to keep the table narrow.
const Electrical: RequestCategory = "Electrical";
const Plumbing: RequestCategory = "Plumbing";
const HVAC: RequestCategory = "HVAC";
const General: RequestCategory = "General Repairs";
const Cleaning: RequestCategory = "Cleaning / Janitorial";
const Lighting: RequestCategory = "Lighting";
const Doors: RequestCategory = "Doors / Locks";
const Windows: RequestCategory = "Windows / Glass";
const Pest: RequestCategory = "Pest Control";
const Safety: RequestCategory = "Safety / Compliance";
const Exterior: RequestCategory = "Exterior Maintenance";
const Interior: RequestCategory = "Interior Maintenance";
const Access: RequestCategory = "Access Request";
const Move: RequestCategory = "Move-In / Move-Out";
const Noise: RequestCategory = "Noise Complaint";
const Landscaping: RequestCategory = "Landscaping";
const Trash: RequestCategory = "Trash / Waste";

export const RULES: Rule[] = [
  // ── Safety / Compliance ── always High; checked first so it wins
  { re: /\b(fire|smoke detector|smoke alarm|carbon monoxide|gas (leak|smell)|smell(ing)? gas)\b/i,                                  category: Safety,   priority: "High" },
  { re: /\b(emergency|hazard(ous)?|danger(ous)?|unsafe|injur(y|ed|ies))\b/i,                                                       category: Safety,   priority: "High" },

  // ── Elevator ── always High (safety + accessibility)
  { re: /\b(elevator|lift)s?\s*(stuck|broken|out|down|not working|won'?t)?/i,                                                      category: General,  priority: "High" },

  // ── Plumbing ── water damage risk → High on the strong signals
  { re: /\b(leak(s|ing|ed)?|flood(s|ing|ed)?|overflow(s|ing|ed)?|burst(ing)? pipe|water (damage|main))\b/i,                        category: Plumbing, priority: "High" },
  { re: /\b(sewage|sewer back(s|ed|ing)? up|back(ed|ing) up the (toilet|drain))\b/i,                                               category: Plumbing, priority: "High" },
  { re: /\b(toilet (clogged|won'?t flush|broken|overflow(ing|ed)?))\b/i,                                                           category: Plumbing, priority: "High" },
  { re: /\b(no (water|hot water)|water heater (broken|out|not working))\b/i,                                                       category: Plumbing, priority: "High" },
  { re: /\b(faucet|sink|drain|pipes?|plumb(ing|er)|garbage disposal|dishwasher (leak|drain))\b/i,                                  category: Plumbing },
  { re: /\b(toilet|urinal|shower|bathtub)\b/i,                                                                                     category: Plumbing },

  // ── Electrical ── High on power/spark/burn signals
  { re: /\b(no power|power (is )?out|outage|spark(s|ing)?|exposed wire|electrical fire|burning smell)\b/i,                          category: Electrical, priority: "High" },
  { re: /\b(smoke (from|coming out of)( an?)? outlet)\b/i,                                                                          category: Electrical, priority: "High" },
  { re: /\b(breaker (tripped|won'?t reset)|short(ed)? circuit)\b/i,                                                                 category: Electrical, priority: "High" },
  { re: /\b(breaker|fuse|outlet|electric(al|ity)?|wir(e|ing)|circuit)\b/i,                                                          category: Electrical },

  // ── HVAC ── High when nothing is working
  { re: /\b(no (heat|ac|air|cooling|a\/c)|heat(er|ing)?( is)? (not|isn'?t) working|ac (not|isn'?t) working|hvac (down|broken|out))\b/i, category: HVAC, priority: "High" },
  { re: /\b(thermostat|hvac|heater|heating|cooling|air condition(ing|er)|vent(ilation|s)?|furnace|boiler)\b/i,                      category: HVAC },

  // ── Doors / Locks ── security signals are High
  { re: /\b(locked out|can'?t lock|won'?t lock|broken lock|deadbolt (broken|stuck)|key (stuck|broken)|security (concern|issue|breach))\b/i, category: Doors, priority: "High" },
  { re: /\b(door|lock|hinge|knob|handle|latch|keypad|key fob|card reader)\b/i,                                                     category: Doors },

  // ── Windows / Glass ── broken/shatter → High
  { re: /\b(broken (window|glass)|shatter(ed)? (window|glass|pane)?|cracked (window|glass))\b/i,                                   category: Windows, priority: "High" },
  { re: /\b(window(s|pane)?|glass|pane)\b/i,                                                                                       category: Windows },

  // ── Lighting
  { re: /\b(light(s|ing)?|bulb|fixture|fluorescent|led)\b/i,                                                                       category: Lighting },

  // ── Pest control
  { re: /\b(pest|rodent|rats?|mouse|mice|roach(es)?|cockroach|ants?|bugs?|spider|termites?|infestation|exterminat(or|e|ion))\b/i,  category: Pest },

  // ── Cleaning / Janitorial
  { re: /\b(clean(ing|er)?|janitorial|sanitiz(e|ation)|dust(y|ing)?|stain|spill)\b/i,                                              category: Cleaning },

  // ── Trash / Waste
  { re: /\b(trash|garbage|dumpster|recycl(e|ing)|waste bin|compactor)\b/i,                                                          category: Trash },

  // ── Landscaping
  { re: /\b(landscap(e|ing)|grass|lawn|tree|bush(es)?|mulch|sprinkler|irrigation|snow (removal|plow|shovel))\b/i,                  category: Landscaping },

  // ── Exterior — roof leak is High
  { re: /\b(roof (leak|leaking|leaks)|roof( is)? leaking)\b/i,                                                                     category: Exterior, priority: "High" },
  { re: /\b(parking lot|sidewalk|exterior|outside|roof|gutter|drainage|asphalt|pothole|facade)\b/i,                                category: Exterior },

  // ── Noise
  { re: /\b(noise|loud|disturb(ance|ing)?|noisy|construction noise)\b/i,                                                            category: Noise },

  // ── Move
  { re: /\b(move-?in|move-?out|moving (in|out))\b/i,                                                                                category: Move },

  // ── Access
  { re: /\b(access|key ?card|key ?fob|badge|entry pass)\b/i,                                                                        category: Access },

  // ── Interior generic (last so more specific rules win first)
  { re: /\b(paint|drywall|ceiling tile|ceiling|carpet|floor(ing)?|wall(s)?|tile)\b/i,                                              category: Interior },
];

const PRIORITY_RANK: Record<RequestPriority, number> = { Low: 1, Medium: 2, High: 3 };

export type TriageResult = {
  categories: RequestCategory[];
  priority: RequestPriority | "";
};

/** Classify a free-text maintenance description into category + priority. */
export function classify(text: string): TriageResult {
  if (!text || !text.trim()) return { categories: [], priority: "" };
  const hay = text.toLowerCase();
  const seen = new Set<RequestCategory>();
  const categories: RequestCategory[] = [];
  let priority: RequestPriority | "" = "";

  for (const rule of RULES) {
    if (!rule.re.test(hay)) continue;
    if (!seen.has(rule.category) && categories.length < 3) {
      seen.add(rule.category);
      categories.push(rule.category);
    }
    if (rule.priority) {
      if (!priority || PRIORITY_RANK[rule.priority] > PRIORITY_RANK[priority]) {
        priority = rule.priority;
      }
    }
  }

  return { categories, priority };
}
