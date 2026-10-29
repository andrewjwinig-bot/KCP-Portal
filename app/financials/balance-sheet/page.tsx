"use client";

// Balance Sheet — the statement of financial position for one partnership,
// derived from its own general ledger.
//
// It exists because a lender's annual Borrower Certification asks for four
// things — balance sheet, detailed income and expense statement, rent roll,
// and each guarantor's financial statement — and the portal produced three of
// them. The Statement of Values was the nearest thing to the fourth and is not
// one: it carries real estate at a cap-rate value against two asset lines and
// one liability, with equity as a single figure. Nothing forces it to balance,
// and it would not tie to the income statement filed beside it.
//
// This does. Every figure is a GL account balance (its opening plus the nets
// through the as-of month), so the sheet ties to the same ledger the operating
// statement is built from — and the proof is displayed rather than assumed.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Select, YearSelect } from "@/app/components/YearSelect";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { AccountListCard } from "@/app/components/AccountListCard";
import { HoverCard } from "@/app/components/HoverCard";
import { Pill, StatPill, TONE_GREEN, TONE_RED, TONE_AMBER, TONE_NEUTRAL } from "@/app/components/Pill";
import { th, td, thL, tdL } from "@/app/components/tableStyles";

const CARD_TITLE: React.CSSProperties = { fontSize: 15, fontWeight: 800, letterSpacing: "0.01em", color: "var(--text)" };
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Accounting presentation: whole dollars, negatives in parentheses. */
function money0(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Math.round(v);
  const s = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `(${s})` : s;
}
const moneyFull = (v: number) =>
  (v < 0 ? "(" : "") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (v < 0 ? ")" : "");

type GroupDef = { key: string; section: "asset" | "liability" | "equity"; label: string; order: number; contra?: boolean };
type AccountRow = { code: string; name: string; signed: number; amount: number };
type GroupRow = GroupDef & { accounts: AccountRow[]; total: number };
type Sheet = {
  key: string; year: number; asOfMonth: number; asOfDate: string;
  assets: GroupRow[]; liabilities: GroupRow[]; equity: GroupRow[];
  totalAssets: number; totalLiabilities: number; totalEquity: number;
  netIncome: number; totalLiabilitiesAndEquity: number;
  unclassified: AccountRow[];
  proof: { assets: number; liabilitiesAndEquity: number; difference: number; balances: boolean };
  coverage: { startMonth: number; through: number; asOfCovered: boolean };
  tieOut: { checked: number; mismatches: { code: string; name: string; computed: number; reported: number; diff: number }[] } | null;
  warnings: string[]; usable: boolean;
};
type DebtCheck = {
  loans: { id: string; lender: string; collateral: string; projectedBalance: number | null; anchorDate: string }[];
  comparable: boolean;
  scheduleTotal: number | null;
  ledgerTotal: number;
  earliestDate: string;
} | null;
type Payload = {
  sheet: Sheet | null; groups: GroupDef[]; overrides?: Record<string, string>;
  debtCheck?: DebtCheck; reason?: string;
  property?: { key: string; name: string; entityName: string; ein: string | null };
};
type PickerProp = { key: string; name: string; entityName: string; years: number[] };

const LS_KEY = "kcp.balanceSheet.last";

export default function BalanceSheetPage() {
  const [props_, setProps] = useState<PickerProp[]>([]);
  const [key, setKey] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState(12);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  // Remember the last property/year, the way the recon page does — this is a
  // page you come back to across a reporting season.
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/financials/balance-sheet").then((x) => x.json()).catch(() => null);
      const list: PickerProp[] = r?.properties ?? [];
      setProps(list);
      let want = "";
      try { want = JSON.parse(localStorage.getItem(LS_KEY) || "{}")?.key || ""; } catch {}
      const chosen = list.find((p) => p.key === want) ?? list[0];
      if (chosen) { setKey(chosen.key); setYear(chosen.years[0] ?? null); }
      setLoading(false);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!key || year == null) return;
    setLoading(true);
    const r = await fetch(`/api/financials/balance-sheet?key=${encodeURIComponent(key)}&year=${year}&month=${month}`)
      .then((x) => x.json()).catch(() => null);
    setData(r ?? null);
    setLoading(false);
    try { localStorage.setItem(LS_KEY, JSON.stringify({ key, year })); } catch {}
  }, [key, year, month]);

  useEffect(() => { load(); }, [load]);

  const years = props_.find((p) => p.key === key)?.years ?? [];
  const sheet = data?.sheet ?? null;
  const groups = data?.groups ?? [];

  const assign = async (account: string, group: string) => {
    setSaving(account);
    await fetch("/api/financials/balance-sheet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, account, group: group || null }),
    }).catch(() => null);
    setSaving("");
    await load();
  };

  const downloads = useMemo(() => {
    if (!sheet) return [];
    const q = `key=${encodeURIComponent(key)}&year=${year}&month=${month}`;
    return [
      { label: "Excel (.xlsx)", description: "Totals as live formulas", href: `/api/financials/balance-sheet/export?${q}&format=xlsx` },
      { label: "PDF", description: "The statement as it reads here", href: `/api/financials/balance-sheet/export?${q}&format=pdf` },
    ];
  }, [sheet, key, year, month]);

  return (
    <main className="container" style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Balance Sheet</h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            Statement of financial position, from the property's own general ledger.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Select value={key} onChange={(k) => { setKey(k); setYear(props_.find((p) => p.key === k)?.years[0] ?? null); }} aria-label="Property">
            {props_.map((p) => <option key={p.key} value={p.key}>{p.key} — {p.name}</option>)}
          </Select>
          {year != null && <YearSelect value={year} years={years} onChange={setYear} suffix="" tone="neutral" />}
          <Select value={String(month)} onChange={(v) => setMonth(Number(v))} tone="neutral" aria-label="As of month">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                as of {m} {new Date(Date.UTC(year ?? 2025, i + 1, 0)).getUTCDate()}
              </option>
            ))}
          </Select>
          <DownloadMenu items={downloads} disabled={!sheet} />
        </div>
      </header>

      {loading && <div className="card"><div className="muted">Loading…</div></div>}

      {!loading && !sheet && (
        <div className="card">
          <div style={CARD_TITLE}>No general ledger for this selection</div>
          <div className="muted small" style={{ marginTop: 6 }}>
            {data?.reason ?? "Upload the Skyline General Ledger on Operating Statements first — the balance sheet is built from the same file."}
          </div>
        </div>
      )}

      {!loading && sheet && (
        <>
          <TitleBlock data={data!} sheet={sheet} month={month} />

          {sheet.warnings.map((w, i) => (
            <div key={i} className="card" style={{ borderColor: "rgba(217,119,6,0.4)", background: "rgba(217,119,6,0.06)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Pill tone={TONE_AMBER}>CHECK</Pill>
                <div style={{ fontSize: 13 }}>{w}</div>
              </div>
            </div>
          ))}

          <div className="pills">
            <StatPill label="Total assets" value={money0(sheet.totalAssets)} />
            <StatPill label="Total liabilities" value={money0(sheet.totalLiabilities)} />
            <StatPill label="Partners' capital" value={money0(sheet.totalEquity)} accent={sheet.totalEquity < 0 ? "#b91c1c" : undefined}
              sub={sheet.totalEquity < 0 ? "deficit" : undefined} />
            <StatPill label={`Net income — ${year}`} value={money0(sheet.netIncome)} accent={sheet.netIncome < 0 ? "#b91c1c" : "#15803d"} />
          </div>

          <ProofCard sheet={sheet} />
          <TieOutCard sheet={sheet} />

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
            <SectionCard
              title="Assets"
              groups={sheet.assets}
              total={sheet.totalAssets}
              totalLabel="Total assets"
            />
            <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
              <SectionCard
                title="Liabilities"
                groups={sheet.liabilities}
                total={sheet.totalLiabilities}
                totalLabel="Total liabilities"
              />
              <SectionCard
                title="Partners' capital"
                groups={sheet.equity}
                total={sheet.totalEquity}
                totalLabel="Total partners' capital"
                extraRow={{ label: `Net income (loss) — ${year}`, amount: sheet.netIncome }}
              />
            </div>
          </div>

          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={SECTION_LABEL}>Total liabilities and partners' capital</div>
            <div style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{money0(sheet.totalLiabilitiesAndEquity)}</div>
          </div>

          {data?.debtCheck && <DebtCheckCard check={data.debtCheck} asOf={sheet.asOfDate} />}

          {sheet.unclassified.length > 0 && (
            <AccountListCard
              title="Accounts not placed on the sheet"
              description={
                "These carry a balance but no rule recognises them, so they are excluded — which is exactly why the sheet above is out of balance. " +
                "Assign each one and it lands in that section permanently, for this property."
              }
              accent="#b45309"
              amountLabel="Balance"
              defaultOpen
              rows={sheet.unclassified.map((a) => ({ account: a.code, name: a.name, amount: a.signed }))}
              format={(n) => money0(n)}
              actionLabel="Section"
              action={(r) => (
                <select
                  className="select-sm"
                  disabled={saving === r.account}
                  value=""
                  onChange={(e) => assign(r.account, e.target.value)}
                  aria-label={`Assign ${r.account}`}
                >
                  <option value="">{saving === r.account ? "Saving…" : "Assign to…"}</option>
                  {groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
              )}
            />
          )}

          <BasisNote />
        </>
      )}
    </main>
  );
}

/** The heading a statement carries: whose it is, and as of when. */
function TitleBlock({ data, sheet, month }: { data: Payload; sheet: Sheet; month: number }) {
  const p = data.property;
  const asOf = `${MONTHS[month - 1]} ${new Date(Date.UTC(sheet.year, month, 0)).getUTCDate()}, ${sheet.year}`;
  return (
    <div className="card" style={{ textAlign: "center", display: "grid", gap: 2 }}>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{p?.entityName ?? p?.name ?? sheet.key}</div>
      {p?.name && p.name !== p.entityName && <div className="muted" style={{ fontSize: 13 }}>{p.name}</div>}
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>Balance Sheet</div>
      <div className="muted small">As of {asOf}</div>
      {p?.ein && <div className="muted small" style={{ marginTop: 2 }}>EIN {p.ein}</div>}
    </div>
  );
}

/**
 * The proof, shown rather than claimed. A general ledger is double-entry, so a
 * complete one balances by construction — displaying that is what separates
 * this from a schedule someone typed. When it does NOT balance the gap is
 * stated in dollars, because the gap is exactly what was left off the sheet.
 */
function ProofCard({ sheet }: { sheet: Sheet }) {
  const ok = sheet.proof.balances;
  return (
    <div
      className="card"
      style={{
        borderColor: ok ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.4)",
        background: ok ? "rgba(22,163,74,0.05)" : "rgba(220,38,38,0.05)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Pill tone={ok ? TONE_GREEN : TONE_RED}>{ok ? "IN BALANCE" : "OUT OF BALANCE"}</Pill>
        <HoverCard
          title="How this is proved"
          rows={[
            { label: "Total assets", value: moneyFull(sheet.proof.assets) },
            { label: "Liabilities + capital", value: moneyFull(sheet.proof.liabilitiesAndEquity) },
            { label: "Difference", value: moneyFull(sheet.proof.difference), color: ok ? "#15803d" : "#b91c1c" },
          ]}
          footer={{
            label: "",
            value: ok
              ? "Every account in the ledger is on the sheet, and double entry does the rest."
              : "The gap is what the sheet could not place. Assign those accounts below.",
          }}
        >
          <span style={{ fontSize: 13 }}>
            {ok
              ? "Assets equal liabilities plus partners' capital, to the penny."
              : `Assets and liabilities plus capital differ by $${moneyFull(Math.abs(sheet.proof.difference))}.`}
          </span>
        </HoverCard>
      </div>
      <div style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
        {money0(sheet.proof.assets)} <span className="muted" style={{ fontWeight: 400 }}>vs</span> {money0(sheet.proof.liabilitiesAndEquity)}
      </div>
    </div>
  );
}

/**
 * The second, independent check — and the one that actually validates the
 * FIGURES. The balance proof only shows nothing was left off the sheet; it
 * holds even if an account is on the wrong side. This compares every account's
 * balance to the ending balance the general ledger itself prints.
 */
function TieOutCard({ sheet }: { sheet: Sheet }) {
  const t = sheet.tieOut;
  if (!t) {
    return (
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Pill tone={TONE_NEUTRAL}>NOT CHECKED</Pill>
        <div style={{ fontSize: 13 }} className="muted">
          This GL upload carries no printed ending balances to check against, or the sheet is dated
          mid-year — where the ledger's year-end column is not the figure shown, so disagreement
          would be correct.
        </div>
      </div>
    );
  }
  const ok = t.mismatches.length === 0;
  return (
    <div
      className="card"
      style={{
        borderColor: ok ? "rgba(22,163,74,0.35)" : "rgba(217,119,6,0.4)",
        background: ok ? "rgba(22,163,74,0.05)" : "rgba(217,119,6,0.06)",
        display: "grid", gap: ok ? 0 : 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Pill tone={ok ? TONE_GREEN : TONE_AMBER}>{ok ? "TIES TO THE LEDGER" : `${t.mismatches.length} DO NOT TIE`}</Pill>
        <div style={{ fontSize: 13 }}>
          {ok
            ? `All ${t.checked} account balances equal the ending balance the general ledger prints for them.`
            : `${t.mismatches.length} of ${t.checked} account balances differ from the ledger's own printed ending balance.`}
        </div>
      </div>
      {!ok && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={thL}>Account</th><th style={thL}>Name</th>
                <th style={th}>On this sheet</th><th style={th}>Ledger prints</th><th style={th}>Difference</th>
              </tr>
            </thead>
            <tbody>
              {t.mismatches.map((m) => (
                <tr key={m.code}>
                  <td style={tdL}><code style={{ fontSize: 12 }}>{m.code}</code></td>
                  <td style={tdL}>{m.name || "—"}</td>
                  <td style={td}>{money0(m.computed)}</td>
                  <td style={td}>{money0(m.reported)}</td>
                  <td style={{ ...td, color: "#b45309", fontWeight: 700 }}>{money0(m.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One half of the sheet: its groups, each expanding to the accounts behind it. */
function SectionCard({
  title, groups, total, totalLabel, extraRow,
}: {
  title: string; groups: GroupRow[]; total: number; totalLabel: string;
  extraRow?: { label: string; amount: number };
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", alignSelf: "start" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={CARD_TITLE}>{title}</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={thL}>Line</th>
              <th style={th}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.key} group={g} open={!!open[g.key]} toggle={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))} />
            ))}
            {extraRow && (
              <tr>
                <td style={tdL}>{extraRow.label}</td>
                <td style={{ ...td, color: extraRow.amount < 0 ? "#b91c1c" : undefined }}>{money0(extraRow.amount)}</td>
              </tr>
            )}
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td style={{ ...tdL, fontWeight: 800 }}>{totalLabel}</td>
              <td style={{ ...td, fontWeight: 900 }}>{money0(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ group, open, toggle }: { group: GroupRow; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr style={{ cursor: "pointer" }} onClick={toggle}>
        <td style={{ ...tdL, fontWeight: group.contra ? 400 : 600, fontStyle: group.contra ? "italic" : undefined }}>
          <span className="muted" style={{ fontSize: 10, marginRight: 6 }}>{open ? "▲" : "▼"}</span>
          {group.label}
          <span className="muted small" style={{ marginLeft: 6 }}>({group.accounts.length})</span>
        </td>
        <td style={{ ...td, fontWeight: 700 }}>{money0(group.total)}</td>
      </tr>
      {open && group.accounts.map((a) => (
        <tr key={a.code} style={{ background: "var(--bg-subtle, rgba(15,23,42,0.02))" }}>
          <td style={{ ...tdL, paddingLeft: 28, fontSize: 13 }}>
            <code style={{ fontSize: 12 }}>{a.code}</code>
            <span className="muted" style={{ marginLeft: 8 }}>{a.name || "—"}</span>
          </td>
          <td style={{ ...td, fontSize: 13 }}>{money0(a.amount)}</td>
        </tr>
      ))}
    </>
  );
}

/**
 * The ledger's mortgage balance against the debt schedule's. The two are kept
 * from different sources — the GL from Skyline, the schedule from the lender's
 * own statements — so agreement is real evidence the figure being certified is
 * right, and a gap usually means a principal payment posted to the wrong month.
 */
function DebtCheckCard({ check, asOf }: { check: NonNullable<DebtCheck>; asOf: string }) {
  const diff = check.comparable && check.scheduleTotal != null
    ? Math.round((check.ledgerTotal - check.scheduleTotal) * 100) / 100
    : null;
  const agrees = diff != null && Math.abs(diff) < 1;
  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={CARD_TITLE}>Mortgage — ledger vs. debt schedule</div>
        {diff == null
          ? <Pill tone={TONE_NEUTRAL}>NOT COMPARABLE</Pill>
          : <Pill tone={agrees ? TONE_GREEN : TONE_AMBER}>{agrees ? "AGREES" : `OFF BY ${money0(Math.abs(diff))}`}</Pill>}
      </div>
      <div className="muted small">
        {diff == null ? (
          <>
            The debt schedule is anchored to a balance read off a lender statement dated{" "}
            <b>{check.earliestDate}</b> and only projects forward from there, so it cannot state a
            balance as of {asOf}. <b>Nothing is being compared</b> — check the ledger figure against
            the lender's own statement for this date instead.
          </>
        ) : (
          <>
            Two independent records of the same balance as of {asOf}: the general ledger, and the
            amortization schedule maintained from the lender's statements.
          </>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%" }}>
          <thead>
            <tr><th style={thL}>Source</th><th style={thL}>Detail</th><th style={th}>Balance</th></tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdL}>General ledger</td>
              <td style={tdL} className="muted">Mortgage payable accounts, as of {asOf}</td>
              <td style={td}>{money0(check.ledgerTotal)}</td>
            </tr>
            {check.loans.map((l) => (
              <tr key={l.id}>
                <td style={tdL}>Debt schedule</td>
                <td style={tdL} className="muted">
                  {l.lender}{l.collateral ? ` — ${l.collateral}` : ""}
                  {l.projectedBalance == null && <> · starts {l.anchorDate}</>}
                </td>
                <td style={{ ...td, color: l.projectedBalance == null ? "var(--muted)" : undefined }}>
                  {l.projectedBalance == null ? "not available for this date" : money0(l.projectedBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** What this statement is prepared on — said on the page, because it has to be
 *  said on anything that leaves the building. */
function BasisNote() {
  return (
    <div className="card">
      <div style={SECTION_LABEL}>Basis of presentation</div>
      <div className="muted small" style={{ marginTop: 8, lineHeight: 1.6 }}>
        Prepared from the partnership's general ledger on the basis of accounting the partnership uses to
        keep its books, which is not necessarily accounting principles generally accepted in the United
        States. Real estate is carried at cost less accumulated depreciation — not at market or appraised
        value. These figures are unaudited and have not been reviewed or compiled by an independent
        accountant. The Statement of Values on the Investor Info page is a different document on a
        different basis (estimated current value) and the two are not expected to agree.
      </div>
    </div>
  );
}
