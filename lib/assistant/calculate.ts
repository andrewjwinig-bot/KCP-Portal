// A calculator for the assistant. The system prompt forbids it from doing
// arithmetic itself (a model adding twelve figures is where wrong totals come
// from), but questions often need two tool results combined — "rent per SF in
// office vs retail, and the difference", "NOI as a % of revenue for these
// three". This does that math in code, on numbers the model copies from tool
// results. No expression parsing, no eval: a fixed set of operations.

export type CalcOp = "sum" | "difference" | "ratio" | "percent" | "percent_change" | "average" | "share";

export function calculate(op: CalcOp, values: number[], labels?: string[]): Record<string, unknown> {
  const v = values.map(Number).filter((n) => Number.isFinite(n));
  if (!v.length) return { error: "values must be numbers" };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  switch (op) {
    case "sum": return { result: r2(v.reduce((t, n) => t + n, 0)) };
    case "average": return { result: r2(v.reduce((t, n) => t + n, 0) / v.length) };
    case "difference":
      if (v.length !== 2) return { error: "difference takes exactly two values: [a, b] → a − b" };
      return { result: r2(v[0] - v[1]) };
    case "ratio":
      if (v.length !== 2) return { error: "ratio takes [numerator, denominator]" };
      return v[1] === 0 ? { error: "denominator is zero" } : { result: Math.round((v[0] / v[1]) * 10000) / 10000 };
    case "percent":
      if (v.length !== 2) return { error: "percent takes [part, whole] → part ÷ whole × 100" };
      return v[1] === 0 ? { error: "whole is zero" } : { resultPct: r1((v[0] / v[1]) * 100) };
    case "percent_change":
      if (v.length !== 2) return { error: "percent_change takes [from, to]" };
      return v[0] === 0 ? { error: "from is zero" } : { resultPct: r1(((v[1] - v[0]) / Math.abs(v[0])) * 100) };
    case "share": {
      const total = v.reduce((t, n) => t + n, 0);
      if (total === 0) return { error: "values total zero" };
      return { total: r2(total), shares: v.map((n, i) => ({ label: labels?.[i] ?? String(i + 1), value: n, sharePct: r1((n / total) * 100) })) };
    }
    default: return { error: `Unknown operation ${op}` };
  }
}
