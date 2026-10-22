import { describe, it, expect, afterEach } from "vitest";
import { rm } from "fs/promises";
import path from "path";
import { createCollectionStore, scopedCollection, createMapStore } from "./collectionStore";
import { storeJSON } from "@/lib/storage";

// Runs against the local-filesystem storage backend (no BLOB token in tests).
type Rec = { id: string; value: number };
const cleanupPrefixes = new Set<string>();
const dataDir = (prefix: string) => path.join(process.cwd(), "data", prefix);

afterEach(async () => {
  for (const p of cleanupPrefixes) await rm(dataDir(p), { recursive: true, force: true });
  cleanupPrefixes.clear();
});

describe("createCollectionStore", () => {
  it("stores, reads, lists, and removes per-record", async () => {
    const prefix = `test-coll-${Date.now()}-a`;
    cleanupPrefixes.add(prefix);
    const store = createCollectionStore<Rec>({ prefix, keyOf: (r) => r.id });

    await store.set("alpha", { id: "alpha", value: 1 });
    await store.set("beta", { id: "beta", value: 2 });

    expect(await store.get("alpha")).toEqual({ id: "alpha", value: 1 });
    expect((await store.all()).map((r) => r.id).sort()).toEqual(["alpha", "beta"]);

    await store.remove("alpha");
    expect(await store.get("alpha")).toBeNull();
    expect((await store.all()).map((r) => r.id)).toEqual(["beta"]);
  });

  it("concurrent writes to different records never clobber each other", async () => {
    const prefix = `test-coll-${Date.now()}-b`;
    cleanupPrefixes.add(prefix);
    const store = createCollectionStore<Rec>({ prefix, keyOf: (r) => r.id });

    // The exact scenario that lost data before: many edits firing at once.
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => store.set(`k${i}`, { id: `k${i}`, value: i })),
    );
    const all = await store.all();
    expect(all.length).toBe(25);
    expect(new Set(all.map((r) => r.id)).size).toBe(25);
  });

  it("keys that sanitize alike stay distinct", async () => {
    const prefix = `test-coll-${Date.now()}-c`;
    cleanupPrefixes.add(prefix);
    const store = createCollectionStore<Rec>({ prefix, keyOf: (r) => r.id });
    await store.set("A/B", { id: "A/B", value: 1 });
    await store.set("A-B", { id: "A-B", value: 2 });
    expect(await store.get("A/B")).toEqual({ id: "A/B", value: 1 });
    expect(await store.get("A-B")).toEqual({ id: "A-B", value: 2 });
    expect((await store.all()).length).toBe(2);
  });

  it("migrates a legacy single-blob manifest then retires it", async () => {
    const prefix = `test-coll-${Date.now()}-d`;
    const legacyPrefix = `test-coll-${Date.now()}-d-legacy`;
    cleanupPrefixes.add(prefix);
    cleanupPrefixes.add(legacyPrefix);
    // Seed a legacy manifest holding a whole array.
    await storeJSON(legacyPrefix, "all", { configs: [{ id: "x", value: 10 }, { id: "y", value: 20 }] });

    const store = createCollectionStore<Rec>({
      prefix,
      keyOf: (r) => r.id,
      legacy: { prefix: legacyPrefix, id: "all", extract: (b: any) => b?.configs ?? [] },
    });

    // First read migrates the legacy records into per-record blobs.
    expect((await store.all()).map((r) => r.id).sort()).toEqual(["x", "y"]);
    expect(await store.get("x")).toEqual({ id: "x", value: 10 });
    // A subsequent per-record edit survives, and the legacy blob is gone.
    await store.set("x", { id: "x", value: 11 });
    expect(await store.get("x")).toEqual({ id: "x", value: 11 });
    const { getJSON } = await import("@/lib/storage");
    expect(await getJSON(legacyPrefix, "all")).toBeNull();
  });

  it("createMapStore: per-key map, concurrent writes, legacy migration", async () => {
    const prefix = `test-map-${Date.now()}-a`;
    const legacyPrefix = `test-map-${Date.now()}-a-legacy`;
    cleanupPrefixes.add(prefix);
    cleanupPrefixes.add(legacyPrefix);
    await storeJSON(legacyPrefix, "all", { facts: { p1: { v: 1 }, p2: { v: 2 } } });

    const m = createMapStore<{ v: number }>({
      prefix,
      legacy: { prefix: legacyPrefix, id: "all", extract: (b: any) => b?.facts ?? {} },
    });
    // Migrates the legacy map.
    expect(await m.all()).toEqual({ p1: { v: 1 }, p2: { v: 2 } });
    // Concurrent writes to different keys all survive.
    await Promise.all(Array.from({ length: 20 }, (_, i) => m.set(`q${i}`, { v: i })));
    const all = await m.all();
    expect(Object.keys(all).length).toBe(22); // p1,p2 + 20
    expect(await m.get("q5")).toEqual({ v: 5 });
    await m.remove("q5");
    expect(await m.get("q5")).toBeNull();
  });

  it("scopedCollection isolates records by scope", async () => {
    const prefix = `test-coll-${Date.now()}-e`;
    cleanupPrefixes.add(prefix);
    const coll = scopedCollection<Rec>({ prefix, keyOf: (r) => r.id });
    await coll.forScope("1100-2026").set("a", { id: "a", value: 1 });
    await coll.forScope("2300-2026").set("a", { id: "a", value: 2 });
    expect(await coll.forScope("1100-2026").get("a")).toEqual({ id: "a", value: 1 });
    expect(await coll.forScope("2300-2026").get("a")).toEqual({ id: "a", value: 2 });
    expect((await coll.forScope("1100-2026").all()).length).toBe(1);
  });
});
