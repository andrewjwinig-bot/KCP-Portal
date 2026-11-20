// Which way up a floor-plan PDF is drawn (client-safe, pure). The suite
// drawings come as sheets laid on their side on a portrait page — title block
// down the left, the plan reading sideways — so drawn as-is they read
// sideways (owner: "ensure that they are always oriented properly"). The
// website and the unit page both draw a plan through `planRotation`, so the
// unit page shows exactly how the website will.

export type Turn = 0 | 90 | 180 | 270;

export const TURNS: Turn[] = [0, 90, 180, 270];

export const isTurn = (n: unknown): n is Turn => n === 0 || n === 90 || n === 180 || n === 270;

/** A turn chosen by hand for a plan already on file, before the control
 *  existed — keyed `<unit ref>|<file name>`, so a new upload goes back to the
 *  rule. A turn saved on the plan (`SuiteAttachment.turn`) beats it. */
const TURN_SEED: Record<string, Turn> = {
  // A portrait sheet whose drawing really is upright.
  "3610-304|One Neshaminy Suite 304_2026.pdf": 0,
  // Laid on its side the other way — title block down the right.
  "40A0-204|Kor Center A Suite 204_ 1,863 rsf.pdf": 90,
};

/** The turn chosen for this plan by hand, if any; undefined → the rule. */
export function chosenTurn(unitRef: string, fp: { name: string; turn?: unknown } | null | undefined): Turn | undefined {
  if (!fp) return undefined;
  if (isTurn(fp.turn)) return fp.turn;
  return TURN_SEED[`${unitRef.toUpperCase()}|${fp.name}`];
}

/** The rotation to hand pdf.js (`page.getViewport({ rotation })`, ABSOLUTE
 *  clockwise degrees), from the page as pdf.js sees it:
 *  - a turn chosen by hand is taken on top of the page's own /Rotate;
 *  - else, where the page carries real text, the turn that makes its text
 *    read across (`angles`: each text run's angle in PDF user space,
 *    counter-clockwise, weighted by its length);
 *  - else a page that DISPLAYS portrait is a sideways sheet: a quarter turn
 *    COUNTER-clockwise — their lettering runs top to bottom with the title
 *    block down the left, and the turn puts it along the bottom, as every
 *    landscape sheet in the set has it (10 of the 12 portrait plans on file).
 *  SELF-CONTAINED ON PURPOSE: the website's script carries this function's
 *  own source (`planRotation.toString()`, injected by the Interplex render),
 *  so it may reference nothing outside itself. */
export function planRotation(page: {
  width: number; height: number; rotate: number;
  angles?: { angle: number; weight: number }[];
  turn?: number | null;
}): number {
  const r = ((Math.round(page.rotate / 90) * 90) % 360 + 360) % 360;
  const wrap = (n: number) => ((Math.round(n / 90) * 90) % 360 + 360) % 360;
  if (page.turn === 0 || page.turn === 90 || page.turn === 180 || page.turn === 270) return wrap(r + page.turn);
  const by: Record<number, number> = {};
  let total = 0;
  for (const a of page.angles || []) {
    const d = wrap(a.angle - r);
    by[d] = (by[d] || 0) + a.weight;
    total += a.weight;
  }
  if (total >= 20) {
    let best = 0;
    for (const k of Object.keys(by)) if (by[+k] > (by[best] || 0)) best = +k;
    return wrap(r + best);
  }
  const portrait = r % 180 === 0 ? page.height > page.width : page.width > page.height;
  return portrait ? wrap(r + 270) : r;
}

/** The part of the sheet the website shows — the suite itself, drawn large
 *  (owner: "crop out all the excess stuff and just show the actual suite
 *  floorplan larger"); the whole sheet stays one click away. Fractions of the
 *  page AS DRAWN at `rotation` (the absolute pdf.js rotation it was drawn at),
 *  so a crop never applies to a plan turned another way since. Chosen by hand
 *  on the unit page: an automatic crop was tried on the 42 plans on file and
 *  cut into the suite on too many of them. */
export type PlanCrop = { x: number; y: number; w: number; h: number; rotation: number };

export function isPlanCrop(c: unknown): c is PlanCrop {
  if (!c || typeof c !== "object") return false;
  const { x, y, w, h, rotation } = c as Record<string, unknown>;
  const f = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  return f(x) && f(y) && f(w) && f(h) && (w as number) > 0.02 && (h as number) > 0.02
    && (x as number) + (w as number) <= 1.0001 && (y as number) + (h as number) <= 1.0001
    && (rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270);
}

/** The crop to draw at this rotation, or null (none, or chosen at another turn). */
export function cropAt(crop: unknown, rotation: number): PlanCrop | null {
  return isPlanCrop(crop) && crop.rotation === rotation ? crop : null;
}
