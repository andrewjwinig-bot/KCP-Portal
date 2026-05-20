"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import { DEPOSIT_ACCOUNTS, type SecurityDeposit } from "@/lib/deposits/deposits";
import { useUser } from "@/app/components/UserProvider";
import DepositForm, { type UnitOption } from "@/app/deposits/DepositForm";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso || "—";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DepositCard({
  unitRef,
  propertyCode,
  tenantCompany,
}: {
  unitRef: string;
  propertyCode: string;
  tenantCompany: string;
}) {
  const { user } = useUser();
  // Only personas with deposit access see the card, and only for units
  // inside their deposit scope (Nancy → office, Harry → SC + residential).
  const hasAccess = user.navKeys.has("all") || user.navKeys.has("deposits");
  const scope = user.depositsScope;
  const inScope = !scope || scope.codes.has(propertyCode);
  const visible = hasAccess && inScope;

  const [deposits, setDeposits] = useState<SecurityDeposit[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SecurityDeposit | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!visible) { setLoading(false); return; }
    let alive = true;
    fetch("/api/deposits")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const all: SecurityDeposit[] = Array.isArray(j?.deposits) ? j.deposits : [];
        setDeposits(all.filter((d) => d.unitRef === unitRef));
      })
      .catch(() => { if (alive) setDeposits([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [unitRef, visible]);

  const unitOptions = useMemo<UnitOption[]>(() => [{
    unitRef,
    label: `${tenantCompany || unitRef} — ${unitRef}`,
    propertyCode,
    tenantCompany,
  }], [unitRef, propertyCode, tenantCompany]);

  function onSaved(d: SecurityDeposit) {
    setDeposits((prev) => {
      const list = prev ?? [];
      const idx = list.findIndex((x) => x.id === d.id);
      if (idx >= 0) { const next = [...list]; next[idx] = d; return next; }
      return [...list, d];
    });
    setEditing(null);
    setAdding(false);
  }
  function onDeleted(id: string) {
    setDeposits((prev) => prev?.filter((x) => x.id !== id) ?? prev);
    setEditing(null);
  }

  const showForm = adding || !!editing;

  if (!visible) return null;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SectionLabel>Security Deposit</SectionLabel>
        {!showForm && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/deposits" style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", textDecoration: "none" }}>
              All deposits →
            </Link>
            <button type="button" className="btn" onClick={() => { setAdding(true); setEditing(null); }}
              style={{ fontSize: 12, padding: "6px 12px", fontWeight: 600 }}>
              + Add deposit
            </button>
          </div>
        )}
      </div>

      {showForm ? (
        <div style={{ marginTop: 10 }}>
          <DepositForm
            deposit={editing}
            unitOptions={unitOptions}
            fixedUnitRef={unitRef}
            onSaved={onSaved}
            onCancel={() => { setAdding(false); setEditing(null); }}
            onDeleted={editing ? onDeleted : undefined}
          />
        </div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Loading…</div>
      ) : (deposits && deposits.length > 0) ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {deposits.map((d) => (
            <div key={d.id}
              onClick={() => { setEditing(d); setAdding(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", border: "1px solid var(--border)",
                borderRadius: 10, background: "rgba(15,23,42,0.015)", cursor: "pointer",
                opacity: d.refunded ? 0.7 : 1,
              }}>
              {d.checkImage && d.checkImage.contentType.startsWith("image/") && (
                <a href={d.checkImage.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  <img src={d.checkImage.url} alt="Check"
                    style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", display: "block" }} />
                </a>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>{d.amount ? money(d.amount) : "—"}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>
                    {d.checkNumber ? `Check #${d.checkNumber}` : ""}
                  </span>
                  {d.refunded && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
                      padding: "2px 8px", borderRadius: 999,
                      background: "rgba(22,163,74,0.10)", color: "#15803d",
                      border: "1px solid rgba(22,163,74,0.30)",
                    }}>
                      Refunded{d.refundDate ? ` · ${prettyDate(d.refundDate)}` : ""}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {prettyDate(d.checkDate)} · {DEPOSIT_ACCOUNTS[d.account].bank}
                </div>
              </div>
              {d.checkImage && !d.checkImage.contentType.startsWith("image/") && (
                <a href={d.checkImage.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d" }}>View file</a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          No security deposit recorded for this suite yet.
        </div>
      )}
    </div>
  );
}
