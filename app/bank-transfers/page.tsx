"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar } from "@/app/components/Calendar";
import { Pill, StatPill, TONE_GREEN, TONE_RED } from "@/app/components/Pill";
import type { BankTransfer } from "@/lib/bankTransfers/storage";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function BankTransfersPage() {
  const [transfers, setTransfers] = useState<BankTransfer[] | null>(null);
  const [shareFolderUrl, setShareFolderUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BankTransfer | "new" | null>(null);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bank-transfers");
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

  const labelOptions = useMemo(() => {
    const set = new Set<string>();
    (transfers ?? []).forEach((t) => {
      if (t.fromLabel) set.add(t.fromLabel);
      if (t.toLabel) set.add(t.toLabel);
    });
    return Array.from(set).sort();
  }, [transfers]);

  async function saveTransfer(draft: Partial<BankTransfer> & { id?: string; createdAt?: string }) {
    try {
      const res = await fetch("/api/bank-transfers", {
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

  async function deleteTransfer(id: string) {
    if (!confirm("Delete this transfer?")) return;
    try {
      const res = await fetch(`/api/bank-transfers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete");
      setEditing(null);
      await reload();
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
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Bank Transfers</h1>
        <button
          onClick={() => setEditing("new")}
          className="btn primary"
          style={{ fontSize: 13, padding: "6px 12px" }}
        >
          + New Transfer
        </button>
      </header>

      <ShareFolderPanel url={shareFolderUrl} onSave={persistShareUrl} />

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

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", padding: "0 2px" }}>
        <Field label="Search">
          <input
            type="search"
            placeholder="Property, account, bank, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...selectStyle, minWidth: 280 }}
          />
        </Field>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", paddingBottom: 6 }}>
          {loading ? "Loading…" : `${filtered.length} of ${(transfers ?? []).length}`}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Bank</th>
                <th>From</th>
                <th>To</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>PDF</th>
                <th>Description</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="muted small" style={{ padding: 16 }}>Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="muted small" style={{ padding: 16 }}>No transfers.</td></tr>
              )}
              {filtered.map((t) => (
                <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => setEditing(t)}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{prettyDate(t.date)}</td>
                  <td>{t.bankName}</td>
                  <td>{t.fromLabel}</td>
                  <td>{t.toLabel}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {fmtMoney(t.amount)}
                  </td>
                  <td>
                    <Pill tone={t.pdfSaved ? TONE_GREEN : TONE_RED}>
                      {t.pdfSaved ? "Saved" : "Missing"}
                    </Pill>
                  </td>
                  <td className="muted small" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.description || "—"}
                  </td>
                  <td>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing(t); }}
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

      {editing !== null && (
        <EditModal
          item={editing === "new" ? null : editing}
          labelOptions={labelOptions}
          onClose={() => setEditing(null)}
          onSave={saveTransfer}
          onDelete={deleteTransfer}
        />
      )}
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", color: "var(--muted)",
    }}>{children}</div>
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

function ShareFolderPanel({ url, onSave }: { url: string; onSave: (next: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SectionLabel>Shared Drive Folder</SectionLabel>
        {!editing && (
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
      </div>

      {error && (
        <div style={{
          margin: "8px 0", padding: "8px 10px", borderRadius: 8,
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)",
          color: "#b91c1c", fontSize: 12, fontWeight: 600,
        }}>{error}</div>
      )}

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
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
      ) : url ? (
        <div style={{ marginTop: 8 }}>
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
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          No SharePoint folder linked yet.
        </div>
      )}
    </div>
  );
}

function EditModal({
  item,
  labelOptions,
  onClose,
  onSave,
  onDelete,
}: {
  item: BankTransfer | null;
  labelOptions: string[];
  onClose: () => void;
  onSave: (draft: Partial<BankTransfer> & { id?: string; createdAt?: string }) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [date, setDate] = useState(item?.date ?? todayISO());
  const [bankName, setBankName] = useState(item?.bankName ?? "Chase");
  const [fromLabel, setFromLabel] = useState(item?.fromLabel ?? "");
  const [toLabel, setToLabel] = useState(item?.toLabel ?? "");
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
            {item ? "Edit transfer" : "New transfer"}
          </h2>
          <button onClick={onClose} className="btn" style={{ fontSize: 13, padding: "4px 10px" }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Date">
            <Calendar value={date} onChange={setDate} variant="card" />
          </Field>

          <Field label="Bank">
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Chase"
              style={selectStyle}
            />
          </Field>

          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
            <Field label="From">
              <input
                list="bt-labels"
                value={fromLabel}
                onChange={(e) => setFromLabel(e.target.value)}
                placeholder="e.g. LIK - Operating"
                style={selectStyle}
              />
            </Field>
            <Field label="To">
              <input
                list="bt-labels"
                value={toLabel}
                onChange={(e) => setToLabel(e.target.value)}
                placeholder="e.g. Bellaire Ave"
                style={selectStyle}
              />
            </Field>
            <datalist id="bt-labels">
              {labelOptions.map((l) => <option key={l} value={l} />)}
            </datalist>
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
