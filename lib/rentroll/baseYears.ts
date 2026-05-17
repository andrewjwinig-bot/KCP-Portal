// Static base-year seed, keyed by unit ref. Merged into /api/tenant-meta
// on read so the documented base years ship with the code. Any value
// edited through the base-year editor (POST /api/tenant-meta) is stored
// separately and takes precedence over this seed.
//
// Units with an unknown base year are simply left out.

export const BASE_YEAR_SEED: Record<string, number> = {
  // ── 3610 ──
  "3610-101": 2016,
  "3610-103": 2025,
  "3610-104": 2020,
  "3610-105": 2024,
  "3610-106": 2016,
  "3610-201": 2018,
  "3610-202": 2025,
  "3610-203": 2025,
  "3610-205": 2024,
  "3610-209": 2022,
  "3610-300": 2017,
  "3610-302": 2025,
  "3610-305": 2016,
  "3610-310": 2019,
};
