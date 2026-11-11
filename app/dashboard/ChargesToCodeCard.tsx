"use client";
// "Charges to Code" — the credit-card charges on THIS person's card, at the
// top of their dashboard (owner: "expenses that are his when they are imported
// should be at the top of his dashboard for him to complete quickly … greg
// should see his charges and drew should see the charges from Andrew"). Harry
// imports the statement on the Credit Card page; each charge is routed by its
// Card Member (`cardholderOf`) and the server returns only this person's own.
// A row is: date · merchant · amount, then property / category / a line
// description (suite when the category is TI). Each pick saves at once. Hidden
// for anyone with the Credit Card page (Harry codes there) and when there is
// nothing to code.

import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleCheck, CreditCard } from "lucide-react";
import { CATEGORIES, PROPERTIES, isRowCoded, type Tx } from "@/lib/expenses/coding";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FIELD: React.CSSProperties = { fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 4, display: "block" };

function shortDate(s: string) {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T00:00:00" : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChargesToCodeCard() {
  const [rows, setRows] = useState<Tx[] | null>(null);
  const [period, setPeriod] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Rows coded in this sitting stay on screen (ticked) until reload, so a
  // pick does not make the list jump under the mouse.
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    fetch("/api/expenses/working", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!j.ok || j.full) { setRows([]); return; }
      const mine: Tx[] = j.tx ?? [];
      setRows(mine);
      setPeriod(j.statementPeriodText ?? "");
      setSeen(new Set(mine.filter((t) => !isRowCoded(t)).map((t) => t.id)));
    }).catch(() => setRows([]));
  }, []);

  const shown = useMemo(() => (rows ?? []).filter((t) => seen.has(t.id)), [rows, seen]);
  if (!rows || !shown.length) return null;
  const left = shown.filter((t) => !isRowCoded(t)).length;

  function save(id: string, patch: Partial<Tx>, debounce = false) {
    setRows((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const send = () => {
      fetch("/api/expenses/working", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch }),
      }).then(async (r) => {
        if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Couldn't save that charge.");
        else setError(null);
      }).catch(() => setError("Couldn't save that charge."));
    };
    const old = timers.current.get(id);
    if (old) clearTimeout(old);
    if (debounce) timers.current.set(id, setTimeout(send, 600)); else send();
  }

  return (
    <section className="card" style={{ display: "grid", gap: 10, gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CreditCard size={20} strokeWidth={1.75} aria-hidden style={{ color: "var(--c-0b4a7d)" }} />
          <div style={{ fontSize: 17, fontWeight: 700 }}>Charges to Code</div>
        </div>
        <div className="small muted">
          {left ? `${left} of ${shown.length} left` : `All ${shown.length} coded — Harry has them`}{period ? ` · ${period}` : ""}
        </div>
      </div>
      {error && <div className="small" style={{ color: "var(--c-b42318)" }}>{error}</div>}
      <div>
        {shown.map((t) => {
          const done = isRowCoded(t);
          return (
            <div key={t.id} className="task-row" style={{ padding: "11px 2px", borderBottom: "1px solid var(--hairline)", display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {done
                  ? <CircleCheck size={20} strokeWidth={1.75} aria-label="Coded" style={{ color: "var(--c-067647)", flexShrink: 0 }} />
                  : <Circle size={20} strokeWidth={1.75} aria-label="Not coded yet" style={{ color: "var(--c-98a2b3)", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description || "Charge"}</div>
                  <div className="small muted">{shortDate(t.date)}{done ? " · Coded" : ""}</div>
                </div>
                <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(Number(t.amount))}</div>
              </div>
              <div className="charge-code-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, paddingLeft: 30 }}>
                <label>
                  <span style={FIELD}>Property</span>
                  <select value={t.propertyId} onChange={(e) => save(t.id, { propertyId: e.target.value })} style={{ width: "100%" }}>
                    <option value="">Choose…</option>
                    {PROPERTIES.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}
                  </select>
                </label>
                <label>
                  <span style={FIELD}>Category</span>
                  <select value={t.category} onChange={(e) => save(t.id, { category: e.target.value })} style={{ width: "100%" }}>
                    <option value="">Choose…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                {t.category === "TI" && (
                  <label>
                    <span style={FIELD}>Suite</span>
                    <input value={t.suite} placeholder="Suite (required for TI)" onChange={(e) => save(t.id, { suite: e.target.value }, true)} style={{ width: "100%" }} />
                  </label>
                )}
                <label>
                  <span style={FIELD}>Description</span>
                  <input value={t.codedDescription} placeholder="What it was for" onChange={(e) => save(t.id, { codedDescription: e.target.value }, true)} style={{ width: "100%" }} />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
