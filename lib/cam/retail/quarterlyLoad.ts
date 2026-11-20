import "server-only";
import { assembledGl } from "@/lib/financials/operating-statements/statementStore";
import {
  QUARTERLY_BILLINGS, QUARTERLY_OVERRIDE_SEED, autoQuarterlyFromGl, computeQuarterly, emptyQuarterlyData, mergeQuarterly,
  type QuarterlyBillingDef, type QuarterlyComputed, type QuarterlyData,
} from "./quarterly";
import { getQuarterly } from "./quarterlyStore";

export type LoadedQuarterly = {
  def: QuarterlyBillingDef;
  /** Staff-typed cells. */
  manual: QuarterlyData;
  /** GL raw < finalized override seed. */
  auto: QuarterlyData;
  /** auto < manual — what the worksheet shows and what is billed. */
  effective: QuarterlyData;
  computed: QuarterlyComputed;
  gl: { hasGl: boolean; maxPosted: number; uploadedAt: string | null };
};

/** ONE read of a quarter-billed tenant's year: the parent property's GL
 *  (eligible expenses by account), the finalized seed, then anything typed on
 *  the page. The worksheet, the send and the automatic trigger all call this,
 *  so the figures sent are the figures shown. */
export async function loadQuarterly(key: string, year: number): Promise<LoadedQuarterly | null> {
  const def = QUARTERLY_BILLINGS[key];
  if (!def) return null;
  const manual = await getQuarterly(key, year);
  const gl = await assembledGl(def.parentProperty, year);
  const maxPosted = gl?.maxPeriodInFile ?? 0;
  const glAuto = gl ? autoQuarterlyFromGl(def, gl.monthly, maxPosted) : emptyQuarterlyData();
  const seed = QUARTERLY_OVERRIDE_SEED[`${key}-${year}`] ?? emptyQuarterlyData();
  const auto = mergeQuarterly(glAuto, seed);
  const effective = mergeQuarterly(auto, manual);
  return {
    def, manual, auto, effective,
    computed: computeQuarterly(def, effective),
    gl: { hasGl: !!gl, maxPosted, uploadedAt: gl?.uploadedAt ?? null },
  };
}
