"use client";

// RECOVERIES — what each recoverable expense billed back to tenants through
// the year's CAM / RET reconciliation, in $ and % (owner, 11/2026: "show as a
// $ and % of each line item what the recoveries were … by building … and even
// by tenant … somewhere more accessible with the year end data"). Full width
// under the Operating Statements Full Year table, and on Operating Expense
// History. Click a line for its modal: where the rest went, by building, by
// tenant. Figures: /api/cam-recon/recoveries (lib/cam/recoveries.ts).

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, X } from "lucide-react";
import { StatPill } from "@/app/components/Pill";
import { TabButton } from "@/app/components/TabButton";
import { HoverCard } from "@/app/components/HoverCard";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import type { RecoveryGroup, RecoveryRow } from "@/lib/cam/recoveries";

type Resp = { key: string; years: number[]; year: number | null; asked?: number | null; group: RecoveryGroup | null; scopes: { key: string; name: string }[] };

const whole = (n: number) => Math.round(Math.abs(n)).toLocaleString("en-US");
const cell = (n: number) => (Math.abs(n) < 0.5 ? "—" : n < 0 ? `(${whole(n)})` : whole(n));
const dollars = (n: number) => (Math.abs(n) < 0.5 ? "$0" : n < 0 ? `($${whole(n)})` : `$${whole(n)}`);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** The ratio as a figure and a thin bar (navy; past 100% the bar is full). */
function Ratio({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      <span style={{ width: 64, height: 6, borderRadius: 3, background: "var(--hairline)", overflow: "hidden", display: "inline-block" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.min(100, Math.max(0, value * 100))}%`, background: "var(--brand)" }} />
      </span>
      <span style={{ minWidth: 52, fontWeight: strong ? 800 : 700 }}>{pct(value)}</span>
    </span>
  );
}

function partsTip(r: RecoveryRow, year: number, children: React.ReactNode) {
  if (!r.parts.length) return children;
  return (
    <HoverCard
      title={`${r.label} · ${year}`}
      width={300}
      rows={r.parts.map((p) => ({ label: p.amount < 0 ? `${p.label} (adds)` : p.label, value: dollars(Math.abs(p.amount)), color: p.amount < 0 ? "var(--c-067647, #067647)" : undefined }))}
      footer={{ label: "Not recovered", value: dollars(r.expense - r.recovered) }}
    >
      {children}
    </HoverCard>
  );
}

export function RecoveriesCard({ statementKey, year, scopePicker = false, title = "Recoveries" }: {
  statementKey: string;
  /** The statement's year; the card reads that year's reconciliation only. */
  year?: number;
  /** Let the viewer switch building / fund / book (Operating Expense History). */
  scopePicker?: boolean;
  title?: string;
}) {
  const [key, setKey] = useState(statementKey);
  const [pickYear, setPickYear] = useState<number | null>(null);
  const [data, setData] = useState<Resp | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<"lines" | "buildings" | "tenants">("lines");
  const [open, setOpen] = useState<RecoveryRow | null>(null);
  const [building, setBuilding] = useState<RecoveryGroup | null>(null);

  useEffect(() => { setKey(statementKey); }, [statementKey]);
  const wantYear = year ?? pickYear;

  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(`/api/cam-recon/recoveries?key=${encodeURIComponent(key)}${wantYear ? `&year=${wantYear}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: Resp) => { if (alive) { setData(j); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [key, wantYear]);

  const g = data?.group ?? null;
  useEffect(() => { if (!g?.buildings?.length && tab === "buildings") setTab("lines"); }, [g, tab]);

  if (failed || !data || !data.years.length) return null;

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{title}{data.year ? ` · ${data.year}` : ""}</div>
        <div className="muted" style={{ fontSize: "var(--fs-14)", marginTop: 2 }}>
          {g
            ? `What tenants were billed for each recoverable expense through the ${data.year} CAM / RET reconciliation${g.kind === "office" ? ", line by line against each tenant's base year" : ""}.`
            : "No reconciliation on file for this property."}
          {g && data.asked && data.asked !== data.year && ` ${data.asked} is reconciled early ${data.asked + 1}, so this is the latest on file.`}
        </div>
      </div>
      {(scopePicker || (!year && data.years.length > 1)) && (
        <div style={{ display: "flex", gap: 8 }}>
          {scopePicker && (
            <select className="select-sm" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Building">
              {!data.scopes.some((s) => s.key === key) && <option value={key}>{key}</option>}
              {data.scopes.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          )}
          {!year && data.years.length > 1 && (
            <select className="select-sm" value={data.year ?? ""} onChange={(e) => setPickYear(Number(e.target.value))} aria-label="Year">
              {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );

  if (!g) return <div className="card" style={{ marginTop: 16 }}>{header}</div>;

  const total = g.grandTotal;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      {header}
      <div className="pills" style={{ marginTop: 14 }}>
        <StatPill label="Recoverable expenses" value={dollars(total.expense)} sub={`${g.kind === "office" ? "Op Ex" : "CAM + INS"} ${dollars(total.expense - (g.others.find((o) => o.category === "ret")?.expense ?? 0))} · RET ${dollars(g.others.find((o) => o.category === "ret")?.expense ?? 0)}`} />
        <StatPill label="Recovered from tenants" value={dollars(total.recovered)} sub={`${total.tenantsPaying} of ${total.tenantsReconciled} tenants paying`} />
        <StatPill label="Recovery ratio" value={pct(total.pct)} sub={`${g.kind === "office" ? "Op Ex" : "CAM"} ${pct(g.opexTotal.pct)}`} total />
        <StatPill label="Not recovered" value={dollars(total.expense - total.recovered)} sub={total.parts.filter((p) => p.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 2).map((p) => `${p.label} ${dollars(p.amount)}`).join(" · ")} />
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginTop: 16 }}>
        <TabButton active={tab === "lines"} onClick={() => setTab("lines")}>By Line</TabButton>
        {!!g.buildings?.length && <TabButton active={tab === "buildings"} onClick={() => setTab("buildings")}>By Building</TabButton>}
        <TabButton active={tab === "tenants"} onClick={() => setTab("tenants")}>By Tenant</TabButton>
      </div>

      <div style={{ overflowX: "auto", marginTop: 4 }}>
        {tab === "lines" && <LinesTable g={g} year={g.year} onOpen={setOpen} />}
        {tab === "buildings" && <BuildingsTable g={g} onOpen={setBuilding} />}
        {tab === "tenants" && <TenantsTable g={g} />}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Recovered is each tenant&rsquo;s amount due for the year on the reconciliation (estimates billed plus the year-end adjustment). Hover Not Recovered for where the rest went; click a line for its buildings and tenants.
      </p>

      {open && <LineModal row={open} g={g} onClose={() => setOpen(null)} />}
      {building && <BuildingModal g={building} onClose={() => setBuilding(null)} onOpen={(r) => { setBuilding(null); setOpen(r); }} />}
    </div>
  );
}

function LinesTable({ g, year, onOpen }: { g: RecoveryGroup; year: number; onOpen: (r: RecoveryRow) => void }) {
  const lines = g.lines.filter((l) => Math.abs(l.expense) >= 0.5 || Math.abs(l.recovered) >= 0.5);
  const row = (l: RecoveryRow, opts: { total?: boolean; rule?: boolean } = {}) => {
    const strong = opts.total ? { fontWeight: 800 } : undefined;
    const money = opts.total ? dollars : cell;
    const clickable = !opts.total;
    return (
      <tr key={l.key} className={clickable ? "row-click" : undefined} onClick={clickable ? () => onOpen(l) : undefined}
        style={{ cursor: clickable ? "pointer" : undefined, ...(opts.total ? { borderTop: "2px solid var(--ink, #101828)" } : opts.rule ? { borderTop: "1px solid var(--border)" } : {}) }}>
        <td style={{ ...tdL, ...strong }}>
          {!opts.total && l.glAccount && l.glAccount !== "—" && <code style={{ marginRight: 8 }}>{l.glAccount}</code>}
          {l.label}
        </td>
        <td style={{ ...td, ...strong }}>{money(l.expense)}</td>
        <td style={{ ...td, ...strong }}>{money(l.recovered)}</td>
        <td style={{ ...td, ...strong }}>{l.expense > 0 ? <Ratio value={l.pct} strong={opts.total} /> : "—"}</td>
        <td style={{ ...td, ...strong }}>{partsTip(l, year, money(l.expense - l.recovered))}</td>
        <td style={{ ...td, color: "var(--muted)" }}>{l.tenantsReconciled ? `${l.tenantsPaying} of ${l.tenantsReconciled}` : "—"}</td>
        <td style={{ ...td, width: 28, color: "var(--muted)" }}>{clickable && <ChevronRight size={16} strokeWidth={1.75} />}</td>
      </tr>
    );
  };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thL}>Expense</th>
          <th style={th}>{year} Expense</th>
          <th style={th}>Recovered</th>
          <th style={th}>Recovery Ratio</th>
          <th style={th}>Not Recovered</th>
          <th style={th}>Tenants Paying</th>
          <th style={th} />
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => row(l))}
        {row(g.opexTotal, { total: true })}
        {g.others.filter((o) => Math.abs(o.expense) >= 0.5 || Math.abs(o.recovered) >= 0.5).map((o, i) => row(o, { rule: i === 0 }))}
        {row(g.grandTotal, { total: true })}
      </tbody>
    </table>
  );
}

function BuildingsTable({ g, onOpen }: { g: RecoveryGroup; onOpen: (b: RecoveryGroup) => void }) {
  const bs = g.buildings ?? [];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thL}>Building</th>
          <th style={th}>Expense</th>
          <th style={th}>Recovered</th>
          <th style={th}>Recovery Ratio</th>
          <th style={th}>Not Recovered</th>
          <th style={th}>Tenants Paying</th>
          <th style={th} />
        </tr>
      </thead>
      <tbody>
        {bs.map((b) => (
          <tr key={b.code} className="row-click" onClick={() => onOpen(b)} style={{ cursor: "pointer" }}>
            <td style={{ ...tdL, fontWeight: 600 }}><code style={{ marginRight: 8 }}>{b.code}</code>{b.name}</td>
            <td style={td}>{cell(b.grandTotal.expense)}</td>
            <td style={td}>{cell(b.grandTotal.recovered)}</td>
            <td style={td}><Ratio value={b.grandTotal.pct} /></td>
            <td style={td}>{partsTip(b.grandTotal, b.year, cell(b.grandTotal.expense - b.grandTotal.recovered))}</td>
            <td style={{ ...td, color: "var(--muted)" }}>{b.grandTotal.tenantsPaying} of {b.grandTotal.tenantsReconciled}</td>
            <td style={{ ...td, width: 28, color: "var(--muted)" }}><ChevronRight size={16} strokeWidth={1.75} /></td>
          </tr>
        ))}
        <tr style={{ borderTop: "2px solid var(--ink, #101828)" }}>
          <td style={{ ...tdL, fontWeight: 800 }}>Total</td>
          <td style={{ ...td, fontWeight: 800 }}>{dollars(g.grandTotal.expense)}</td>
          <td style={{ ...td, fontWeight: 800 }}>{dollars(g.grandTotal.recovered)}</td>
          <td style={{ ...td, fontWeight: 800 }}><Ratio value={g.grandTotal.pct} strong /></td>
          <td style={{ ...td, fontWeight: 800 }}>{dollars(g.grandTotal.expense - g.grandTotal.recovered)}</td>
          <td style={td} />
          <td style={td} />
        </tr>
      </tbody>
    </table>
  );
}

function TenantsTable({ g }: { g: RecoveryGroup }) {
  const multi = !!g.buildings?.length;
  const hasIns = g.tenants.some((t) => Math.abs(t.ins) >= 0.5);
  const sum = (f: (t: RecoveryGroup["tenants"][number]) => number) => g.tenants.reduce((s, t) => s + f(t), 0);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={thL}>Tenant</th>
          {multi && <th style={thL}>Building</th>}
          <th style={th}>{g.kind === "office" ? "Op Ex" : "CAM"}</th>
          {hasIns && <th style={th}>INS</th>}
          <th style={th}>RET</th>
          <th style={th}>Total</th>
          <th style={th}>Share</th>
        </tr>
      </thead>
      <tbody>
        {g.tenants.map((t) => (
          <tr key={`${t.building}|${t.unitRef}`}>
            <td style={{ ...tdL, fontWeight: 600 }}><code style={{ marginRight: 8 }}>{t.unitRef}</code>{t.name}</td>
            {multi && <td style={tdL}><code>{t.building}</code></td>}
            <td style={td}>{cell(t.opex)}</td>
            {hasIns && <td style={td}>{cell(t.ins)}</td>}
            <td style={td}>{cell(t.ret)}</td>
            <td style={{ ...td, fontWeight: 700 }}>{cell(t.total)}</td>
            <td style={{ ...td, color: "var(--muted)" }}>{g.grandTotal.recovered > 0 ? pct(t.total / g.grandTotal.recovered) : "—"}</td>
          </tr>
        ))}
        <tr style={{ borderTop: "2px solid var(--ink, #101828)" }}>
          <td style={{ ...tdL, fontWeight: 800 }}>{g.tenants.length} tenants paying</td>
          {multi && <td style={td} />}
          <td style={{ ...td, fontWeight: 800 }}>{dollars(sum((t) => t.opex))}</td>
          {hasIns && <td style={{ ...td, fontWeight: 800 }}>{dollars(sum((t) => t.ins))}</td>}
          <td style={{ ...td, fontWeight: 800 }}>{dollars(sum((t) => t.ret))}</td>
          <td style={{ ...td, fontWeight: 800 }}>{dollars(sum((t) => t.total))}</td>
          <td style={td} />
        </tr>
      </tbody>
    </table>
  );
}

function Shell({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const body = (
    <div className="modalOverlay" onClick={onClose} style={{ zIndex: 100, overflow: "auto" }}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} style={{ padding: 22 }}>
        <div className="modalHeader">
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{title}</div>
            <div className="muted" style={{ fontSize: "var(--fs-14)", marginTop: 2 }}>{sub}</div>
          </div>
          <button type="button" className="btn sm" onClick={onClose} aria-label="Close"><X size={16} strokeWidth={1.75} /></button>
        </div>
        {children}
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}

const secLabel: React.CSSProperties = { fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", margin: "18px 0 6px" };

function LineModal({ row, g, onClose }: { row: RecoveryRow; g: RecoveryGroup; onClose: () => void }) {
  // The same line in each building of a combined group.
  const byBuilding = (g.buildings ?? []).map((b) => {
    const match = [...b.lines, ...b.others, b.opexTotal, b.grandTotal].find((r) =>
      r.key === row.key || (r.category === row.category && ((row.glAccount && row.glAccount !== "—" && r.glAccount === row.glAccount) || r.label.toLowerCase() === row.label.toLowerCase())));
    return match ? { b, r: match } : null;
  }).filter(Boolean) as { b: RecoveryGroup; r: RecoveryRow }[];
  const notRecovered = row.expense - row.recovered;
  return (
    <Shell title={row.label} sub={`${g.name} · ${g.year} reconciliation${row.glAccount && row.glAccount !== "—" ? ` · ${row.glAccount}` : ""}`} onClose={onClose}>
      <div className="pills">
        <StatPill label={`${g.year} Expense`} value={dollars(row.expense)} />
        <StatPill label="Recovered" value={dollars(row.recovered)} sub={`${row.tenantsPaying} of ${row.tenantsReconciled} tenants paying`} />
        <StatPill label="Recovery ratio" value={pct(row.pct)} total />
        <StatPill label="Not recovered" value={dollars(notRecovered)} />
      </div>

      {!!row.parts.length && (
        <>
          <div style={secLabel}>Where the rest went</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {row.parts.slice().sort((a, b) => b.amount - a.amount).map((p) => (
                <tr key={p.label} className="task-row">
                  <td style={tdL}>{p.amount < 0 ? `${p.label} (adds to the recovery)` : p.label}</td>
                  <td style={{ ...td, color: p.amount < 0 ? "var(--c-067647, #067647)" : undefined }}>{p.amount < 0 ? `+${whole(p.amount)}` : whole(p.amount)}</td>
                  <td style={{ ...td, color: "var(--muted)", width: 80 }}>{row.expense > 0 ? pct(Math.abs(p.amount) / row.expense) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {byBuilding.length > 1 && (
        <>
          <div style={secLabel}>By building</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thL}>Building</th><th style={th}>Expense</th><th style={th}>Recovered</th><th style={th}>Recovery Ratio</th><th style={th}>Not Recovered</th></tr></thead>
            <tbody>
              {byBuilding.map(({ b, r }) => (
                <tr key={b.code}>
                  <td style={{ ...tdL, fontWeight: 600 }}><code style={{ marginRight: 8 }}>{b.code}</code>{b.name}</td>
                  <td style={td}>{cell(r.expense)}</td>
                  <td style={td}>{cell(r.recovered)}</td>
                  <td style={td}>{r.expense > 0 ? <Ratio value={r.pct} /> : "—"}</td>
                  <td style={td}>{partsTip(r, g.year, cell(r.expense - r.recovered))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div style={secLabel}>By tenant</div>
      {row.tenants.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={thL}>Tenant</th>{byBuilding.length > 1 && <th style={thL}>Building</th>}<th style={th}>Recovered</th><th style={th}>Share of Line</th></tr></thead>
          <tbody>
            {row.tenants.map((t) => (
              <tr key={`${t.building}|${t.unitRef}`}>
                <td style={{ ...tdL, fontWeight: 600 }}><code style={{ marginRight: 8 }}>{t.unitRef}</code>{t.name}</td>
                {byBuilding.length > 1 && <td style={tdL}><code>{t.building}</code></td>}
                <td style={td}>{cell(t.amount)}</td>
                <td style={{ ...td, color: "var(--muted)" }}>{row.expense > 0 ? pct(t.amount / row.expense) : "—"}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--ink, #101828)" }}>
              <td style={{ ...tdL, fontWeight: 800 }}>Total</td>
              {byBuilding.length > 1 && <td style={td} />}
              <td style={{ ...td, fontWeight: 800 }}>{dollars(row.recovered)}</td>
              <td style={{ ...td, fontWeight: 800 }}>{pct(row.pct)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="muted">No tenant paid anything on this line — every tenant&rsquo;s share sat under their base year, or the line is excluded by lease.</p>
      )}
    </Shell>
  );
}

function BuildingModal({ g, onClose, onOpen }: { g: RecoveryGroup; onClose: () => void; onOpen: (r: RecoveryRow) => void }) {
  return (
    <Shell title={g.name} sub={`${g.code} · ${g.year} reconciliation`} onClose={onClose}>
      <div className="pills">
        <StatPill label="Recoverable expenses" value={dollars(g.grandTotal.expense)} />
        <StatPill label="Recovered" value={dollars(g.grandTotal.recovered)} sub={`${g.grandTotal.tenantsPaying} of ${g.grandTotal.tenantsReconciled} tenants paying`} />
        <StatPill label="Recovery ratio" value={pct(g.grandTotal.pct)} total />
        <StatPill label="Not recovered" value={dollars(g.grandTotal.expense - g.grandTotal.recovered)} />
      </div>
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <LinesTable g={g} year={g.year} onOpen={onOpen} />
      </div>
    </Shell>
  );
}
