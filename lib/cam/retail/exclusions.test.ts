// Guardrail: every CAM exclusion / admin-fee-exclusion configured for a tenant
// must name a REAL line in that property's expense pool. A typo'd label would
// silently exclude nothing (or fail to skip the admin fee), so this test keeps
// the unit-page config, the statement strikethrough, and the recon math in
// lockstep across every tenant.

import { describe, it, expect } from "vitest";
import { RETAIL_RECON_FIXTURES } from "./registry";
import { seedCamConfig } from "../retailConfigSeed";

describe("retail config exclusion labels match real pool lines", () => {
  for (const [key, fx] of Object.entries(RETAIL_RECON_FIXTURES)) {
    const poolLabels = new Set(fx.pool.camLines.map((l) => l.label.toLowerCase()));
    for (const yr of Object.values(fx.byYear)) {
      for (const u of yr.roster) {
        const cfg = seedCamConfig(u.unitRef);
        if (!cfg) continue;
        const labels = [...cfg.camExcludedLines, ...cfg.camAdminExcludedLines];
        for (const label of labels) {
          it(`${key} · ${u.unitRef}: "${label}" is a real pool line`, () => {
            expect(poolLabels.has(label.toLowerCase())).toBe(true);
          });
        }
      }
    }
  }
});
