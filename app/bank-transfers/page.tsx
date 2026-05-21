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
  const [query, setQuery] = useState("");

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
    const q = query.trim().toLowerCase();
    if (!q) return transfers;
    return transfers.filter((t) =>
      t.fromLabel.toLowerCase().includes(q) ||
      t.toLabel.toLowerCase().includes(q) ||
      t.bankName.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  }, [transfers, query]);

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

  async function updateShareUrl() {
    const next = prompt("Share folder URL:", shareFolderUrl);
    if (next === null) return;
    try {
      const res = await fetch("/api/bank-transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareFolderUrl: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update");
      setShareFolderUrl(body.shareFolderUrl ?? "");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update");
    }
  }

  return (
    <main style={{ display: "grid", gap: 14, padding: "16px clamp(12px, 3vw, 28px) 32px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Bank Transfers</h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            Log of inter-account / inter-property wires. Newest on top.
          </div>
        </div>
        <button onClick={() => setEditing("new")} className="btn primary" style={{ fontSize: 13, padding: "8px 16px" }}>
          + New Transfer
        </button>
      </header>

      {/* Share-folder link */}
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
          PDF folder
        </span>
        {shareFolderUrl ? (
          <a href={shareFolderUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600 }}>
            Open shared folder ↗
          </a>
        ) : (
          <span className="muted small">Not set</span>
        )}
        <button onClick={updateShareUrl} className="btn" style={{ fontSize: 12, padding: "4px 10px", marginLeft: "auto" }}>
          Edit link
        </button>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c" }}>Error</div>
          <div className="muted small">{error}</div>
        </div>
      )}

      <div className="pills">
        <StatPill label="Transfers" value={filtered.length} />
        <StatPill label="Total volume" value={fmtMoney(totalAmount)} />
        <StatPill label="Missing PDF" value={missingPdf} accent={missingPdf > 0 ? "#b91c1c" : undefined} />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by property, account, bank or description…"
          className="input"
          style={{ fontSize: 13, padding: "8px 12px", minWidth: 280, flex: 1, maxWidth: 480 }}
        />
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
              className="input"
            />
          </Field>

          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
            <Field label="From">
              <input
                list="bt-labels"
                value={fromLabel}
                onChange={(e) => setFromLabel(e.target.value)}
                placeholder="e.g. LIK - Operating"
                className="input"
              />
            </Field>
            <Field label="To">
              <input
                list="bt-labels"
                value={toLabel}
                onChange={(e) => setToLabel(e.target.value)}
                placeholder="e.g. Bellaire Ave"
                className="input"
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
              className="input"
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
