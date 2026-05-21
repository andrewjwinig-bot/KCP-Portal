"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pill, Badge, StatPill, TONE_BLUE, TONE_GREEN, TONE_NEUTRAL } from "@/app/components/Pill";
import { SERVICE_TYPES } from "@/lib/serviceCalendar/seed";
import type { ServiceItem } from "@/lib/serviceCalendar/storage";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Tab = "month" | "all";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function monthsLabel(months: number[]): string {
  if (months.length === 0) return "—";
  if (months.length === 12) return "Every month";
  return months.map((m) => MONTH_SHORT[m - 1]).join(" / ");
}

export default function ServiceCalendarPage() {
  const today = new Date();
  const [items, setItems] = useState<ServiceItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("month");
  const [month, setMonth] = useState<number>(today.getMonth() + 1);   // 1-12
  const [year, setYear] = useState<number>(today.getFullYear());
  const [editing, setEditing] = useState<ServiceItem | "new" | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/service-calendar");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      setItems(body.items ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const monthItems = useMemo(() => {
    if (!items) return [];
    return items
      .filter((it) => it.months.includes(month))
      .sort((a, b) => a.propertyLabel.localeCompare(b.propertyLabel) || a.service.localeCompare(b.service));
  }, [items, month]);

  const allItems = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) =>
      a.propertyLabel.localeCompare(b.propertyLabel) || a.service.localeCompare(b.service)
    );
  }, [items]);

  const monthTotal = useMemo(
    () => monthItems.reduce((sum, it) => sum + (it.amount || 0), 0),
    [monthItems]
  );
  const propertyCount = useMemo(
    () => new Set(monthItems.map((it) => it.propertyLabel)).size,
    [monthItems]
  );

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    setMonth(m);
    setYear(y);
  }

  async function saveItem(draft: Omit<ServiceItem, "createdAt" | "updatedAt"> & { createdAt?: string }) {
    try {
      const res = await fetch("/api/service-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
      setEditing(null);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item?")) return;
    try {
      const res = await fetch(`/api/service-calendar?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete");
      setEditing(null);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <main style={{ display: "grid", gap: 14, padding: "16px clamp(12px, 3vw, 28px) 32px" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Service Calendar</h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            Routine inspections, services, and maintenance — repeats yearly. Edit anything inline.
          </div>
        </div>
        <button onClick={() => setEditing("new")} className="btn primary" style={{ fontSize: 13, padding: "8px 16px" }}>
          + Add Item
        </button>
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, padding: "0 2px" }}>
        <TabButton active={tab === "month"} onClick={() => setTab("month")}>
          This Month <Badge>{monthItems.length}</Badge>
        </TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>
          All Items <Badge muted>{allItems.length}</Badge>
        </TabButton>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c" }}>Error</div>
          <div className="muted small">{error}</div>
        </div>
      )}

      {tab === "month" && (
        <>
          {/* Month picker + KPI tiles */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => shiftMonth(-1)} className="btn" style={{ fontSize: 13, padding: "6px 12px" }} aria-label="Previous month">‹</button>
            <div style={{ fontSize: 18, fontWeight: 700, minWidth: 200, textAlign: "center" }}>
              {MONTH_NAMES[month - 1]} {year}
            </div>
            <button onClick={() => shiftMonth(1)} className="btn" style={{ fontSize: 13, padding: "6px 12px" }} aria-label="Next month">›</button>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="input"
              style={{ fontSize: 13, padding: "6px 8px" }}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || today.getFullYear())}
              className="input"
              style={{ fontSize: 13, padding: "6px 8px", width: 80 }}
            />
            <button
              onClick={() => { setMonth(today.getMonth() + 1); setYear(today.getFullYear()); }}
              className="btn"
              style={{ fontSize: 12, padding: "6px 10px" }}
            >
              Today
            </button>
          </div>

          <div className="pills">
            <StatPill label="Items scheduled" value={monthItems.length} />
            <StatPill label="Properties" value={propertyCount} />
            <StatPill label="Budget total" value={fmtMoney(monthTotal)} />
          </div>

          {/* Table */}
          <div className="card" style={{ padding: 0 }}>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Service</th>
                    <th>Recurs</th>
                    <th style={{ textAlign: "right" }}>$ Amount</th>
                    <th>Notes</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={6} className="muted small" style={{ padding: 16 }}>Loading…</td></tr>
                  )}
                  {!loading && monthItems.length === 0 && (
                    <tr><td colSpan={6} className="muted small" style={{ padding: 16 }}>
                      Nothing scheduled for {MONTH_NAMES[month - 1]}.
                    </td></tr>
                  )}
                  {monthItems.map((it) => (
                    <tr key={it.id} style={{ cursor: "pointer" }} onClick={() => setEditing(it)}>
                      <td style={{ fontWeight: 600 }}>{it.propertyLabel}</td>
                      <td>{it.service}</td>
                      <td>
                        <Pill tone={it.months.length === 1 ? TONE_GREEN : TONE_BLUE}>
                          {monthsLabel(it.months)}
                        </Pill>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {fmtMoney(it.amount)}
                      </td>
                      <td className="muted small" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.notes || "—"}
                      </td>
                      <td>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditing(it); }}
                          className="btn"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "all" && (
        <div className="card" style={{ padding: 0 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Service</th>
                  <th>Months</th>
                  <th style={{ textAlign: "right" }}>$ / occurrence</th>
                  <th style={{ textAlign: "right" }}>Annual</th>
                  <th>Notes</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="muted small" style={{ padding: 16 }}>Loading…</td></tr>
                )}
                {!loading && allItems.length === 0 && (
                  <tr><td colSpan={7} className="muted small" style={{ padding: 16 }}>No items yet.</td></tr>
                )}
                {allItems.map((it) => (
                  <tr key={it.id} style={{ cursor: "pointer" }} onClick={() => setEditing(it)}>
                    <td style={{ fontWeight: 600 }}>{it.propertyLabel}</td>
                    <td>{it.service}</td>
                    <td>
                      <Pill tone={TONE_NEUTRAL}>{monthsLabel(it.months)}</Pill>
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(it.amount)}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(it.amount * it.months.length)}
                    </td>
                    <td className="muted small" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.notes || "—"}
                    </td>
                    <td>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditing(it); }}
                        className="btn"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing !== null && (
        <EditModal
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={saveItem}
          onDelete={deleteItem}
        />
      )}
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="btn"
      style={{
        fontSize: 13,
        padding: "8px 14px",
        background: active ? "var(--card)" : "transparent",
        borderColor: active ? "var(--border)" : "transparent",
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}

function EditModal({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: ServiceItem | null;
  onClose: () => void;
  onSave: (draft: Omit<ServiceItem, "createdAt" | "updatedAt"> & { createdAt?: string }) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [propertyLabel, setPropertyLabel] = useState(item?.propertyLabel ?? "");
  const [service, setService] = useState(item?.service ?? SERVICE_TYPES[0]);
  const [months, setMonths] = useState<Set<number>>(new Set(item?.months ?? []));
  const [amount, setAmount] = useState<string>(item ? String(item.amount) : "1");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);

  function toggleMonth(m: number) {
    setMonths((s) => {
      const next = new Set(s);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  }

  async function handleSave() {
    if (!propertyLabel.trim() || !service.trim()) {
      alert("Property and service are required.");
      return;
    }
    setSaving(true);
    await onSave({
      id: item?.id ?? "",
      propertyLabel: propertyLabel.trim(),
      service: service.trim(),
      months: Array.from(months).sort((a, b) => a - b),
      amount: Number(amount) || 0,
      notes,
      createdAt: item?.createdAt,
    });
    setSaving(false);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)", color: "var(--text)",
          borderRadius: 12, border: "1px solid var(--border)",
          maxWidth: 560, width: "100%",
          maxHeight: "90vh", overflowY: "auto",
          padding: 20,
          boxShadow: "0 12px 40px rgba(15,23,42,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            {item ? "Edit item" : "New item"}
          </h2>
          <button onClick={onClose} className="btn" style={{ fontSize: 13, padding: "4px 10px" }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Property">
            <input
              value={propertyLabel}
              onChange={(e) => setPropertyLabel(e.target.value)}
              placeholder="e.g. 2300 or 7010 Retail"
              className="input"
            />
          </Field>

          <Field label="Service">
            <input
              list="service-types"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="e.g. Sprinkler Inspections"
              className="input"
            />
            <datalist id="service-types">
              {SERVICE_TYPES.map((t) => <option key={t} value={t} />)}
            </datalist>
          </Field>

          <Field label="Months">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
              {MONTH_SHORT.map((m, i) => {
                const n = i + 1;
                const on = months.has(n);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMonth(n)}
                    style={{
                      padding: "8px 0",
                      borderRadius: 8,
                      border: `1px solid ${on ? "#0b4a7d" : "var(--border)"}`,
                      background: on ? "rgba(11,74,125,0.10)" : "transparent",
                      color: on ? "#0b4a7d" : "var(--text)",
                      fontWeight: on ? 700 : 500,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="$ Amount per occurrence">
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input"
              style={{ resize: "vertical" }}
            />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, gap: 8, flexWrap: "wrap" }}>
          <div>
            {item && (
              <button
                onClick={() => onDelete(item.id)}
                disabled={saving}
                className="btn"
                style={{ fontSize: 13, padding: "8px 14px", color: "#b91c1c", borderColor: "rgba(220,38,38,0.35)" }}
              >
                Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} disabled={saving} className="btn" style={{ fontSize: 13, padding: "8px 14px" }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="btn primary" style={{ fontSize: 13, padding: "8px 18px" }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}
