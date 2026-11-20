// WHO HAS ACTUALLY MOVED OUT — judged against the rent roll, never against a
// lease date. A lease reaching its expiration is not a move-out: the tenant
// gets the chance to renew, and the renewal reaches the portal only when the
// next rent roll is imported with the new term. So a tenant is a move-out ONLY
// when a rent roll imported AFTER they were last seen — the newest roll that
// covers their property — no longer shows them. Still on that roll (renewed,
// or holding over while the renewal is papered) → not a move-out. Owner: "we
// cant move tenants out who renew". Regional Cardiology, Search Engines
// Marketer, Reliant Care, Land Medical and Julia Meehan-Haley Eicher all
// queued as close-outs on an expired lease date and had renewed.
//
// Pure (no storage), so it is pinned by its test.

import { snapshotMonthKey } from "@/lib/rentroll/snapshot";

type Unit = { unitRef: string; occupantName: string; isVacant: boolean; amenity?: unknown; sqft: number; leaseTo: string | null };
type Snap = { reportTo?: string | null; uploadedAt?: string | null; properties?: { propertyCode: string; units?: Unit[] }[] };

export type ConfirmedMoveout = {
  propertyCode: string;
  unitRef: string;
  occupantName: string;
  sqft: number;
  leaseTo: string | null;
  /** `YYYY-MM` of the newest roll that still showed them — their last month. */
  lastSeen: string | null;
  /** `YYYY-MM` of the roll that no longer shows them — the evidence. */
  goneAsOf: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The same tenant under the roll's naming drift ("Regional Cardiology
 *  Consultant" / "…Consultants", a dropped "Inc."): equal once folded, or one
 *  a prefix of the other when the shorter is long enough to mean something. */
export function sameTenant(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 8 && l.startsWith(s);
}

const occupied = (u: Unit) => !u.isVacant && !u.amenity && !!u.occupantName && !/^vacant\b/i.test(u.occupantName.trim());

/**
 * Tenants confirmed gone in the last `windowDays`: present on an earlier roll
 * of their property and absent from the NEWEST roll covering that property.
 * A property missing from a later import is NOT evidence anyone left — it is
 * judged only by the rolls that carry it (the Nancy office-only import shape).
 * A tenant still on the property's newest roll under the same name — at their
 * suite or another one — is never returned, whatever their lease date says.
 */
export function confirmedMoveouts(snapshots: Snap[], now = new Date(), windowDays = 60): ConfirmedMoveout[] {
  const snaps = snapshots
    .filter((s) => s && Array.isArray(s.properties))
    .map((s) => ({ s, key: snapshotMonthKey(s) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  if (!snaps.length) return [];

  const target = new Date(now);
  target.setDate(target.getDate() - windowDays);
  const targetKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;

  // Each property's rolls, oldest first.
  const byProp = new Map<string, { key: string; units: Unit[] }[]>();
  for (const { s, key } of snaps) {
    for (const p of s.properties ?? []) {
      const code = String(p.propertyCode ?? "").toUpperCase();
      if (!code) continue;
      const list = byProp.get(code) ?? [];
      const at = list.findIndex((x) => x.key === key);
      const entry = { key, units: p.units ?? [] };
      if (at >= 0) list[at] = entry; else list.push(entry);
      byProp.set(code, list);
    }
  }

  const out: ConfirmedMoveout[] = [];
  for (const [code, rolls] of byProp) {
    if (rolls.length < 2) continue; // one roll proves nobody left
    const latest = rolls[rolls.length - 1];
    const stillThere = latest.units.filter(occupied);
    const onLatest = (u: Unit) => stillThere.some((c) => sameTenant(c.occupantName, u.occupantName));

    // The rolls to compare from: the newest at/before the window start, and
    // every one since (so a tenant who came and went inside it is caught).
    const earlier = rolls.slice(0, -1);
    let from = 0;
    for (let i = 0; i < earlier.length; i++) if (earlier[i].key <= targetKey) from = i;

    const seen = new Map<string, ConfirmedMoveout>();
    for (let i = from; i < earlier.length; i++) {
      for (const u of earlier[i].units) {
        if (!occupied(u) || onLatest(u)) continue;
        const k = `${u.unitRef}|${norm(u.occupantName)}`;
        // Newest appearance wins — its lease term and last-seen month.
        seen.set(k, {
          propertyCode: code, unitRef: u.unitRef, occupantName: u.occupantName, sqft: u.sqft,
          leaseTo: u.leaseTo, lastSeen: earlier[i].key, goneAsOf: latest.key,
        });
      }
    }
    out.push(...seen.values());
  }
  return out.sort((a, b) => a.occupantName.localeCompare(b.occupantName));
}
