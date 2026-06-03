// Expense allocation breakdown for mixed retail/office centers (7010 Parkwood
// Shopping/Office Center). Each operating-expense line is split between the
// retail (8502) and office (8503) reconciliations; some lines are shared
// (allocated by a %), some are retail-only or office-only. This drives the
// at-a-glance "what's for what" table on the recon page.

export type AllocationLine = {
  label: string;
  retail: number;
  office: number;
};

export type PropertyAllocation = {
  propertyCode: string;
  name: string;
  reconYear: number;
  /** CAM operating-expense lines. */
  cam: AllocationLine[];
  /** Insurance + RET pools (shown below the CAM lines). */
  insurance: AllocationLine;
  realEstateTaxes: AllocationLine;
};

// 7010 — retail (8502) vs office (8503) per the two 2025 CAM workbooks.
export const ALLOCATION_7010: PropertyAllocation = {
  propertyCode: "7010",
  name: "Parkwood Shopping/Office Center",
  reconYear: 2025,
  cam: [
    { label: "Maintenance Salaries", retail: 24045.60, office: 3914.40 },   // 86% / 14%
    { label: "Electric (Common)", retail: 7321, office: 966 },
    { label: "Water / Sewer", retail: 0, office: 4198 },                     // office only
    { label: "Building Maintenance (incl. elevator)", retail: 87239, office: 21956 },
    { label: "Parking Lot Cleaning", retail: 31810.32, office: 5816 },
    { label: "Security", retail: 143149.50, office: 27267 },
    { label: "Parking Lot Maintenance", retail: 69256, office: 12507 },
    { label: "Snow Removal", retail: 42844.20, office: 8160.80 },
    { label: "Trash Removal", retail: 0, office: 6672.96 },                  // office only
    { label: "Cleaning", retail: 0, office: 21606.86 },                      // office only
    { label: "Landscaping", retail: 17347.68, office: 3304.31 },
    { label: "Liability Insurance", retail: 37600.88, office: 6121.07 },
  ],
  insurance: { label: "Property Insurance", retail: 7869.41, office: 1281.07 },
  realEstateTaxes: { label: "Real Estate Taxes", retail: 141941.88, office: 22129 },
};

/** Allocation breakdown for a property, or null when it isn't a mixed center. */
export function allocationFor(propertyCode: string): PropertyAllocation | null {
  return propertyCode === "7010" ? ALLOCATION_7010 : null;
}
