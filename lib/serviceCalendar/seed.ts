// Initial routine-maintenance schedule for shopping centers. Seeded on
// first page load. Gregory edits everything (months, $ amount, notes,
// add/remove items) directly through the Service Calendar UI — this seed
// is just the starting point.
//
// $ amount defaults to $1 as a placeholder so it's visually obvious that
// the real amount still needs to be filled in.

import type { ServiceItem } from "./storage";

export const SERVICE_TYPES = [
  "Fire Alarm Inspection",
  "Sprinkler Inspections",
  "Backflow Inspection",
  "Drain Cleaning",
  "Fire Ext Inspections",
  "HVAC Service & Maintenance",
  "Sidewalk Cleaning",
  "Roof Maintenance",
  "Elevator Maintenance",
] as const;

// One row per property; nine cells matching SERVICE_TYPES. null = NA.
const ROWS: { property: string; cells: (number[] | null)[] }[] = [
  { property: "2300",        cells: [null,             [2,5,8,11],      [9],   [3,7,11], [10], null,           [3,6,9,12], [5,11], null] },
  { property: "7010 Retail", cells: [null,             null,            [7],   [3,7,11], [10], [1,4,7,10],     [3,6,9,12], [5,11], null] },
  { property: "7010 Office", cells: [[8],              null,            [7],   null,     [10], [1,4,7,10],     null,       [5,11], null] },
  { property: "1100",        cells: [null,             null,            [7],   [3,7,11], [10], null,           [3,6,9,12], [5,11], null] },
  { property: "4500",        cells: [[2,5,8,11],       [2,5,8,11],      [3],   [3,7,11], [10], null,           [3,6,9,12], [5,11], null] },
  { property: "9510",        cells: [null,             null,            [8],   [3,7,11], [10], null,           [3,6,9,12], [5,11], null] },
];

export function SERVICE_CALENDAR_SEED(): ServiceItem[] {
  const now = new Date().toISOString();
  const items: ServiceItem[] = [];
  for (const row of ROWS) {
    for (let i = 0; i < SERVICE_TYPES.length; i++) {
      const months = row.cells[i];
      if (!months || months.length === 0) continue;
      items.push({
        id: `svc_seed_${row.property.replace(/\s+/g, "_")}_${i}`,
        propertyLabel: row.property,
        service: SERVICE_TYPES[i],
        months: months.slice().sort((a, b) => a - b),
        amount: 1,
        notes: "",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return items;
}
