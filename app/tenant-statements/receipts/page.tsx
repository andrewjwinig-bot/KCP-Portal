import { redirect } from "next/navigation";

// Receipt Reconciliation became Receivables at /tenant-statements (owner,
// 11/2026: one page instead of Monthly Statements + Receipt Reconciliation).
// Old links — emails, bookmarks, Tami's dashboard — keep their query.
export default function ReceiptsMoved({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x)); else if (v != null) qs.set(k, v);
  }
  const q = qs.toString();
  redirect(`/tenant-statements${q ? `?${q}` : ""}`);
}
