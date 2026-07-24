// Security deposit tracking — one record per tenant deposit check.
// Pure types + helpers, safe to import from client components.
// Server-only storage lives in ./storage.ts.

export type DepositAccount = "ni-llc" | "all-but-ni";

// The two Liberty accounts deposits land in. NI LLC properties have a
// dedicated account; everything else pools into the second.
export const DEPOSIT_ACCOUNTS: Record<DepositAccount, {
  label: string;
  bank: string;
  /** Property the account is booked on. */
  propertyCode: string;
}> = {
  "ni-llc":     { label: "NI LLC Security Deposits",           bank: "Liberty x7448", propertyCode: "4000" },
  "all-but-ni": { label: "Security Deposits — All but NI LLC", bank: "Liberty x7216", propertyCode: "2010" },
};

const NI_LLC_CODES = new Set(["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);

/** Which Liberty account a unit's deposit belongs in, by property code. */
export function accountForProperty(propertyCode: string): DepositAccount {
  return NI_LLC_CODES.has((propertyCode ?? "").toUpperCase()) ? "ni-llc" : "all-but-ni";
}

export type DepositCheckImage = {
  url: string;
  name: string;
  contentType: string;
  size: number;
  uploadedAt: string;
};

export type SecurityDeposit = {
  id: string;
  unitRef: string;
  propertyCode: string;
  tenantCompany: string;
  checkNumber: string;
  amount: number;          // dollars
  checkDate: string;       // ISO YYYY-MM-DD, or "" if unknown
  account: DepositAccount;
  checkImage: DepositCheckImage | null;
  notes: string;
  /** True once the deposit has been returned to the tenant. */
  refunded: boolean;
  /** ISO YYYY-MM-DD the refund was issued. Empty when not refunded. */
  refundDate: string;
  /** Tenant defaulted — the deposit was forfeited / applied rather than returned. */
  tenantDefaulted: boolean;
  /** Only part of the deposit was refunded (the rest applied to damages/charges). */
  partialRefund: boolean;
  /** Dollar amount actually refunded to the tenant on a partial refund. */
  partialRefundAmount: number;
  /** Note describing how the withheld portion was applied. */
  partialRefundNote: string;
  createdAt: string;
  updatedAt: string;
};

/** Best-effort fields pulled off a check image by OCR. */
export type ExtractedCheck = {
  checkNumber: string;
  amount: number | null;
  checkDate: string;       // ISO YYYY-MM-DD, or ""
};

/** Normalize a check number for duplicate comparison (alphanumerics only,
 *  lowercased) so "#1234" and "1234" match. */
export function normalizeCheckNumber(s: string): string {
  return (s ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** A within-unit signature for spotting an accidental duplicate entry: the
 *  check number when present, else the amount + date. Returns null when there
 *  isn't enough to call it a duplicate (no check #, no amount). */
export function depositDupKey(d: Pick<SecurityDeposit, "checkNumber" | "amount" | "checkDate">): string | null {
  const cn = normalizeCheckNumber(d.checkNumber);
  if (cn) return `c:${cn}`;
  if (d.amount > 0) return `a:${Math.round(d.amount * 100)}|${d.checkDate || "?"}`;
  return null;
}

/** Ids of deposits that look like duplicates: 2+ records for the SAME unit that
 *  share a dup signature (same check #, or same amount + date). */
export function duplicateDepositIds(deposits: SecurityDeposit[]): Set<string> {
  const byKey = new Map<string, SecurityDeposit[]>();
  for (const d of deposits) {
    const sig = depositDupKey(d);
    if (!sig) continue;
    const k = `${d.unitRef}|${sig}`;
    const arr = byKey.get(k);
    if (arr) arr.push(d);
    else byKey.set(k, [d]);
  }
  const dups = new Set<string>();
  for (const arr of byKey.values()) {
    if (arr.length > 1) for (const d of arr) dups.add(d.id);
  }
  return dups;
}

export function newDepositId(): string {
  // UUID when available (server + modern browsers) so rapidly-added checks can
  // never collide on an id and overwrite each other; timestamp+random fallback.
  const uuid = globalThis.crypto?.randomUUID?.();
  return `dep_${uuid ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`}`;
}

function asText(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function asISODate(value: unknown): string {
  const s = asText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// Coerce an untrusted JSON body into a clean deposit. Account is always
// derived from the property code so it can't drift out of sync.
export function sanitizeDeposit(body: unknown, existing?: SecurityDeposit): SecurityDeposit {
  const b = (body ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const propertyCode = asText(b.propertyCode, 10) || existing?.propertyCode || "";
  const refunded = !!b.refunded;
  return {
    id: existing?.id ?? (asText(b.id, 64) || newDepositId()),
    unitRef: asText(b.unitRef, 40) || existing?.unitRef || "",
    propertyCode,
    tenantCompany: asText(b.tenantCompany, 200) || existing?.tenantCompany || "",
    checkNumber: asText(b.checkNumber, 40),
    amount: asAmount(b.amount),
    checkDate: asISODate(b.checkDate),
    account: accountForProperty(propertyCode),
    checkImage: existing?.checkImage ?? null,
    notes: asText(b.notes, 1000),
    refunded,
    // A refund date is only meaningful when the deposit is refunded.
    refundDate: refunded ? asISODate(b.refundDate) : "",
    tenantDefaulted: !!b.tenantDefaulted,
    partialRefund: !!b.partialRefund,
    partialRefundAmount: b.partialRefund ? asAmount(b.partialRefundAmount) : 0,
    partialRefundNote: b.partialRefund ? asText(b.partialRefundNote, 500) : "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
