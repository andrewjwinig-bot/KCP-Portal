// Shared retail-reconciliation loader: assembles the pool + tenant configs +
// GL/overrides for one property/year and reconciles it. Used by the gated CAM
// recon route AND the public tenant-link statement page, so both compute the
// exact same numbers from one place.

import "server-only";
import { reconcileRetailBuilding } from "./compute";
import type { RetailExpensePool } from "./types";
import { assembleRetail } from "./assemble";
import { RETAIL_RECON_FIXTURES } from "./registry";
import { allocationFor } from "./allocation";
import { getCamConfig } from "../configStorage";
import { getEscrowOverrides } from "./escrowStore";
import { getPoolOverride } from "./poolStore";
import { getFinalOverrides, RET_FINAL_KEY } from "./finalStore";
import { retailHistoryYears, retailLineHistory, retailInsHistory, retailRetHistory } from "./expenseHistory";
import { seedCamConfig } from "../retailConfigSeed";
import { emptyCamConfig } from "../config";
import { getSuiteContactsMap } from "@/lib/suites/contactsStorage";
import { camRecipientEmails } from "@/lib/suites/contacts";
import { DEFAULT_CC } from "../office/contacts";
import { capexFor, capexAmountIn, sharesCapex } from "./capex";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { assembledGl, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";

const GL_FROM_YEAR = 2026;

/**
 * A property's annual GL total for an expense-line account spec, pulled from the
 * imported operating-statement GL. The spec is what a retail pool line carries
 * in `glAccount`: a single account ("6380-8502"), a comma-list
 * ("6380-8502,6380-8501"), or a wildcard mask ("6360-*"). Returns null when the
 * line has no GL account ("—" — e.g. an amortized cap-ex or a stipulated
 * liability figure), so the caller keeps the hand-seeded amount instead of
 * zeroing it. A real account that simply hasn't posted returns 0.
 */
export function glAnnualForSpec(gl: StoredGl | null, spec: string): number | null {
  if (!gl || !spec || spec === "—") return null;
  const masks = spec.split(",").map((s) => s.trim()).filter(Boolean);
  if (!masks.length) return null;
  let sum = 0;
  for (const [acct, nets] of Object.entries(gl.monthly)) {
    if (masks.some((m) => accountMatchesMask(m, acct))) sum += nets.reduce((a, n) => a + (n || 0), 0);
  }
  return Math.round(sum);
}

export type RetailExpenseLine = { account: string; label: string; amount: number; seed: number; overridden: boolean; history?: (number | null)[] };
export type RetailExpenseFinal = {
  historyYears: number[];
  fromGl: boolean;
  glImport: { at: string; by: string | null } | null;
  lines: RetailExpenseLine[];
  ins: RetailExpenseLine;
  ret: RetailExpenseLine;
};

export type LoadedRetailRecon = {
  result: ReturnType<typeof reconcileRetailBuilding>;
  contacts: Record<string, { email: string; cc: string }>;
  allocation: ReturnType<typeof allocationFor>;
  expenseFinal: RetailExpenseFinal;
  /** The pool the result was computed on (FINALs and GL applied). */
  pool: RetailExpensePool;
};

/** Reconcile one retail property/year. Returns null when there's no fixture for
 *  that property/year (the caller maps that to a 404). */
export async function loadRetailRecon(property: string, year: number): Promise<LoadedRetailRecon | null> {
  const fixture = RETAIL_RECON_FIXTURES[property];
  const reconYear = fixture?.byYear[year];
  if (!fixture || !reconYear) return null;

  const saved = new Map(
    await Promise.all(reconYear.roster.map(async (u) => [u.unitRef, await getCamConfig(u.unitRef)] as const)),
  );
  const baseConfig = (unitRef: string) => saved.get(unitRef) ?? seedCamConfig(unitRef) ?? emptyCamConfig(unitRef);

  // Amortized capital projects billed this year (capex.ts). A tenant whose
  // lease began after the project is excluded from the line, read off the
  // rent roll's original lease-from date.
  const capex = capexFor(property).filter((c) => capexAmountIn(c, year) > 0);
  const leaseFrom = new Map<string, string | null>();
  if (capex.some((c) => c.occupiedBy)) {
    const roll = await resolveCurrentRentroll().catch(() => null);
    for (const p of roll?.properties ?? []) for (const u of p.units ?? []) leaseFrom.set(u.unitRef, u.leaseFrom ?? null);
  }
  const configFor = (unitRef: string) => {
    const cfg = baseConfig(unitRef);
    const out = capex.filter((c) => !sharesCapex(c, unitRef, leaseFrom.get(unitRef)) && !cfg.camExcludedLines.includes(c.label)).map((c) => c.label);
    return out.length ? { ...cfg, camExcludedLines: [...cfg.camExcludedLines, ...out] } : cfg;
  };

  const escrowOverrides = await getEscrowOverrides(property, year);
  const roster = reconYear.roster.map((u) => {
    const ov = escrowOverrides[u.unitRef];
    if (!ov) return u;
    return {
      ...u,
      ...(ov.camEscrow != null ? { camEscrow: ov.camEscrow } : {}),
      ...(ov.insEscrow != null ? { insEscrow: ov.insEscrow } : {}),
      ...(ov.retEscrow != null ? { retEscrow: ov.retEscrow } : {}),
    };
  });

  const poolOverride = await getPoolOverride(property, year);
  const finals = await getFinalOverrides(property, year);

  const gl = year >= GL_FROM_YEAR ? await assembledGl(property, year) : null;
  // GL actual for a pool line, mask-aware, falling back to the hand-seeded value
  // when there's no GL (pre-2026) or the line has no GL account ("—").
  const glBase = (spec: string, seed: number) => {
    if (!gl) return seed;
    const v = glAnnualForSpec(gl, spec);
    return v == null ? seed : v;
  };

  // A capital project billed this year that the seeded pool doesn't carry yet.
  const seededLines = [
    ...fixture.pool.camLines,
    ...capex.filter((c) => !fixture.pool.camLines.some((l) => l.label === c.label))
      .map((c) => ({ glAccount: "—", label: c.label, amount: capexAmountIn(c, year), nonControllable: true })),
  ];
  const pool = {
    ...fixture.pool,
    camLines: seededLines.map((l) =>
      finals[l.label] != null ? { ...l, amount: finals[l.label] } : { ...l, amount: glBase(l.glAccount, l.amount) },
    ),
    // Insurance stays seed → override (reconcile-and-finalize on the recon page):
    // its GL account (6510) overlaps the stipulated Liability Insurance CAM line
    // in some centers, so it isn't auto-sourced.
    insAmount: poolOverride.insAmount ?? fixture.pool.insAmount,
    retAmount: finals[RET_FINAL_KEY] ?? glBase("6410-8502", fixture.pool.retAmount),
  };

  const tenants = assembleRetail(pool, roster, fixture.gla, configFor);
  const result = reconcileRetailBuilding(pool, tenants);

  const histYears = retailHistoryYears(property, year, 3);
  const expenseFinal: RetailExpenseFinal = {
    historyYears: histYears,
    fromGl: !!gl,
    glImport: gl ? { at: gl.uploadedAt, by: gl.uploadedBy ?? null } : null,
    lines: seededLines.map((l) => {
      const base = glBase(l.glAccount, l.amount);
      return {
        account: l.glAccount, label: l.label,
        amount: finals[l.label] ?? base, seed: base,
        overridden: finals[l.label] != null,
        history: retailLineHistory(property, l.label, histYears),
      };
    }),
    ins: {
      account: "—", label: "Property Insurance",
      amount: pool.insAmount, seed: fixture.pool.insAmount,
      overridden: poolOverride.insAmount != null,
      history: retailInsHistory(property, histYears),
    },
    ret: {
      account: "6410", label: "Real Estate Taxes",
      amount: finals[RET_FINAL_KEY] ?? glBase("6410-8502", fixture.pool.retAmount),
      seed: glBase("6410-8502", fixture.pool.retAmount),
      overridden: finals[RET_FINAL_KEY] != null,
      history: retailRetHistory(property, histYears),
    },
  };

  const suiteContacts = await getSuiteContactsMap(reconYear.roster.map((u) => u.unitRef));
  const contacts: Record<string, { email: string; cc: string }> = {};
  for (const u of reconYear.roster) {
    contacts[u.unitRef] = { email: camRecipientEmails(suiteContacts[u.unitRef] ?? []), cc: DEFAULT_CC };
  }

  return { result, contacts, allocation: allocationFor(fixture.pool.propertyCode), expenseFinal, pool };
}
