// Tenant billing contacts for the CAM/RET reconciliation — the address a
// statement would be circulated to, plus the internal CC. Seeded from the
// reconciliation workbook's per-tenant pages and editable thereafter
// (overrides stored per property). Kept separate from the lease config:
// contacts are not year-specific.

export type TenantContact = { email: string; cc: string };

/** Internal CC applied to every statement by default. */
export const DEFAULT_CC = "dwinig@kormancommercial.com;gmasciantonio@kormancommercial.com";

/** Seed contacts keyed by property → unit ref. */
export const CONTACTS_SEED: Record<string, Record<string, TenantContact>> = {
  "4070": {
    "4070-103": { email: "steve@bctma.com", cc: DEFAULT_CC },
    "4070-107": { email: "email@ossv.net", cc: DEFAULT_CC },
    "4070-113": { email: "bmcquoid@allstate.com", cc: DEFAULT_CC },
    "4070-115": { email: "khalikov577@gmail.com", cc: DEFAULT_CC },
    "4070-116": { email: "nicole@rothkofflaw.com", cc: DEFAULT_CC },
    "4070-117": { email: "payable@btsbm.com", cc: DEFAULT_CC },
    "4070-201": { email: "RobertHalfLeaseAdmin@jll.com", cc: DEFAULT_CC },
    "4070-209": { email: "ryanjanis44@gmail.com", cc: DEFAULT_CC },
    "4070-211": { email: "reynolds@aim-online.us", cc: DEFAULT_CC },
    "4070-215": { email: "arohricht@cgbaglaw.com", cc: DEFAULT_CC },
    "4070-301": { email: "AP@veltriinc.com", cc: DEFAULT_CC },
    "4070-400": { email: "mmayad@mette.com", cc: DEFAULT_CC },
    "4070-411": { email: "uhg.docs@cbre.com", cc: DEFAULT_CC },
    "4070-415": { email: "AP@veltriinc.com", cc: DEFAULT_CC },
  },
};
