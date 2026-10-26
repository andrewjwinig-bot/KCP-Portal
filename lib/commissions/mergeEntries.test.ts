import { describe, it, expect } from "vitest";
import { mergeEntries } from "./mergeEntries";

const e = (id: string, v = 0) => ({ id, v });

describe("mergeEntries", () => {
  it("a page that loaded nothing cannot wipe the stored list", () => {
    expect(mergeEntries([e("a"), e("b")], [e("c")], []).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("deletes only what the page had and dropped", () => {
    expect(mergeEntries([e("a"), e("b")], [e("a")], ["a", "b"]).map((x) => x.id)).toEqual(["a"]);
  });
  it("keeps an entry another tab added, and applies this page's edit", () => {
    const r = mergeEntries([e("a"), e("x")], [e("a", 5)], ["a"]);
    expect(r).toEqual([e("a", 5), e("x")]);
  });
});
