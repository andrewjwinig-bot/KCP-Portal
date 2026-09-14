import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { PROPERTY_DEFS } from "@/lib/properties/data";

/**
 * What to call the entity that ISSUED a K-1.
 *
 * An entity that files a return is not necessarily a property. Grays Ferry SC
 * Assoc., Inc. is the GP of 4500 and owns no real estate; Lincoln Subsidiary
 * Joint Venture III owns the three Neshaminy buildings rather than being one;
 * Cherrywood and Whitpain are joint ventures. None is in the property
 * directory, so a directory lookup falls through to the raw code — and the
 * investor-facing pages read it straight out:
 *
 *   "WHIT   2025 Schedule K-1"
 *
 * on the portal, and in the email announcing it. The ownership record's own
 * label is therefore the source and PROPERTY_DEFS is the fallback, which is the
 * rule the admin roster already followed — the investor-facing routes did not,
 * which is exactly the wrong way round.
 */
export function partnershipName(code: string): string {
  const c = code.toUpperCase();
  return (
    PROPERTY_OWNERSHIP.find((p) => p.propertyCode.toUpperCase() === c)?.propertyName
    ?? PROPERTY_DEFS.find((p) => p.id.toUpperCase() === c)?.name
    ?? code
  );
}
