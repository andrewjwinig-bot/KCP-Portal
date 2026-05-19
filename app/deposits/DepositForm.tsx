"use client";

import { useRef, useState } from "react";
import { Calendar } from "@/app/components/Calendar";
import { accountForProperty, DEPOSIT_ACCOUNTS, type SecurityDeposit } from "@/lib/deposits/deposits";

export type UnitOption = {
  unitRef: string;
  label: string;
  propertyCode: string;
  tenantCompany: string;
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--card)", color: "var(--text)", outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--muted)",
};

export default function DepositForm({
  deposit,
  unitOptions,
  fixedUnitRef,
  onSaved,
  onCancel,
  onDeleted,
}: {
  deposit: SecurityDeposit | null;
  unitOptions: UnitOption[];
  fixedUnitRef?: string;
  onSaved: (d: SecurityDeposit) => void;
  onCancel: () => void;
  onDeleted?: (id: string) => void;
}) {
  const [unitRef, setUnitRef] = useState(
    deposit?.unitRef ?? fixedUnitRef ?? unitOptions[0]?.unitRef ?? "",
  );
  const [checkNumber, setCheckNumber] = useState(deposit?.checkNumber ?? "");
  const [amount, setAmount] = useState(deposit?.amount ? String(deposit.amount) : "");
  const [checkDate, setCheckDate] = useState(deposit?.checkDate ?? "");
  const [notes, setNotes] = useState(deposit?.notes ?? "");
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [existingImage, setExistingImage] = useState(deposit?.checkImage ?? null);
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fall back to the deposit's stored unit when the tenant has since left
  // the rent roll, so an existing record stays editable.
  const unit: UnitOption | null =
    unitOptions.find((u) => u.unitRef === unitRef) ??
    (deposit && deposit.unitRef === unitRef
      ? {
          unitRef: deposit.unitRef,
          label: `${deposit.tenantCompany || deposit.unitRef} — ${deposit.unitRef}`,
          propertyCode: deposit.propertyCode,
          tenantCompany: deposit.tenantCompany,
        }
      : null);
  const account = unit ? accountForProperty(unit.propertyCode) : null;

  async function onPickFile(file: File) {
    setStagedFile(file);
    setStagedPreview(URL.createObjectURL(file));
    setExtractNote(null);
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/deposits/extract", { method: "POST", body: fd });
      const j = await res.json();
      // Only fill blanks — never clobber what the user already typed.
      if (j.checkNumber && !checkNumber) setCheckNumber(j.checkNumber);
      if (j.amount != null && !amount) setAmount(String(j.amount));
      if (j.checkDate && !checkDate) setCheckDate(j.checkDate);
      if (j.note) setExtractNote(j.note);
      else if (j.checkNumber || j.amount != null || j.checkDate) {
        setExtractNote("Autofilled from the check image — please verify.");
      }
    } catch {
      setExtractNote("Couldn't read the check automatically — enter the details manually.");
    } finally {
      setExtracting(false);
    }
  }

  async function save() {
    if (!unit) { setError("Pick a unit."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: deposit?.id,
        unitRef: unit.unitRef,
        propertyCode: unit.propertyCode,
        tenantCompany: unit.tenantCompany,
        checkNumber,
        amount: Number(amount) || 0,
        checkDate,
        notes,
      };
      const res = await fetch(deposit ? `/api/deposits/${deposit.id}` : "/api/deposits", {
        method: deposit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      let saved: SecurityDeposit = j.deposit;

      if (stagedFile) {
        const fd = new FormData();
        fd.append("file", stagedFile);
        const up = await fetch(`/api/deposits/${saved.id}/check-image`, { method: "POST", body: fd });
        const uj = await up.json();
        if (!up.ok) throw new Error(uj.error ?? "Check image upload failed");
        saved = uj.deposit;
      }
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeImage() {
    if (deposit && existingImage) {
      try { await fetch(`/api/deposits/${deposit.id}/check-image`, { method: "DELETE" }); }
      catch { /* ignore */ }
      setExistingImage(null);
    }
    setStagedFile(null);
    setStagedPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function del() {
    if (!deposit || !onDeleted) return;
    if (!confirm("Delete this security deposit record? This cannot be undone.")) return;
    setSaving(true);
    try {
      await fetch(`/api/deposits/${deposit.id}`, { method: "DELETE" });
      onDeleted(deposit.id);
    } catch {
      setError("Delete failed");
      setSaving(false);
    }
  }

  const previewUrl = stagedPreview ?? existingImage?.url ?? null;
  const previewIsImage =
    stagedFile?.type.startsWith("image/") ??
    existingImage?.contentType.startsWith("image/") ??
    false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && (
        <div style={{
          padding: "8px 10px", borderRadius: 8,
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)",
          color: "#b91c1c", fontSize: 12, fontWeight: 600,
        }}>{error}</div>
      )}

      {/* Tenant / unit */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={labelStyle}>Tenant / Unit</span>
        {fixedUnitRef ? (
          <div style={{ ...inputStyle, background: "rgba(15,23,42,0.04)" }}>
            {unit ? unit.label : fixedUnitRef}
          </div>
        ) : (
          <select style={inputStyle} value={unitRef} onChange={(e) => setUnitRef(e.target.value)}>
            <option value="">Select a tenant…</option>
            {unitOptions.map((u) => (
              <option key={u.unitRef} value={u.unitRef}>{u.label}</option>
            ))}
          </select>
        )}
        {account && (
          <span style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            Account: <strong>{DEPOSIT_ACCOUNTS[account].bank}</strong> — {DEPOSIT_ACCOUNTS[account].label}
          </span>
        )}
      </div>

      {/* Check image */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={labelStyle}>Check Image</span>
        {previewUrl && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {previewIsImage ? (
              <a href={previewUrl} target="_blank" rel="noreferrer">
                <img src={previewUrl} alt="Check"
                  style={{ maxHeight: 120, borderRadius: 8, border: "1px solid var(--border)", display: "block" }} />
              </a>
            ) : (
              <a href={previewUrl} target="_blank" rel="noreferrer"
                style={{ fontSize: 13, fontWeight: 600, color: "#0b4a7d" }}>View uploaded file</a>
            )}
            <button type="button" onClick={removeImage} className="btn"
              style={{ fontSize: 12, padding: "5px 12px", fontWeight: 600 }}>Remove</button>
          </div>
        )}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px", cursor: "pointer",
            border: "1.5px dashed var(--border)", borderRadius: 10,
            background: "rgba(15,23,42,0.015)", fontSize: 13, color: "var(--muted)",
          }}
        >
          {extracting
            ? "Reading the check…"
            : previewUrl
              ? "Replace the check image"
              : "⭳ Upload a photo of the check — we'll try to read the check #, amount and date"}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
          }}
        />
        {extractNote && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{extractNote}</span>
        )}
      </div>

      {/* Check fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>Check #</span>
          <input style={inputStyle} value={checkNumber} placeholder="1234"
            onChange={(e) => setCheckNumber(e.target.value)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>Amount</span>
          <input style={inputStyle} value={amount} inputMode="decimal" placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>Check Date</span>
          <Calendar value={checkDate} onChange={setCheckDate} variant="card" />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={labelStyle}>Notes</span>
        <input style={inputStyle} value={notes} placeholder="Anything worth noting"
          onChange={(e) => setNotes(e.target.value)} />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={save} disabled={saving || extracting}
          className="btn primary" style={{ fontSize: 13, padding: "8px 18px", fontWeight: 700 }}>
          {saving ? "Saving…" : deposit ? "Save Changes" : "Add Deposit"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}
          className="btn" style={{ fontSize: 13, padding: "8px 16px", fontWeight: 600 }}>
          Cancel
        </button>
        {deposit && onDeleted && (
          <button type="button" onClick={del} disabled={saving}
            style={{
              marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "#b91c1c",
              background: "transparent", border: "1px solid rgba(220,38,38,0.35)",
              borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit",
            }}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
