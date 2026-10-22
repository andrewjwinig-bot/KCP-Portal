import { NextResponse } from "next/server";
import { monthlyStatements } from "@/lib/financials/operating-statements/mappingStore";
import { listGls } from "@/lib/financials/operating-statements/statementStore";
import { glKeysFor } from "@/lib/financials/cash-analysis/funds";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { loadT12 } from "@/lib/financials/t12/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — without params: the picker (every statement, with the latest month its
// GL is posted through). With ?key&end=YYYY-MM: that property's T-12.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const end = url.searchParams.get("end");

  const [mappings, gls] = await Promise.all([monthlyStatements(), listGls()]);
  // The latest month each GL key is posted through: the newest year, the
  // furthest month any upload for it reaches.
  const latest = new Map<string, { year: number; month: number }>();
  for (const g of gls) {
    const m = g.maxPeriodInFile ?? 0;
    if (!m) continue;
    const cur = latest.get(g.key);
    if (!cur || g.year > cur.year || (g.year === cur.year && m > cur.month)) latest.set(g.key, { year: g.year, month: m });
  }
  const latestFor = (k: string) => {
    let best: { year: number; month: number } | null = null;
    for (const member of [k, ...glKeysFor(k)]) {
      const l = latest.get(member);
      if (l && (!best || l.year > best.year || (l.year === best.year && l.month > best.month))) best = l;
    }
    return best;
  };
  const available = mappings.map((m) => ({
    key: m.key,
    propertyCode: m.propertyCode,
    entityName: m.entityName,
    name: PROPERTY_DEFS.find((p) => p.id === m.key)?.name ?? m.entityName,
    latest: latestFor(m.key),
  }));

  if (!key || !end) return NextResponse.json({ available });
  const mm = /^(\d{4})-(\d{1,2})$/.exec(end);
  if (!mm || Number(mm[2]) < 1 || Number(mm[2]) > 12) return NextResponse.json({ available, error: "end must be YYYY-MM" }, { status: 400 });
  const t12 = await loadT12(key, Number(mm[1]), Number(mm[2]));
  if (!t12) return NextResponse.json({ available, error: "No mapping for that property" }, { status: 404 });
  return NextResponse.json({ available, t12 });
}
