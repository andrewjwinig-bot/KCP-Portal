export function toMoney(n: any) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function normalizeAmount(raw: any) {
  if (raw == null) return 0;
  let s = String(raw).trim();
  const negParen = s.startsWith("(") && s.endsWith(")");
  s = s.replace(/[,$()]/g, "");
  let n = Number(s);
  if (Number.isNaN(n)) n = 0;
  if (negParen) n = -Math.abs(n);
  return n;
}

export function groupBy<T>(arr: T[], keyFn: (item: T) => string) {
  const m = new Map<string, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(item);
  }
  return m;
}
