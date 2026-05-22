"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar } from "@/app/components/Calendar";
import { useUser } from "@/app/components/UserProvider";
import { Pill, StatPill, TONE_GREEN, TONE_RED } from "@/app/components/Pill";
import { UNIQUE_BANK_ACCOUNTS, type BankGroup } from "@/lib/bank-rec/accounts";
import type { BankTransfer } from "@/lib/bankTransfers/storage";

// Only admin / drew / harry can input or modify transfers. Alison and
// stacie get read-only access (no New Transfer, no Edit, table rows
// don't open the editor).
const CAN_EDIT_USERS = new Set(["admin", "drew", "harry"]);

const BANK_OPTIONS: BankGroup[] = ["M&T", "JPM-Chase", "Liberty Bank"];

/** Display label for one bank account: prefer the internal key, fall back to
 *  the formal account name; always suffix with the last4 so it's unambiguous. */
function accountLabel(acc: { key: string; accountName: string; last4: string }): string {
  const base = acc.key || acc.accountName;
  return `${base} (${acc.last4})`;
}

/** Normalize the bank name on records that pre-date the bank dropdown
 *  (the seed used "Chase" before we constrained to UNIQUE_BANK_ACCOUNTS). */
function normalizeBank(name: string): string {
  const n = name.trim();
  if (n.toLowerCase() === "chase") return "JPM-Chase";
  return n;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function BankTransfersPage() {
  const { user } = useUser();
  const canEdit = CAN_EDIT_USERS.has(user.id);
  const [transfers, setTransfers] = useState<BankTransfer[] | null>(null);
  const [shareFolderUrl, setShareFolderUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BankTransfer | "new" | null>(null);
  const [savedPrompt, setSavedPrompt] = useState<boolean>(false);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bank-transfers", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      setTransfers(body.transfers ?? []);
      setShareFolderUrl(body.shareFolderUrl ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  function applyLocalUpdate(saved: BankTransfer): void {
    // Optimistic state update so the new/edited row shows up immediately,
    // even if the backing store has a brief read-after-write delay.
    setTransfers((curr) => {
      const list = curr ?? [];
      const idx = list.findIndex((x) => x.id === saved.id);
      const next = idx >= 0
        ? list.map((x, i) => (i === idx ? saved : x))
        : [saved, ...list];
      return [...next].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.createdAt.localeCompare(a.createdAt);
      });
    });
  }
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    if (!transfers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return transfers;
    return transfers.filter((t) =>
      t.fromLabel.toLowerCase().includes(q) ||
      t.toLabel.toLowerCase().includes(q) ||
      t.bankName.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  }, [transfers, search]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, t) => sum + (t.amount || 0), 0),
    [filtered]
  );
  const missingPdf = useMemo(
    () => filtered.filter((t) => !t.pdfSaved).length,
    [filtered]
  );

  // Distinct labels currently in use that are NOT in UNIQUE_BANK_ACCOUNTS.
  // Surfaced in the dropdowns as "Legacy" entries so existing rows still
  // show their value and can be remapped to a canonical account.
  const legacyLabels = useMemo(() => {
    const canonical = new Set(UNIQUE_BANK_ACCOUNTS.map(accountLabel));
    const set = new Set<string>();
    (transfers ?? []).forEach((t) => {
      if (t.fromLabel && !canonical.has(t.fromLabel)) set.add(t.fromLabel);
      if (t.toLabel && !canonical.has(t.toLabel)) set.add(t.toLabel);
    });
    return Array.from(set).sort();
  }, [transfers]);

  async function saveTransfer(
    draft: Partial<BankTransfer> & { id?: string; createdAt?: string },
    isNew: boolean,
  ) {
    try {
      const res = await fetch("/api/bank-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
      if (body.transfer) applyLocalUpdate(body.transfer);
      setEditing(null);
      if (isNew) setSavedPrompt(true);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function deleteTransfer(id: string) {
    if (!confirm("Delete this transfer?")) return;
    try {
      const res = await fetch(`/api/bank-transfers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete");
      setTransfers((curr) => (curr ?? []).filter((x) => x.id !== id));
      setEditing(null);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function persistShareUrl(next: string): Promise<void> {
    const res = await fetch("/api/bank-transfers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareFolderUrl: next }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Failed to update");
    setShareFolderUrl(body.shareFolderUrl ?? "");
  }

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header>
        <h1>Bank Transfers</h1>
      </header>

      <Toolbar
        canEdit={canEdit}
        url={shareFolderUrl}
        onSaveUrl={persistShareUrl}
        onNewTransfer={() => setEditing("new")}
        search={search}
        onSearchChange={setSearch}
        resultsCount={filtered.length}
        totalCount={(transfers ?? []).length}
        loading={loading}
      />

      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>Couldn&apos;t load bank transfers</div>
          <div className="muted small">{error}</div>
        </div>
      )}

      <div className="pills">
        <StatPill label="Transfers" value={filtered.length} />
        <StatPill label="Total volume" value={fmtMoney(totalAmount)} />
        <StatPill label="Missing PDF" value={missingPdf} accent={missingPdf > 0 ? "#b91c1c" : undefined} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Description</th>
                <th style={{ width: 80 }}>PDF</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="muted small" style={{ padding: 16 }}>Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="muted small" style={{ padding: 16 }}>No transfers.</td></tr>
              )}
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  style={{ cursor: canEdit ? "pointer" : "default" }}
                  onClick={canEdit ? () => setEditing(t) : undefined}
                >
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div style={{ fontWeight: 600 }}>{prettyDate(t.date)}</div>
                    <div className="muted small">{normalizeBank(t.bankName)}</div>
                  </td>
                  <td>{t.fromLabel}</td>
                  <td>{t.toLabel}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {fmtMoney(t.amount)}
                  </td>
                  <td className="muted small" style={{ maxWidth: 360, whiteSpace: "normal", wordBreak: "break-word" }}>
                    {t.description || "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                      <Pill tone={t.pdfSaved ? TONE_GREEN : TONE_RED}>
                        {t.pdfSaved ? "Saved" : "Missing"}
                      </Pill>
                      {canEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditing(t); }}
                          className="btn"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== null && (
        <EditModal
          item={editing === "new" ? null : editing}
          legacyLabels={legacyLabels}
          onClose={() => setEditing(null)}
          onSave={saveTransfer}
          onDelete={deleteTransfer}
        />
      )}

      {savedPrompt && (
        <SavedPrompt url={shareFolderUrl} onClose={() => setSavedPrompt(false)} />
      )}
    </main>
  );
}

function SavedPrompt({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 110,
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
          maxWidth: 460, width: "100%",
          padding: 22,
          boxShadow: "0 12px 40px rgba(15,23,42,0.25)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Save Record on SharePoint</h2>
        <div className="muted small" style={{ marginTop: 8 }}>
          Transfer saved. Drop the supporting PDF in the shared folder so the record is complete.
        </div>

        <div style={{ marginTop: 16 }}>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn primary"
              style={{
                fontSize: 14, padding: "10px 18px", fontWeight: 700, textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
            >
              <FolderIcon /> Open SharePoint Folder
            </a>
          ) : (
            <div className="muted small">
              No SharePoint folder linked yet — add one with the Shared Drive Folder card above.
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} className="btn" style={{ fontSize: 13, padding: "8px 16px" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function Toolbar({
  canEdit,
  url,
  onSaveUrl,
  onNewTransfer,
  search,
  onSearchChange,
  resultsCount,
  totalCount,
  loading,
}: {
  canEdit: boolean;
  url: string;
  onSaveUrl: (next: string) => Promise<void>;
  onNewTransfer: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  resultsCount: number;
  totalCount: number;
  loading: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setSaving(true);
    setError(null);
    try {
      await onSaveUrl(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {error && (
            <div style={{
              padding: "8px 10px", borderRadius: 8,
              background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)",
              color: "#b91c1c", fontSize: 12, fontWeight: 600,
            }}>{error}</div>
          )}
          <input
            style={{ ...selectStyle, width: "100%" }}
            value={draft}
            placeholder="Paste the SharePoint folder link (https://…)"
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={() => save(draft.trim())} disabled={saving}
              className="btn primary" style={{ fontSize: 13, padding: "7px 16px", fontWeight: 700 }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} disabled={saving}
              className="btn" style={{ fontSize: 13, padding: "7px 14px", fontWeight: 600 }}>
              Cancel
            </button>
            {url && (
              <button type="button" onClick={() => save("")} disabled={saving}
                style={{
                  marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "#b91c1c",
                  background: "transparent", border: "1px solid rgba(220,38,38,0.35)",
                  borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
                }}>
                Remove
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {canEdit && (
            <button
              type="button"
              onClick={onNewTransfer}
              className="btn primary"
              style={{ fontSize: 13, padding: "8px 16px", fontWeight: 700 }}
            >
              + New Transfer
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn primary"
                style={{
                  fontSize: 13, padding: "8px 16px", fontWeight: 700, textDecoration: "none",
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}
              >
                <FolderIcon /> Open SharePoint Folder
              </a>
            ) : (
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                No SharePoint folder linked yet.
              </span>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => { setDraft(url); setEditing(true); setError(null); }}
                style={{
                  fontSize: 11, fontWeight: 600, color: "var(--brand)",
                  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {url ? "Change link" : "Link a folder"}
              </button>
            )}
            <input
              type="search"
              placeholder="Search bank, account, description…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ ...selectStyle, minWidth: 260 }}
            />
            <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {loading ? "Loading…" : `${resultsCount} of ${totalCount}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function EditModal({
  item,
  legacyLabels,
  onClose,
  onSave,
  onDelete,
}: {
  item: BankTransfer | null;
  legacyLabels: string[];
  onClose: () => void;
  onSave: (draft: Partial<BankTransfer> & { id?: string; createdAt?: string }, isNew: boolean) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [date, setDate] = useState(item?.date ?? todayISO());
  const [bankName, setBankName] = useState<string>(normalizeBank(item?.bankName ?? "JPM-Chase"));
  const [fromLabel, setFromLabel] = useState(item?.fromLabel ?? "");
  const [toLabel, setToLabel] = useState(item?.toLabel ?? "");

  // Accounts available for the From / To dropdowns: filtered by the
  // selected bank so transfers stay within one institution (matches how
  // the historical log was kept). If the existing record's value points
  // at another bank or a legacy label, it's still preserved at the top
  // of the list so it doesn't silently disappear.
  const accountsForBank = useMemo(
    () => UNIQUE_BANK_ACCOUNTS.filter((a) => a.bank === bankName),
    [bankName],
  );
  const accountLabelsForBank = useMemo(
    () => new Set(accountsForBank.map(accountLabel)),
    [accountsForBank],
  );
  const [amount, setAmount] = useState<string>(item ? String(item.amount) : "");
  const [pdfSaved, setPdfSaved] = useState<boolean>(item?.pdfSaved ?? false);
  const [description, setDescription] = useState(item?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!fromLabel.trim() || !toLabel.trim()) {
      alert("From and To are required.");
      return;
    }
    setSaving(true);
    await onSave({
      id: item?.id,
      date,
      bankName: bankName.trim(),
      fromLabel: fromLabel.trim(),
      toLabel: toLabel.trim(),
      amount: Number(amount) || 0,
      pdfSaved,
      description,
      createdAt: item?.createdAt,
    }, !item);
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
            {item ? "Edit transfer" : "New transfer"}
          </h2>
          <button onClick={onClose} className="btn" style={{ fontSize: 13, padding: "4px 10px" }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Date">
            <Calendar value={date} onChange={setDate} variant="card" />
          </Field>

          <Field label="Bank">
            <select
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              style={selectStyle}
            >
              {BANK_OPTIONS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>

          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
            <Field label="From">
              <AccountSelect
                value={fromLabel}
                onChange={setFromLabel}
                accounts={accountsForBank}
                inBankLabels={accountLabelsForBank}
                legacyLabels={legacyLabels}
              />
            </Field>
            <Field label="To">
              <AccountSelect
                value={toLabel}
                onChange={setToLabel}
                accounts={accountsForBank}
                inBankLabels={accountLabelsForBank}
                legacyLabels={legacyLabels}
              />
            </Field>
          </div>

          <Field label="Amount">
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              style={selectStyle}
            />
          </Field>

          <Field label="PDF saved to shared folder">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={pdfSaved} onChange={(e) => setPdfSaved(e.target.checked)} />
              <span>{pdfSaved ? "Yes — PDF is in the shared folder" : "No — still needs to be saved"}</span>
            </label>
          </Field>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...selectStyle, resize: "vertical" }}
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

function AccountSelect({
  value,
  onChange,
  accounts,
  inBankLabels,
  legacyLabels,
}: {
  value: string;
  onChange: (next: string) => void;
  accounts: { key: string; accountName: string; last4: string }[];
  inBankLabels: Set<string>;
  legacyLabels: string[];
}) {
  // If the current value isn't one of the in-bank canonical options, show
  // it as a "Legacy" option at the top so the existing data is preserved
  // until staff remaps it.
  const valueIsCanonical = !value || inBankLabels.has(value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
      <option value="">— Select account —</option>
      {!valueIsCanonical && (
        <optgroup label="Current (legacy)">
          <option value={value}>{value}</option>
        </optgroup>
      )}
      <optgroup label="Accounts">
        {accounts.map((a) => {
          const label = `${a.key || a.accountName} (${a.last4})`;
          return <option key={a.last4} value={label}>{label}</option>;
        })}
      </optgroup>
      {legacyLabels.length > 0 && (
        <optgroup label="Other legacy labels">
          {legacyLabels.filter((l) => l !== value).map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
