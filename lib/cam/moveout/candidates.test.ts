import { describe, it, expect, vi } from "vitest";

// Registries: make "2300" a retail-reconcilable property so candidates surface.
vi.mock("@/lib/cam/retail/registry", () => ({ RETAIL_RECON_FIXTURES: { "2300": {} } }));
vi.mock("@/lib/cam/office/registry", () => ({ OFFICE_RECON_FIXTURES: {} }));
// No current rent roll → the "expiring" branch is empty; only vacated matters.
vi.mock("@/lib/storage", () => ({ getJSON: async () => null }));

const vacatedMock = vi.fn();
vi.mock("@/lib/leasing/recentlyVacated", () => ({ recentlyVacatedTenants: (...a: any[]) => vacatedMock(...a) }));

import { moveoutCandidates } from "./candidates";

const NOW = new Date("2026-08-15T12:00:00Z");

describe("moveoutCandidates — vacate month resolution", () => {
  it("derives year/month from leaseTo when it parses", async () => {
    vacatedMock.mockResolvedValue([
      { propertyCode: "2300", unitRef: "2300-1879", occupantName: "Acme", sqft: 2000, leaseTo: "6/30/2026", lastSeen: "2026-05" },
    ]);
    const [c] = await moveoutCandidates(NOW);
    expect(c.year).toBe(2026);
    expect(c.month).toBe(6);
  });

  it("falls back to the lastSeen month when leaseTo is unparseable", async () => {
    vacatedMock.mockResolvedValue([
      { propertyCode: "2300", unitRef: "2300-1879", occupantName: "Acme", sqft: 2000, leaseTo: "MTM", lastSeen: "2026-07" },
    ]);
    const [c] = await moveoutCandidates(NOW);
    expect(c.year).toBe(2026); // would be null before the fix → watcher skips forever
    expect(c.month).toBe(7);
  });

  it("stays null only when neither leaseTo nor lastSeen is available", async () => {
    vacatedMock.mockResolvedValue([
      { propertyCode: "2300", unitRef: "2300-1879", occupantName: "Acme", sqft: 2000, leaseTo: null, lastSeen: null },
    ]);
    const [c] = await moveoutCandidates(NOW);
    expect(c.year).toBeNull();
    expect(c.month).toBeNull();
  });
});
