import { describe, expect, it } from "vitest";
import { chosenTurn, planRotation } from "./floorplanTurn";

// Shapes from the Interplex floor plans on file (10/2026).
describe("planRotation", () => {
  it("turns a sideways sheet on a portrait page a quarter counter-clockwise", () => {
    // 40A0-201: 612×792, no /Rotate, lettering drawn as lines, reading downward.
    expect(planRotation({ width: 612, height: 792, rotate: 0 })).toBe(270);
  });
  it("leaves a landscape page, and a page its own /Rotate already turns", () => {
    expect(planRotation({ width: 792, height: 612, rotate: 0 })).toBe(0);
    // 4050-101: a portrait page /Rotate 90 → displays landscape.
    expect(planRotation({ width: 612, height: 792, rotate: 90 })).toBe(90);
  });
  it("reads real text across, whatever the page shape", () => {
    // 3640-105: /Rotate 270 and its text runs at 270 — already reads across.
    expect(planRotation({ width: 612, height: 792, rotate: 270, angles: [{ angle: 270, weight: 279 }] })).toBe(270);
    // Text running bottom-to-top on an unrotated landscape page.
    expect(planRotation({ width: 792, height: 612, rotate: 0, angles: [{ angle: 90, weight: 300 }] })).toBe(90);
    // Upright text on a portrait page stays upright.
    expect(planRotation({ width: 612, height: 792, rotate: 0, angles: [{ angle: 0, weight: 400 }, { angle: 90, weight: 12 }] })).toBe(0);
  });
  it("ignores a stray label or two", () => {
    expect(planRotation({ width: 612, height: 792, rotate: 0, angles: [{ angle: 0, weight: 8 }] })).toBe(270);
  });
  it("takes a turn chosen by hand on top of the page's /Rotate", () => {
    expect(planRotation({ width: 612, height: 792, rotate: 0, turn: 270 })).toBe(270);
    expect(planRotation({ width: 612, height: 792, rotate: 90, turn: 0 })).toBe(90);
    expect(planRotation({ width: 612, height: 792, rotate: 90, turn: 180 })).toBe(270);
  });
  it("is self-contained, so the website can carry its source", () => {
    const fn = new Function(`return (${planRotation.toString()})`)();
    expect(fn({ width: 612, height: 792, rotate: 0 })).toBe(270);
  });
});

describe("chosenTurn", () => {
  it("a saved turn beats the seed; a new upload goes back to the rule", () => {
    expect(chosenTurn("40A0-204", { name: "Kor Center A Suite 204_ 1,863 rsf.pdf" })).toBe(90);
    expect(chosenTurn("40A0-204", { name: "Kor Center A Suite 204_ 1,863 rsf.pdf", turn: 90 })).toBe(90);
    expect(chosenTurn("40A0-204", { name: "new.pdf" })).toBeUndefined();
    expect(chosenTurn("3610-304", { name: "One Neshaminy Suite 304_2026.pdf" })).toBe(0);
  });
});
