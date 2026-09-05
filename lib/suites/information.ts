// Per-suite "Suite Information" data model — physical condition and
// spec details staff record for each rent-roll unit. Pure types +
// constants, safe to import from client components. Server-only storage
// lives in ./informationStorage.ts.

export const FLOORING_OPTIONS = [
  "Carpet - Replace",
  "Carpet - Good",
  "Carpet - OK",
  "Tile - OK",
  "Tile - Replace",
  "Other",
] as const;

export const LIGHTING_OPTIONS = ["Fluorescent", "LED"] as const;

export const PAINT_OPTIONS = ["Good", "Fair", "Poor"] as const;
export const RESTROOMS_OPTIONS = ["Yes", "No", "N/A"] as const;
export const KITCHEN_OPTIONS = ["Yes", "No", "N/A"] as const;

export type SuiteAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  uploadedAt: string;
};

export type SuiteInformation = {
  unitRef: string;
  blinds: string;              // free text
  ceiling: string;             // free text
  flooring: string[];          // multi-select, FLOORING_OPTIONS
  lighting: string[];          // multi-select, LIGHTING_OPTIONS
  paint: string;               // single-select, PAINT_OPTIONS or ""
  restrooms: string;           // single-select, RESTROOMS_OPTIONS or ""
  kitchen: string;             // single-select, KITCHEN_OPTIONS or ""
  hvac: string;                // free text — size & date
  waterService: string;        // free text — size & location
  waterHeater: string;         // free text
  electricalService: string;   // free text
  attachments: SuiteAttachment[];
  floorplan: SuiteAttachment | null;
  updatedAt: string;
};

// Free-text + dropdown fields only — the subset a JSON save touches.
// Attachments and the floorplan are managed through their own endpoints.
export type SuiteInformationFields = Omit<
  SuiteInformation,
  "unitRef" | "attachments" | "floorplan" | "updatedAt"
>;

export function emptySuiteInformation(unitRef: string): SuiteInformation {
  return {
    unitRef,
    blinds: "",
    ceiling: "",
    flooring: [],
    lighting: [],
    paint: "",
    restrooms: "",
    kitchen: "",
    hvac: "",
    waterService: "",
    waterHeater: "",
    electricalService: "",
    attachments: [],
    floorplan: null,
    updatedAt: new Date().toISOString(),
  };
}

function pickFromList(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v === "string" && allowed.includes(v)) seen.add(v);
  }
  return [...seen];
}

function pickOne(value: unknown, allowed: readonly string[]): string {
  return typeof value === "string" && allowed.includes(value) ? value : "";
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 2000) : "";
}

// Coerce an untrusted JSON body into a clean field set — drops anything
// not on the allowed dropdown lists.
export function sanitizeFields(body: unknown): SuiteInformationFields {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    blinds: asText(b.blinds),
    ceiling: asText(b.ceiling),
    flooring: pickFromList(b.flooring, FLOORING_OPTIONS),
    lighting: pickFromList(b.lighting, LIGHTING_OPTIONS),
    paint: pickOne(b.paint, PAINT_OPTIONS),
    restrooms: pickOne(b.restrooms, RESTROOMS_OPTIONS),
    kitchen: pickOne(b.kitchen, KITCHEN_OPTIONS),
    hvac: asText(b.hvac),
    waterService: asText(b.waterService),
    waterHeater: asText(b.waterHeater),
    electricalService: asText(b.electricalService),
  };
}
