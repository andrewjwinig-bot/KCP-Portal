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
  createdAt: string;
  updatedAt: string;
};

/** Best-effort fields pulled off a check image by OCR. */
export type ExtractedCheck = {
  checkNumber: string;
  amount: number | null;
  checkDate: string;       // ISO YYYY-MM-DD, or ""
};

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
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
