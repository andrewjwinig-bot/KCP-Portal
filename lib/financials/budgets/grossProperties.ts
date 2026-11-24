// PROPERTIES BUDGETED AS ALL-GROSS — every tenant pays rent only.
//
// 9000 Butler & Main (owner: "the only CAM that butler and main tenants pay is
// their own utilities so we can assume that they are gross for now. no monthly
// CAM estimates right now"). Its tenants pay their own utilities direct, so the
// budget carries no CAM / INS / RET recoveries and CAM Estimates by Tenant
// lists none of them. Take a code out of here once its leases recover.

export const ALL_GROSS_PROPERTIES = new Set(["9000"]);

export const isAllGross = (code: string | null | undefined): boolean =>
  ALL_GROSS_PROPERTIES.has(String(code ?? "").toUpperCase());

export const ALL_GROSS_NOTE = "Gross lease — pays its own utilities; no CAM / INS / RET";
