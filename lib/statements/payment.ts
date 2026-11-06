// "How to pay" — the remittance details a tenant sees on their statement.
//
// Kept as editable data rather than hard-coded copy: AP contacts and lockbox
// details change, and a wrong remit address on a tenant-facing page costs real
// money. Defaults come from the remittance block Skyline itself prints on the
// statement; staff can override them globally or per property on the Monthly
// Statements page.

import "server-only";
import { createMapStore } from "@/lib/collectionStore";

export type PaymentInstructions = {
  /** Who the check is made out to. */
  payableTo: string;
  /** Remit-to address, one line per element. */
  remitTo: string[];
  /** Free-text ACH / wire guidance. Intentionally not bank numbers — those
   *  don't belong on a shared portal page; tenants are pointed at AR instead. */
  achNote: string;
  /** Who to contact about a balance. */
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /** Optional extra paragraph (late-fee terms, portal-specific guidance). */
  note: string;
};

/** Global default — the remittance block printed on the Skyline statement. */
export const DEFAULT_INSTRUCTIONS: PaymentInstructions = {
  payableTo: "Korman Commercial Properties, Inc.",
  remitTo: ["Korman Commercial Properties, Inc.", "8 Neshaminy Interplex, Suite 400", "Trevose, PA 19053"],
  achNote: "Paying by ACH or wire? Email accounting for remittance instructions before you send — include your unit reference so the payment posts to the right account.",
  contactName: "Marie Jaster",
  contactEmail: "mjaster@kormancommercial.com",
  contactPhone: "",
  note: "Please reference your unit number on every payment. Charges are due on the first of the month.",
};

export const GLOBAL_KEY = "default";

const store = createMapStore<Partial<PaymentInstructions>>({ prefix: "tenant-statement-payment" });

/** The saved overrides: the global one under GLOBAL_KEY, plus any per-property. */
export async function allOverrides(): Promise<Record<string, Partial<PaymentInstructions>>> {
  return store.all();
}

export async function saveOverride(key: string, value: Partial<PaymentInstructions>): Promise<void> {
  await store.set(key, value);
}

export async function clearOverride(key: string): Promise<void> {
  await store.remove(key);
}

const layer = (base: PaymentInstructions, patch: Partial<PaymentInstructions> | null | undefined): PaymentInstructions => {
  if (!patch) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) ? v.length > 0 : String(v).trim() !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
};

/** Effective instructions for a property: defaults < global override < property. */
export async function instructionsFor(propertyCode: string): Promise<PaymentInstructions> {
  const saved = await store.all();
  return layer(layer(DEFAULT_INSTRUCTIONS, saved[GLOBAL_KEY]), saved[propertyCode]);
}
