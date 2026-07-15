// Shared retail-reconciliation loader: assembles the pool + tenant configs +
// GL/overrides for one property/year and reconciles it. Used by the gated CAM
// recon route AND the public tenant-link statement page, so both compute the
// exact same numbers from one place.

import "server-only";
import { reconcileRetailBuilding } from "./compute";
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
import { assembledGl } from "@/lib/financials/operating-statements/statementStore";

const GL_FROM_YEAR = 2026;

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
  const configFor = (unitRef: string) => saved.get(unitRef) ?? seedCamConfig(unitRef) ?? emptyCamConfig(unitRef);

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
  const glFull: Record<string, number> = {};
  if (gl) for (const [acct, nets] of Object.entries(gl.monthly)) glFull[acct] = Math.round(nets.reduce((a, n) => a + (n || 0), 0));
  const glBase = (account: string, seed: number) => (gl ? (glFull[account] ?? 0) : seed);

  const pool = {
    ...fixture.pool,
    camLines: fixture.pool.camLines.map((l) =>
      finals[l.label] != null ? { ...l, amount: finals[l.label] } : { ...l, amount: glBase(l.glAccount, l.amount) },
    ),
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
    lines: fixture.pool.camLines.map((l) => {
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

  return { result, contacts, allocation: allocationFor(fixture.pool.propertyCode), expenseFinal };
}
