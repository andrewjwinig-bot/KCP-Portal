"use client";
// Importing Skyline's Credit Balance report — ONE flow for Open Credits and
// Receipt Reconciliation, through the shared import modal.

import { useCallback } from "react";
import { useImport } from "@/app/components/import/ImportProvider";
import { useUser } from "@/app/components/UserProvider";

const num = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function useCreditBalanceImport(onDone: () => void | Promise<void>) {
  const { user } = useUser();
  const { startImport } = useImport();
  return useCallback(async (files: File[]) => {
    if (!files.length) return;
    await startImport({
      kind: "credit-balance",
      title: (n) => `Reading ${n} Credit Balance report${n === 1 ? "" : "s"}`,
      subtitle: "Skyline · Credit Balance · Any With Open Credits",
      files, by: user?.label,
      upload: async (file, { signal }) => {
        const fd = new FormData(); fd.append("file", file);
        const r = await fetch("/api/tenant-statements/aging", { method: "POST", body: fd, signal });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.result) return { status: "failed", error: j?.error ?? "Could not read it." };
        const res = j.result;
        const notes = [
          res.unresolved.length ? `${res.unresolved.length} tenant${res.unresolved.length === 1 ? "" : "s"} could not be matched to a property: ${res.unresolved.map((u: { suite: string; tenantName: string }) => `${u.tenantName} (${u.suite})`).join(", ")}` : "",
          res.untied.length ? `${res.untied.length} did not tie to Skyline's balance` : "",
        ].filter(Boolean).join(" · ");
        return { status: "done", entity: `As of ${longDate(res.asOf)} · ${res.tenants} tenants · ${res.properties.length} properties`, detail: notes || `${res.credits.count} credits totalling $${num(res.credits.total)}` };
      },
      report: (rows) => ({ stats: [
        { value: String(rows.filter((r) => r.status === "done").length), label: "imported" },
        { value: String(rows.filter((r) => r.status === "failed").length), label: "need a look" },
      ] }),
    });
    await onDone();
  }, [startImport, user?.label, onDone]);
}
