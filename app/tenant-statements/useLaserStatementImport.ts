"use client";
// Importing Skyline's Laser Statement — ONE flow, used by Receivables and the
// Statements & Tenant Portal page, through the shared import modal.

import { useCallback } from "react";
import { useImport } from "@/app/components/import/ImportProvider";
import { useUser } from "@/app/components/UserProvider";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const periodLabel = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

export function useLaserStatementImport(onDone: () => void | Promise<void>) {
  const { user } = useUser();
  const { startImport } = useImport();
  return useCallback(async (files: File[]) => {
    if (!files.length) return;
    await startImport({
      kind: "tenant-statements",
      title: (n) => `Importing ${n} Laser Statement${n === 1 ? "" : "s"}`,
      subtitle: "Skyline Laser Statement · PDF or Excel · you can keep working while this runs",
      files,
      by: user.label,
      concurrency: 1,
      upload: async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("uploadedBy", user.label);
        const j = await fetch("/api/tenant-statements", { method: "POST", body: fd }).then((r) => r.json());
        if (!j.ok) return { status: "failed", error: j.error ?? "Import failed" };
        const untied: number = j.untied?.length ?? j.mismatched.length;
        const mg = j.merge as { replaced: number; added: number; carriedOver: number; cleared?: number } | undefined;
        const paidOff = mg?.cleared ? ` · ${mg.cleared} paid in full` : "";
        const merged = (mg && mg.carriedOver > 0
          ? ` · ${mg.replaced} replaced, ${mg.carriedOver} kept`
          : mg && mg.replaced > 0 && mg.added === 0 ? ` · ${mg.replaced} replaced` : "") + paidOff;
        const note = untied
          ? `${untied} tenant${untied === 1 ? "" : "s"} don't reconcile — held back from the portal`
          : j.autoPublished ? "every tenant ties out · published to the portal"
          : j.published ? "every tenant ties out · the month was already live"
          : "every tenant ties out · publish when you're ready";
        return {
          status: "done" as const,
          entity: `${periodLabel(j.period)} · ${j.properties.length} propert${j.properties.length === 1 ? "y" : "ies"}`,
          detail: `${money0(j.openBalance)} open${merged}`,
          count: j.tenants,
          countLabel: "tenants",
          note,
          noteTone: untied ? ("warn" as const) : ("ok" as const),
          raw: j,
        };
      },
      report: (rows) => {
        const ok = rows.filter((r) => r.status === "done")
          .map((r) => r.raw as { period: string; tenants: number; totalTenants: number; openBalance: number; mismatched: string[]; untied?: string[]; published: boolean; autoPublished: boolean;
            merge?: { replaced: number; added: number; carriedOver: number; changed: number; netChange: number; cleared?: number } });
        const last = ok[ok.length - 1];
        const p = last?.period;
        const open = ok.reduce((a, r) => a + r.openBalance, 0);
        // The final import's view of the month is the authoritative one.
        const untied = last?.untied?.length ?? ok.reduce((a, r) => a + r.mismatched.length, 0);
        const live = !!last?.published;
        const m = last?.merge;
        return {
          stats: [
            { value: String(last?.totalTenants ?? 0), label: "tenants on the month" },
            ...(m && (m.replaced || m.carriedOver)
              // A re-import: what matters is what moved, not the gross total.
              ? [
                  { value: String(m.replaced), label: m.replaced === 1 ? "statement replaced" : "statements replaced" },
                  { value: String(m.carriedOver), label: "kept as they were" },
                  ...(m.cleared ? [{ value: String(m.cleared), label: "paid in full · now $0" }] : []),
                  { value: m.changed ? `${m.netChange >= 0 ? "+" : "−"}${money0(Math.abs(m.netChange))}` : "no change",
                    label: m.changed ? `net across ${m.changed} ${m.changed === 1 ? "balance" : "balances"}` : "to any balance" },
                ]
              : [{ value: money0(open), label: "open balance imported" }]),
            { value: untied ? String(untied) : "All", label: untied ? (untied === 1 ? "tenant to review" : "tenants to review") : "tie out to Skyline" },
          ],
          unlocks: p ? [live
            ? {
                id: "live", title: `${periodLabel(p)} is live for tenants`,
                subtitle: untied
                  ? `Every statement is on the portal, but ${untied} are flagged "under review" — fix those and re-import.`
                  : "Every tenant reconciled, so the month published itself. Tenants can see and pay from it now.",
                href: "/tenant-statements/statements", cta: "Open",
              }
            : {
                id: "publish", title: untied ? `${periodLabel(p)} is held back for review` : `Publish ${periodLabel(p)}`,
                subtitle: untied
                  ? `${untied} tenant${untied === 1 ? " doesn't" : "s don't"} reconcile to Skyline's balance. Fix the export and re-import — the month publishes itself once they all tie.`
                  : "Auto-publish is off, so the month stays hidden until you publish it.",
                href: "/tenant-statements/statements", cta: "Review",
              }] : [],
        };
      },
    });
    await onDone();
  }, [startImport, user?.label, onDone]);
}
