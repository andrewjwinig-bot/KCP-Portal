import { describe, expect, it } from "vitest";
import { floorplateFor, floorplateSvg, floorplateUrl } from "./floorplate";

describe("a listing's quick floorplate", () => {
  it("finds a mapped suite's floor and greys out the rest of it", () => {
    const hit = floorplateFor("3610-101");
    expect(hit?.floor.floor).toBe("1");
    const svg = floorplateSvg(hit!.floor, hit!.suite, "data:image/webp;base64,AA", "Suite 101");
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain("Suite 101");
    expect(floorplateUrl("3610-101")).toBe("/api/website/floorplate?unit=3610-101");
  });
  it("a suite no floor maps has none", () => {
    expect(floorplateFor("40A0-204")).toBeNull();
    expect(floorplateUrl("9999-1")).toBeNull();
  });
});
