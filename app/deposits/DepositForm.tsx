"use client";

import { StatusBanner } from "@/app/components/StatusBanner";
import { UnitSelect } from "@/app/components/UnitSelect";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Calendar } from "@/app/components/Calendar";
import { upload as blobUpload } from "@vercel/blob/client";
import { accountForProperty, DEPOSIT_ACCOUNTS, depositDupKey, refundsOf, type SecurityDeposit } from "@/lib/deposits/deposits";

/** The typed amount as dollars. "25,496" and "$25,496.00" are what people
 *  type; bare Number() read them as NaN → $0, which saved SEOM's $25,496
 *  deposit (3640-300) as $0 and dropped it from the move-out settlement. */
const amountNum = (v: string) => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : 0; };
/** A figure as it should read in a money box: "12,615.45" (owner: the
 *  amount showed as 12615.45). Blank stays blank. */
const moneyText = (n: number) => (n ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const reformat = (v: string) => (String(v ?? "").trim() ? moneyText(amountNum(v)) : "");
const dollars = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One partial refund in the form — the amount kept as typed text. */
type RefundRow = { id: string; date: string; amount: string; note: string };
const newRefundId = () => `rf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export type UnitOption = {
  unitRef: string;
  label: string;
  propertyCode: string;
  tenantCompany: string;
  /** The building header in the dropdown — "3610 · Building 1, …". */
  group?: string;
  former?: boolean;
};

// The look of an input / select comes from globals.css (the program-wide
// control pill); only the layout is set here.
const inputStyle: React.CSSProperties = { width: "100%" };
// A fixed tenant is shown read-only in the same pill shape as the controls.
const readOnlyLook: React.CSSProperties = {
  width: "100%", padding: "7px 13px", fontSize: "var(--fs-13)", borderRadius: 999,
  border: "1px solid var(--border)", background: "var(--tint-neutral-bg, rgba(15,23,42,0.04))", color: "var(--text)",
};
const labelStyle: React.CSSProperties = {
  fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--muted)",
};

// Parse a response body without throwing on empty / non-JSON payloads
// (e.g. a platform 413 when an upload is too large).
async function readJson(res: Response): Promise<Record<string, any>> {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

// Downscale large photos in the browser so uploads stay well under the
// ~4.5 MB serverless body cap. Non-images pass through untouched.
async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const MAX = 2200;
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size <= 3_500_000) { bitmap.close?.(); return file; }
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close?.(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function DepositForm({
  deposit,
  unitOptions,
  fixedUnitRef,
  allDeposits,
  onSaved,
  onCheckAdded,
  onCancel,
  onDeleted,
}: {
  deposit: SecurityDeposit | null;
  unitOptions: UnitOption[];
  fixedUnitRef?: string;
  /** All deposits (for a live "looks like a duplicate" warning on entry). */
  allDeposits?: SecurityDeposit[];
  onSaved: (d: SecurityDeposit) => void;
  /** Called when a check is saved via "Save & add another check" — the parent
   *  updates its list but the modal stays open for the next check. */
  onCheckAdded?: (d: SecurityDeposit) => void;
  onCancel: () => void;
  onDeleted?: (id: string) => void;
}) {
  const [unitRef, setUnitRef] = useState(
    deposit?.unitRef ?? fixedUnitRef ?? unitOptions[0]?.unitRef ?? "",
  );
  // The record currently being saved. Starts as the edited deposit (if any);
  // after "Save & add another check" it clears so the next check is a new record.
  const [editId, setEditId] = useState<string | undefined>(deposit?.id);
  const [checkNumber, setCheckNumber] = useState(deposit?.checkNumber ?? "");
  const [amount, setAmount] = useState(deposit?.amount ? moneyText(deposit.amount) : "");
  const [checkDate, setCheckDate] = useState(deposit?.checkDate ?? "");
  const [notes, setNotes] = useState(deposit?.notes ?? "");
  const [refunded, setRefunded] = useState(deposit?.refunded ?? false);
  const [refundDate, setRefundDate] = useState(deposit?.refundDate ?? "");
  const [tenantDefaulted, setTenantDefaulted] = useState(deposit?.tenantDefaulted ?? false);
  // Partial refunds as a dated timeline; each one comes off what we hold.
  const [refunds, setRefunds] = useState<RefundRow[]>(() =>
    (deposit ? refundsOf(deposit) : []).map((r) => ({
      id: r.id === "legacy" ? newRefundId() : r.id,
      // A refund recorded before refunds were dated takes the deposit's refund
      // date if it had one; otherwise it is dated here.
      date: r.date || deposit?.refundDate || "",
      amount: moneyText(r.amount), note: r.note,
    })));
  const setRefund = (id: string, patch: Partial<RefundRow>) =>
    setRefunds((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [existingImage, setExistingImage] = useState(deposit?.checkImage ?? null);
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Checks saved during this modal session via "add another" (for a running tally).
  const [addedChecks, setAddedChecks] = useState<{ checkNumber: string; amount: number }[]>([]);
  const [autoStatus, setAutoStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  // Fall back to the deposit's stored unit when the tenant has since left
  // the rent roll, so an existing record stays editable.
  // An EXISTING deposit keeps its own tenant: a departed tenant's suite may be
  // re-leased, and taking the first option on the suite handed their deposit
  // the new tenant's name on the next save.
  const norm = (s: string | undefined) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const unit: UnitOption | null =
    (deposit && deposit.unitRef === unitRef
      ? unitOptions.find((u) => u.unitRef === unitRef && norm(u.tenantCompany) === norm(deposit.tenantCompany))
      : undefined) ??
    (deposit && deposit.unitRef === unitRef && deposit.tenantCompany ? null : unitOptions.find((u) => u.unitRef === unitRef)) ??
    (deposit && deposit.unitRef === unitRef
      ? {
          unitRef: deposit.unitRef,
          label: `${deposit.tenantCompany || deposit.unitRef} — ${deposit.unitRef}`,
          propertyCode: deposit.propertyCode,
          tenantCompany: deposit.tenantCompany,
        }
      : null);
  const account = unit ? accountForProperty(unit.propertyCode) : null;

  // Live duplicate guard: another saved check for this same unit matching the
  // current check # (or amount + date). Informational only — a tenant can
  // legitimately pay via multiple checks — but a match is usually a double-entry.
  const dupMatch = (() => {
    if (!unit) return null;
    const sig = depositDupKey({ checkNumber, amount: amountNum(amount) || 0, checkDate });
    if (!sig) return null;
    return (allDeposits ?? []).find(
      (x) => x.id !== editId && x.unitRef === unit.unitRef && depositDupKey(x) === sig,
    ) ?? null;
  })();

  async function onPickFile(rawFile: File) {
    setExtractNote(null);
    setExtracting(true);
    const file = await downscaleImage(rawFile);
    setStagedFile(file);
    setStagedPreview(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/deposits/extract", { method: "POST", body: fd });
      const j = await readJson(res);
      // Only fill blanks — never clobber what the user already typed.
      if (j.checkNumber && !checkNumber) setCheckNumber(j.checkNumber);
      if (j.amount != null && !amount) setAmount(String(j.amount));
      if (j.checkDate && !checkDate) setCheckDate(j.checkDate);
      if (j.note) setExtractNote(j.note);
      else if (j.checkNumber || j.amount != null || j.checkDate) {
        setExtractNote("Autofilled from the check image — please verify against the photo.");
      }
    } catch {
      setExtractNote("Couldn't read the check automatically — type the details from the image below.");
    } finally {
      setExtracting(false);
    }
  }

  // The id is mirrored in a ref so async saves never read a stale closure value
  // (which would otherwise let two quick saves each POST a new record).
  const editIdRef = useRef<string | undefined>(deposit?.id);
  function rememberId(id: string | undefined) { editIdRef.current = id; setEditId(id); }

  // Core persistence: upsert the deposit (PUT once we have an id, else POST)
  // plus any staged check image. Returns the saved record; leaves UI flow
  // (close / reset) to the caller.
  async function persist(): Promise<SecurityDeposit> {
    if (!unit) throw new Error("Pick a unit.");
    const id = editIdRef.current;
    const payload = {
      id,
      unitRef: unit.unitRef,
      propertyCode: unit.propertyCode,
      tenantCompany: unit.tenantCompany,
      checkNumber,
      amount: amountNum(amount) || 0,
      checkDate,
      notes,
      refunded,
      refundDate: refunded ? refundDate : "",
      tenantDefaulted,
      refunds: refunds.map((r) => ({ id: r.id, date: r.date, amount: amountNum(r.amount), note: r.note })),
    };
    const res = await fetch(id ? `/api/deposits/${id}` : "/api/deposits", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await readJson(res);
    if (!res.ok || !j.deposit) throw new Error((j.error as string) ?? "Couldn't save the deposit.");
    let saved = j.deposit as SecurityDeposit;
    rememberId(saved.id);

    // Image upload is optional — only attempt it when a file is staged.
    if (stagedFile) {
      // Straight to Blob from the browser, then attach — a scanned PDF of a
      // check is often over the 4.5 MB a request to the app can carry, and
      // the platform rejected it with no message.
      const seg = (v: string) => String(v).replace(/[^\w.\-]+/g, "_").slice(0, 80) || "check";
      let blobUrl: string;
      try {
        const blob = await blobUpload(`deposits/${saved.id}/${seg(stagedFile.name)}`, stagedFile, {
          access: "private",
          handleUploadUrl: "/api/deposits/blob-upload",
          contentType: stagedFile.type || undefined,
          multipart: stagedFile.size > 8 * 1024 * 1024,
        });
        blobUrl = blob.url;
      } catch (e) {
        throw new Error(`The deposit was saved, but the check image didn't upload: ${e instanceof Error ? e.message : "upload failed"}.`);
      }
      const up = await fetch(`/api/deposits/${saved.id}/check-image`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blobUrl, name: stagedFile.name, contentType: stagedFile.type, size: stagedFile.size }),
      });
      const uj = await readJson(up);
      if (!up.ok || !uj.deposit) {
        throw new Error((uj.error as string) ?? "The deposit was saved, but the check image couldn't be attached.");
      }
      saved = uj.deposit as SecurityDeposit;
      setExistingImage(saved.checkImage ?? null);
      setStagedFile(null);
      setStagedPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    }
    return saved;
  }

  // ── Auto-save ──────────────────────────────────────────────────────────────
  // Persist edits automatically (debounced) so nothing is lost if the user never
  // clicks a button. Only fires once there's a unit and a real amount, so simply
  // opening the form never creates a blank record.
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const firstRun = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function autosave() {
    if (!unit || !(amountNum(amount) > 0)) return;
    if (savingRef.current) { dirtyRef.current = true; return; }
    savingRef.current = true;
    setAutoStatus("saving");
    try {
      const saved = await persist();
      onCheckAdded?.(saved);
      setAutoStatus("saved");
      setError(null);
    } catch (e) {
      setAutoStatus("error");
      setError(e instanceof Error ? e.message : "Auto-save failed");
    } finally {
      savingRef.current = false;
      if (dirtyRef.current) { dirtyRef.current = false; void autosave(); }
    }
  }

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (!unit || !(amountNum(amount) > 0)) return;
    setAutoStatus("pending");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void autosave(); }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitRef, checkNumber, amount, checkDate, notes, refunded, refundDate, tenantDefaulted, refunds]);

  // Persist immediately when a field loses focus, so tabbing/clicking away saves
  // right then instead of waiting out the debounce.
  function flushSave() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (unit && amountNum(amount) > 0) void autosave();
  }

  async function save(addAnother = false) {
    if (!unit) { setError("Pick a unit."); return; }
    // "Done" on an untouched new form (no record yet, no amount) just closes —
    // never create a blank deposit.
    if (!addAnother && !editIdRef.current && !(amountNum(amount) > 0)) { onCancel(); return; }
    if (addAnother && !(amountNum(amount) > 0)) {
      setError("Enter this check's amount before adding another.");
      return;
    }
    setSaving(true);
    setError(null);
    // Serialize with any in-flight auto-save so we never double-create.
    while (savingRef.current) { await new Promise((r) => setTimeout(r, 40)); }
    savingRef.current = true;
    try {
      const saved = await persist();
      if (addAnother) {
        // Keep the modal open, pinned to the same tenant; reset for the next
        // check (the saved one becomes a fresh new record).
        onCheckAdded?.(saved);
        setAddedChecks((prev) => [...prev, { checkNumber: saved.checkNumber, amount: saved.amount }]);
        rememberId(undefined);
        setCheckNumber("");
        setAmount("");
        setCheckDate("");
        setNotes("");
        setRefunded(false);
        setRefundDate("");
        setTenantDefaulted(false);
        setRefunds([]);
        setStagedFile(null);
        setStagedPreview(null);
        setExistingImage(null);
        setExtractNote(null);
        setAutoStatus("idle");
        if (fileRef.current) fileRef.current.value = "";
      } else {
        onSaved(saved);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function removeImage() {
    if (editId && existingImage) {
      try { await fetch(`/api/deposits/${editId}/check-image`, { method: "DELETE" }); }
      catch { /* ignore */ }
      setExistingImage(null);
    }
    setStagedFile(null);
    setStagedPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function del() {
    if (!editId || !onDeleted) return;
    if (!confirm("Delete this security deposit record? This cannot be undone.")) return;
    setSaving(true);
    try {
      await fetch(`/api/deposits/${editId}`, { method: "DELETE" });
      onDeleted(editId);
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
        <StatusBanner compact tone="danger" title={error} />
      )}

      {/* Tenant / unit */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={labelStyle}>Tenant / Unit</span>
        {fixedUnitRef ? (
          <div style={readOnlyLook}>
            {unit ? unit.label : fixedUnitRef}
          </div>
        ) : (
          <UnitSelect value={unitRef} onChange={setUnitRef}
            units={unitOptions.map((u) => ({ unitRef: u.unitRef, tenant: u.tenantCompany, group: u.group ?? u.propertyCode, meta: u.former ? "Former tenant" : undefined }))} />
        )}
        {account && (
          <span style={{ fontSize: "var(--fs-12)", color: "var(--muted)", marginTop: 2 }}>
            Account: <strong>{DEPOSIT_ACCOUNTS[account].bank}</strong> — {DEPOSIT_ACCOUNTS[account].label}
          </span>
        )}
      </div>

      {/* Check image — optional */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={labelStyle}>Check Image <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
        {previewUrl && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {previewIsImage ? (
              <a href={previewUrl} target="_blank" rel="noreferrer" title="Open full size in a new tab">
                <img src={previewUrl} alt="Check"
                  style={{
                    width: "100%", maxHeight: 460, objectFit: "contain",
                    borderRadius: 10, border: "1px solid var(--border)",
                    background: "var(--tint-neutral-faint, rgba(15,23,42,0.03))", display: "block",
                  }} />
              </a>
            ) : (
              <a href={previewUrl} target="_blank" rel="noreferrer"
                style={{ fontSize: "var(--fs-13)", fontWeight: 600, color: "var(--c-0b4a7d)" }}>View uploaded file</a>
            )}
            <div>
              <button type="button" onClick={removeImage} className="btn"
                style={{ fontSize: "var(--fs-12)", padding: "5px 12px", fontWeight: 600 }}>Remove image</button>
            </div>
          </div>
        )}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px", cursor: "pointer", textAlign: "center",
            border: "1.5px dashed var(--border)", borderRadius: 10,
            background: "var(--tint-neutral-faint, rgba(15,23,42,0.015))", fontSize: "var(--fs-13)", color: "var(--muted)",
          }}
        >
          {extracting
            ? "Reading the check…"
            : previewUrl
              ? "Replace the check image"
              : "⭳ Upload a photo of the check (optional) — read it large below and we'll try to autofill the check #, amount and date"}
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
          <span style={{ fontSize: "var(--fs-12)", color: "var(--muted)" }}>{extractNote}</span>
        )}
      </div>

      {dupMatch && (
        <StatusBanner compact tone="warning" title="Possible duplicate">
          This tenant already has {dupMatch.checkNumber ? `check #${dupMatch.checkNumber}` : "a check"}
          {dupMatch.amount ? ` for $${dupMatch.amount.toLocaleString("en-US")}` : ""}
          {dupMatch.checkDate ? ` dated ${dupMatch.checkDate}` : ""} on file. If it&apos;s the same check, don&apos;t enter it twice.
        </StatusBanner>
      )}

      {/* Check fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>Check #</span>
          <input style={inputStyle} value={checkNumber} placeholder="1234"
            onChange={(e) => setCheckNumber(e.target.value)} onBlur={flushSave} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>Amount</span>
          <input style={inputStyle} value={amount} inputMode="decimal" placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)} onBlur={() => { setAmount(reformat(amount)); flushSave(); }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={labelStyle}>Check Date</span>
          <Calendar value={checkDate} onChange={setCheckDate} variant="card" />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={labelStyle}>Notes</span>
        <input style={inputStyle} value={notes} placeholder="Anything worth noting"
          onChange={(e) => setNotes(e.target.value)} onBlur={flushSave} />
      </div>

      {/* Refund status */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={refunded}
              onChange={(e) => setRefunded(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span style={{ fontSize: "var(--fs-13)", fontWeight: 700 }}>Refunded in full</span>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={tenantDefaulted}
              onChange={(e) => setTenantDefaulted(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span style={{ fontSize: "var(--fs-13)", fontWeight: 700 }}>Tenant Defaulted</span>
          </label>
        </div>
        {refunded && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 260 }}>
            <span style={labelStyle}>Refund Date</span>
            <Calendar value={refundDate} onChange={setRefundDate} variant="card" />
          </div>
        )}
        <RefundTimeline
          rows={refunds}
          checkAmount={amountNum(amount)}
          fullyRefunded={refunded}
          forfeited={tenantDefaulted}
          onChange={setRefund}
          onAdd={() => setRefunds((prev) => [...prev, { id: newRefundId(), date: "", amount: "", note: "" }])}
          onRemove={(id) => setRefunds((prev) => prev.filter((r) => r.id !== id))}
          onBlur={flushSave}
        />
      </div>

      {/* Running tally of checks added this session (multi-check deposits). */}
      {addedChecks.length > 0 && (
        <StatusBanner compact tone="success" title={<>Added {addedChecks.length} check{addedChecks.length === 1 ? "" : "s"} for this tenant</>}>
          {addedChecks.map((c) => `${c.checkNumber ? `#${c.checkNumber} ` : ""}$${c.amount.toLocaleString("en-US")}`).join(", ")} · enter the next check, or finish below.
        </StatusBanner>
      )}

      {/* Actions — changes save automatically; the button just closes. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => save(false)} disabled={saving || extracting}
          className="btn primary" style={{ fontSize: "var(--fs-13)", padding: "8px 18px", fontWeight: 700 }}>
          {saving ? "Saving…" : "Done"}
        </button>
        {onCheckAdded && (
          <button type="button" onClick={() => save(true)} disabled={saving || extracting}
            className="btn" style={{ fontSize: "var(--fs-13)", padding: "8px 16px", fontWeight: 700 }}
            title="Save this check and add another for the same tenant">
            + Add another check
          </button>
        )}
        <span style={{ fontSize: "var(--fs-12)", fontWeight: 600, color: autoStatus === "error" ? "var(--c-b91c1c)" : "var(--muted)" }}>
          {autoStatus === "saving" || autoStatus === "pending"
            ? "Saving…"
            : autoStatus === "saved"
              ? "Saved automatically"
              : autoStatus === "error"
                ? "Auto-save failed — click Done to retry"
                : ""}
        </span>
        {editId && onDeleted && (
          <button type="button" onClick={del} disabled={saving}
            style={{
              marginLeft: "auto", fontSize: "var(--fs-12)", fontWeight: 600, color: "var(--c-b91c1c)",
              background: "transparent", border: "1px solid var(--tint-red-line, rgba(220,38,38,0.35))",
              borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit",
            }}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/** The deposit's partial refunds, oldest first, each dated, with what is
 *  still held under them — the check less every refund. */
function RefundTimeline({ rows, checkAmount, fullyRefunded, forfeited, onChange, onAdd, onRemove, onBlur }: {
  rows: RefundRow[];
  checkAmount: number;
  fullyRefunded: boolean;
  forfeited: boolean;
  onChange: (id: string, patch: Partial<RefundRow>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onBlur: () => void;
}) {
  const sorted = [...rows].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const refundedSum = rows.reduce((s, r) => s + amountNum(r.amount), 0);
  const held = fullyRefunded || forfeited ? 0 : Math.max(0, checkAmount - refundedSum);
  const label: React.CSSProperties = { fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={label}>Partial Refunds</span>
        <button type="button" className="btn sm" onClick={onAdd}>
          <Plus size={16} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0 }} />Add partial refund
        </button>
      </div>
      {sorted.length > 0 && (
        <div>
          {sorted.map((r) => (
            <div key={r.id} className="task-row" style={{ display: "grid", gridTemplateColumns: "190px 150px minmax(0, 1fr) 36px", gap: 8, alignItems: "center", padding: "8px 2px", borderBottom: "1px solid var(--hairline)" }}>
              <Calendar value={r.date} onChange={(v) => onChange(r.id, { date: v })} variant="card" />
              <input value={r.amount} inputMode="decimal" placeholder="Amount" aria-label="Amount refunded"
                style={{ width: "100%", textAlign: "right" }}
                onChange={(e) => onChange(r.id, { amount: e.target.value })}
                onBlur={() => { onChange(r.id, { amount: reformat(r.amount) }); onBlur(); }} />
              <input value={r.note} placeholder="Why, e.g. per 5th Amendment" aria-label="Note"
                style={{ width: "100%" }}
                onChange={(e) => onChange(r.id, { note: e.target.value })} onBlur={onBlur} />
              <button type="button" className="btn sm" aria-label="Remove this refund" onClick={() => onRemove(r.id)}
                style={{ padding: 0, width: 36, justifyContent: "center" }}>
                <X size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
      {(sorted.length > 0 || fullyRefunded || forfeited) && checkAmount > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: "var(--fs-14)", paddingTop: 2 }}>
          <span className="muted">
            Check {dollars(checkAmount)}
            {refundedSum > 0 ? ` less ${dollars(refundedSum)} refunded` : ""}
            {fullyRefunded ? " · refunded in full" : forfeited ? " · forfeited" : ""}
          </span>
          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>Held {dollars(held)}</span>
        </div>
      )}
    </div>
  );
}
