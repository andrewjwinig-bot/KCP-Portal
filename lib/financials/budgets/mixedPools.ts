/**
 * A MIXED CENTRE's budget pools, split into its retail and office parts.
 *
 * 7010 (Parkwood) is retail with an office centre upstairs, reconciled as TWO
 * recoveries — the retail tenants on the retail pool, the office tenants
 * (the "7010O" recon) on the office pool. The budget has to scale each by ITS
 * pool, or office-only costs (water & sewer, office cleaning) move the retail
 * tenants' bills.
 *
 * Which part of a line is office, in order of evidence:
 *   1. its GL ACCOUNTS — the -8503 suffix is the office part, always (owner):
 *      a line split by account puts its -8503 sub-lines on the office side;
 *   2. a line whose every account is -8503 is wholly office;
 *   3. otherwise the split the CAM recon itself keeps for the centre
 *      (`MIXED_7010` in `lib/cam/retail/allocation.ts` — the ONE source of the
 *      allocation), matched by GL account;
 *   4. and failing that, the workbook's stated split (86% retail / 14% office).
 */
import { MIXED_7010, splitAmounts, type MixedCenter, type SplitLine } from "@/lib/cam/retail/allocation";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";

const MIXED: Record<string, MixedCenter> = { [MIXED_7010.propertyCode]: MIXED_7010 };
export const mixedCenterFor = (code: string): MixedCenter | null => MIXED[String(code).toUpperCase()] ?? null;

/** The workbook's note on 7010: "Split Expenses are 86% Retail and 14% Office". */
export const DEFAULT_OFFICE_SHARE = 0.14;

export const isOfficeAccount = (acct: string) => /-8503$/.test(String(acct).trim());
const accounts = (mask: string) => String(mask ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const shareOf = (l: SplitLine) => { const s = splitAmounts(l); const t = s.retail + s.office; return t ? s.office / t : DEFAULT_OFFICE_SHARE; };

export type PoolKind = "cam" | "ins" | "ret";

/** The office share (0–1) of a line with no account split to read. */
export function officeShare(mc: MixedCenter, kind: PoolKind, mask: string): number {
  const parts = accounts(mask);
  if (parts.length && parts.every(isOfficeAccount)) return 1;
  if (kind === "ret") return shareOf(mc.realEstateTaxes);
  if (kind === "ins") return shareOf(mc.insurance);
  const hit = mc.cam.find((l) => [l.glRetail, l.glOffice].some((g) => g && accountMatchesMask(mask, g)));
  if (hit) return shareOf(hit);
  return parts.some(isOfficeAccount) ? DEFAULT_OFFICE_SHARE : 0;
}

type LineLike = { mask: string; total: number; basisTotal: number; subLines?: { account: string; bucket?: string; total: number; basisTotal: number | null }[] };

/** A line's budget and basis, split [retail, office]. */
export function splitLine(mc: MixedCenter, kind: PoolKind, l: LineLike): { retail: [number, number]; office: [number, number] } {
  const byAccount = l.subLines?.length && l.subLines.every((x) => !x.bucket) && l.subLines.some((x) => isOfficeAccount(x.account));
  if (byAccount) {
    const o: [number, number] = [0, 0], r: [number, number] = [0, 0];
    for (const x of l.subLines!) {
      const side = isOfficeAccount(x.account) ? o : r;
      side[0] += x.total || 0; side[1] += x.basisTotal || 0;
    }
    return { retail: r, office: o };
  }
  const s = officeShare(mc, kind, l.mask);
  return {
    retail: [(l.total || 0) * (1 - s), (l.basisTotal || 0) * (1 - s)],
    office: [(l.total || 0) * s, (l.basisTotal || 0) * s],
  };
}
